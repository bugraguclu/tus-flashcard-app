import { AppState, Platform, type AppStateStatus } from 'react-native';
import { flushDatabaseWrites, getDB, isPrimaryTab } from '../db';
import { CATALOG_PACK_ID } from '../catalogRows';
import type { ApplySummary } from './syncApply';
import { createSyncTransport } from './syncApi';
import { createEnv, markEverything, outboxCount, type SyncEnv } from './syncCapture';
import { SyncClock } from './syncClock';
import {
    dropSyncState,
    ensureSyncTables,
    getMeta,
    getNumberMeta,
    installCaptureTriggers,
    maxDirtySeq,
    removeCaptureTriggers,
    setMeta,
    syncTablesExist,
    type SyncDb,
} from './syncDb';
import { errorCode, runSyncRound, type SyncTransport } from './syncRun';

/*
 * The app's sync loop (docs/HESAP_SENKRON.md §7.7–7.8). Study never waits for it: changes are
 * captured by triggers as they are written, and a round runs a moment after the last write, when
 * another device's change is announced by the long poll, when the app comes to the front, and
 * when it goes to the background. A failed round leaves everything in place for the next one.
 * Only the web tab that writes the collection syncs.
 */

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
    enabled: boolean;
    phase: SyncPhase;
    lastSyncedAt: number | null;
    /** Objects with changes not yet sent. */
    pending: number;
    /** The account error code of the last failure, if the last round failed. */
    errorCode: string | null;
    /** A backup taken before a large wave of deletions from another device. */
    backupBeforeDeletion: boolean;
}

export interface SyncAccount {
    baseUrl: string;
    clientLabel: string;
    userId: string;
    getToken: () => string | null;
}

const IDLE_STATUS: SyncStatus = { enabled: false, phase: 'off', lastSyncedAt: null, pending: 0, errorCode: null, backupBeforeDeletion: false };
const WRITE_SETTLE_MS = 1_500;
const POLL_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
const VERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;

let status: SyncStatus = IDLE_STATUS;
const statusListeners = new Set<(status: SyncStatus) => void>();
const appliedListeners = new Set<(summary: ApplySummary) => void>();

let account: SyncAccount | null = null;
let env: SyncEnv | null = null;
let transport: (SyncTransport & { devices: ReturnType<typeof createSyncTransport>['devices']; removeDevice: ReturnType<typeof createSyncTransport>['removeDevice'] }) | null = null;
let running = false;
let roundPromise: Promise<void> | null = null;
let rerun = false;
let roundTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let waitAbort: AbortController | null = null;
let backoffMs = 0;
let lastSeenSeq = 0;
let appStateSubscription: { remove(): void } | null = null;
let visibilityHandler: (() => void) | null = null;

function setStatus(patch: Partial<SyncStatus>): void {
    status = { ...status, ...patch };
    for (const listener of statusListeners) listener(status);
}

export function getSyncStatus(): SyncStatus {
    return status;
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
}

/** Told when another device's changes were written here, so screens reload what they show. */
export function subscribeSyncApplied(listener: (summary: ApplySummary) => void): () => void {
    appliedListeners.add(listener);
    return () => appliedListeners.delete(listener);
}

declare const __DEV__: boolean | undefined;

function db(): SyncDb {
    const handle = getDB() as unknown as SyncDb;
    // Development builds only: lets a developer inspect the sync tables from the console.
    if (typeof __DEV__ !== 'undefined' && __DEV__) (globalThis as { __tusSyncDb?: SyncDb }).__tusSyncDb = handle;
    return handle;
}

/** Whether this collection syncs with an account (and which). */
export function syncedAccountId(handle: SyncDb = db()): string | null {
    if (!syncTablesExist(handle)) return null;
    return getMeta(handle, 'enabled') === '1' ? getMeta(handle, 'user') : null;
}

function randomDeviceId(): string {
    const bytes = new Uint8Array(16);
    if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function deviceIdFor(handle: SyncDb): string {
    let deviceId = getMeta(handle, 'deviceId');
    if (!deviceId) {
        deviceId = randomDeviceId();
        setMeta(handle, 'deviceId', deviceId);
    }
    return deviceId;
}

/** What the first link will merge from this device: studied cards and the learner's own notes. */
export function firstLinkPreview(handle: SyncDb = db()): { studiedCards: number; notes: number; reviews: number } {
    const count = (sql: string, ...params: unknown[]) => Number(handle.getFirstSync<{ n: number }>(sql, ...params)?.n ?? 0);
    return {
        studiedCards: count('SELECT COUNT(*) AS n FROM anki_cards WHERE reps > 0'),
        notes: count('SELECT COUNT(*) AS n FROM notes WHERE instr(data, ?) = 0', CATALOG_PACK_ID),
        reviews: count('SELECT COUNT(*) AS n FROM revlog'),
    };
}

function buildEnv(handle: SyncDb, dev: number): SyncEnv {
    return createEnv(handle, new SyncClock(handle), dev);
}

function refreshPending(): void {
    if (!env) return;
    const dirty = maxDirtySeq(env.db) > 0 ? 1 : 0;
    setStatus({ pending: outboxCount(env.db) + dirty });
}

async function backupBeforeDeletion(): Promise<void> {
    try {
        const { createBackupNow } = await import('../backup');
        await createBackupNow();
        setStatus({ backupBeforeDeletion: true });
    } catch (error) {
        // The wave is applied all the same: the server keeps deleted content for 30 days.
        console.warn('[Sync] backup before a large deletion failed:', error);
    }
}

async function runRound(): Promise<void> {
    if (!env || !transport || !account) return;
    if (!isPrimaryTab()) {
        // Another tab writes this collection now; what this one applied would not be kept.
        stopLoops();
        setStatus({ phase: 'off' });
        return;
    }
    const handle = env.db;
    setStatus({ phase: 'syncing' });
    try {
        const result = await runSyncRound(env, transport, { beforeLargeDeletion: backupBeforeDeletion });
        await flushDatabaseWrites();
        const now = Date.now();
        setMeta(handle, 'lastSync', String(now));
        backoffMs = 0;
        lastSeenSeq = maxDirtySeq(handle);
        setStatus({ phase: 'idle', lastSyncedAt: now, errorCode: null });
        if (result.summary.changed.size > 0) {
            for (const listener of appliedListeners) listener(result.summary);
        }
        if (getNumberMeta(handle, 'lastVerify', 0) < now - VERIFY_INTERVAL_MS) {
            // The daily check: compare every row with what was last synced (§8.4).
            setMeta(handle, 'lastVerify', String(now));
            markEverything(handle);
            scheduleRound(10_000);
        }
    } catch (error) {
        const code = errorCode(error);
        const offline = code === 'offline' || code === 'timeout' || code === 'rate_limited';
        backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs ? backoffMs * 2 : 5_000);
        setStatus({ phase: offline ? 'offline' : 'error', errorCode: code ?? 'server_error' });
        if (code !== 'unauthorized' && code !== 'format_too_old') scheduleRound(backoffMs);
        if (!offline) console.warn('[Sync] round failed:', error);
    } finally {
        refreshPending();
    }
}

/** Runs a round now, or right after the one in progress. */
export function syncNow(): Promise<void> {
    if (!running) return Promise.resolve();
    if (roundTimer) {
        clearTimeout(roundTimer);
        roundTimer = null;
    }
    if (roundPromise) {
        rerun = true;
        return roundPromise;
    }
    roundPromise = (async () => {
        do {
            rerun = false;
            await runRound();
        } while (rerun && running);
    })().finally(() => {
        roundPromise = null;
    });
    return roundPromise;
}

function scheduleRound(delayMs: number): void {
    if (!running) return;
    if (roundTimer) clearTimeout(roundTimer);
    roundTimer = setTimeout(() => {
        roundTimer = null;
        void syncNow();
    }, delayMs);
}

let waitLoopActive = false;

async function waitLoop(): Promise<void> {
    if (waitLoopActive) return;
    waitLoopActive = true;
    try {
        await waitUntilStopped();
    } finally {
        waitLoopActive = false;
    }
}

async function waitUntilStopped(): Promise<void> {
    while (running && env && transport && AppState.currentState !== 'background') {
        const controller = new AbortController();
        waitAbort = controller;
        try {
            const since = getNumberMeta(env.db, 'since', 0);
            const reply = await transport.wait(since, controller.signal);
            if (!running) return;
            if (reply.changed) await syncNow();
        } catch {
            if (!running) return;
            await new Promise((resolve) => setTimeout(resolve, Math.max(5_000, backoffMs)));
        }
    }
}

function onAppState(next: AppStateStatus): void {
    if (!running) return;
    if (next === 'active') {
        void syncNow();
        void waitLoop();
    } else if (next === 'background') {
        // iOS gives a few seconds: send what is waiting; the rest goes on the next launch.
        void syncNow();
        waitAbort?.abort();
    }
}

function startLoops(): void {
    if (running || !env) return;
    running = true;
    lastSeenSeq = 0;
    pollTimer = setInterval(() => {
        if (!env || roundPromise) return;
        const seq = maxDirtySeq(env.db);
        if (seq > lastSeenSeq) {
            lastSeenSeq = seq;
            refreshPending();
            scheduleRound(WRITE_SETTLE_MS);
        }
    }, POLL_MS);
    appStateSubscription = AppState.addEventListener('change', onAppState);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
        visibilityHandler = () => {
            if (document.visibilityState === 'hidden') void syncNow();
            else void syncNow();
        };
        document.addEventListener('visibilitychange', visibilityHandler);
    }
    void syncNow();
    void waitLoop();
}

function stopLoops(): void {
    running = false;
    if (roundTimer) clearTimeout(roundTimer);
    if (pollTimer) clearInterval(pollTimer);
    roundTimer = null;
    pollTimer = null;
    waitAbort?.abort();
    waitAbort = null;
    appStateSubscription?.remove();
    appStateSubscription = null;
    if (visibilityHandler && typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
}

function connect(next: SyncAccount, handle: SyncDb): void {
    account = next;
    transport = createSyncTransport({
        baseUrl: next.baseUrl,
        clientLabel: next.clientLabel,
        deviceId: deviceIdFor(handle),
        getToken: next.getToken,
    });
}

/**
 * Follows the account: signed in to the account this collection syncs with → sync runs; signed
 * out, or another account → it stops (the collection stays as it is).
 */
export function configureSync(next: SyncAccount | null): void {
    const handle = db();
    if (!next || !isPrimaryTab()) {
        stopLoops();
        account = next;
        setStatus({ ...IDLE_STATUS, enabled: next ? syncedAccountId(handle) === next.userId : false });
        return;
    }
    const synced = syncedAccountId(handle);
    if (synced !== next.userId) {
        stopLoops();
        account = next;
        setStatus({ ...IDLE_STATUS, enabled: false });
        return;
    }
    if (running && account?.userId === next.userId) return;
    connect(next, handle);
    installCaptureTriggers(handle);
    env = buildEnv(handle, getNumberMeta(handle, 'dev', 0));
    const last = getNumberMeta(handle, 'lastSync', 0);
    setStatus({ enabled: true, phase: 'idle', lastSyncedAt: last || null, errorCode: null });
    refreshPending();
    startLoops();
}

/**
 * Turns sync on for the signed-in account (the first link, §7.6): this device's collection is
 * merged with the account's as ordinary changes. Throws the account error when the server cannot
 * be reached, leaving sync off.
 */
export async function enableSync(next: SyncAccount): Promise<void> {
    const handle = db();
    ensureSyncTables(handle);
    const previousUser = getMeta(handle, 'user');
    if (previousUser && previousUser !== next.userId) {
        // Another account synced this collection before: start its bookkeeping from scratch.
        dropSyncState(handle, true);
    }
    connect(next, handle);
    const state = await transport!.state();
    const firstLink = previousUser !== next.userId || !getMeta(handle, 'dev');
    setMeta(handle, 'dev', String(state.dev));
    setMeta(handle, 'user', next.userId);
    setMeta(handle, 'enabled', '1');
    installCaptureTriggers(handle);
    env = buildEnv(handle, state.dev);
    env.clock.calibrate(state.now, Date.now(), Date.now());
    // Everything already here is compared with what this device last sent; on the first link that
    // is nothing, so the whole collection goes up, each row stamped with when it last changed.
    markEverything(handle, { link: firstLink });
    setMeta(handle, 'lastVerify', String(Date.now()));
    setStatus({ enabled: true, phase: 'idle', errorCode: null, backupBeforeDeletion: false });
    stopLoops();
    startLoops();
}

/** Turns sync off on this device. Nothing is deleted; turning it on again catches up. */
export function disableSync(): void {
    stopLoops();
    const handle = db();
    if (syncTablesExist(handle)) {
        setMeta(handle, 'enabled', '0');
        removeCaptureTriggers(handle);
    }
    env = null;
    setStatus({ ...IDLE_STATUS });
}

export async function listSyncDevices() {
    if (!transport) return [];
    return transport.devices();
}

export async function removeSyncDevice(dev: number): Promise<void> {
    if (transport) await transport.removeDevice(dev);
}

export function acknowledgeDeletionBackup(): void {
    setStatus({ backupBeforeDeletion: false });
}
