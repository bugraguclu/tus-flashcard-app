import { compareVersion, type SyncKind, type WireGroup, type WireObject } from '../syncContract';
import { hashValue } from './syncClock';
import {
    DELETED_HASH,
    KIND_ORDER,
    captureChanges,
    codecForKind,
    dropShadow,
    readShadow,
    writeShadow,
    type SyncEnv,
} from './syncCapture';
import type { ShadowGroup } from './syncCodecTypes';
import { CATALOG_KINDS } from './syncContext';
import { inTransaction, withGuard } from './syncDb';
import { reidLocalObject } from './syncReid';
import { repairCollection } from './syncRepair';

/*
 * Applying what other devices wrote (docs/HESAP_SENKRON.md §6, §7.2). For each incoming group the
 * version with the larger (stamp, device) pair wins against the one in the shadow, which is this
 * device's latest, pending or not. Winning groups are laid over the object's current groups and
 * written; an object that cannot be written yet (its note or deck has not arrived, or the catalog
 * is not installed here) is parked and tried again later. Afterwards the repairs run (§6.4) and
 * what they changed is captured as derived writes, stamped just above the version they fix.
 */

export interface ApplySummary {
    /** Objects written or removed, by kind. */
    changed: Map<SyncKind, Set<string>>;
    /** Local note ids whose text changed (the search index follows them). */
    notes: Set<number>;
    /** Local card ids removed. */
    removedCards: Set<number>;
    parked: number;
    reIdentified: number;
}

export function emptySummary(): ApplySummary {
    return { changed: new Map(), notes: new Set(), removedCards: new Set(), parked: 0, reIdentified: 0 };
}

function note(summary: ApplySummary, kind: SyncKind, lid: string): void {
    let set = summary.changed.get(kind);
    if (!set) {
        set = new Set();
        summary.changed.set(kind, set);
    }
    set.add(lid);
    if (kind === 'note' || kind === 'cnote') summary.notes.add(Number(lid));
}

/** Merges two group maps, keeping the newer version of each group. */
function mergeGroups(a: Record<string, WireGroup>, b: Record<string, WireGroup>): Record<string, WireGroup> {
    const out = { ...a };
    for (const [name, group] of Object.entries(b)) {
        const current = out[name];
        if (!current || compareVersion(group[1], group[2], current[1], current[2]) > 0) out[name] = group;
    }
    return out;
}

function readParked(env: SyncEnv, kind: SyncKind, id: string): { ident: string | null; f: Record<string, WireGroup> } | null {
    const row = env.db.getFirstSync<{ ident: string | null; f: string }>('SELECT ident, f FROM sync_parked WHERE kind = ? AND id = ?', kind, id);
    if (!row) return null;
    try {
        return { ident: row.ident, f: JSON.parse(row.f) as Record<string, WireGroup> };
    } catch {
        return null;
    }
}

type Outcome = 'applied' | 'parked' | 'unchanged';

function applyObject(env: SyncEnv, incoming: WireObject, summary: ApplySummary): Outcome {
    const { db, ctx } = env;
    const codec = codecForKind(incoming.k);
    const parked = readParked(env, incoming.k, incoming.id);
    const groups = parked ? mergeGroups(parked.f, incoming.f) : incoming.f;
    const incomingIdent = incoming.ident ?? parked?.ident ?? null;

    let shadow = readShadow(db, incoming.k, incoming.id);
    if (shadow && shadow.ident && incomingIdent && shadow.ident !== incomingIdent) {
        // Another object already holds this id here: move ours aside, then take theirs (§6.5).
        if (shadow.lid !== null) reidLocalObject(env, incoming.k, shadow.lid);
        dropShadow(db, incoming.k, incoming.id);
        summary.reIdentified += 1;
        shadow = null;
    }

    const winners: Record<string, unknown> = {};
    const nextShadow: Record<string, ShadowGroup> = { ...(shadow?.f ?? {}) };
    for (const [name, [value, hlc, dev]] of Object.entries(groups)) {
        env.clock.observe(hlc);
        const current = shadow?.f[name];
        if (current && compareVersion(hlc, dev, current[1], current[2]) <= 0) continue;
        winners[name] = value;
        nextShadow[name] = [hashValue(value), hlc, dev];
        // A pending local version of this group lost: it is not sent.
        db.runSync('DELETE FROM sync_out WHERE kind = ? AND id = ? AND grp = ?', incoming.k, incoming.id, name);
    }
    if (Object.keys(winners).length === 0) {
        if (parked) db.runSync('DELETE FROM sync_parked WHERE kind = ? AND id = ?', incoming.k, incoming.id);
        return 'unchanged';
    }

    // Deleted here, and the incoming change is not an undelete: it is recorded and stays deleted.
    if (shadow?.f.del?.[0] === DELETED_HASH && !('del' in winners)) {
        writeShadow(db, { kind: incoming.k, id: incoming.id, lid: shadow.lid, ident: shadow.ident ?? incomingIdent, f: nextShadow });
        db.runSync('DELETE FROM sync_parked WHERE kind = ? AND id = ?', incoming.k, incoming.id);
        return 'applied';
    }

    let lid = shadow?.lid ?? codec.localKey(ctx, incoming.k, incoming.id);
    let current = lid !== null ? codec.encode(ctx, lid, (kind, id) => readShadow(db, kind, id)) : null;
    if (!shadow && current && current.ident && incomingIdent && current.ident !== incomingIdent && !CATALOG_KINDS.has(incoming.k)) {
        // A row this device has not captured yet (one just moved to a new id) is a different
        // object under the same id: it moves again rather than being overwritten.
        reidLocalObject(env, incoming.k, lid!);
        summary.reIdentified += 1;
        lid = null;
        current = null;
    }
    if (lid !== null && !current) lid = codec.table === 'settings' ? lid : null;
    if (current && current.kind !== incoming.k) {
        // The row here is a different kind of object (a learner card where a catalog card was
        // expected): keep it and wait.
        db.runSync('INSERT OR REPLACE INTO sync_parked (kind, id, ident, f) VALUES (?, ?, ?, ?)', incoming.k, incoming.id, incomingIdent, JSON.stringify(groups));
        summary.parked += 1;
        return 'parked';
    }
    // An object not here yet is written from everything the server sent for it, not only from
    // the groups newer than what this device last saw (a pull carries whole objects).
    const base = current
        ? current.groups
        : Object.fromEntries(Object.entries(groups).map(([name, group]) => [name, group[0]]));
    const merged = { ...base, ...winners };
    const ident = shadow?.ident ?? incomingIdent;

    if (merged.del === true) {
        if (incoming.k === 'deck' && merged.mi !== undefined && merged.mi !== null) {
            const winner = ctx.local('decks', merged.mi);
            if (winner !== null && winner !== 0) db.runSync('INSERT OR REPLACE INTO sync_merged (loser, winner) VALUES (?, ?)', Number(incoming.id), winner);
        }
        if (lid !== null && current && !CATALOG_KINDS.has(incoming.k)) {
            if (incoming.k === 'card' || incoming.k === 'ccard') summary.removedCards.add(Number(lid));
            if (incoming.k === 'note') {
                for (const row of db.getAllSync<{ id: number }>('SELECT id FROM anki_cards WHERE noteId = ?', Number(lid))) {
                    summary.removedCards.add(Number(row.id));
                }
            }
            codec.remove(ctx, incoming.k, lid);
            note(summary, incoming.k, lid);
        }
        writeShadow(db, { kind: incoming.k, id: incoming.id, lid: null, ident, f: nextShadow });
        db.runSync('DELETE FROM sync_parked WHERE kind = ? AND id = ?', incoming.k, incoming.id);
        return 'applied';
    }

    const outcome = codec.write(ctx, incoming.k, incoming.id, lid, ident, merged);
    if ('park' in outcome) {
        db.runSync('INSERT OR REPLACE INTO sync_parked (kind, id, ident, f) VALUES (?, ?, ?, ?)', incoming.k, incoming.id, incomingIdent, JSON.stringify(groups));
        summary.parked += 1;
        return 'parked';
    }
    ctx.reset();
    // The shadow keeps the incoming stamps with the hash of what was actually written, so the
    // next capture does not mistake a normalized value for a local edit.
    // Encoded against the versions just taken in, so a value the row cannot show (a bury under a
    // suspension) is read back from them rather than from what this device saw before.
    const written = codec.encode(ctx, outcome.lid, (kind, id) => (kind === incoming.k && id === incoming.id
        ? { kind, id, lid: outcome.lid, ident, f: nextShadow }
        : readShadow(db, kind, id)));
    for (const name of Object.keys(winners)) {
        if (name === 'del') continue;
        const value = written && name in written.groups ? written.groups[name] : null;
        nextShadow[name] = [hashValue(value), nextShadow[name][1], nextShadow[name][2]];
    }
    writeShadow(db, { kind: incoming.k, id: incoming.id, lid: outcome.lid, ident, f: nextShadow });
    db.runSync('DELETE FROM sync_parked WHERE kind = ? AND id = ?', incoming.k, incoming.id);
    note(summary, incoming.k, outcome.lid);
    return 'applied';
}

function sortByKind(objects: readonly WireObject[]): WireObject[] {
    const rank = new Map(KIND_ORDER.map((kind, index) => [kind, index]));
    return [...objects].sort((a, b) => (rank.get(a.k) ?? 99) - (rank.get(b.k) ?? 99));
}

/**
 * Applies a page of incoming objects in one transaction, retries parked objects whose missing
 * piece may have arrived, runs the repairs and captures their changes as derived writes.
 */
export function applyRemote(env: SyncEnv, objects: readonly WireObject[], summary: ApplySummary = emptySummary()): ApplySummary {
    const { db } = env;
    inTransaction(db, 'sync_apply', () => {
        withGuard(db, () => {
            env.ctx.reset();
            let pending = sortByKind(objects);
            // Objects that wait for one another (a subdeck and its parent in the same page) get
            // more passes, as long as each pass writes something.
            for (let pass = 0; pass < 8 && pending.length > 0; pass += 1) {
                const parkedNow: WireObject[] = [];
                let progress = false;
                for (const object of pending) {
                    const result = applyObject(env, object, summary);
                    if (result === 'parked') parkedNow.push(object);
                    else progress = true;
                }
                if (!progress || parkedNow.length === 0) break;
                summary.parked -= parkedNow.length;
                pending = parkedNow.map((object) => ({ ...object, f: {} }));
            }
            retryParked(env, summary);
        });
        const touched = env.ctx.touched.splice(0);
        for (const [table, key] of touched) db.runSync('INSERT INTO sync_dirty (tbl, rid) VALUES (?, ?)', table, key);
        repairCollection(env, summary);
        captureChanges(env, { mode: 'derived', limit: 1_000_000 });
        env.clock.save();
    });
    return summary;
}

/** Tries the parked objects again; one whose piece arrived is written now. */
export function retryParked(env: SyncEnv, summary: ApplySummary): void {
    const rows = env.db.getAllSync<{ kind: SyncKind; id: string; ident: string | null }>('SELECT kind, id, ident FROM sync_parked');
    if (rows.length === 0) return;
    const rank = new Map(KIND_ORDER.map((kind, index) => [kind, index]));
    rows.sort((a, b) => (rank.get(a.kind) ?? 99) - (rank.get(b.kind) ?? 99));
    for (const row of rows) {
        const before = summary.parked;
        const outcome = applyObject(env, { k: row.kind, id: row.id, ident: row.ident, f: {} }, summary);
        if (outcome === 'parked') summary.parked = before;
    }
}

/** How many incoming deletions a page carries (a big wave triggers a backup first, §7.6). */
export function countDeletions(objects: readonly WireObject[]): { objects: number; answers: number } {
    let objectsDeleted = 0;
    let answers = 0;
    for (const object of objects) {
        const del = object.f.del;
        if (!del || del[0] !== true) continue;
        if (object.k === 'rev') answers += 1;
        else objectsDeleted += 1;
    }
    return { objects: objectsDeleted, answers };
}

export { DELETED_HASH };
