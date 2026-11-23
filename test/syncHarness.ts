// Two (or more) devices against one in-process sync server, each with its own real SQLite
// collection, running the app's own lib/ code (docs/HESAP_SENKRON.md §9.1: "the real bar is the
// same invariants on two sql.js clients with the real lib/ code").
import type { SqlJsStatic } from 'sql.js';
import { AccountStore } from '../server/account/store.ts';
import { SyncService } from '../server/account/sync.ts';
import { SyncCollections } from '../server/account/syncStore.ts';
import { SYNC_FORMAT, type PullReply, type PushReply, type PushRequest, type SyncStateReply, type WaitReply } from '../lib/syncContract';
import { SyncClock } from '../lib/sync/syncClock';
import { createEnv, markEverything, type SyncEnv } from '../lib/sync/syncCapture';
import { ensureSyncTables, installCaptureTriggers, setMeta } from '../lib/sync/syncDb';
import { runSyncRound, type RoundResult, type SyncTransport } from '../lib/sync/syncRun';
import { createAppDb, type SyncDb } from './sqljsHarness';

export interface DbHolder {
    db: any;
}

export class TransportError extends Error {
    readonly code: string;
    constructor(code: string) {
        super(code);
        this.code = code;
    }
}

export interface Faults {
    /** Probability a request is lost before the server sees it. */
    dropRequest: number;
    /** Probability the server's answer is lost after it acted. */
    dropReply: number;
    random: () => number;
}

const SILENT = { info: () => undefined, warn: () => undefined, error: () => undefined };

export class SyncWorld {
    readonly accounts = new AccountStore(':memory:');
    readonly collections = new SyncCollections(':memory:');
    readonly service: SyncService;
    readonly userId = 'user0000000001';
    serverNow: () => number = () => Date.now();

    constructor() {
        this.service = new SyncService({ accounts: this.accounts, collections: this.collections, log: SILENT, now: () => this.serverNow() });
        const now = Date.now();
        this.accounts.insertUser({
            id: this.userId, email: 'a@example.com', name: 'A', passwordHash: '', emailVerifiedAt: now,
            createdAt: now, updatedAt: now, googleSub: null, appleSub: null,
        });
    }

    /** What the server holds, as plain data. */
    serverObjects(): Array<{ k: string; id: string; f: Record<string, [unknown, number, number]> }> {
        const all: Array<{ k: string; id: string; f: Record<string, [unknown, number, number]> }> = [];
        const device = 'inspector-device-01';
        this.service.state(this.userId, device, 'inspector', SYNC_FORMAT);
        let cursor: string | null = null;
        do {
            const page: PullReply = this.service.pull(this.userId, device, '0', cursor);
            all.push(...page.objs.map((obj) => ({ k: obj.k, id: obj.id, f: obj.f as never })));
            cursor = page.next;
        } while (cursor);
        return all;
    }
}

export class TestClient {
    readonly name: string;
    readonly db: SyncDb;
    env!: SyncEnv;
    readonly deviceId: string;
    online = true;
    faults: Faults | null = null;
    /** Local clock skew in ms (the device's wall clock minus the true time). */
    skewMs = 0;
    private readonly world: SyncWorld;
    private readonly holder: DbHolder;

    constructor(SQL: SqlJsStatic, world: SyncWorld, holder: DbHolder, name: string) {
        this.name = name;
        this.world = world;
        this.holder = holder;
        this.db = createAppDb(SQL);
        this.deviceId = `device-${name}-0000000`;
    }

    now = (): number => Date.now() + this.skewMs;

    /** Runs app code against this device's collection. */
    run<T>(work: () => T): T {
        this.holder.db = this.db;
        return work();
    }

    readonly transport: SyncTransport = {
        state: async (): Promise<SyncStateReply> => this.call(() => this.world.service.state(this.world.userId, this.deviceId, this.name, SYNC_FORMAT)),
        push: async (body: PushRequest): Promise<PushReply> => this.call(() => this.world.service.push(this.world.userId, this.deviceId, body as never)),
        pull: async (since: number, cursor: string | null): Promise<PullReply> =>
            this.call(() => this.world.service.pull(this.world.userId, this.deviceId, String(since), cursor)),
        wait: async (since: number): Promise<WaitReply> => this.call(() => this.world.service.wait(this.world.userId, this.deviceId, String(since))) as never,
    };

    private call<T>(work: () => T): T {
        if (!this.online) throw new TransportError('offline');
        if (this.faults && this.faults.random() < this.faults.dropRequest) throw new TransportError('offline');
        let result: T;
        try {
            result = work();
        } catch (error) {
            const code = (error as { code?: string }).code;
            if (!code) throw error;
            throw new TransportError(code);
        }
        if (this.faults && this.faults.random() < this.faults.dropReply) throw new TransportError('timeout');
        return result;
    }

    /** Signs in and turns sync on: the device's own collection becomes ordinary changes. */
    async link(): Promise<void> {
        const state = await this.transport.state();
        ensureSyncTables(this.db);
        setMeta(this.db, 'dev', String(state.dev));
        setMeta(this.db, 'deviceId', this.deviceId);
        installCaptureTriggers(this.db);
        this.env = createEnv(this.db, new SyncClock(this.db, this.now), state.dev, this.now);
        markEverything(this.db, { link: true });
    }

    /** One sync round; returns null when the network failed part-way. */
    async sync(): Promise<RoundResult | null> {
        this.holder.db = this.db;
        try {
            return await runSyncRound(this.env, this.transport, { now: this.now });
        } catch (error) {
            if (error instanceof TransportError) return null;
            throw error;
        }
    }

    close(): void {
        this.db.close();
    }
}

/** Syncs every device until a whole pass changes nothing anywhere. */
export async function syncUntilQuiet(clients: readonly TestClient[], maxPasses = 10): Promise<void> {
    for (let pass = 0; pass < maxPasses; pass += 1) {
        let activity = 0;
        for (const client of clients) {
            const result = await client.sync();
            if (!result) throw new Error(`${client.name} could not sync`);
            activity += result.pushed + result.summary.changed.size;
        }
        if (activity === 0) return;
    }
}
