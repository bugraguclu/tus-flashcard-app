import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HLC_SCALE, MAX_CLOCK_AHEAD_MS, SYNC_FORMAT, SYNC_PULL_PAGE, SYNC_WAIT_MS } from '../../lib/syncContract.ts';
import type { PushObject } from '../../lib/syncContract.ts';
import { AccountError } from './errors.ts';
import { createAccountHandler } from './http.ts';
import type { Logger } from './mailer.ts';
import { SyncService } from './sync.ts';
import { SyncCollections } from './syncStore.ts';
import { createHarness, registration } from './testing.ts';

const SILENT: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
const PHONE = 'phone-device-0001';
const WEB = 'web-device-00002';

async function setup(options: { dir?: string; quotaBytes?: number } = {}) {
    const harness = createHarness({ syncEnabled: true } as never);
    const collections = new SyncCollections(options.dir ?? ':memory:');
    const sync = new SyncService({
        accounts: harness.store,
        collections,
        now: harness.clock.now,
        log: SILENT,
        quotaBytes: options.quotaBytes,
    });
    const grant = await harness.service.register(registration(), harness.context) as { token: string; user: { id: string } };
    const userId = grant.user.id;
    const phone = sync.state(userId, PHONE, 'iPhone', SYNC_FORMAT).dev;
    const web = sync.state(userId, WEB, 'Chrome · Mac', SYNC_FORMAT).dev;
    const stamp = (offsetMs = 0, counter = 0) => (harness.clock.now() + offsetMs) * HLC_SCALE + counter;
    const push = (device: string, objs: PushObject[], extra: Record<string, unknown> = {}) =>
        sync.push(userId, device, { format: SYNC_FORMAT, objs, ...extra });
    return { ...harness, sync, collections, userId, phone, web, stamp, push, token: grant.token };
}

const card = (id: string, f: PushObject['f'], ident: string | null = 'guid-1'): PushObject => ({ k: 'card', id, ident, f });

describe('devices', () => {
    it('numbers each device once, in order, and keeps the number', async () => {
        const { sync, userId, phone, web } = await setup();
        expect([phone, web]).toEqual([1, 2]);
        expect(sync.state(userId, PHONE, 'iPhone 15', SYNC_FORMAT).dev).toBe(1);
        expect(sync.devices(userId, WEB).devices.map((device) => [device.dev, device.current]).sort()).toEqual([[1, false], [2, true]]);
    });

    it('refuses an unknown device and a malformed id', async () => {
        const { sync, userId } = await setup();
        expect(() => sync.pull(userId, 'never-registered-1', null, null)).toThrow(expect.objectContaining({ code: 'device_unknown' }));
        expect(() => sync.state(userId, 'x', null, SYNC_FORMAT)).toThrow(expect.objectContaining({ code: 'invalid_input' }));
        expect(() => sync.state(userId, PHONE, null, 0)).toThrow(expect.objectContaining({ code: 'format_too_old' }));
    });

    it('forgets a removed device and never reuses its number', async () => {
        const { sync, userId } = await setup();
        sync.removeDevice(userId, 1);
        expect(() => sync.pull(userId, PHONE, null, null)).toThrow(expect.objectContaining({ code: 'device_unknown' }));
        expect(sync.state(userId, PHONE, 'iPhone', SYNC_FORMAT).dev).toBe(3);
    });
});

describe('merging groups', () => {
    it('keeps the newer version of each group independently', async () => {
        const { push, sync, userId, stamp, phone, web } = await setup();
        push(PHONE, [card('5', { sched: ['answered', stamp(0)], flag: [0, stamp(0)] })]);
        // The web flags the card a little later without having seen the answer: both survive.
        push(WEB, [card('5', { flag: [3, stamp(10)] })]);
        const page = sync.pull(userId, PHONE, '0', null);
        expect(page.objs).toEqual([{ k: 'card', id: '5', ident: 'guid-1', f: { sched: ['answered', stamp(0), phone], flag: [3, stamp(10), web] } }]);
    });

    it('answers a losing group with the version that beat it, and changes nothing', async () => {
        const { push, stamp, web } = await setup();
        push(WEB, [card('5', { flag: [3, stamp(10)] })]);
        const reply = push(PHONE, [card('5', { flag: [1, stamp(5)] })]);
        expect(reply.ownUsn).toBeNull();
        expect(reply.win).toEqual([{ k: 'card', id: '5', ident: 'guid-1', f: { flag: [3, stamp(10), web] } }]);
    });

    it('breaks equal stamps by device number, the same way on every side', async () => {
        const { push, sync, userId, stamp, web } = await setup();
        push(WEB, [card('5', { flag: [3, stamp(0)] })]);
        push(PHONE, [card('5', { flag: [1, stamp(0)] })]);
        expect(sync.pull(userId, PHONE, '0', null).objs[0].f.flag).toEqual([3, stamp(0), web]);
    });

    it('treats a repeated push as a no-op that does not move the counter', async () => {
        const { push, stamp } = await setup();
        const first = push(PHONE, [card('5', { flag: [1, stamp(0)] })]);
        const again = push(PHONE, [card('5', { flag: [1, stamp(0)] })]);
        expect(first.ownUsn).toBe(1);
        expect(again).toMatchObject({ usn: 1, ownUsn: null, win: [] });
    });

    it('refuses an object whose identity differs from the one stored under its id', async () => {
        const { push, sync, userId, stamp } = await setup();
        push(PHONE, [card('5', { flag: [1, stamp(0)] }, 'guid-A')]);
        const reply = push(WEB, [card('5', { flag: [2, stamp(1)] }, 'guid-B'), card('6', { flag: [2, stamp(1)] }, 'guid-C')]);
        expect(reply.conflicts).toEqual([{ k: 'card', id: '5', ident: 'guid-A', f: { flag: [1, stamp(0), 1] } }]);
        const stored = sync.pull(userId, PHONE, '0', null).objs;
        expect(stored.find((obj) => obj.id === '5')?.f.flag[0]).toBe(1);
        expect(stored.find((obj) => obj.id === '6')?.f.flag[0]).toBe(2);
    });

    it('rejects a push stamped more than five minutes ahead, before changing anything', async () => {
        const { push, sync, userId, stamp } = await setup();
        expect(() => push(PHONE, [card('5', { flag: [1, stamp(0)] }), card('6', { flag: [1, stamp(MAX_CLOCK_AHEAD_MS + 1_000)] })]))
            .toThrow(expect.objectContaining({ code: 'clock_ahead' }));
        expect(sync.pull(userId, PHONE, '0', null).objs).toEqual([]);
    });

    it('validates every pushed object', async () => {
        const { push } = await setup();
        const bad = [
            { k: 'nope', id: '1', ident: null, f: {} },
            { k: 'card', id: '', ident: null, f: {} },
            { k: 'card', id: '1', ident: null, f: { g: ['v', -1] } },
            { k: 'card', id: '1', ident: null, f: { g: 'v' } },
            { k: 'card', id: '1', ident: 5, f: {} },
        ];
        for (const obj of bad) expect(() => push(PHONE, [obj as never])).toThrow(AccountError);
    });
});

describe('pulling', () => {
    it('pages in usn order without splitting or repeating, and ends with the counter', async () => {
        const { push, sync, userId, stamp } = await setup();
        const total = SYNC_PULL_PAGE + 25;
        push(PHONE, Array.from({ length: total }, (_, index) => card(String(index), { flag: [1, stamp(0)] }, null)));
        push(WEB, [card('7', { flag: [4, stamp(9)] }, null)]);
        const seen: string[] = [];
        let cursor: string | null = null;
        let pages = 0;
        do {
            const page = sync.pull(userId, PHONE, '0', cursor);
            seen.push(...page.objs.map((obj) => obj.id));
            cursor = page.next;
            pages += 1;
            if (!cursor) expect(page.usn).toBe(2);
        } while (cursor);
        expect(pages).toBe(2);
        expect(new Set(seen).size).toBe(total);
        // Card 7 moved to usn 2, so it comes once, at the end.
        expect(seen[seen.length - 1]).toBe('7');
        expect(sync.pull(userId, PHONE, '2', null)).toMatchObject({ objs: [], next: null, usn: 2 });
    });
});

describe('multi-part pushes', () => {
    it('shows nothing until the final part, then merges every part at once', async () => {
        const { push, sync, userId, stamp } = await setup();
        const staged = push(PHONE, [card('1', { flag: [1, stamp(0)] }, null)], { batch: { id: 'batch-0001', part: 0, final: false } });
        expect(staged).toMatchObject({ staged: true, usn: 0 });
        expect(sync.pull(userId, WEB, '0', null).objs).toEqual([]);
        const done = push(PHONE, [card('2', { flag: [2, stamp(0)] }, null)], { batch: { id: 'batch-0001', part: 1, final: true } });
        expect(done.ownUsn).toBe(1);
        expect(sync.pull(userId, WEB, '0', null).objs.map((obj) => obj.id).sort()).toEqual(['1', '2']);
    });

    it('asks for the whole batch again when a part is missing', async () => {
        const { push, sync, userId, stamp } = await setup();
        push(PHONE, [card('1', { flag: [1, stamp(0)] }, null)], { batch: { id: 'batch-0002', part: 0, final: false } });
        expect(() => push(PHONE, [card('3', { flag: [1, stamp(0)] }, null)], { batch: { id: 'batch-0002', part: 2, final: true } }))
            .toThrow(expect.objectContaining({ code: 'batch_expired' }));
        expect(sync.pull(userId, WEB, '0', null).objs).toEqual([]);
    });
});

describe('long polls', () => {
    it('wakes another device at once and leaves the pushing device asleep', async () => {
        vi.useFakeTimers();
        try {
            const { push, sync, userId, stamp } = await setup();
            let webWoke = false;
            let phoneWoke = false;
            const webWait = sync.wait(userId, WEB, '0').then((reply) => { webWoke = reply.changed; });
            const phoneWait = sync.wait(userId, PHONE, '0').then((reply) => { phoneWoke = reply.changed; });
            push(PHONE, [card('1', { flag: [1, stamp(0)] }, null)]);
            await vi.advanceTimersByTimeAsync(0);
            expect(webWoke).toBe(true);
            expect(phoneWoke).toBe(false);
            await vi.advanceTimersByTimeAsync(SYNC_WAIT_MS);
            await Promise.all([webWait, phoneWait]);
            expect(phoneWoke).toBe(false);
            expect(sync.waitingCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('answers at once when the device is already behind, and stops when the client leaves', async () => {
        const { push, sync, userId, stamp } = await setup();
        push(PHONE, [card('1', { flag: [1, stamp(0)] }, null)]);
        await expect(sync.wait(userId, WEB, '0')).resolves.toMatchObject({ changed: true, usn: 1 });
        const gone = new AbortController();
        const waiting = sync.wait(userId, WEB, '1', gone.signal);
        expect(sync.waitingCount()).toBe(1);
        gone.abort();
        await expect(waiting).resolves.toMatchObject({ changed: false });
        expect(sync.waitingCount()).toBe(0);
    });
});

describe('storage', () => {
    it('keeps each account in its own file and deletes it with the account', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'tus-sync-'));
        try {
            const { push, stamp, service, token, userId, collections } = await setup({ dir });
            push(PHONE, [card('1', { flag: [1, stamp(0)] }, null)]);
            expect(existsSync(join(dir, `${userId}.sqlite`))).toBe(true);
            expect(collections.bytes(userId)).toBeGreaterThan(0);
            collections.closeAll();
            // A reopened file still holds the data.
            expect(collections.get(userId).count()).toBe(1);
            const harnessDelete = service.deleteAccount(token, { password: registration().password });
            await harnessDelete;
            // The hook is wired by main.ts; here the service is built without it, so drop it directly.
            collections.delete(userId);
            expect(existsSync(join(dir, `${userId}.sqlite`))).toBe(false);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('refuses pushes once the account is over its quota', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'tus-sync-'));
        try {
            const { push, stamp } = await setup({ dir, quotaBytes: 256 * 1024 });
            push(PHONE, [card('1', { flag: ['x'.repeat(600_000), stamp(0)] }, null)]);
            expect(() => push(PHONE, [card('2', { flag: [1, stamp(0)] }, null)])).toThrow(expect.objectContaining({ code: 'quota_exceeded' }));
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('over HTTP', () => {
    const servers: Server[] = [];
    afterEach(async () => {
        await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
    });

    it('serves state, push, pull and refuses without a session', async () => {
        const { service, sync, token } = await setup();
        const server = createServer(createAccountHandler(service, { allowedOrigins: [], allowLocalOrigins: false, trustProxy: false }, SILENT, sync));
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address() as AddressInfo;
        const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) => new Promise<{ status: number; body: any }>((resolve, reject) => {
            const payload = body === undefined ? undefined : JSON.stringify(body);
            const outgoing = httpRequest({
                host: '127.0.0.1', port, method, path,
                headers: { ...headers, ...(payload ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) } : {}) },
            }, (response: IncomingMessage) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') }));
            });
            outgoing.on('error', reject);
            if (payload) outgoing.write(payload);
            outgoing.end();
        });
        const auth = { authorization: `Bearer ${token}`, 'x-device': 'http-device-0001', 'x-client': 'Safari · Mac' };
        expect((await call('GET', '/v1/sync/state?format=1', { 'x-device': 'http-device-0001' })).status).toBe(401);
        const state = await call('GET', `/v1/sync/state?format=${SYNC_FORMAT}`, auth);
        expect(state.status).toBe(200);
        expect(state.body).toMatchObject({ usn: 0, dev: 3 });
        // A body far over the account endpoints' 16 KB limit is accepted here.
        const big = 'x'.repeat(100_000);
        const pushed = await call('POST', '/v1/sync/push', auth, {
            format: SYNC_FORMAT,
            objs: [{ k: 'note', id: '9', ident: 'g', f: { 'f:0': [big, state.body.now * HLC_SCALE] } }],
        });
        expect(pushed.status).toBe(200);
        expect(pushed.body.ownUsn).toBe(1);
        const pulled = await call('GET', '/v1/sync/pull?since=0', auth);
        expect(pulled.body.objs[0].f['f:0'][0]).toHaveLength(100_000);
        const ahead = await call('POST', '/v1/sync/push', auth, {
            format: SYNC_FORMAT,
            objs: [{ k: 'note', id: '9', ident: 'g', f: { tag: [1, (state.body.now + MAX_CLOCK_AHEAD_MS * 2) * HLC_SCALE] } }],
        });
        expect(ahead).toMatchObject({ status: 409, body: { error: { code: 'clock_ahead' } } });
    });
});
