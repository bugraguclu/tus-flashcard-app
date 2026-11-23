import {
    SYNC_FORMAT,
    SYNC_PART_BYTES,
    type PullReply,
    type PushReply,
    type PushRequest,
    type SyncStateReply,
    type WaitReply,
} from '../syncContract';
import { applyRemote, countDeletions, emptySummary, type ApplySummary } from './syncApply';
import { acknowledge, captureChanges, dropShadow, readOutbox, readShadow, type SyncEnv } from './syncCapture';
import { getMeta, getNumberMeta, inTransaction, setMeta, withGuard } from './syncDb';
import { reidLocalObject } from './syncReid';

/*
 * One sync round (docs/HESAP_SENKRON.md §8.3): capture → push → pull → apply. Network-agnostic:
 * the app passes an HTTP transport (lib/sync/syncApi.ts), the tests the server's service itself.
 */

export interface SyncTransport {
    state(): Promise<SyncStateReply>;
    push(body: PushRequest): Promise<PushReply>;
    pull(since: number, cursor: string | null): Promise<PullReply>;
    wait(since: number, signal?: AbortSignal): Promise<WaitReply>;
}

export interface RoundHooks {
    /** Called once before applying a page with a large wave of deletions (a restore elsewhere). */
    beforeLargeDeletion?: (counts: { objects: number; answers: number }) => Promise<void>;
    now?: () => number;
}

export interface RoundResult {
    summary: ApplySummary;
    pushed: number;
    pulled: number;
    usn: number;
}

/** A wave this large is backed up first (§7.6). */
export const LARGE_DELETION = { objects: 1_000, answers: 100 };

export function errorCode(error: unknown): string | null {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : null;
}

function randomId(): string {
    const bytes = new Uint8Array(12);
    if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Captures everything marked so far. */
export function captureAll(env: SyncEnv): number {
    let total = 0;
    for (let round = 0; round < 1_000; round += 1) {
        const result = captureChanges(env);
        total += result.changed;
        if (!result.more) break;
    }
    return total;
}

/** Re-stamps every waiting group after the server said this device's clock ran ahead (§6.1). */
function restampOutbox(env: SyncEnv, serverNow: number): void {
    const { db } = env;
    env.clock.resetAfterClockAhead(serverNow);
    inTransaction(db, 'sync_restamp', () => {
        const rows = db.getAllSync<{ kind: string; id: string; grp: string }>('SELECT kind, id, grp FROM sync_out ORDER BY rowid');
        for (const row of rows) {
            const stamp = env.clock.tick();
            db.runSync('UPDATE sync_out SET hlc = ? WHERE kind = ? AND id = ? AND grp = ?', stamp, row.kind, row.id, row.grp);
            const shadow = readShadow(db, row.kind as never, row.id);
            if (shadow?.f[row.grp]) {
                shadow.f[row.grp] = [shadow.f[row.grp][0], stamp, env.dev];
                db.runSync('UPDATE sync_shadow SET f = ? WHERE kind = ? AND id = ?', JSON.stringify(shadow.f), row.kind, row.id);
            }
        }
        env.clock.save();
    });
}

async function pushOutbox(env: SyncEnv, transport: SyncTransport, summary: ApplySummary, now: () => number): Promise<number> {
    const { db } = env;
    const { parts, entries } = readOutbox(db, SYNC_PART_BYTES);
    if (parts.length === 0) return 0;
    const batchId = parts.length > 1 ? randomId() : null;
    let reply: PushReply | null = null;
    for (let index = 0; index < parts.length; index += 1) {
        const sentAt = now();
        reply = await transport.push({
            format: SYNC_FORMAT,
            objs: parts[index],
            ...(batchId ? { batch: { id: batchId, part: index, final: index === parts.length - 1 } } : {}),
        });
        env.clock.calibrate(reply.now, sentAt, now());
    }
    if (!reply) return 0;
    const sent = entries.flat();
    acknowledge(db, sent);
    for (const entry of sent) env.clock.accepted(entry.hlc);
    env.clock.save();

    // Objects the server holds under the same id are someone else's: move ours, take theirs.
    if (reply.conflicts.length > 0) {
        withGuard(db, () => inTransaction(db, 'sync_conflicts', () => {
            for (const conflict of reply!.conflicts) {
                const shadow = readShadow(db, conflict.k, conflict.id);
                if (shadow?.lid) reidLocalObject(env, conflict.k, shadow.lid);
                dropShadow(db, conflict.k, conflict.id);
                summary.reIdentified += 1;
            }
        }));
        applyRemote(env, reply.conflicts.map((conflict) => ({ k: conflict.k, id: conflict.id, ident: conflict.ident, f: conflict.f })), summary);
    }
    if (reply.win.length > 0) applyRemote(env, reply.win, summary);

    // Nobody else wrote in between: this device has everything up to its own push.
    const since = getNumberMeta(db, 'since', 0);
    if (reply.ownUsn !== null && reply.ownUsn !== undefined && reply.ownUsn === since + 1 && !getMeta(db, 'cursor')) {
        setMeta(db, 'since', String(reply.ownUsn));
    }
    return entries.reduce((total, part) => total + part.length, 0);
}

async function pushWithRecovery(env: SyncEnv, transport: SyncTransport, summary: ApplySummary, now: () => number): Promise<number> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await pushOutbox(env, transport, summary, now);
        } catch (error) {
            const code = errorCode(error);
            if (attempt >= 2) throw error;
            if (code === 'clock_ahead') {
                const state = await transport.state();
                restampOutbox(env, state.now);
                continue;
            }
            if (code === 'batch_expired') continue;
            if (code === 'device_unknown') {
                const state = await transport.state();
                env.dev = state.dev;
                setMeta(env.db, 'dev', String(state.dev));
                continue;
            }
            throw error;
        }
    }
}

async function pullAll(env: SyncEnv, transport: SyncTransport, summary: ApplySummary, hooks: RoundHooks): Promise<{ pulled: number; usn: number }> {
    const { db } = env;
    let since = getNumberMeta(db, 'since', 0);
    let cursor = getMeta(db, 'cursor');
    let pulled = 0;
    let warned = false;
    for (let page = 0; page < 100_000; page += 1) {
        const reply = await transport.pull(since, cursor);
        if (!warned && hooks.beforeLargeDeletion) {
            const counts = countDeletions(reply.objs);
            if (counts.objects >= LARGE_DELETION.objects || counts.answers >= LARGE_DELETION.answers) {
                warned = true;
                await hooks.beforeLargeDeletion(counts);
            }
        }
        if (reply.objs.length > 0) applyRemote(env, reply.objs, summary);
        pulled += reply.objs.length;
        if (reply.next) {
            cursor = reply.next;
            setMeta(db, 'cursor', cursor);
            continue;
        }
        since = Math.max(since, reply.usn);
        setMeta(db, 'since', String(since));
        db.runSync("DELETE FROM sync_meta WHERE k = 'cursor'");
        return { pulled, usn: since };
    }
    return { pulled, usn: since };
}

/**
 * A full round. Pending changes go first, so the server's answer can correct them at once; then
 * everything other devices wrote is pulled. Repairs made while applying are pushed in the same
 * round.
 */
export async function runSyncRound(env: SyncEnv, transport: SyncTransport, hooks: RoundHooks = {}): Promise<RoundResult> {
    const now = hooks.now ?? Date.now;
    const summary = emptySummary();
    captureAll(env);
    let pushed = await pushWithRecovery(env, transport, summary, now);
    const { pulled, usn } = await pullAll(env, transport, summary, hooks);
    // What waited for something local (the catalog installed since, a note written here) is tried
    // again even when nothing new came in.
    if (env.db.getFirstSync('SELECT 1 AS x FROM sync_parked LIMIT 1')) applyRemote(env, [], summary);
    for (let again = 0; again < 3; again += 1) {
        captureAll(env);
        const more = await pushWithRecovery(env, transport, summary, now);
        if (more === 0) break;
        pushed += more;
    }
    summary.parked = Number(env.db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_parked')?.n ?? 0);
    return { summary, pushed, pulled, usn: Math.max(usn, getNumberMeta(env.db, 'since', 0)) };
}
