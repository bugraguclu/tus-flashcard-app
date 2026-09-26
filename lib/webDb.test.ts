import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Just enough of IndexedDB for lib/webDb.ts: one database with one object store, reads and writes
 * that complete on a later tick, and an optional read failure.
 */
function createFakeIndexedDb(initial: Map<string, unknown> = new Map()) {
    const records = initial;
    let storeCreated = initial.size > 0;
    // `puts` counts writes as they are started, `writes` as they commit on a later tick.
    const state = { failReads: null as Error | null, writes: 0, puts: 0 };

    const database = {
        objectStoreNames: { contains: () => storeCreated },
        createObjectStore: () => { storeCreated = true; },
        close: () => undefined,
        transaction: () => {
            const tx: Record<string, any> = {};
            tx.objectStore = () => ({
                get: (key: string) => {
                    const request: Record<string, any> = {};
                    setTimeout(() => {
                        if (state.failReads) {
                            request.error = state.failReads;
                            request.onerror?.();
                            return;
                        }
                        request.result = records.get(key);
                        request.onsuccess?.();
                    });
                    return request;
                },
                put: (value: unknown, key: string) => {
                    state.puts += 1;
                    setTimeout(() => {
                        records.set(key, value);
                        state.writes += 1;
                        tx.oncomplete?.();
                    });
                },
            });
            return tx;
        },
    };

    const indexedDB = {
        open: () => {
            const request: Record<string, any> = {};
            setTimeout(() => {
                request.result = database;
                if (!storeCreated) request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        },
    };
    return { indexedDB, records, state };
}

/** One Web Locks lock: held by one owner at a time, waiters served in order. */
function createFakeLocks() {
    let holder: symbol | null = null;
    const queue: (() => void)[] = [];
    const releaseTo = (token: symbol) => {
        if (holder !== token) return;
        holder = null;
        queue.shift()?.();
    };
    const locks = {
        request(name: string, optionsOrCallback: any, maybeCallback?: any): Promise<unknown> {
            const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
            const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
            return new Promise((resolve, reject) => {
                const grant = () => {
                    const token = Symbol(name);
                    holder = token;
                    Promise.resolve()
                        .then(() => callback({ name }))
                        .then(
                            (value) => { releaseTo(token); resolve(value); },
                            (error) => { releaseTo(token); reject(error); },
                        );
                };
                if (holder === null) grant();
                else if (options.ifAvailable) Promise.resolve().then(() => callback(null)).then(resolve, reject);
                else queue.push(grant);
            });
        },
    };
    /** Stand in for another tab that holds the writer lock until the returned close is called. */
    const holdInAnotherTab = () => {
        const token = Symbol('other tab');
        holder = token;
        return () => releaseTo(token);
    };
    return { locks, holdInAnotherTab };
}

async function loadWebDb(options: {
    indexedDB: unknown;
    locks: unknown;
}) {
    vi.resetModules();
    const webDb = await import('./webDb');
    // sql.js picks its WebAssembly file by whether `window` exists, so it starts from the local
    // package file before the browser globals below are put in place.
    await webDb.loadSqlJs();
    const reload = vi.fn();
    vi.stubGlobal('window', { addEventListener: vi.fn(), location: { reload } });
    vi.stubGlobal('document', { addEventListener: vi.fn(), visibilityState: 'visible' });
    vi.stubGlobal('localStorage', { getItem: () => null, removeItem: vi.fn() });
    vi.stubGlobal('indexedDB', options.indexedDB);
    vi.stubGlobal('navigator', { locks: options.locks });
    return { webDb, reload };
}

async function savedCollectionBytes(): Promise<Uint8Array> {
    const { loadSqlJs } = await import('./webDb');
    const SQL = await loadSqlJs();
    const db = new SQL.Database();
    db.run('CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT)');
    db.run("INSERT INTO decks VALUES (1, 'Kardiyoloji')");
    const bytes = db.export();
    db.close();
    return bytes;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('web database start-up', () => {
    it('opens the saved collection', async () => {
        const saved = await savedCollectionBytes();
        const idb = createFakeIndexedDb(new Map([['collection', saved]]));
        const { webDb } = await loadWebDb({ indexedDB: idb.indexedDB, locks: createFakeLocks().locks });

        const db = await webDb.initWebDatabase();

        expect(db.getFirstSync<{ name: string }>('SELECT name FROM decks WHERE id = 1')?.name).toBe('Kardiyoloji');
        expect(webDb.isPrimaryTab()).toBe(true);
    });

    it('stops instead of starting empty when the saved collection cannot be read', async () => {
        const saved = await savedCollectionBytes();
        const idb = createFakeIndexedDb(new Map([['collection', saved]]));
        idb.state.failReads = new Error('Failed to read large IndexedDB value');
        const { webDb } = await loadWebDb({ indexedDB: idb.indexedDB, locks: createFakeLocks().locks });

        await expect(webDb.initWebDatabase()).rejects.toMatchObject({ name: webDb.STORAGE_READ_ERROR_NAME });
        expect(webDb.getWebDatabase()).toBeNull();

        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(idb.state.writes).toBe(0);
        expect(idb.records.get('collection')).toBe(saved);
    });

    it('starts a new collection when nothing has been saved yet', async () => {
        const idb = createFakeIndexedDb();
        const { webDb } = await loadWebDb({ indexedDB: idb.indexedDB, locks: createFakeLocks().locks });

        const db = await webDb.initWebDatabase();
        db.execSync('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
        await new Promise((resolve) => setTimeout(resolve, 400));

        expect(idb.state.writes).toBe(1);
        expect(idb.records.get('collection')).toBeInstanceOf(Uint8Array);
    });

    it('starts the save on page hide in the same task, on the connection it keeps open', async () => {
        const idb = createFakeIndexedDb();
        const { webDb } = await loadWebDb({ indexedDB: idb.indexedDB, locks: createFakeLocks().locks });
        const db = await webDb.initWebDatabase();
        await new Promise((resolve) => setTimeout(resolve, 20));
        db.execSync('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
        const listeners = (window.addEventListener as unknown as { mock: { calls: [string, () => void][] } }).mock.calls;
        const onPageHide = listeners.find(([type]) => type === 'pagehide')?.[1];
        const startedBefore = idb.state.puts;

        onPageHide?.();

        expect(idb.state.puts).toBe(startedBefore + 1);
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(idb.records.get('collection')).toBeInstanceOf(Uint8Array);
    });

    it('still starts as the writer when the browser refuses the writer lock', async () => {
        const idb = createFakeIndexedDb();
        const locks = { request: () => Promise.reject(new DOMException('Blocked', 'SecurityError')) };
        const { webDb } = await loadWebDb({ indexedDB: idb.indexedDB, locks });

        await expect(webDb.initWebDatabase()).resolves.toBeDefined();
        expect(webDb.isPrimaryTab()).toBe(true);
    });
});

describe('web writer election', () => {
    it('keeps a second tab read-only while another tab writes', async () => {
        const { locks, holdInAnotherTab } = createFakeLocks();
        holdInAnotherTab();
        const idb = createFakeIndexedDb();
        const { webDb, reload } = await loadWebDb({ indexedDB: idb.indexedDB, locks });

        const db = await webDb.initWebDatabase();
        db.execSync('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
        await new Promise((resolve) => setTimeout(resolve, 400));

        expect(webDb.isPrimaryTab()).toBe(false);
        expect(idb.state.writes).toBe(0);
        expect(reload).not.toHaveBeenCalled();
        expect(webDb.isWriterTakeoverReloading()).toBe(false);
    });

    it('reloads a read-only tab to take over once the writer closes, past any unsaved-changes prompt', async () => {
        const { locks, holdInAnotherTab } = createFakeLocks();
        const closeWriterTab = holdInAnotherTab();
        const { webDb, reload } = await loadWebDb({ indexedDB: createFakeIndexedDb().indexedDB, locks });
        await webDb.initWebDatabase();

        closeWriterTab();
        await settle();

        expect(reload).toHaveBeenCalledTimes(1);
        expect(webDb.isWriterTakeoverReloading()).toBe(true);
    });
});
