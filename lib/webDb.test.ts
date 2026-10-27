import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_TEST_SCHEMA } from '../test/sqljsHarness';

/**
 * Just enough of IndexedDB for lib/webDb.ts: one database with one object store, reads and writes
 * that complete on a later tick, and an optional read failure.
 */
function createFakeIndexedDb(initial: Map<string, unknown> = new Map()) {
    const records = initial;
    let storeCreated = initial.size > 0;
    // `puts` counts writes as they are started, `writes` as they commit on a later tick.
    const state = {
        failReads: null as Error | null,
        failWrites: null as Error | null,
        holdWrites: false,
        pendingWrites: [] as (() => void)[],
        writes: 0,
        puts: 0,
    };

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
                    const commit = () => {
                        if (state.failWrites) {
                            tx.error = state.failWrites;
                            tx.onabort?.();
                            return;
                        }
                        records.set(key, value);
                        state.writes += 1;
                        tx.oncomplete?.();
                    };
                    if (state.holdWrites) state.pendingWrites.push(commit);
                    else setTimeout(commit);
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
    vi.doUnmock('./db');
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

describe('explicit durable saves', () => {
    it('waits for the IndexedDB commit before reporting a save as complete', async () => {
        const idb = createFakeIndexedDb();
        const { webDb } = await loadWebDb({ indexedDB: idb.indexedDB, locks: createFakeLocks().locks });
        const db = await webDb.initWebDatabase();
        await new Promise((resolve) => setTimeout(resolve, 20));
        idb.state.holdWrites = true;
        db.execSync('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
        db.runSync('INSERT INTO settings VALUES (?, ?)', 'language', 'tr');
        let completed = false;

        const save = webDb.flushWebDatabase().then(() => { completed = true; });
        await settle();
        expect(completed).toBe(false);
        expect(idb.state.writes).toBe(0);
        idb.state.pendingWrites.shift()!();
        await save;

        const restored = await webDb.openSqlJsReader(idb.records.get('collection') as Uint8Array);
        expect(restored.getFirstSync<{ value: string }>('SELECT value FROM settings')?.value).toBe('tr');
        restored.close();
    });

    it('includes a newer edit when an earlier save is still committing', async () => {
        const idb = createFakeIndexedDb();
        const { webDb } = await loadWebDb({ indexedDB: idb.indexedDB, locks: createFakeLocks().locks });
        const db = await webDb.initWebDatabase();
        await new Promise((resolve) => setTimeout(resolve, 20));
        idb.state.holdWrites = true;
        db.execSync("CREATE TABLE settings (value TEXT); INSERT INTO settings VALUES ('en')");
        const first = webDb.flushWebDatabase();
        await settle();
        db.runSync('UPDATE settings SET value = ?', 'tr');
        let completed = false;
        const latest = webDb.flushWebDatabase().then(() => { completed = true; });

        idb.state.pendingWrites.shift()!();
        await settle();
        expect(completed).toBe(false);
        idb.state.pendingWrites.shift()!();
        await Promise.all([first, latest]);

        const restored = await webDb.openSqlJsReader(idb.records.get('collection') as Uint8Array);
        expect(restored.getFirstSync<{ value: string }>('SELECT value FROM settings')?.value).toBe('tr');
        restored.close();
    });

    it('keeps a newer explicit save pending when pagehide also starts a snapshot', async () => {
        const idb = createFakeIndexedDb();
        const { webDb } = await loadWebDb({ indexedDB: idb.indexedDB, locks: createFakeLocks().locks });
        const db = await webDb.initWebDatabase();
        await new Promise((resolve) => setTimeout(resolve, 20));
        idb.state.holdWrites = true;
        db.execSync("CREATE TABLE settings (value TEXT); INSERT INTO settings VALUES ('old')");
        const first = webDb.flushWebDatabase();
        await settle();
        db.runSync('UPDATE settings SET value = ?', 'new');
        let complete = false;
        const latest = webDb.flushWebDatabase().then(() => { complete = true; });
        const listeners = (window.addEventListener as unknown as { mock: { calls: [string, () => void][] } }).mock.calls;
        listeners.find(([type]) => type === 'pagehide')![1]();

        idb.state.pendingWrites.shift()!(); // Only the old snapshot has committed.
        await settle();
        expect(complete).toBe(false);
        idb.state.pendingWrites.shift()!(); // The pagehide snapshot commits independently.
        await settle();
        idb.state.pendingWrites.shift()!(); // The awaited writer's latest snapshot commits.
        await Promise.all([first, latest]);
        const restored = await webDb.openSqlJsReader(idb.records.get('collection') as Uint8Array);
        expect(restored.getFirstSync<{ value: string }>('SELECT value FROM settings')?.value).toBe('new');
        restored.close();
    });

    it('rejects a failed commit instead of acknowledging success', async () => {
        const idb = createFakeIndexedDb();
        const { webDb } = await loadWebDb({ indexedDB: idb.indexedDB, locks: createFakeLocks().locks });
        const db = await webDb.initWebDatabase();
        db.execSync('CREATE TABLE settings (value TEXT)');
        idb.state.failWrites = new Error('Storage quota exceeded');

        await expect(webDb.flushWebDatabase()).rejects.toThrow('Storage quota exceeded');
        expect(idb.records.has('collection')).toBe(false);
    });

    it('does not acknowledge a save from a read-only tab', async () => {
        const { locks, holdInAnotherTab } = createFakeLocks();
        holdInAnotherTab();
        const idb = createFakeIndexedDb();
        const { webDb } = await loadWebDb({ indexedDB: idb.indexedDB, locks });
        await webDb.initWebDatabase();

        await expect(webDb.flushWebDatabase()).rejects.toThrow(/read.only/i);
        expect(idb.state.puts).toBe(0);
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

/** Real note/import/scheduler writes, restored exclusively from the acknowledged IDB bytes. */
describe('collection operations survive an immediate reload', () => {
    async function collection() {
        const idb = createFakeIndexedDb();
        const { webDb } = await loadWebDb({ indexedDB: idb.indexedDB, locks: createFakeLocks().locks });
        const db = await webDb.initWebDatabase();
        db.execSync(APP_TEST_SCHEMA);
        vi.doMock('./db', () => ({
            getDB: () => db,
            flushDatabaseWrites: () => webDb.flushWebDatabase(),
            readOnlyTabMessage: () => webDb.isPrimaryTab() ? null : 'read-only',
        }));
        const notes = await import('./noteManager');
        const { saveDeck, saveDeckConfig } = await import('./deckManager');
        const { DEFAULT_DECK_CONFIG, BUILTIN_NOTE_TYPES } = await import('./models');
        saveDeck({ id: 1, name: 'Test', configId: 1, mod: 0, usn: -1, description: '', collapsed: false, isFiltered: false });
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG, buryNewSiblings: true });
        notes.saveNoteType(BUILTIN_NOTE_TYPES.find((type) => type.id === 2)!);
        const { commitCollectionWrite } = await import('./collectionWrite');
        return { idb, webDb, db, notes, commitCollectionWrite, DEFAULT_DECK_CONFIG };
    }

    it('stores the answer, review log and buried sibling before advancing', async () => {
        const { idb, webDb, notes, commitCollectionWrite, DEFAULT_DECK_CONFIG } = await collection();
        const created = notes.createTusCard({ question: 'Reload question', answer: 'Answer', noteTypeId: 2, deckId: 1 });
        const { resolveSettingsFromConfig } = await import('./settingsResolver');
        const { answerStudyCard } = await import('./studyAnswer');
        const settings = resolveSettingsFromConfig(DEFAULT_DECK_CONFIG, { dayRolloverHour: 4, algorithm: 'ANKI_V3' } as any);
        const result = await commitCollectionWrite(() => answerStudyCard(created.card.id, 3, settings, 1234));
        const reader = await webDb.openSqlJsReader(idb.records.get('collection') as Uint8Array);
        expect(reader.getFirstSync<{ reps: number }>('SELECT reps FROM anki_cards WHERE id = ?', created.card.id)?.reps).toBe(1);
        expect(reader.getFirstSync<{ queue: number }>('SELECT queue FROM anki_cards WHERE id = ?', created.cards[1].id)?.queue).toBe(-2);
        expect(reader.getFirstSync<{ cardId: number }>('SELECT cardId FROM revlog WHERE id = ?', result.reviewLogId)?.cardId).toBe(created.card.id);
        reader.close();
    });

    it('stores a text import before returning its completion log', async () => {
        const { idb, webDb, commitCollectionWrite } = await collection();
        const { importDelimitedNotes } = await import('./importNotes');
        const { BUILTIN_NOTE_TYPES } = await import('./models');
        const result = await commitCollectionWrite(() => importDelimitedNotes('Durable imported note\tImported answer', {
            noteType: BUILTIN_NOTE_TYPES[0], deckId: 1, delimiter: '\t',
        }));
        expect(result.added).toBe(1);
        const reader = await webDb.openSqlJsReader(idb.records.get('collection') as Uint8Array);
        expect(reader.getFirstSync<{ sfld: string }>('SELECT sfld FROM notes')?.sfld).toBe('Durable imported note');
        expect(reader.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM anki_cards')?.count).toBe(1);
        reader.close();
    });

    it('restores the card and sibling after a storage failure so retry records only one answer', async () => {
        const { idb, webDb, notes, commitCollectionWrite, DEFAULT_DECK_CONFIG } = await collection();
        const created = notes.createTusCard({ question: 'Retry question', answer: 'Answer', noteTypeId: 2, deckId: 1 });
        await webDb.flushWebDatabase();
        const before = notes.getCardsForNote(created.note.id);
        const { resolveSettingsFromConfig } = await import('./settingsResolver');
        const { answerStudyCard, undoAnswer } = await import('./studyAnswer');
        const settings = resolveSettingsFromConfig(DEFAULT_DECK_CONFIG, { dayRolloverHour: 4, algorithm: 'ANKI_V3' } as any);
        idb.state.failWrites = new Error('Quota exceeded');
        await expect(commitCollectionWrite(() => answerStudyCard(created.card.id, 3, settings, 1234), (result) => {
            undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);
        })).rejects.toThrow('Quota exceeded');
        expect(notes.getCardsForNote(created.note.id)).toEqual(before);
        idb.state.failWrites = null;
        await commitCollectionWrite(() => answerStudyCard(created.card.id, 3, settings, 1234));
        const reader = await webDb.openSqlJsReader(idb.records.get('collection') as Uint8Array);
        expect(reader.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM revlog')?.count).toBe(1);
        reader.close();
    });
});
