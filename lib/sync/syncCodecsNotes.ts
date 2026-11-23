import { restoreQueueFromType } from '../ankiState';
import { CATALOG_PACK_ID } from '../catalogRows';
import { checksumField } from '../models';
import { sortFieldText } from '../noteChecksum';
import type { SyncKind } from '../syncContract';
import { hashValue } from './syncClock';
import type { CodecContext } from './syncContext';
import { applyRest, modToMs, restOf, type Codec, type Encoded, type Groups, type WriteOutcome } from './syncCodecTypes';

/*
 * Cards and notes (docs/HESAP_SENKRON.md §6.2). A card is split so that an answer on one device
 * and a flag, suspension, bury or move on another never overwrite each other:
 *   sched  type, due, interval, ease, reps, lapses, left, last review, the scheduling queue, and
 *          Anki's card data (FSRS memory)
 *   place  deck, original deck and original due (they move together)
 *   flag, susp, bury ([user|sibling, day], only meaningful on that day), ord, n (note, created)
 * The stored queue is derived: suspended → -1, buried today → -3/-2, otherwise sched's queue.
 * A note has one group per field (`f:<index>`) and per tag (`tag:<lower-case name>`), so editing
 * different fields, or adding a tag while a leech tag is added elsewhere, never conflicts.
 * Catalog cards and notes carry only the learner's own fields (lib/catalogProtection.ts).
 */

const CARD_KNOWN = new Set([
    'id', 'noteId', 'deckId', 'ord', 'mod', 'usn', 'type', 'queue', 'due', 'ivl', 'factor', 'reps', 'lapses',
    'left', 'odue', 'odid', 'flags', 'lastReview', 'ankiData',
]);

const NOTE_KNOWN = new Set([
    'id', 'guid', 'noteTypeId', 'mod', 'usn', 'tags', 'fields', 'sfld', 'csum',
    // Catalog bookkeeping the installer owns.
    'catalogPack', 'catalogFieldsEdited', 'catalogPackageTags', 'sourcePackageId', 'catalogSubject', 'catalogTopic',
]);
/** Learner notes carry these too, in `x`; catalog notes take them from the package. */
const NOTE_LEARNER_EXTRA = ['sourcePackageId', 'catalogSubject', 'catalogTopic'];

const num = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

interface CardRow {
    data: string;
    created: number | null;
    guid: string | null;
    pack: string | null;
}

/** Finds the day a still-buried card was buried on, from the version this device last saw. */
function buryDay(kind: 'u' | 's', today: number, previousHash: string | undefined): number {
    if (previousHash) {
        for (let day = today; day >= today - 30; day -= 1) {
            if (hashValue([kind, day]) === previousHash) return day;
        }
    }
    return today;
}

/** The bury value behind a hash, when it is one of the last month's. */
function recoverBury(today: number, hash: string): [string, number] | null {
    for (let day = today; day >= today - 30; day -= 1) {
        for (const kind of ['u', 's']) {
            if (hashValue([kind, day]) === hash) return [kind, day];
        }
    }
    return null;
}

export const cardCodec: Codec = {
    table: 'anki_cards',
    kinds: ['card', 'ccard'],

    encode(ctx, lid, shadow) {
        const row = ctx.db.getFirstSync<CardRow>(
            `SELECT c.data AS data, c.created_at AS created, json_extract(n.data, '$.guid') AS guid,
                    json_extract(n.data, '$.catalogPack') AS pack
             FROM anki_cards c LEFT JOIN notes n ON n.id = c.noteId WHERE c.id = ?`,
            Number(lid),
        );
        const card = row ? ctx.parse(row.data) : null;
        if (!row || !card) return null;
        const catalog = row.pack === CATALOG_PACK_ID;
        const kind: SyncKind = catalog ? 'ccard' : 'card';
        const queue = num(card.queue);
        const deckId = num(card.deckId, 1);
        const odid = num(card.odid);
        const groups: Groups = {
            sched: {
                type: num(card.type),
                due: num(card.due),
                ivl: num(card.ivl),
                factor: num(card.factor),
                reps: num(card.reps),
                lapses: num(card.lapses),
                left: num(card.left),
                lastReview: num(card.lastReview),
                q: queue >= 0 ? queue : restoreQueueFromType(card as never),
                d: typeof card.ankiData === 'string' ? card.ankiData : null,
            },
            place: { d: ctx.ref('decks', deckId), o: odid ? ctx.ref('decks', odid) : 0, od: num(card.odue) },
            flag: num(card.flags),
            susp: queue === -1,
        };
        const previousBury = shadow(kind, lid)?.f.bury?.[0];
        if (queue === -2 || queue === -3) {
            const buryKind = queue === -3 ? 'u' : 's';
            groups.bury = [buryKind, buryDay(buryKind, ctx.today(), previousBury)];
        } else if (queue === -1 && previousBury) {
            // A suspended card's queue cannot also say it is buried: the bury this device last
            // saw still holds, so lifting the suspension later brings it back (§6.2 `susp`/`bury`).
            const kept = recoverBury(ctx.today(), previousBury);
            if (kept) groups.bury = kept;
        }
        if (!catalog) {
            groups.n = [num(card.noteId), num(row.created)];
            groups.ord = num(card.ord);
            groups.x = restOf(card, CARD_KNOWN);
        }
        const encoded: Encoded = { kind, id: lid, lid, ident: catalog ? null : row.guid ?? null, groups, modMs: modToMs(card.mod) };
        if (catalog) encoded.defaults = catalogCardDefaults(groups);
        return encoded;
    },

    localKey(ctx, _kind, id) {
        return ctx.db.getFirstSync('SELECT 1 AS x FROM anki_cards WHERE id = ?', Number(id)) ? id : null;
    },

    write(ctx, kind, id, lid, _ident, groups): WriteOutcome {
        const existingRaw = lid === null ? null : ctx.db.getFirstSync<{ data: string }>('SELECT data FROM anki_cards WHERE id = ?', Number(lid))?.data;
        const existing = existingRaw ? ctx.parse(existingRaw) : null;
        let noteId: number;
        let created = 0;
        if (!existing) {
            if (kind === 'ccard') return { park: 'catalog' };
            const n = groups.n as [number, number] | undefined;
            if (!Array.isArray(n) || !groups.sched || !groups.place) return { park: 'incomplete' };
            noteId = num(n[0]);
            created = num(n[1]);
            if (!ctx.db.getFirstSync('SELECT 1 AS x FROM notes WHERE id = ?', noteId)) return { park: 'note' };
        } else {
            noteId = num(existing.noteId);
        }
        const card: Record<string, unknown> = existing ? { ...existing } : { id: Number(id), noteId, usn: -1 };

        const sched = groups.sched as Record<string, unknown> | undefined;
        if (sched) {
            for (const key of ['type', 'due', 'ivl', 'factor', 'reps', 'lapses', 'left', 'lastReview'] as const) card[key] = num(sched[key]);
            if (typeof sched.d === 'string') card.ankiData = sched.d;
            else delete card.ankiData;
        }
        const place = groups.place as { d?: unknown; o?: unknown; od?: unknown } | undefined;
        if (place) {
            const deck = resolveDeck(ctx, place.d);
            if (deck === 'park') return { park: 'deck' };
            card.deckId = deck;
            if (place.o === 0 || place.o === null || place.o === undefined) {
                card.odid = 0;
            } else {
                const original = resolveDeck(ctx, place.o);
                if (original === 'park') return { park: 'deck' };
                card.odid = original;
            }
            card.odue = num(place.od);
        }
        if ('flag' in groups) card.flags = num(groups.flag) & 7;
        if (!existing && groups.ord === undefined) return { park: 'incomplete' };
        if (groups.ord !== undefined && kind === 'card') card.ord = num(groups.ord);
        if (kind === 'card' && 'x' in groups) applyRest(card, CARD_KNOWN, groups.x);

        const schedQueue = num((sched ?? {}).q, num(card.queue));
        const bury = groups.bury as [string, number] | null | undefined;
        const buried = Array.isArray(bury) && num(bury[1]) === ctx.today();
        card.queue = groups.susp === true ? -1 : buried ? (bury![0] === 'u' ? -3 : -2) : schedQueue;
        card.mod = Math.floor(ctx.now() / 1000);
        card.usn = -1;

        const nowMs = ctx.now();
        const columns = [
            card.noteId, card.deckId, card.ord ?? 0, card.type ?? 0, card.queue, card.due ?? 0, card.ivl ?? 0,
            card.factor ?? 0, card.reps ?? 0, card.lapses ?? 0, card.left ?? 0, card.flags ?? 0, JSON.stringify(card), nowMs,
        ];
        if (existing) {
            ctx.db.runSync(
                `UPDATE anki_cards SET noteId = ?, deckId = ?, ord = ?, type = ?, queue = ?, due = ?, ivl = ?, factor = ?,
                    reps = ?, lapses = ?, "left" = ?, flags = ?, data = ?, updated_at = ?, usn = -1, tombstone = 0 WHERE id = ?`,
                ...columns, Number(lid),
            );
            return { lid: lid! };
        }
        ctx.db.runSync(
            `INSERT INTO anki_cards (noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data,
                updated_at, id, created_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, -1, 0)`,
            ...columns, Number(id), created || nowMs,
        );
        return { lid: id };
    },

    remove(ctx, _kind, lid) {
        ctx.db.runSync('DELETE FROM anki_cards WHERE id = ?', Number(lid));
        ctx.db.runSync('DELETE FROM cards_fts WHERE card_id = ?', String(lid));
    },
};

/** A catalog card nobody has touched holds what every fresh install of the catalog also holds. */
function catalogCardDefaults(groups: Groups): Set<string> {
    const defaults = new Set<string>();
    if (groups.flag === 0) defaults.add('flag');
    if (groups.susp === false) defaults.add('susp');
    const sched = groups.sched as Record<string, unknown>;
    if (sched.type === 0 && sched.reps === 0 && sched.lapses === 0 && !sched.lastReview && sched.d === null) defaults.add('sched');
    if ((groups.place as { o?: unknown }).o === 0) defaults.add('place');
    return defaults;
}

/**
 * The local deck a reference points to. A deck that is not here yet parks the card; one known to
 * be deleted (or merged) sends the card where Anki would: the deck it was merged into, else the
 * Default deck (§6.4).
 */
export function resolveDeck(ctx: CodecContext, ref: unknown): number | 'park' {
    const local = ctx.local('decks', ref);
    if (local !== null && local !== 0) return local;
    if (typeof ref === 'number' && ref > 0) {
        const merged = ctx.db.getFirstSync<{ winner: number }>('SELECT winner FROM sync_merged WHERE loser = ?', ref)?.winner;
        if (merged !== undefined && ctx.db.getFirstSync('SELECT 1 AS x FROM decks WHERE id = ?', merged)) return merged;
        const shadow = ctx.db.getFirstSync<{ f: string }>("SELECT f FROM sync_shadow WHERE kind = 'deck' AND id = ?", String(ref));
        if (shadow && shadow.f.includes('"del"') && isDeleted(shadow.f)) return 1;
        return 'park';
    }
    return 'park';
}

function isDeleted(rawShadow: string): boolean {
    try {
        const parsed = JSON.parse(rawShadow) as Record<string, [string, number, number]>;
        return parsed.del?.[0] === hashValue(true);
    } catch {
        return false;
    }
}

function noteTypeSortIndex(ctx: CodecContext, noteTypeId: number): number {
    const raw = ctx.db.getFirstSync<{ data: string }>('SELECT data FROM note_types WHERE id = ?', noteTypeId)?.data;
    const index = Number(ctx.parse(raw)?.sortFieldIdx);
    return Number.isInteger(index) && index >= 0 ? index : 0;
}

function tagGroups(tags: unknown): Groups {
    const groups: Groups = {};
    if (!Array.isArray(tags)) return groups;
    for (const tag of tags) {
        if (typeof tag === 'string' && tag.trim()) groups[`tag:${tag.toLowerCase()}`] = tag;
    }
    return groups;
}

/** Tags in the order the note had them, the ones it gains appended in name order. */
function mergedTags(previous: unknown, groups: Groups): string[] {
    const wanted = new Map<string, string>();
    for (const [name, value] of Object.entries(groups)) {
        if (name.startsWith('tag:') && typeof value === 'string' && value.trim()) wanted.set(name.slice(4), value);
    }
    const tags: string[] = [];
    for (const tag of Array.isArray(previous) ? previous : []) {
        if (typeof tag !== 'string') continue;
        const spelled = wanted.get(tag.toLowerCase());
        if (spelled !== undefined) {
            tags.push(spelled);
            wanted.delete(tag.toLowerCase());
        }
    }
    return [...tags, ...[...wanted.values()].sort((a, b) => a.localeCompare(b))];
}

function fieldsFromGroups(groups: Groups): string[] | null {
    let max = -1;
    for (const [name, value] of Object.entries(groups)) {
        if (!name.startsWith('f:') || value === null || value === undefined) continue;
        const index = Number(name.slice(2));
        if (Number.isInteger(index) && index >= 0 && index < 1000) max = Math.max(max, index);
    }
    if (max < 0) return null;
    const fields: string[] = [];
    for (let index = 0; index <= max; index += 1) {
        const value = groups[`f:${index}`];
        fields.push(typeof value === 'string' ? value : '');
    }
    return fields;
}

function writeNoteRow(ctx: CodecContext, note: Record<string, unknown>, exists: boolean): void {
    const tags = Array.isArray(note.tags) ? note.tags as string[] : [];
    const values = [
        note.noteTypeId, note.sfld ?? '', note.csum ?? 0, tags.length > 0 ? ` ${tags.join(' ')} ` : '', JSON.stringify(note), ctx.now(),
    ];
    if (exists) {
        ctx.db.runSync(
            'UPDATE notes SET noteTypeId = ?, sfld = ?, csum = ?, tags = ?, data = ?, updated_at = ?, usn = -1, tombstone = 0 WHERE id = ?',
            ...values, note.id,
        );
    } else {
        ctx.db.runSync(
            `INSERT INTO notes (noteTypeId, sfld, csum, tags, data, updated_at, id, usn, tombstone)
             VALUES (?, ?, ?, ?, ?, ?, ?, -1, 0)`,
            ...values, note.id,
        );
    }
}

export const noteCodec: Codec = {
    table: 'notes',
    kinds: ['note', 'cnote'],

    encode(ctx, lid) {
        const raw = ctx.db.getFirstSync<{ data: string }>('SELECT data FROM notes WHERE id = ?', Number(lid))?.data;
        const note = ctx.parse(raw);
        if (!note) return null;
        const catalog = note.catalogPack === CATALOG_PACK_ID;
        const groups: Groups = tagGroups(note.tags);
        if (catalog) {
            groups.cf = note.catalogFieldsEdited === true && Array.isArray(note.fields) ? note.fields : null;
        } else {
            groups.nt = ctx.ref('note_types', num(note.noteTypeId));
            const fields = Array.isArray(note.fields) ? note.fields : [];
            fields.forEach((value, index) => { groups[`f:${index}`] = typeof value === 'string' ? value : String(value ?? ''); });
            const rest = restOf(note, NOTE_KNOWN) ?? {};
            for (const key of NOTE_LEARNER_EXTRA) if (note[key] !== undefined) rest[key] = note[key];
            groups.x = Object.keys(rest).length > 0 ? rest : null;
        }
        const encoded: Encoded = {
            kind: catalog ? 'cnote' : 'note',
            id: lid,
            lid,
            ident: typeof note.guid === 'string' ? note.guid : null,
            groups,
            modMs: modToMs(note.mod),
        };
        if (catalog) {
            // The package's own tags and unedited fields are on every device that installed it.
            const packageTags = Array.isArray(note.catalogPackageTags) ? note.catalogPackageTags : [];
            encoded.defaults = new Set([
                ...packageTags.filter((tag): tag is string => typeof tag === 'string').map((tag) => `tag:${tag.toLowerCase()}`),
                ...(groups.cf === null ? ['cf'] : []),
            ]);
        }
        return encoded;
    },

    localKey(ctx, _kind, id) {
        return ctx.db.getFirstSync('SELECT 1 AS x FROM notes WHERE id = ?', Number(id)) ? id : null;
    },

    write(ctx, kind, id, lid, ident, groups) {
        const existingRaw = lid === null ? null : ctx.db.getFirstSync<{ data: string }>('SELECT data FROM notes WHERE id = ?', Number(lid))?.data;
        const existing = existingRaw ? ctx.parse(existingRaw) : null;
        if (!existing && kind === 'cnote') return { park: 'catalog' };
        const note: Record<string, unknown> = existing
            ? { ...existing }
            : { id: Number(id), guid: ident ?? '', mod: 0, usn: -1, tags: [], fields: [], sfld: '', csum: 0, flags: 0 };
        if (kind === 'note') {
            if (!existing && groups.nt === undefined) return { park: 'incomplete' };
            if (groups.nt !== undefined) {
                const noteTypeId = ctx.local('note_types', groups.nt);
                if (noteTypeId === null || noteTypeId === 0) return { park: 'notetype' };
                note.noteTypeId = noteTypeId;
            }
            const fields = fieldsFromGroups(groups);
            note.fields = fields ?? [];
            const rest = (groups.x && typeof groups.x === 'object' ? groups.x : {}) as Record<string, unknown>;
            for (const key of NOTE_LEARNER_EXTRA) {
                if (rest[key] !== undefined) note[key] = rest[key];
                else delete note[key];
            }
            applyRest(note, NOTE_KNOWN, Object.fromEntries(Object.entries(rest).filter(([key]) => !NOTE_LEARNER_EXTRA.includes(key))));
        } else if (Array.isArray(groups.cf)) {
            note.fields = groups.cf.map((value) => (typeof value === 'string' ? value : ''));
            note.catalogFieldsEdited = true;
        }
        note.tags = mergedTags(note.tags, groups);
        const fields = (note.fields as string[]) ?? [];
        note.sfld = sortFieldText(fields, noteTypeSortIndex(ctx, num(note.noteTypeId)));
        note.csum = checksumField(fields[0] ?? '');
        note.mod = Math.floor(ctx.now() / 1000);
        note.usn = -1;
        writeNoteRow(ctx, note, Boolean(existing));
        ctx.noteCatalogFlag(Number(note.id), kind === 'cnote');
        return { lid: String(note.id) };
    },

    remove(ctx, _kind, lid) {
        // A deleted note takes its cards along, as a local delete does. The cards' own deletion is
        // captured afterwards as a derived write, in case their delete has not reached us yet.
        const cardIds = ctx.db.getAllSync<{ id: number }>('SELECT id FROM anki_cards WHERE noteId = ?', Number(lid)).map((row) => Number(row.id));
        ctx.db.runSync('DELETE FROM notes WHERE id = ?', Number(lid));
        for (const cardId of cardIds) {
            cardCodec.remove(ctx, 'card', String(cardId));
            ctx.touched.push(['anki_cards', String(cardId)]);
        }
    },
};
