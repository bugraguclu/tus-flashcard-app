import { BUILTIN_NOTE_TYPES, DEFAULT_DECK_CONFIG, DEFAULT_DECKS, getDeckDisplayName, getParentDeckName } from '../models';
import type { SyncKind } from '../syncContract';
import { hashValue } from './syncClock';
import type { CodecContext } from './syncContext';
import { applyRest, modToMs, restOf, type Codec, type Encoded, type Groups } from './syncCodecTypes';

/*
 * Decks, presets (deck options) and note types (docs/HESAP_SENKRON.md §6.2).
 *
 * A deck's full name is not sent: it travels as its parent (`par`, a reference) and its own name
 * (`leaf`). Renaming a deck changes only its leaf, moving it only its parent, so a rename on one
 * device and a new subdeck on another end up in the same tree. The local `decks.name` path is
 * rebuilt from them (lib/sync/syncDeckTree.ts).
 */

const num = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const DECK_KNOWN = new Set([
    'id', 'name', 'mod', 'usn', 'configId', 'sortOrder', 'newLimit', 'reviewLimit', 'desiredRetention', 'description',
    'descriptionMarkdown', 'collapsed', 'isFiltered', 'searchQuery', 'searchLimit', 'searchOrder', 'searchQuery2',
    'searchLimit2', 'searchOrder2', 'reschedule', 'previewDelays', 'filteredAllowEmpty', 'filteredDeckEmpty',
    'filteredDoneCardIds', 'filteredPreviewDue', 'filteredBuildAt', 'catalogPack', 'catalogSourceId',
]);

const FILTER_OPTS: ReadonlyArray<[wire: string, key: string]> = [
    ['q', 'searchQuery'], ['l', 'searchLimit'], ['o', 'searchOrder'], ['q2', 'searchQuery2'], ['l2', 'searchLimit2'],
    ['o2', 'searchOrder2'], ['r', 'reschedule'], ['pd', 'previewDelays'], ['ae', 'filteredAllowEmpty'],
];
const FILTER_BUILD: ReadonlyArray<[wire: string, key: string]> = [
    ['e', 'filteredDeckEmpty'], ['at', 'filteredBuildAt'], ['pd', 'filteredPreviewDue'], ['done', 'filteredDoneCardIds'],
];

const MEMBERSHIP_KEY = (id: number) => `filtered_membership_v1:${id}`;
const TODAY_LIMITS_KEY = (id: number) => `deck_today_limits:${id}`;
const TODAY_BOOST_KEY = (id: number) => `deck_today_boost:${id}`;

function setting(ctx: CodecContext, key: string): string | null {
    return ctx.db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
}

function putSetting(ctx: CodecContext, key: string, value: unknown): void {
    if (typeof value === 'string') ctx.db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
    else ctx.db.runSync('DELETE FROM settings WHERE key = ?', key);
}

function pick(record: Record<string, unknown>, pairs: ReadonlyArray<[string, string]>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [wire, key] of pairs) out[wire] = record[key] === undefined ? null : record[key];
    return out;
}

function place(record: Record<string, unknown>, pairs: ReadonlyArray<[string, string]>, value: unknown): void {
    const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    for (const [wire, key] of pairs) {
        if (source[wire] === null || source[wire] === undefined) delete record[key];
        else record[key] = source[wire];
    }
}

function deckGroups(ctx: CodecContext, id: number, name: string, deck: Record<string, unknown>, catalog: boolean): Groups {
    const limits = setting(ctx, TODAY_LIMITS_KEY(id));
    const boost = setting(ctx, TODAY_BOOST_KEY(id));
    const groups: Groups = {
        cfg: ctx.ref('deck_configs', num(deck.configId, 1)),
        lim: [deck.newLimit ?? null, deck.reviewLimit ?? null],
        ret: deck.desiredRetention ?? null,
        coll: deck.collapsed === true,
        today: limits === null && boost === null ? null : { l: limits, b: boost },
    };
    if (catalog) return groups;
    const parentName = getParentDeckName(name);
    const parentId = parentName === null
        ? 0
        : num(ctx.db.getFirstSync<{ id: number }>('SELECT id FROM decks WHERE name = ?', parentName)?.id, 0);
    groups.par = parentId ? ctx.ref('decks', parentId) : 0;
    groups.leaf = getDeckDisplayName(name).split(DUPLICATE_MARK)[0];
    groups.ord = deck.sortOrder ?? null;
    groups.desc = [typeof deck.description === 'string' ? deck.description : '', deck.descriptionMarkdown === true];
    const filtered = deck.isFiltered === true;
    groups.filt = filtered ? pick(deck, FILTER_OPTS) : null;
    groups.fbuild = filtered ? { ...pick(deck, FILTER_BUILD), m: setting(ctx, MEMBERSHIP_KEY(id)) } : null;
    groups.x = restOf(deck, DECK_KNOWN);
    return groups;
}

/** The groups of the Default deck as a fresh install writes it. */
const DEFAULT_DECK_GROUP_HASHES = (() => {
    const deck = DEFAULT_DECKS[0] as unknown as Record<string, unknown>;
    const groups: Groups = {
        cfg: num(deck.configId, 1), lim: [null, null], ret: null, coll: false, today: null, par: 0,
        leaf: String(deck.name), ord: null, desc: ['', false], filt: null, fbuild: null, x: null,
    };
    return new Map(Object.entries(groups).map(([name, value]) => [name, hashValue(value)]));
})();

export const deckCodec: Codec = {
    table: 'decks',
    kinds: ['deck', 'cdeck'],

    encode(ctx, lid) {
        const row = ctx.db.getFirstSync<{ name: string; data: string }>('SELECT name, data FROM decks WHERE id = ?', Number(lid));
        const deck = row ? ctx.parse(row.data) : null;
        if (!row || !deck) return null;
        const id = Number(lid);
        const source = ctx.catalogSource('decks', id);
        const catalog = source !== null;
        const groups = deckGroups(ctx, id, row.name, deck, catalog);
        const encoded: Encoded = {
            kind: catalog ? 'cdeck' : 'deck',
            id: catalog ? String(source) : lid,
            lid,
            ident: catalog ? null : id === 1 ? 'b:1' : `n:${row.name.toLowerCase()}`,
            groups,
            modMs: modToMs(deck.mod),
        };
        if (id === 1 && !catalog) {
            encoded.defaults = new Set(Object.entries(groups)
                .filter(([name, value]) => DEFAULT_DECK_GROUP_HASHES.get(name) === hashValue(value))
                .map(([name]) => name));
        }
        return encoded;
    },

    localKey(ctx, kind, id) {
        if (kind === 'cdeck') {
            const local = ctx.catalogLocal('decks', Number(id));
            return local === null ? null : String(local);
        }
        return ctx.db.getFirstSync('SELECT 1 AS x FROM decks WHERE id = ?', Number(id)) ? id : null;
    },

    write(ctx, kind, id, lid, _ident, groups) {
        const existingRow = lid === null ? null : ctx.db.getFirstSync<{ name: string; data: string }>('SELECT name, data FROM decks WHERE id = ?', Number(lid));
        const existing = existingRow ? ctx.parse(existingRow.data) : null;
        if (!existing && kind === 'cdeck') return { park: 'catalog' };
        const localId = existing ? Number(lid) : Number(id);
        const deck: Record<string, unknown> = existing ? { ...existing } : { id: localId, mod: 0, usn: -1, description: '', collapsed: false, isFiltered: false };

        if (groups.cfg !== undefined) {
            const configId = ctx.local('deck_configs', groups.cfg);
            // A preset that is not here (deleted, or not arrived) falls back to the default one.
            deck.configId = configId === null || configId === 0 ? 1 : configId;
        }
        if (groups.lim !== undefined) {
            const [newLimit, reviewLimit] = Array.isArray(groups.lim) ? groups.lim : [null, null];
            if (newLimit === null || newLimit === undefined) delete deck.newLimit; else deck.newLimit = newLimit;
            if (reviewLimit === null || reviewLimit === undefined) delete deck.reviewLimit; else deck.reviewLimit = reviewLimit;
        }
        if (groups.ret !== undefined) {
            if (groups.ret === null) delete deck.desiredRetention; else deck.desiredRetention = groups.ret;
        }
        if (groups.coll !== undefined) deck.collapsed = groups.coll === true;
        if ('today' in groups) {
            const today = groups.today as { l?: unknown; b?: unknown } | null;
            putSetting(ctx, TODAY_LIMITS_KEY(localId), today?.l ?? null);
            putSetting(ctx, TODAY_BOOST_KEY(localId), today?.b ?? null);
        }

        let name = existingRow?.name ?? '';
        if (kind === 'deck') {
            if (!existing && (groups.leaf === undefined || groups.par === undefined)) return { park: 'incomplete' };
            if ('ord' in groups) {
                if (groups.ord === null) delete deck.sortOrder; else deck.sortOrder = groups.ord;
            }
            if ('desc' in groups) {
                const [description, markdown] = Array.isArray(groups.desc) ? groups.desc : ['', false];
                deck.description = typeof description === 'string' ? description : '';
                if (markdown === true) deck.descriptionMarkdown = true; else delete deck.descriptionMarkdown;
            }
            if ('filt' in groups) {
                deck.isFiltered = groups.filt !== null && groups.filt !== undefined;
                place(deck, FILTER_OPTS, groups.filt);
            }
            if ('fbuild' in groups) {
                place(deck, FILTER_BUILD, groups.fbuild);
                const membership = groups.fbuild && typeof groups.fbuild === 'object' ? (groups.fbuild as { m?: unknown }).m : null;
                putSetting(ctx, MEMBERSHIP_KEY(localId), membership ?? null);
            }
            if ('x' in groups) applyRest(deck, DECK_KNOWN, groups.x);
            if (groups.leaf !== undefined || groups.par !== undefined) {
                const parentRef = groups.par ?? 0;
                let parentName: string | null = null;
                const parentId = parentRef === 0 || parentRef === null ? 0 : liveParent(ctx, parentRef);
                if (parentId === 'park') return { park: 'parent' };
                // The parent was deleted elsewhere: the deck follows it into the deck it was merged
                // into, or to the top, and says so as a derived write.
                if (parentId !== (parentRef === 0 || parentRef === null ? 0 : ctx.local('decks', parentRef))) ctx.touched.push(['decks', String(localId)]);
                if (parentId !== 0) {
                    parentName = ctx.db.getFirstSync<{ name: string }>('SELECT name FROM decks WHERE id = ?', parentId)?.name ?? null;
                    if (parentName === null) return { park: 'parent' };
                    if (existingRow && (parentName === existingRow.name || parentName.startsWith(`${existingRow.name}::`))) {
                        parentName = breakCycle(ctx, localId, existingRow.name, parentId);
                    }
                }
                const leaf = typeof groups.leaf === 'string' && groups.leaf.trim() ? groups.leaf : getDeckDisplayName(name || `Deste ${localId}`);
                name = parentName ? `${parentName}::${leaf}` : leaf;
            }
        }
        deck.name = name;
        deck.mod = Math.floor(ctx.now() / 1000);
        deck.usn = -1;
        renameAndWrite(ctx, localId, existingRow?.name ?? null, name, deck);
        return { lid: String(localId) };
    },

    remove(ctx, _kind, lid) {
        const name = ctx.db.getFirstSync<{ name: string }>('SELECT name FROM decks WHERE id = ?', Number(lid))?.name;
        if (name !== undefined) {
            // Its direct subdecks, by id: a deck that takes the freed name later is not their parent.
            const children = ctx.db.getAllSync<{ id: number }>(
                "SELECT id FROM decks WHERE substr(name, 1, ?) = ? AND instr(substr(name, ?), '::') = 0",
                name.length + 2, `${name}::`, name.length + 3,
            ).map((row) => Number(row.id));
            ctx.removedDecks.push({ id: Number(lid), name, children });
        }
        ctx.db.runSync('DELETE FROM decks WHERE id = ?', Number(lid));
        for (const key of [MEMBERSHIP_KEY, TODAY_LIMITS_KEY, TODAY_BOOST_KEY]) ctx.db.runSync('DELETE FROM settings WHERE key = ?', key(Number(lid)));
        // Cards and subdecks still pointing here are moved by the repair pass (lib/sync/syncDeckTree.ts).
    },
};

/**
 * Two devices moved two decks under each other, so the new parent is this deck or one of its
 * subdecks (§6.4). The deck with the smallest id on that loop goes to the top level: when it is
 * this deck, it is written at the top; otherwise that deck is moved out first. Returns the parent
 * name to write this deck under (null: top level). The moved decks are captured as derived writes.
 */
function breakCycle(ctx: CodecContext, deckId: number, deckName: string, parentId: number): string | null {
    const parentName = ctx.db.getFirstSync<{ name: string }>('SELECT name FROM decks WHERE id = ?', parentId)?.name ?? deckName;
    const own = deckName.split('::').length;
    const parts = parentName.split('::');
    const loop: Array<{ id: number; name: string }> = [{ id: deckId, name: deckName }];
    for (let length = own + 1; length <= parts.length; length += 1) {
        const name = parts.slice(0, length).join('::');
        const row = ctx.db.getFirstSync<{ id: number }>('SELECT id FROM decks WHERE name = ?', name);
        if (row) loop.push({ id: Number(row.id), name });
    }
    const smallest = loop.reduce((best, entry) => (entry.id < best.id ? entry : best));
    ctx.touched.push(['decks', String(deckId)]);
    if (smallest.id === deckId) return null;
    const leaf = getDeckDisplayName(smallest.name);
    const taken = ctx.db.getFirstSync<{ id: number }>('SELECT id FROM decks WHERE name = ?', leaf);
    const target = taken && Number(taken.id) !== smallest.id ? `${leaf}${DUPLICATE_MARK}${smallest.id}` : leaf;
    const data = ctx.parse(ctx.db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE id = ?', smallest.id)?.data) ?? {};
    data.name = target;
    ctx.db.runSync('UPDATE decks SET name = ?, data = ? WHERE id = ?', target, JSON.stringify(data), smallest.id);
    renameSubdecks(ctx, smallest.name, target);
    ctx.touched.push(['decks', String(smallest.id)]);
    return ctx.db.getFirstSync<{ name: string }>('SELECT name FROM decks WHERE id = ?', parentId)?.name ?? null;
}

/**
 * The deck a subdeck sits under: the parent itself, or, when another device deleted it, the deck
 * it was merged into, else the top level (0). An unknown parent (not arrived yet) parks the deck.
 */
export function liveParent(ctx: CodecContext, ref: unknown): number | 'park' {
    const local = ctx.local('decks', ref);
    if (local !== null) return local;
    if (typeof ref !== 'number') return 'park';
    const shadow = ctx.db.getFirstSync<{ f: string }>("SELECT f FROM sync_shadow WHERE kind = 'deck' AND id = ?", String(ref));
    let deleted = false;
    try { deleted = Boolean(shadow) && (JSON.parse(shadow!.f) as Record<string, [string]>).del?.[0] === hashValue(true); } catch { deleted = false; }
    if (!deleted) return 'park';
    let hop = ref;
    for (let depth = 0; depth < 20; depth += 1) {
        const winner = ctx.db.getFirstSync<{ winner: number }>('SELECT winner FROM sync_merged WHERE loser = ?', hop)?.winner;
        if (winner === undefined) break;
        if (ctx.db.getFirstSync('SELECT 1 AS x FROM decks WHERE id = ?', winner)) return Number(winner);
        hop = Number(winner);
    }
    return 0;
}

/** Marks a deck name taken by another deck; the repair pass merges the two (§6.4). */
export const DUPLICATE_MARK = '⁣dup:';

/**
 * Writes a deck under its name, renaming its subdecks along with it. A name another deck already
 * holds is written with a duplicate mark instead; the repair pass then merges the two decks.
 */
function renameAndWrite(ctx: CodecContext, id: number, oldName: string | null, wanted: string, deck: Record<string, unknown>): void {
    const holder = ctx.db.getFirstSync<{ id: number }>('SELECT id FROM decks WHERE name = ?', wanted);
    const name = holder && Number(holder.id) !== id ? `${wanted}${DUPLICATE_MARK}${id}` : wanted;
    deck.name = name;
    if (oldName === null) {
        ctx.db.runSync(
            'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, -1, 0)',
            id, name, JSON.stringify(deck), ctx.now(),
        );
        return;
    }
    ctx.db.runSync('UPDATE decks SET name = ?, data = ?, updated_at = ?, usn = -1 WHERE id = ?', name, JSON.stringify(deck), ctx.now(), id);
    if (oldName !== name) renameSubdecks(ctx, oldName, name);
}

/** Moves every subdeck of `oldName` under `newName`, as deckStore's rename does. */
export function renameSubdecks(ctx: CodecContext, oldName: string, newName: string): void {
    const children = ctx.db.getAllSync<{ id: number; name: string; data: string }>(
        'SELECT id, name, data FROM decks WHERE substr(name, 1, ?) = ?',
        oldName.length + 2, `${oldName}::`,
    );
    for (const child of children) {
        const childName = `${newName}${child.name.slice(oldName.length)}`;
        const data = ctx.parse(child.data) ?? {};
        data.name = childName;
        const taken = ctx.db.getFirstSync<{ id: number }>('SELECT id FROM decks WHERE name = ?', childName);
        const finalName = taken && Number(taken.id) !== Number(child.id) ? `${childName}${DUPLICATE_MARK}${child.id}` : childName;
        data.name = finalName;
        ctx.db.runSync('UPDATE decks SET name = ?, data = ? WHERE id = ?', finalName, JSON.stringify(data), child.id);
    }
}

// --- Presets ------------------------------------------------------------------------------------

const PRESET_SKIP = new Set(['id', 'mod', 'usn', 'catalogPack', 'catalogSourceId']);
const PRESET_CONTENT = new Set(['ankiRaw', 'sourcePackageId']);

const DEFAULT_PRESET_HASHES = new Map(
    Object.entries(DEFAULT_DECK_CONFIG as unknown as Record<string, unknown>)
        .filter(([key]) => !PRESET_SKIP.has(key) && !PRESET_CONTENT.has(key))
        .map(([key, value]) => [`o:${key}`, hashValue(value)]),
);

export const presetCodec: Codec = {
    table: 'deck_configs',
    kinds: ['preset', 'cpreset'],

    encode(ctx, lid) {
        const raw = ctx.db.getFirstSync<{ data: string }>('SELECT data FROM deck_configs WHERE id = ?', Number(lid))?.data;
        const preset = ctx.parse(raw);
        if (!preset) return null;
        const id = Number(lid);
        const source = ctx.catalogSource('deck_configs', id);
        const catalog = source !== null;
        const groups: Groups = {};
        const rest: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(preset)) {
            if (PRESET_SKIP.has(key) || value === undefined) continue;
            if (PRESET_CONTENT.has(key)) rest[key] = value;
            else groups[`o:${key}`] = value;
        }
        if (!catalog) groups.x = Object.keys(rest).length > 0 ? rest : null;
        const encoded: Encoded = {
            kind: catalog ? 'cpreset' : 'preset',
            id: catalog ? String(source) : lid,
            lid,
            ident: catalog ? null : id === 1 ? 'b:1' : `n:${String(preset.name ?? '').toLowerCase()}`,
            groups,
            modMs: modToMs(preset.mod),
        };
        if (id === 1 && !catalog) {
            encoded.defaults = new Set(Object.entries(groups)
                .filter(([name, value]) => DEFAULT_PRESET_HASHES.get(name) === hashValue(value))
                .map(([name]) => name));
        }
        return encoded;
    },

    localKey(ctx, kind, id) {
        if (kind === 'cpreset') {
            const local = ctx.catalogLocal('deck_configs', Number(id));
            return local === null ? null : String(local);
        }
        return ctx.db.getFirstSync('SELECT 1 AS x FROM deck_configs WHERE id = ?', Number(id)) ? id : null;
    },

    write(ctx, kind, id, lid, _ident, groups) {
        const raw = lid === null ? null : ctx.db.getFirstSync<{ data: string }>('SELECT data FROM deck_configs WHERE id = ?', Number(lid))?.data;
        const existing = raw ? ctx.parse(raw) : null;
        if (!existing && kind === 'cpreset') return { park: 'catalog' };
        const localId = existing ? Number(lid) : Number(id);
        const preset: Record<string, unknown> = existing ? { ...existing } : { ...DEFAULT_DECK_CONFIG, id: localId };
        for (const [name, value] of Object.entries(groups)) {
            if (!name.startsWith('o:')) continue;
            const key = name.slice(2);
            if (PRESET_SKIP.has(key) || PRESET_CONTENT.has(key)) continue;
            if (value === null || value === undefined) delete preset[key];
            else preset[key] = value;
        }
        if (kind === 'preset' && 'x' in groups) {
            const rest = groups.x && typeof groups.x === 'object' ? groups.x as Record<string, unknown> : {};
            for (const key of PRESET_CONTENT) {
                if (rest[key] === undefined) delete preset[key];
                else preset[key] = rest[key];
            }
        }
        preset.id = localId;
        preset.mod = Math.floor(ctx.now() / 1000);
        preset.usn = -1;
        ctx.db.runSync('INSERT OR REPLACE INTO deck_configs (id, data) VALUES (?, ?)', localId, JSON.stringify(preset));
        return { lid: String(localId) };
    },

    remove(ctx, _kind, lid) {
        ctx.db.runSync('DELETE FROM deck_configs WHERE id = ?', Number(lid));
    },
};

// --- Note types ---------------------------------------------------------------------------------

const NOTE_TYPE_KNOWN = new Set(['id', 'name', 'kind', 'fields', 'templates', 'css', 'sortFieldIdx', 'mod', 'usn', 'catalogPack', 'catalogSourceId']);

function noteTypeGroups(noteType: Record<string, unknown>): Groups {
    return {
        name: noteType.name ?? '',
        kind: noteType.kind === 'cloze' ? 'cloze' : 'standard',
        css: typeof noteType.css === 'string' ? noteType.css : '',
        fields: Array.isArray(noteType.fields) ? noteType.fields : [],
        tpls: Array.isArray(noteType.templates) ? noteType.templates : [],
        sort: num(noteType.sortFieldIdx),
        x: restOf(noteType, NOTE_TYPE_KNOWN),
    };
}

const BUILTIN_HASHES = new Map(BUILTIN_NOTE_TYPES.map((noteType) => [
    noteType.id,
    new Map(Object.entries(noteTypeGroups(noteType as unknown as Record<string, unknown>)).map(([name, value]) => [name, hashValue(value)])),
]));

export const noteTypeCodec: Codec = {
    table: 'note_types',
    kinds: ['ntype'],

    encode(ctx, lid) {
        const raw = ctx.db.getFirstSync<{ data: string }>('SELECT data FROM note_types WHERE id = ?', Number(lid))?.data;
        const noteType = ctx.parse(raw);
        // The catalog's note types are its content: they never leave the device.
        if (!noteType || ctx.catalogSource('note_types', Number(lid)) !== null) return null;
        const id = Number(lid);
        const groups = noteTypeGroups(noteType);
        const builtin = BUILTIN_HASHES.get(id);
        const encoded: Encoded = {
            kind: 'ntype',
            id: lid,
            lid,
            ident: builtin ? `b:${id}` : `n:${String(noteType.name ?? '').toLowerCase()}`,
            groups,
            modMs: modToMs(noteType.mod),
        };
        if (builtin) {
            encoded.defaults = new Set(Object.entries(groups).filter(([name, value]) => builtin.get(name) === hashValue(value)).map(([name]) => name));
        }
        return encoded;
    },

    localKey(ctx, _kind, id) {
        return ctx.db.getFirstSync('SELECT 1 AS x FROM note_types WHERE id = ?', Number(id)) ? id : null;
    },

    write(ctx, _kind, id, lid, _ident, groups) {
        const raw = lid === null ? null : ctx.db.getFirstSync<{ data: string }>('SELECT data FROM note_types WHERE id = ?', Number(lid))?.data;
        const existing = raw ? ctx.parse(raw) : null;
        if (!existing && (groups.name === undefined || groups.fields === undefined || groups.tpls === undefined)) return { park: 'incomplete' };
        const noteType: Record<string, unknown> = existing ? { ...existing } : { id: Number(id), css: '', sortFieldIdx: 0, kind: 'standard' };
        if (groups.name !== undefined) noteType.name = String(groups.name ?? '');
        if (groups.kind !== undefined) noteType.kind = groups.kind === 'cloze' ? 'cloze' : 'standard';
        if (groups.css !== undefined) noteType.css = typeof groups.css === 'string' ? groups.css : '';
        if (Array.isArray(groups.fields)) noteType.fields = groups.fields;
        if (Array.isArray(groups.tpls)) noteType.templates = groups.tpls;
        if (groups.sort !== undefined) noteType.sortFieldIdx = num(groups.sort);
        if ('x' in groups) applyRest(noteType, NOTE_TYPE_KNOWN, groups.x);
        noteType.mod = Math.floor(ctx.now() / 1000);
        noteType.usn = -1;
        ctx.db.runSync(
            'INSERT OR REPLACE INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, -1, 0)',
            noteType.id, String(noteType.name ?? ''), JSON.stringify(noteType), ctx.now(),
        );
        return { lid: String(noteType.id) };
    },

    remove(ctx, _kind, lid) {
        ctx.db.runSync('DELETE FROM note_types WHERE id = ?', Number(lid));
    },
};

export type { SyncKind };
