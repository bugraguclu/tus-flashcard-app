import {
    HLC_SCALE,
    MAX_CLOCK_AHEAD_MS,
    SYNC_FORMAT,
    SYNC_PULL_PAGE,
    SYNC_WAIT_MS,
    compareVersion,
    isSyncKind,
    isValidGroupName,
    isValidObjectId,
    isValidStamp,
} from '../../lib/syncContract.ts';
import type {
    PullReply,
    PushObject,
    PushReply,
    SyncConflict,
    SyncDeviceInfo,
    SyncKind,
    SyncStateReply,
    WaitReply,
    WireGroup,
    WireObject,
} from '../../lib/syncContract.ts';
import { AccountError } from './errors.ts';
import type { Logger } from './mailer.ts';
import type { AccountStore } from './store.ts';
import type { CollectionDb, SyncCollections } from './syncStore.ts';

/*
 * The sync service (docs/HESAP_SENKRON.md §8). It keeps, for every group of every object, the
 * version with the larger (stamp, device) pair, and hands each device the objects that changed
 * since the change counter (`usn`) it last saw. It never reads the values it stores.
 */

/** Unfinished multi-part pushes are dropped after this long. */
const STAGED_TTL_MS = 60 * 60 * 1000;
/** A collection larger than this refuses further pushes (§12: per-account quota). */
export const DEFAULT_COLLECTION_QUOTA_BYTES = 512 * 1024 * 1024;
/** Most objects one request may carry; the client sends far fewer per part. */
const MAX_OBJECTS_PER_PART = 50_000;
const MAX_PARTS = 2_000;
const DEVICE_NAME_LIMIT = 60;
const TOUCH_INTERVAL_MS = 60_000;

export interface SyncServiceDeps {
    accounts: AccountStore;
    collections: SyncCollections;
    now?: () => number;
    log: Logger;
    quotaBytes?: number;
}

interface Waiter {
    since: number;
    deviceId: string;
    resolve: (reply: WaitReply) => void;
}

function invalid(message: string): AccountError {
    return new AccountError('invalid_input', 400, message);
}

function parseFields(raw: string): Record<string, WireGroup> {
    try {
        const parsed = JSON.parse(raw) as Record<string, WireGroup>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Checks a pushed object's shape; returns it typed or throws `invalid_input`. */
export function validatePushObject(raw: unknown): PushObject {
    const object = asObject(raw);
    if (!object) throw invalid('Nesne biçimi geçersiz.');
    const { k, id, ident, f } = object;
    if (!isSyncKind(k)) throw invalid('Nesne türü geçersiz.');
    if (!isValidObjectId(id)) throw invalid('Nesne kimliği geçersiz.');
    if (ident !== null && ident !== undefined && (typeof ident !== 'string' || ident.length > 400)) throw invalid('Kimlik izi geçersiz.');
    const fields = asObject(f);
    if (!fields) throw invalid('Alan grupları geçersiz.');
    const groups: Record<string, [unknown, number]> = {};
    for (const [name, group] of Object.entries(fields)) {
        if (!isValidGroupName(name)) throw invalid('Alan grubu adı geçersiz.');
        if (!Array.isArray(group) || group.length < 2 || !isValidStamp(group[1])) throw invalid('Alan grubu geçersiz.');
        groups[name] = [group[0] === undefined ? null : group[0], group[1]];
    }
    return { k, id, ident: typeof ident === 'string' ? ident : null, f: groups };
}

export function validatePushObjects(raw: unknown): PushObject[] {
    if (!Array.isArray(raw)) throw invalid('Gönderim listesi geçersiz.');
    if (raw.length > MAX_OBJECTS_PER_PART) throw new AccountError('payload_too_large', 413);
    return raw.map(validatePushObject);
}

function cleanDeviceId(value: string | null): string {
    if (!value || !/^[A-Za-z0-9_-]{8,80}$/.test(value)) throw invalid('Cihaz kimliği geçersiz.');
    return value;
}

function parseCursor(value: string | null): [number, number] {
    if (!value) return [0, 0];
    const match = /^(\d{1,15}):(\d{1,15})$/.exec(value);
    if (!match) throw invalid('İmleç geçersiz.');
    return [Number(match[1]), Number(match[2])];
}

function parseSince(value: string | null): number {
    if (value === null || value === '') return 0;
    if (!/^\d{1,15}$/.test(value)) throw invalid('Sıra numarası geçersiz.');
    return Number(value);
}

export class SyncService {
    private readonly accounts: AccountStore;
    private readonly collections: SyncCollections;
    private readonly now: () => number;
    private readonly log: Logger;
    private readonly quotaBytes: number;
    private readonly waiters = new Map<string, Set<Waiter>>();
    private readonly touchedAt = new Map<string, number>();

    constructor(deps: SyncServiceDeps) {
        this.accounts = deps.accounts;
        this.collections = deps.collections;
        this.now = deps.now ?? Date.now;
        this.log = deps.log;
        this.quotaBytes = deps.quotaBytes ?? DEFAULT_COLLECTION_QUOTA_BYTES;
    }

    /** The device's number; registers it (with the client label as its name) on first sight. */
    state(userId: string, deviceIdHeader: string | null, clientLabel: string | null, format: number): SyncStateReply {
        if (format < SYNC_FORMAT) throw new AccountError('format_too_old', 426);
        const deviceId = cleanDeviceId(deviceIdHeader);
        const name = (clientLabel ?? '').slice(0, DEVICE_NAME_LIMIT) || 'Cihaz';
        const device = this.accounts.registerSyncDevice(userId, deviceId, name, this.now());
        return { usn: this.collections.get(userId).usn(), dev: device.dev, now: this.now(), format: SYNC_FORMAT };
    }

    private deviceNumber(userId: string, deviceIdHeader: string | null): { deviceId: string; dev: number } {
        const deviceId = cleanDeviceId(deviceIdHeader);
        const device = this.accounts.findSyncDevice(userId, deviceId);
        if (!device) throw new AccountError('device_unknown', 409);
        const now = this.now();
        const key = `${userId}:${deviceId}`;
        if (now - (this.touchedAt.get(key) ?? 0) >= TOUCH_INTERVAL_MS) {
            this.touchedAt.set(key, now);
            this.accounts.touchSyncDevice(userId, deviceId, now);
        }
        return { deviceId, dev: device.dev };
    }

    push(userId: string, deviceIdHeader: string | null, body: Record<string, unknown>): PushReply {
        const format = typeof body.format === 'number' ? body.format : 0;
        if (format < SYNC_FORMAT) throw new AccountError('format_too_old', 426);
        const { deviceId, dev } = this.deviceNumber(userId, deviceIdHeader);
        const objs = validatePushObjects(body.objs);
        const now = this.now();
        const limit = (now + MAX_CLOCK_AHEAD_MS) * HLC_SCALE;
        for (const obj of objs) {
            for (const group of Object.values(obj.f)) {
                if (group[1] > limit) throw new AccountError('clock_ahead', 409, undefined, { retryAfter: 0 });
            }
        }
        const db = this.collections.get(userId);
        db.purgeStaged(now - STAGED_TTL_MS);

        const batch = asObject(body.batch);
        let all = objs;
        if (batch) {
            const id = typeof batch.id === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(batch.id) ? batch.id : null;
            const part = typeof batch.part === 'number' && Number.isInteger(batch.part) && batch.part >= 0 && batch.part < MAX_PARTS
                ? batch.part
                : null;
            if (id === null || part === null) throw invalid('Parça bilgisi geçersiz.');
            if (batch.final !== true) {
                this.assertQuota(userId);
                db.stagePart(id, part, JSON.stringify(objs), now);
                return { usn: db.usn(), now, staged: true, ownUsn: null, win: [], conflicts: [] };
            }
            const parts = db.stagedParts(id);
            // Every part before the final one must have arrived, or the batch is sent again.
            if (parts.length !== part || parts.some((stored, index) => stored.part !== index)) {
                db.dropBatch(id);
                throw new AccountError('batch_expired', 409);
            }
            all = [...parts.flatMap((stored) => validatePushObjects(JSON.parse(stored.body))), ...objs];
            db.dropBatch(id);
        }
        this.assertQuota(userId);
        const reply = db.transaction(() => this.merge(db, all, dev, now));
        if (reply.ownUsn !== null) this.wake(userId, reply.usn, deviceId);
        return reply;
    }

    private assertQuota(userId: string): void {
        if (this.collections.bytes(userId) > this.quotaBytes) throw new AccountError('quota_exceeded', 507);
    }

    private merge(db: CollectionDb, objs: PushObject[], dev: number, now: number): PushReply {
        let usn = db.usn();
        let newUsn: number | null = null;
        const win: WireObject[] = [];
        const conflicts: SyncConflict[] = [];
        for (const obj of objs) {
            const stored = db.get(obj.k, obj.id);
            if (stored && stored.ident !== null && obj.ident !== null && stored.ident !== obj.ident) {
                conflicts.push({ k: obj.k, id: obj.id, ident: stored.ident, f: parseFields(stored.fields) });
                continue;
            }
            const fields = stored ? parseFields(stored.fields) : {};
            const lost: Record<string, WireGroup> = {};
            let changed = !stored;
            for (const [name, [value, hlc]] of Object.entries(obj.f)) {
                const current = Object.prototype.hasOwnProperty.call(fields, name) ? fields[name] : undefined;
                const order = current ? compareVersion(hlc, dev, current[1], current[2]) : 1;
                if (order > 0) {
                    fields[name] = [value, hlc, dev];
                    changed = true;
                } else if (order < 0 && current) {
                    lost[name] = current;
                } else if (order === 0 && current && process.env.SYNC_STRICT_SERVER && JSON.stringify(current[0]) !== JSON.stringify(value)) {
                    throw new Error(`same version, different value: ${obj.k}/${obj.id}/${name} ${hlc}:${dev} ${JSON.stringify(current[0])} vs ${JSON.stringify(value)}`);
                }
            }
            const ident = stored?.ident ?? obj.ident;
            if (changed || (stored && stored.ident === null && ident !== null)) {
                if (newUsn === null) newUsn = usn + 1;
                db.put(obj.k, obj.id, ident, newUsn, JSON.stringify(fields));
            }
            if (Object.keys(lost).length > 0) win.push({ k: obj.k, id: obj.id, ident, f: lost });
        }
        if (newUsn !== null) {
            usn = newUsn;
            db.setUsn(usn);
        }
        return { usn, now, ownUsn: newUsn, win, conflicts };
    }

    pull(userId: string, deviceIdHeader: string | null, sinceParam: string | null, cursorParam: string | null): PullReply {
        this.deviceNumber(userId, deviceIdHeader);
        const since = parseSince(sinceParam);
        const [afterUsn, afterRowid] = parseCursor(cursorParam);
        const db = this.collections.get(userId);
        const usn = db.usn();
        const rows = db.page(since, afterUsn, afterRowid, SYNC_PULL_PAGE + 1);
        const more = rows.length > SYNC_PULL_PAGE;
        const page = more ? rows.slice(0, SYNC_PULL_PAGE) : rows;
        const last = page[page.length - 1];
        return {
            objs: page.map((row) => ({ k: row.kind as SyncKind, id: row.id, ident: row.ident, f: parseFields(row.fields) })),
            usn,
            next: more && last ? `${last.usn}:${last.rowid}` : null,
            now: this.now(),
        };
    }

    /** Answers as soon as another device changes the account, or after SYNC_WAIT_MS. */
    wait(userId: string, deviceIdHeader: string | null, sinceParam: string | null, signal?: AbortSignal): Promise<WaitReply> {
        const { deviceId } = this.deviceNumber(userId, deviceIdHeader);
        const since = parseSince(sinceParam);
        const usn = this.collections.get(userId).usn();
        if (usn > since) return Promise.resolve({ usn, now: this.now(), changed: true });
        return new Promise((resolve) => {
            let set = this.waiters.get(userId);
            if (!set) {
                set = new Set();
                this.waiters.set(userId, set);
            }
            const waiters = set;
            let timer: ReturnType<typeof setTimeout> | null = null;
            const finish = (reply: WaitReply) => {
                if (timer) clearTimeout(timer);
                waiters.delete(waiter);
                if (waiters.size === 0) this.waiters.delete(userId);
                signal?.removeEventListener('abort', onAbort);
                resolve(reply);
            };
            const waiter: Waiter = { since, deviceId, resolve: finish };
            const onAbort = () => finish({ usn: this.collections.get(userId).usn(), now: this.now(), changed: false });
            timer = setTimeout(() => finish({ usn: this.collections.get(userId).usn(), now: this.now(), changed: false }), SYNC_WAIT_MS);
            (timer as { unref?: () => void }).unref?.();
            signal?.addEventListener('abort', onAbort, { once: true });
            waiters.add(waiter);
        });
    }

    /** Wakes the account's long polls, except those of the device whose push caused the change. */
    private wake(userId: string, usn: number, pushingDeviceId: string): void {
        const set = this.waiters.get(userId);
        if (!set) return;
        for (const waiter of [...set]) {
            if (waiter.deviceId === pushingDeviceId) continue;
            if (usn > waiter.since) waiter.resolve({ usn, now: this.now(), changed: true });
        }
    }

    devices(userId: string, deviceIdHeader: string | null): { devices: SyncDeviceInfo[] } {
        const current = deviceIdHeader ?? '';
        return {
            devices: this.accounts.listSyncDevices(userId).map((device) => ({
                dev: device.dev,
                name: device.name,
                platform: '',
                lastSeenAt: new Date(device.lastSeenAt).toISOString(),
                current: device.deviceId === current,
            })),
        };
    }

    removeDevice(userId: string, dev: number): Record<string, never> {
        if (!Number.isInteger(dev) || dev <= 0) throw invalid('Cihaz numarası geçersiz.');
        if (this.accounts.removeSyncDevice(userId, dev) === 0) throw new AccountError('not_found', 404);
        return {};
    }

    /** Drops the account's synced collection (account deletion). */
    deleteUser(userId: string): void {
        this.collections.delete(userId);
        const set = this.waiters.get(userId);
        if (set) for (const waiter of [...set]) waiter.resolve({ usn: 0, now: this.now(), changed: false });
        this.log.info('[sync] a deleted account’s collection was removed');
    }

    /** Pending long polls (for the shutdown path and tests). */
    waitingCount(): number {
        let total = 0;
        for (const set of this.waiters.values()) total += set.size;
        return total;
    }
}
