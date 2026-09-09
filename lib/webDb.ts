/**
 * Web database driver.
 *
 * The browser has no native SQLite, so this module runs sql.js (SQLite compiled
 * to WebAssembly) in memory and exposes the same synchronous surface that
 * expo-sqlite provides on native (`WebSQLiteDatabase`), keeping the rest of the
 * app platform-agnostic.
 *
 * The in-memory database is snapshotted to IndexedDB after each write (debounced)
 * and again on page hide. IndexedDB stores the snapshot as raw bytes, so there is
 * no base64 inflation and no ~5 MB localStorage cap.
 *
 * Note: sql.js keeps the whole database in RAM, so each save re-serializes it in
 * full. To stop two tabs from clobbering each other's snapshot, a Web Locks
 * election makes only one tab the writer; other tabs never persist and reload to
 * take over when the writer closes. An OPFS-backed build would remove the whole
 * snapshot model; see the audit notes.
 */

import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';

// Persistence — IndexedDB snapshot store

// A short debounce keeps the IndexedDB snapshot close to current; the flush on
// pagehide/visibilitychange covers the rest. Async IDB writes still can't fully
// complete on a hard tab-kill — OPFS-backed SQLite would close that gap entirely.
const SAVE_DEBOUNCE_MS = 250;

const IDB_NAME = 'tus_flashcard';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'collection';

// Pre-IndexedDB snapshot location; read once to migrate existing users, then cleared.
const LEGACY_STORAGE_KEY = 'tus_flashcard_sqljs_db';

let _sqlDb: SqlJsDatabase | null = null;
let _initPromise: Promise<WebSQLiteDatabase> | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _saveInFlight = false;
let _saveDirty = false;

// Writer election: only the elected tab persists, so tabs can't clobber each
// other's snapshot. Default true so a lone tab — or a browser without the Web
// Locks API — always persists.
let _isPrimary = true;

/** Open the IndexedDB database, lazily creating the snapshot object store. */
function openIdb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Read the persisted snapshot, or null if nothing is stored yet. */
function idbLoad(): Promise<Uint8Array | null> {
    return openIdb().then(
        (db) =>
            new Promise<Uint8Array | null>((resolve, reject) => {
                const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
                req.onsuccess = () => {
                    const val = req.result as ArrayBuffer | Uint8Array | undefined;
                    db.close();
                    if (!val) return resolve(null);
                    resolve(val instanceof Uint8Array ? val : new Uint8Array(val));
                };
                req.onerror = () => {
                    db.close();
                    reject(req.error);
                };
            }),
    );
}

/** Overwrite the persisted snapshot with the given bytes. */
function idbSave(bytes: Uint8Array): Promise<void> {
    return openIdb().then(
        (db) =>
            new Promise<void>((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
                tx.onabort = () => {
                    db.close();
                    reject(tx.error);
                };
            }),
    );
}

/**
 * Export the in-memory database and write it to IndexedDB, coalescing overlapping
 * saves so a burst of writes queues at most one extra save and the newest state wins.
 */
async function persistToIdb(): Promise<void> {
    if (!_sqlDb || !_isPrimary) return;
    if (_saveInFlight) {
        _saveDirty = true;
        return;
    }
    _saveInFlight = true;
    try {
        await idbSave(_sqlDb.export());
    } catch (e) {
        console.warn('[WebDB] Failed to persist database to IndexedDB:', e);
    } finally {
        _saveInFlight = false;
        if (_saveDirty) {
            _saveDirty = false;
            void persistToIdb();
        }
    }
}

/** Debounce a snapshot save after a write. */
function schedulePersist(): void {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => void persistToIdb(), SAVE_DEBOUNCE_MS);
}

/** Cancel the debounce and flush immediately (best-effort on page hide / unload). */
function flushPersist(): void {
    if (_saveTimer) {
        clearTimeout(_saveTimer);
        _saveTimer = null;
    }
    void persistToIdb();
}

/**
 * Elect a single writer across tabs via the Web Locks API. The first tab holds
 * the lock and persists; later tabs stay read-only (they never persist, so they
 * can't overwrite the writer's snapshot) and reload to take over if the writer
 * tab closes. No-ops where Web Locks is unavailable — the tab stays the writer.
 * Resolves once this tab's initial role is known.
 */
function electWriter(): Promise<void> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) return Promise.resolve();

    const settled = new Promise<void>((resolve) => {
        locks.request('tus-flashcard-writer', { ifAvailable: true }, (lock) => {
            _isPrimary = !!lock;
            resolve();
            if (lock) return new Promise<void>(() => {}); // hold for this tab's lifetime
        });
    });

    // Blocks until the current writer releases the lock (its tab closed), then
    // reloads so this tab re-initialises from the latest snapshot as the writer.
    locks.request('tus-flashcard-writer', () => {
        if (!_isPrimary) window.location.reload();
        return new Promise<void>(() => {});
    });

    return settled;
}

/** Decode the pre-IndexedDB base64 localStorage snapshot, if one exists. */
function decodeLegacySnapshot(): Uint8Array | null {
    try {
        const base64 = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!base64) return null;

        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    } catch (e) {
        console.warn('[WebDB] Failed to read legacy localStorage snapshot:', e);
        return null;
    }
}

/** Load the snapshot: IndexedDB first, else migrate the legacy localStorage copy once. */
async function loadPersisted(): Promise<Uint8Array | null> {
    try {
        const fromIdb = await idbLoad();
        if (fromIdb && fromIdb.length > 0) return fromIdb;
    } catch (e) {
        console.warn('[WebDB] Failed to load database from IndexedDB:', e);
    }

    const legacy = decodeLegacySnapshot();
    if (legacy) {
        try {
            await idbSave(legacy);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch (e) {
            console.warn('[WebDB] Failed to migrate legacy snapshot to IndexedDB:', e);
        }
        return legacy;
    }
    return null;
}

// Synchronous SQL wrapper — mirrors expo-sqlite's API

export interface WebSQLiteDatabase {
    execSync(sql: string): void;
    runSync(sql: string, ...params: any[]): { changes: number; lastInsertRowId: number };
    getAllSync<T = any>(sql: string, ...params: any[]): T[];
    getFirstSync<T = any>(sql: string, ...params: any[]): T | null;
}

/** sql.js binds `?` placeholders from an array; pass undefined when there are none. */
function bindParams(params: any[]): any[] | undefined {
    return params.length > 0 ? params : undefined;
}

/** Run a query and shape sql.js's column/row result into an array of objects. */
function execToObjects<T = any>(db: SqlJsDatabase, sql: string, params: any[]): T[] {
    const results = db.exec(sql, bindParams(params));
    if (results.length === 0) return [];

    const { columns, values } = results[0];
    return values.map((row: any[]) => {
        const obj: Record<string, any> = {};
        columns.forEach((col: string, i: number) => {
            obj[col] = row[i];
        });
        return obj as T;
    });
}

/** Wrap a sql.js database as the app's synchronous handle; writes trigger a debounced save. */
function createWrapper(db: SqlJsDatabase): WebSQLiteDatabase {
    function getAllSync<T = any>(sql: string, ...params: any[]): T[] {
        try {
            return execToObjects<T>(db, sql, params);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`SQL getAllSync failed: ${msg}\nSQL: ${sql.slice(0, 200)}`);
        }
    }

    return {
        execSync(sql: string): void {
            try {
                db.run(sql);
                schedulePersist();
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`SQL exec failed: ${msg}\nSQL: ${sql.slice(0, 200)}`);
            }
        },

        runSync(sql: string, ...params: any[]): { changes: number; lastInsertRowId: number } {
            try {
                db.run(sql, bindParams(params));
                schedulePersist();

                // sql.js's run() doesn't report affected rows; ask SQLite directly. A SELECT
                // does not reset changes()/last_insert_rowid(), so this stays accurate.
                const changesRow = db.exec('SELECT changes() as c, last_insert_rowid() as r');
                const changes = changesRow.length > 0 ? (changesRow[0].values[0][0] as number) : 0;
                const lastInsertRowId = changesRow.length > 0 ? (changesRow[0].values[0][1] as number) : 0;

                return { changes, lastInsertRowId };
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`SQL run failed: ${msg}\nSQL: ${sql.slice(0, 200)}`);
            }
        },

        getAllSync,

        getFirstSync<T = any>(sql: string, ...params: any[]): T | null {
            const results = getAllSync<T>(sql, ...params);
            return results.length > 0 ? results[0] : null;
        },
    };
}

// Module loading & public API

let _sqlModule: ReturnType<typeof initSqlJs> | null = null;

/** Boot sql.js from the integrity-pinned app bundle, never from a runtime CDN. */
export function loadSqlJs() {
    if (!_sqlModule) {
        // Metro turns the static require into a same-origin, content-hashed asset URL. Node-based
        // package tests use the installed local file directly; neither path contacts a CDN.
        const wasmUri = typeof window === 'undefined'
            ? 'node_modules/sql.js/dist/sql-wasm.wasm'
            : (() => {
                const bundled = require('sql.js/dist/sql-wasm.wasm') as string | { default?: string };
                const uri = typeof bundled === 'string' ? bundled : bundled.default;
                if (!uri) throw new Error('Bundled sql.js WASM asset could not be resolved.');
                return uri;
            })();
        _sqlModule = initSqlJs({ locateFile: () => wasmUri });
    }
    return _sqlModule;
}

/**
 * Ask the browser to keep our storage durable so IndexedDB isn't evicted under storage pressure.
 * Best-effort: unsupported browsers or a denied request are ignored and the app keeps working with
 * default (evictable) storage.
 */
async function requestPersistentStorage(): Promise<void> {
    try {
        const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
        if (!storage?.persist || !storage.persisted) return;
        if (await storage.persisted()) return; // already granted
        await storage.persist();
    } catch (e) {
        console.warn('[WebDB] Persistent storage request failed:', e);
    }
}

/** Initialise the web database: boot WASM, restore the snapshot, and wire unload flushes. */
export function initWebDatabase(): Promise<WebSQLiteDatabase> {
    // React development/static hydration can mount an effect twice. Without a shared promise,
    // two initializers can race: startup migrates one database, then the slower initializer
    // replaces it with the old empty IndexedDB snapshot. One process-wide initialization keeps
    // both schema and learner data attached to the same handle.
    if (_initPromise) return _initPromise;
    if (_sqlDb) return Promise.resolve(createWrapper(_sqlDb));

    _initPromise = (async () => {
        const SQL = await loadSqlJs();
        const savedData = await loadPersisted();
        _sqlDb = savedData ? new SQL.Database(savedData) : new SQL.Database();

        await electWriter();
        void requestPersistentStorage();

        // IndexedDB writes are async and cannot complete during `beforeunload`, so flush
        // on the events that fire reliably before the page is discarded.
        window.addEventListener('pagehide', flushPersist);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flushPersist();
        });

        return createWrapper(_sqlDb);
    })().catch((error) => {
        _sqlDb = null;
        _initPromise = null;
        throw error;
    });
    return _initPromise;
}

/** The synchronous handle, available only after initWebDatabase() has resolved. */
export function getWebDatabase(): WebSQLiteDatabase | null {
    if (!_sqlDb) return null;
    return createWrapper(_sqlDb);
}

/** Whether this tab is the elected writer. Non-writer tabs don't persist changes. */
export function isPrimaryTab(): boolean {
    return _isPrimary;
}

export interface SqlJsReader {
    getAllSync<T = any>(sql: string, ...params: any[]): T[];
    getFirstSync<T = any>(sql: string, ...params: any[]): T | null;
    execSync(sql: string): void;
    close(): void;
}

/**
 * Open a standalone, read-only sql.js database over raw bytes (e.g. an .apkg
 * collection). Deliberately not the full createWrapper — it must never schedule
 * persistence of the app's own database.
 */
export async function openSqlJsReader(bytes: Uint8Array): Promise<SqlJsReader> {
    const SQL = await loadSqlJs();
    const db = new SQL.Database(bytes);
    const getAllSync = <T = any>(sql: string, ...params: any[]): T[] => execToObjects<T>(db, sql, params);
    return {
        getAllSync,
        getFirstSync<T = any>(sql: string, ...params: any[]): T | null {
            const rows = getAllSync<T>(sql, ...params);
            return rows.length > 0 ? rows[0] : null;
        },
        execSync: (sql: string) => { db.run(sql); },
        close: () => db.close(),
    };
}
