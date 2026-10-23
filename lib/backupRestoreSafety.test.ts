// Restore and snapshot safety: what a restore commits together, what a backup carries, when an
// automatic backup is skipped, and chunked writing. Retention shape: https://docs.ankiweb.net/backups.html
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any, asyncStorageFails: false }));
vi.mock('./db', () => ({ getDB: () => h.db, dbGetSchemaVersion: () => 10, initDB: () => {}, dbIndexAllCards: () => {}, dbUpsertFtsCard: () => {}, isPrimaryTab: () => true }));
vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, multiRemove: async () => {},
        getAllKeys: async () => { if (h.asyncStorageFails) throw new Error('AsyncStorage unavailable'); return []; },
    },
}));
import { exportAllData, exportAllDataChunks, importAllData } from './backupData';
import { createBackupNow, runAutoBackupIfDue, type BackupStore } from './backup';
import { retainedBackupNames, DEFAULT_BACKUP_POLICY, MAX_RECENT_BACKUPS } from './backupPolicy';
import { CATALOG_LEARNER_DATA_KEY, applyPendingCatalogLearnerData } from './backupCatalogLearnerData';
import { loadSettings } from './settingsStore';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { h.db = createAppDb(SQL); h.asyncStorageFails = false; });

function seedCollection() {
    h.db.runSync('INSERT INTO note_types (id, name, data, updated_at, usn) VALUES (1, ?, ?, 0, -1)', 'Basic', JSON.stringify({ id: 1, name: 'Basic', fields: [{ name: 'Front', ord: 0 }] }));
    h.db.runSync('INSERT INTO decks (id, name, data, updated_at, usn) VALUES (1, ?, ?, 0, -1)', 'Default', JSON.stringify({ id: 1, name: 'Default' }));
    h.db.runSync('INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn) VALUES (1, 1, ?, 0, ?, ?, 0, -1)', 'q', '', JSON.stringify({ id: 1, fields: ['q'], tags: [] }));
    insertCard(1, 1);
}

function insertCard(id: number, noteId: number) {
    h.db.runSync(`INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn)
        VALUES (?, ?, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, ?, 0, 1, -1)`, id, noteId, JSON.stringify({ id }));
}

function memoryStore(options: { chunked?: boolean } = {}) {
    const files = new Map<string, string>();
    const chunkCounts: number[] = [];
    const api: BackupStore = {
        list: async () => [...files].map(([name, value]) => ({ name, size: value.length, createdAt: 1 })),
        read: async (name) => files.get(name)!,
        write: async (name, value) => { files.set(name, value); },
        remove: async (name) => { files.delete(name); },
        ...(options.chunked ? { writeChunks: async (name: string, chunks: readonly string[]) => { chunkCounts.push(chunks.length); files.set(name, chunks.join('')); } } : {}),
    };
    return { files, api, chunkCounts };
}

describe('restore', () => {
    it('reports a committed restore as done when legacy storage cleanup fails afterwards (B6)', async () => {
        seedCollection();
        const data = JSON.parse(await exportAllData());
        data.settings = { ...data.settings, dayRolloverHour: 7 };
        h.asyncStorageFails = true;
        expect(await importAllData(JSON.stringify(data))).toBe(true);
        // Settings were written with the tables, not after them.
        expect(loadSettings().dayRolloverHour).toBe(7);
    });

    it('rolls the settings back with the tables when the transaction fails', async () => {
        seedCollection();
        const data = JSON.parse(await exportAllData());
        data.settings = { ...data.settings, dayRolloverHour: 9 };
        const run = h.db.runSync;
        h.db.runSync = (sql: string, ...params: any[]) => {
            if (typeof params[0] === 'string' && params[0].startsWith('interday_review_usage:')) throw new Error('disk full');
            return run(sql, ...params);
        };
        data.queueBookkeeping = { 'interday_review_usage:5': '1' };
        expect(await importAllData(JSON.stringify(data))).toBe(false);
        h.db.runSync = run;
        expect(loadSettings().dayRolloverHour).not.toBe(9);
    });

    it('carries filtered membership and review-allowance rows and clears stale ones (B7)', async () => {
        seedCollection();
        h.db.runSync('INSERT INTO settings (key, value) VALUES (?, ?), (?, ?)', 'filtered_membership_v1:3', '{"buildAt":1,"ids":[1]}', 'interday_review_usage:77', '1');
        const json = await exportAllData();
        expect(JSON.parse(json).queueBookkeeping).toEqual({ 'filtered_membership_v1:3': '{"buildAt":1,"ids":[1]}', 'interday_review_usage:77': '1' });

        h.db.runSync('DELETE FROM settings WHERE key = ?', 'interday_review_usage:77');
        h.db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', 'filtered_membership_v1:9', '{"stale":true}');
        expect(await importAllData(json)).toBe(true);
        const keys = h.db.getAllSync("SELECT key FROM settings WHERE key LIKE 'filtered%' OR key LIKE 'interday%' ORDER BY key").map((row: any) => row.key);
        expect(keys).toEqual(['filtered_membership_v1:3', 'interday_review_usage:77']);
    });

    it('clears stale bookkeeping rows even when restoring an older backup without them', async () => {
        seedCollection();
        const data = JSON.parse(await exportAllData()); delete data.queueBookkeeping;
        h.db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', 'filtered_membership_v1:9', '{}');
        expect(await importAllData(JSON.stringify(data))).toBe(true);
        expect(h.db.getFirstSync('SELECT key FROM settings WHERE key = ?', 'filtered_membership_v1:9')).toBeNull();
    });
});

describe('catalog learner overlay (B4)', () => {
    function installCatalogCard(ankiData = '') {
        h.db.runSync('INSERT INTO notes (id, data) VALUES (11, ?)', JSON.stringify({ id: 11, guid: 'g', catalogPack: 'bka-tus', tags: [] }));
        h.db.runSync('INSERT INTO anki_cards (id, noteId, data) VALUES (31, 11, ?)', JSON.stringify({ id: 31, ankiData }));
    }

    it('keeps a card answered after the backup instead of rolling its memory state back', () => {
        const takenAt = Date.now() - 86_400_000;
        h.db.runSync('INSERT INTO settings VALUES (?, ?)', CATALOG_LEARNER_DATA_KEY, JSON.stringify({ notes: {}, cards: { '31': JSON.stringify({ s: 3, lrt: Math.floor((takenAt - 5000) / 1000) }) }, takenAt }));
        installCatalogCard('{"s":9}');
        h.db.runSync('INSERT INTO revlog (id, cardId, ease, ivl, lastIvl, factor, time, type) VALUES (?, 31, 3, 1, 0, 0, 0, 1)', Date.now() - 1000);
        applyPendingCatalogLearnerData();
        expect(JSON.parse(h.db.getFirstSync('SELECT data FROM anki_cards WHERE id = 31').data).ankiData).toBe('{"s":9}');
        // The entry is settled either way: a later run cannot apply it.
        expect(h.db.getFirstSync('SELECT value FROM settings WHERE key = ?', CATALOG_LEARNER_DATA_KEY).value).toBe('');
    });

    it('applies the overlay to a card whose last review is the one the backup knew', () => {
        const lrtMs = Date.now() - 3 * 86_400_000;
        h.db.runSync('INSERT INTO settings VALUES (?, ?)', CATALOG_LEARNER_DATA_KEY, JSON.stringify({ notes: {}, cards: { '31': JSON.stringify({ s: 3, lrt: Math.floor(lrtMs / 1000) }) }, takenAt: Date.now() - 86_400_000 }));
        installCatalogCard('');
        h.db.runSync('INSERT INTO revlog (id, cardId, ease, ivl, lastIvl, factor, time, type) VALUES (?, 31, 3, 1, 0, 0, 0, 1)', Math.floor(lrtMs / 1000) * 1000 + 400);
        applyPendingCatalogLearnerData();
        expect(JSON.parse(JSON.parse(h.db.getFirstSync('SELECT data FROM anki_cards WHERE id = 31').data).ankiData).s).toBe(3);
    });

    it('records when the backup was taken as the restore writes the overlay', async () => {
        seedCollection();
        const data = JSON.parse(await exportAllData());
        data.catalogLearnerData = { notes: { g: ['x'] }, cards: {} };
        expect(await importAllData(JSON.stringify(data))).toBe(true);
        const pending = JSON.parse(h.db.getFirstSync('SELECT value FROM settings WHERE key = ?', CATALOG_LEARNER_DATA_KEY).value);
        expect(pending.takenAt).toBe(Date.parse(data.exportDate));
    });
});

describe('automatic backups', () => {
    it('skips an automatic backup when nothing changed since the last one (B5)', async () => {
        seedCollection();
        const s = memoryStore();
        let token = 'a'; let last: string | null = null; let clock = Date.now();
        const deps = { store: s.api, now: () => new Date(clock += 1000), changeToken: () => token, getLastBackupAt: () => last, setLastBackupAt: (value: string) => { last = value; }, intervalMinutes: () => 0, autoBackupEnabled: () => true, isWriter: () => true, rolloverHour: () => 4 };
        expect((await runAutoBackupIfDue(deps)).didRun).toBe(true);
        expect((await runAutoBackupIfDue(deps)).didRun).toBe(false);
        token = 'b';
        expect((await runAutoBackupIfDue(deps)).didRun).toBe(true);
    });

    it('reads "changed" from the database connection by default', async () => {
        seedCollection();
        const s = memoryStore(); let clock = Date.now();
        const deps = { store: s.api, now: () => new Date(clock += 1000), intervalMinutes: () => 0, autoBackupEnabled: () => true, isWriter: () => true, rolloverHour: () => 4 };
        expect((await runAutoBackupIfDue(deps)).didRun).toBe(true);
        expect((await runAutoBackupIfDue(deps)).didRun).toBe(false);
        h.db.runSync("UPDATE notes SET sfld = 'edited' WHERE id = 1");
        expect((await runAutoBackupIfDue(deps)).didRun).toBe(true);
    });

    it('keeps at most the newest recent copies of today and yesterday, then the older buckets', () => {
        const now = new Date(2026, 9, 22, 23, 0);
        const snapshots = Array.from({ length: 60 }, (_, index) => ({ name: `r${index}`, createdAt: now.getTime() - index * 30 * 60_000 }));
        snapshots.push({ name: 'old', createdAt: new Date(2026, 9, 10, 12).getTime() });
        const kept = retainedBackupNames(snapshots, now, DEFAULT_BACKUP_POLICY);
        expect([...kept].filter((name) => name.startsWith('r'))).toHaveLength(MAX_RECENT_BACKUPS);
        expect(kept.has('r0')).toBe(true);
        expect(kept.has('old')).toBe(true);
    });
});

describe('chunked snapshot (BAK-4)', () => {
    it('writes a large collection in page-sized chunks that join into the same restorable JSON', async () => {
        seedCollection();
        for (let id = 1; id <= 4500; id++) h.db.runSync('INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, 1, -1, 3, 1, 0, 2500, 1000, 1)', id);
        const snapshot = await exportAllDataChunks();
        expect(snapshot.restorable).toBe(true);
        expect(snapshot.chunks.length).toBeGreaterThan(10);
        expect(Math.max(...snapshot.chunks.map((chunk) => chunk.length))).toBeLessThan(snapshot.chunks.join('').length / 2);
        const parsed = JSON.parse(snapshot.chunks.join(''));
        expect(parsed.tables.revlog).toHaveLength(4500);
        expect(parsed.tables.notes).toHaveLength(1);

        const s = memoryStore({ chunked: true });
        const { fileName } = await createBackupNow({ store: s.api, setLastBackupAt: () => {}, rolloverHour: () => 4 });
        expect(s.chunkCounts[0]).toBeGreaterThan(10);
        expect(JSON.parse(s.files.get(fileName)!).tables.revlog).toHaveLength(4500);
        expect(await importAllData(s.files.get(fileName)!)).toBe(true);
        expect(h.db.getFirstSync('SELECT COUNT(*) AS n FROM revlog').n).toBe(4500);
    });

    it('marks a damaged collection as a recovery copy, as the whole-file check did', async () => {
        seedCollection();
        insertCard(2, 99);
        const snapshot = await exportAllDataChunks();
        expect(snapshot).toMatchObject({ restorable: false, reason: 'orphan-card' });
        expect(JSON.parse(snapshot.chunks.join(''))).toMatchObject({ recoveryOnly: true, recoveryReason: 'orphan-card' });
    });
});
