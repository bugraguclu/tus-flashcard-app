import { HLC_SCALE, type PushObject, type SyncKind } from '../syncContract';
import { hashValue, type SyncClock } from './syncClock';
import { cardCodec, noteCodec } from './syncCodecsNotes';
import { deckCodec, noteTypeCodec, presetCodec } from './syncCodecsDecks';
import { INTERDAY_USAGE_PREFIX, revlogCodec, sessionCodec, settingCodec } from './syncCodecsOther';
import type { Codec, Encoded, Groups, ShadowGroup, ShadowRow } from './syncCodecTypes';
import { CATALOG_KINDS, CodecContext } from './syncContext';
import { CAPTURED_TABLES, SYNCED_SETTING_KEYS, SYNCED_SETTING_PREFIXES, deleteMeta, getMeta, inTransaction, setMeta, type SyncDb } from './syncDb';

/*
 * Capture (docs/HESAP_SENKRON.md §7.1): turns the rows the triggers marked into versioned groups.
 * Each marked row is encoded, compared group by group with the shadow, and every group whose value
 * changed gets a new stamp and goes to `sync_out`. Comparing values, not write events, means a row
 * deleted and written back unchanged (a catalog refresh, an undo) sends nothing.
 */

/** Applied in this order, so what an object refers to is written before it. */
export const CODECS: readonly Codec[] = [noteTypeCodec, presetCodec, deckCodec, noteCodec, cardCodec, revlogCodec, sessionCodec, settingCodec];

const BY_KIND = new Map<SyncKind, Codec>();
for (const codec of CODECS) for (const kind of codec.kinds) BY_KIND.set(kind, codec);
const BY_TABLE = new Map<string, Codec>(CODECS.map((codec) => [codec.table, codec]));

export const KIND_ORDER: readonly SyncKind[] = CODECS.flatMap((codec) => codec.kinds);

export function codecForKind(kind: SyncKind): Codec {
    const codec = BY_KIND.get(kind);
    if (!codec) throw new Error(`Unknown sync kind ${kind}`);
    return codec;
}

export interface SyncEnv {
    db: SyncDb;
    clock: SyncClock;
    /** This device's number from the server; 0 before it has one. */
    dev: number;
    ctx: CodecContext;
}

export function createEnv(db: SyncDb, clock: SyncClock, dev: number, now: () => number = Date.now): SyncEnv {
    return { db, clock, dev, ctx: new CodecContext(db, now) };
}

// --- Shadow -------------------------------------------------------------------------------------

interface ShadowDbRow {
    kind: SyncKind;
    id: string;
    lid: string | null;
    ident: string | null;
    f: string;
}

function toShadow(row: ShadowDbRow | null): ShadowRow | null {
    if (!row) return null;
    let f: Record<string, ShadowGroup> = {};
    try { f = JSON.parse(row.f) as Record<string, ShadowGroup>; } catch { f = {}; }
    return { kind: row.kind, id: row.id, lid: row.lid, ident: row.ident, f };
}

export function readShadow(db: SyncDb, kind: SyncKind, id: string): ShadowRow | null {
    return toShadow(db.getFirstSync<ShadowDbRow>('SELECT kind, id, lid, ident, f FROM sync_shadow WHERE kind = ? AND id = ?', kind, id));
}

export function shadowByLocalKey(db: SyncDb, kinds: readonly SyncKind[], lid: string): ShadowRow | null {
    const rows = db.getAllSync<ShadowDbRow>('SELECT kind, id, lid, ident, f FROM sync_shadow WHERE lid = ?', lid);
    const row = rows.find((candidate) => kinds.includes(candidate.kind)) ?? null;
    return toShadow(row);
}

export function writeShadow(db: SyncDb, row: ShadowRow): void {
    db.runSync(
        'INSERT OR REPLACE INTO sync_shadow (kind, id, lid, ident, f) VALUES (?, ?, ?, ?, ?)',
        row.kind, row.id, row.lid, row.ident, JSON.stringify(row.f),
    );
}

export function dropShadow(db: SyncDb, kind: SyncKind, id: string): void {
    db.runSync('DELETE FROM sync_shadow WHERE kind = ? AND id = ?', kind, id);
    db.runSync('DELETE FROM sync_out WHERE kind = ? AND id = ?', kind, id);
}

export const DELETED_HASH = hashValue(true);

// --- Resolving marked rows ----------------------------------------------------------------------

interface Target {
    codec: Codec;
    lid: string;
}

/** The objects a marked row belongs to. Bookkeeping keys belong to the answer or deck they name. */
export function targetsFor(table: string, rid: string): Target[] {
    if (table === 'settings') {
        if ((SYNCED_SETTING_KEYS as readonly string[]).includes(rid)) return [{ codec: settingCodec, lid: rid }];
        for (const prefix of SYNCED_SETTING_PREFIXES) {
            if (!rid.startsWith(prefix)) continue;
            const id = rid.slice(prefix.length);
            if (!/^\d+$/.test(id)) return [];
            return [{ codec: prefix === INTERDAY_USAGE_PREFIX ? revlogCodec : deckCodec, lid: id }];
        }
        return [];
    }
    const codec = BY_TABLE.get(table);
    return codec ? [{ codec, lid: String(rid) }] : [];
}

// --- Capture ------------------------------------------------------------------------------------

/**
 * normal: a change made now. derived: a repair, one step above the version it corrects (§6.4).
 * link: the first scan of a collection that existed before sync was turned on; rows keep the time
 * they were last changed, so the first link orders edits made on two devices by when they happened.
 */
export type StampMode = 'normal' | 'derived' | 'link';

export interface CaptureResult {
    /** Objects with at least one new version. */
    changed: number;
    /** More marked rows wait (the batch limit was reached). */
    more: boolean;
}

function stampFor(env: SyncEnv, mode: StampMode, current: ShadowGroup | undefined, group: string, encoded: Encoded | null, firstSight: boolean): number {
    if (mode === 'derived') {
        // One above the version it corrects; the clock moves past it, so a later edit of the same
        // group never gets this stamp again.
        const stamp = (current ? current[1] : 0) + 1;
        env.clock.witness(stamp);
        return stamp;
    }
    if (!current && encoded) {
        if (encoded.defaults?.has(group)) return 0;
        // An edit made before this device first synced keeps the time it was made; so does a
        // catalog row the installer just wrote (its package's own time), which must not override
        // what the learner did on another device.
        if (firstSight && encoded.modMs && (mode === 'link' || CATALOG_KINDS.has(encoded.kind))) {
            const stamp = Math.max(1, Math.min(encoded.modMs * HLC_SCALE, env.clock.wallStamp()));
            env.clock.witness(stamp);
            return stamp;
        }
    }
    return env.clock.tick();
}

/** Encodes one object and records every group that changed. Returns whether anything did. */
export function captureObject(env: SyncEnv, codec: Codec, lid: string, mode: StampMode): boolean {
    const { db, ctx } = env;
    const shadowOf = (kind: SyncKind, id: string) => readShadow(db, kind, id);
    const encoded = codec.encode(ctx, lid, shadowOf);
    let shadow: ShadowRow | null;
    let groups: Groups;
    let kind: SyncKind;
    let id: string;
    if (encoded) {
        kind = encoded.kind;
        id = encoded.id;
        shadow = readShadow(db, kind, id);
        groups = { ...encoded.groups };
        if (shadow?.f.del?.[0] === DELETED_HASH) groups.del = false;
    } else {
        shadow = shadowByLocalKey(db, codec.kinds, lid);
        // Never seen, a catalog row (uninstalling the catalog is not deleting progress), or a setting.
        if (!shadow || CATALOG_KINDS.has(shadow.kind) || shadow.kind === 'set') return false;
        if (shadow.f.del?.[0] === DELETED_HASH) return false;
        kind = shadow.kind;
        id = shadow.id;
        groups = { del: true };
        if (kind === 'deck') {
            // A deck merged into another says where its cards and subdecks went (§6.4).
            const winner = db.getFirstSync<{ winner: number }>('SELECT winner FROM sync_merged WHERE loser = ?', Number(lid))?.winner;
            if (winner !== undefined) groups.mi = ctx.ref('decks', Number(winner));
        }
    }
    const firstSight = !shadow;
    const f: Record<string, ShadowGroup> = { ...(shadow?.f ?? {}) };
    const names = new Set(Object.keys(groups));
    if (encoded) for (const name of Object.keys(f)) if (name !== 'del') names.add(name);
    let changed = false;
    for (const name of names) {
        const value = name in groups ? groups[name] : null;
        const hash = hashValue(value);
        const current = f[name];
        if (current && current[0] === hash) continue;
        if (!current && value === null && name !== 'del') {
            // Absent and never seen: nothing to say.
            continue;
        }
        const stamp = stampFor(env, mode, current, name, encoded, firstSight);
        f[name] = [hash, stamp, stamp === 0 ? 0 : env.dev];
        if (stamp > 0) {
            db.runSync(
                'INSERT OR REPLACE INTO sync_out (kind, id, grp, v, hlc) VALUES (?, ?, ?, ?, ?)',
                kind, id, name, JSON.stringify(value ?? null), stamp,
            );
            changed = true;
        } else {
            db.runSync('DELETE FROM sync_out WHERE kind = ? AND id = ? AND grp = ?', kind, id, name);
        }
    }
    const lidNow = encoded ? encoded.lid : null;
    const ident = shadow?.ident ?? encoded?.ident ?? null;
    if (!shadow || changed || shadow.lid !== lidNow || JSON.stringify(shadow.f) !== JSON.stringify(f)) {
        writeShadow(db, { kind, id, lid: lidNow ?? shadow?.lid ?? null, ident, f });
    }
    return changed;
}

/**
 * Captures what the triggers marked, oldest first, at most `limit` rows per call. Each call is one
 * transaction: the new versions, the shadow, the clock and the removal of the marks commit together.
 */
export function captureChanges(env: SyncEnv, options: { limit?: number; mode?: StampMode } = {}): CaptureResult {
    const { db } = env;
    const limit = options.limit ?? 5_000;
    const mode = options.mode ?? (getMeta(db, 'linkScan') === '1' ? 'link' : 'normal');
    const last = db.getFirstSync<{ seq: number }>('SELECT seq FROM sync_dirty ORDER BY seq LIMIT 1 OFFSET ?', limit - 1);
    const upTo = last ? Number(last.seq) : Number(db.getFirstSync<{ s: number | null }>('SELECT MAX(seq) AS s FROM sync_dirty')?.s ?? 0);
    if (!upTo) return { changed: 0, more: false };
    let changed = 0;
    inTransaction(db, 'sync_capture', () => {
        env.ctx.reset();
        const rows = db.getAllSync<{ tbl: string; rid: string }>('SELECT DISTINCT tbl, rid FROM sync_dirty WHERE seq <= ?', upTo);
        const seen = new Set<string>();
        for (const row of rows) {
            for (const target of targetsFor(row.tbl, String(row.rid))) {
                const key = `${target.codec.table}\u0000${target.lid}`;
                if (seen.has(key)) continue;
                seen.add(key);
                if (captureObject(env, target.codec, target.lid, mode)) changed += 1;
            }
        }
        db.runSync('DELETE FROM sync_dirty WHERE seq <= ?', upTo);
        env.clock.save();
    });
    const more = Boolean(db.getFirstSync('SELECT 1 AS x FROM sync_dirty LIMIT 1'));
    if (!more && mode === 'link') deleteMeta(db, 'linkScan');
    return { changed, more };
}

/**
 * Marks every row (and every object this device has seen that is now gone), so the next captures
 * compare the whole collection with the shadow. Used on the first link and once a day, which also
 * catches a write an old cached web build made without the triggers (§8.4).
 */
export function markEverything(db: SyncDb, options: { link?: boolean } = {}): void {
    inTransaction(db, 'sync_mark_all', () => {
        if (options.link) setMeta(db, 'linkScan', '1');
        for (const [table, key] of CAPTURED_TABLES) {
            if (table === 'settings') {
                const keys = SYNCED_SETTING_KEYS.map((name) => `'${name}'`).join(', ');
                const prefixes = SYNCED_SETTING_PREFIXES.map((prefix) => `substr(key, 1, ${prefix.length}) = '${prefix}'`).join(' OR ');
                db.runSync(`INSERT INTO sync_dirty (tbl, rid) SELECT 'settings', key FROM settings WHERE key IN (${keys}) OR ${prefixes}`);
                db.runSync(`INSERT INTO sync_dirty (tbl, rid) SELECT 'settings', value FROM (SELECT ${SYNCED_SETTING_KEYS.map((name) => `'${name}' AS value`).join(' UNION SELECT ')})`);
            } else {
                db.runSync(`INSERT INTO sync_dirty (tbl, rid) SELECT '${table}', ${key} FROM ${table}`);
            }
        }
        for (const codec of CODECS) {
            if (codec.table === 'settings') continue;
            const kinds = codec.kinds.map((kind) => `'${kind}'`).join(', ');
            db.runSync(`INSERT INTO sync_dirty (tbl, rid) SELECT '${codec.table}', lid FROM sync_shadow WHERE kind IN (${kinds}) AND lid IS NOT NULL`);
        }
    });
}

// --- Outbox -------------------------------------------------------------------------------------

export interface OutboxEntry {
    kind: SyncKind;
    id: string;
    grp: string;
    hlc: number;
}

/** The waiting groups, gathered per object, in parts of about `partBytes` of JSON. */
export function readOutbox(db: SyncDb, partBytes: number): { parts: PushObject[][]; entries: OutboxEntry[][] } {
    const rows = db.getAllSync<{ kind: SyncKind; id: string; grp: string; v: string; hlc: number; ident: string | null }>(
        `SELECT o.kind, o.id, o.grp, o.v, o.hlc, s.ident FROM sync_out o
         LEFT JOIN sync_shadow s ON s.kind = o.kind AND s.id = o.id
         ORDER BY o.kind, o.id`,
    );
    const parts: PushObject[][] = [];
    const entries: OutboxEntry[][] = [];
    let part: PushObject[] = [];
    let partEntries: OutboxEntry[] = [];
    let size = 0;
    let current: PushObject | null = null;
    const flush = () => {
        if (part.length === 0) return;
        parts.push(part);
        entries.push(partEntries);
        part = [];
        partEntries = [];
        size = 0;
    };
    for (const row of rows) {
        if (!current || current.k !== row.kind || current.id !== row.id) {
            if (size > partBytes) flush();
            current = { k: row.kind, id: row.id, ident: row.ident ?? null, f: {} };
            part.push(current);
            size += row.id.length + 40;
        }
        let value: unknown = null;
        try { value = JSON.parse(row.v); } catch { value = null; }
        current.f[row.grp] = [value, Number(row.hlc)];
        partEntries.push({ kind: row.kind, id: row.id, grp: row.grp, hlc: Number(row.hlc) });
        size += row.v.length + row.grp.length + 24;
    }
    flush();
    return { parts, entries };
}

/** Forgets the pushed versions; a group captured again while the push was in flight stays. */
export function acknowledge(db: SyncDb, sent: readonly OutboxEntry[]): void {
    inTransaction(db, 'sync_ack', () => {
        for (const entry of sent) {
            db.runSync('DELETE FROM sync_out WHERE kind = ? AND id = ? AND grp = ? AND hlc = ?', entry.kind, entry.id, entry.grp, entry.hlc);
        }
    });
}

export function outboxCount(db: SyncDb): number {
    try {
        return Number(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM (SELECT DISTINCT kind, id FROM sync_out)')?.n ?? 0);
    } catch {
        return 0;
    }
}
