// Which destructive operations may stand on a recovery-only safety copy. A snapshot of a
// collection with a damaged row keeps that row verbatim and cannot itself be restored, so only the
// actions that are a way out of the damage (Repair, restoring a chosen backup) may run on one.
// Reset and collection replacement need a restorable pre-operation backup.
// Behaviour reference: https://docs.ankiweb.net/backups.html (independently implemented).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any, media: new Map<string, Uint8Array>() }));
vi.mock('./db', () => ({
    getDB: () => h.db,
    dbGetSchemaVersion: () => 10,
    initDB: () => {},
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
    dbDeleteFtsCard: () => {},
    isPrimaryTab: () => true,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getAllKeys: async () => [], multiRemove: async () => {} } }));
vi.mock('./mediaStore', () => ({
    sanitizeMediaFilename: (name: string) => name,
    saveMediaBytes: async (name: string, bytes: Uint8Array) => { h.media.set(name, new Uint8Array(bytes)); },
    readMediaBytes: async (name: string) => h.media.get(name) ?? null,
}));

import { exportAllData, importAllData } from './backupData';
import { BackupNotRestorableError, createBackupNow, importBackupContents, listBackups, validateBackupContents, type BackupDeps, type BackupStore } from './backup';
import { resetAllDataWithBackup, ResetWorkflowError } from './resetWorkflow';
import { optimizeDatabaseWithBackup } from './maintenanceWorkflow';
import { emptyRepairResult } from './maintenance';
import { importPackageWithBackup } from './packageImportWorkflow';
import { openSqlJsReader } from './webDb';

const PACKAGE = new Uint8Array(readFileSync(path.resolve(__dirname, '../test/fixtures/anki-26.05-legacy.apkg')));

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });

function memoryStore() {
    const files = new Map<string, string>();
    const api: BackupStore = {
        list: async () => [...files].map(([name, contents]) => ({ name, size: contents.length, createdAt: 1 })),
        read: async (name) => files.get(name)!,
        write: async (name, contents) => { files.set(name, contents); },
        remove: async (name) => { files.delete(name); },
    };
    return { files, api };
}

let store: ReturnType<typeof memoryStore>;
let backupDeps: BackupDeps;

beforeEach(() => {
    h.db = createAppDb(SQL);
    h.media.clear();
    store = memoryStore();
    backupDeps = { store: store.api, exportData: exportAllData, setLastBackupAt: () => {}, isWriter: () => true, maxCopies: () => 10 };
    h.db.runSync('INSERT INTO note_types (id, name, data, updated_at, usn) VALUES (1, ?, ?, 0, -1)', 'Basic', JSON.stringify({ id: 1, name: 'Basic', fields: [{ name: 'Front', ord: 0 }], templates: [] }));
    h.db.runSync('INSERT INTO decks (id, name, data, updated_at, usn) VALUES (5, ?, ?, 0, -1)', 'Local', JSON.stringify({ id: 5, name: 'Local', configId: 1 }));
    h.db.runSync('INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn) VALUES (8, 1, ?, 0, ?, ?, 0, -1)', 'kept', '', JSON.stringify({ id: 8, guid: 'kept', noteTypeId: 1, fields: ['kept'], tags: [] }));
});

/** A note row whose JSON no longer parses: Repair reports it but cannot rewrite it. */
function damageCollection() {
    h.db.runSync('INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn) VALUES (9, 1, ?, 0, ?, ?, 0, -1)', '', '', '{broken');
}

const rows = () => ({
    notes: h.db.getAllSync('SELECT id, data FROM notes ORDER BY id'),
    decks: h.db.getAllSync('SELECT id, name FROM decks ORDER BY id'),
});

const packageOptions = { subject: 'tus', topic: 'Anki', fileName: 'collection.colpkg', withScheduling: true, withDeckConfigs: true, openReader: openSqlJsReader };

describe('operations that are not a way out of a damaged collection', () => {
    it('refuses Reset before deleting anything when only a recovery copy can be made', async () => {
        damageCollection();
        const before = rows();
        const reset = vi.fn(async () => { h.db.runSync('DELETE FROM notes'); });

        const error = await resetAllDataWithBackup({ backupDeps, reset }).catch((caught) => caught);

        expect(error).toBeInstanceOf(ResetWorkflowError);
        expect(error).toMatchObject({ stage: 'backup', backupFileName: undefined });
        expect(error.cause).toBeInstanceOf(BackupNotRestorableError);
        expect(reset).not.toHaveBeenCalled();
        expect(rows()).toEqual(before);
        expect(store.files.size).toBe(0);
    });

    it('resets a readable collection only after a restorable backup is on disk', async () => {
        const reset = vi.fn(async () => {
            expect([...store.files.values()].map((contents) => validateBackupContents(contents))).toEqual([{ valid: true }]);
        });
        const { backupFileName } = await resetAllDataWithBackup({ backupDeps, reset });
        expect(reset).toHaveBeenCalledTimes(1);
        expect(store.files.has(backupFileName)).toBe(true);
    });

    it('refuses a .colpkg replacement before reading the package when only a recovery copy can be made', async () => {
        damageCollection();
        const before = rows();

        await expect(importPackageWithBackup(PACKAGE, { ...packageOptions, replaceCollection: true }, { backupDeps }))
            .rejects.toBeInstanceOf(BackupNotRestorableError);

        expect(rows()).toEqual(before);
        expect(h.db.getFirstSync('SELECT COUNT(*) AS n FROM anki_cards').n).toBe(0);
        expect(store.files.size).toBe(0);
    });

    it('replaces a readable collection after a restorable backup', async () => {
        const result = await importPackageWithBackup(PACKAGE, { ...packageOptions, replaceCollection: true }, { backupDeps });
        expect(result.cardsImported).toBeGreaterThan(0);
        expect(rows().decks.map((deck: any) => deck.name)).not.toContain('Local');
        expect([...store.files.values()].map((contents) => validateBackupContents(contents))).toEqual([{ valid: true }]);
    });
});

describe('operations that are a way out of a damaged collection', () => {
    it('lets Repair run on a recovery copy and keeps that copy shareable', async () => {
        damageCollection();
        const optimize = vi.fn(() => ({ repair: { ...emptyRepairResult(), unreadableNotes: 1 }, ftsReindexed: 0, freedBytes: 0, failedSteps: [] }));

        const outcome = await optimizeDatabaseWithBackup({ backupDeps, optimize });

        expect(optimize).toHaveBeenCalledTimes(1);
        expect(outcome.backupRestorable).toBe(false);
        const copy = JSON.parse(store.files.get(outcome.backupFileName)!);
        expect(copy.recoveryOnly).toBe(true);
        expect(copy.tables.notes.map((note: any) => note.data)).toContain('{broken');
        expect((await listBackups(backupDeps)).map((backup) => backup.name)).toContain(outcome.backupFileName);
    });

    it('restores a chosen backup over a damaged collection and keeps the recovery copy of what it replaced', async () => {
        const healthy = await exportAllData();
        damageCollection();

        const result = await importBackupContents(healthy, { ...backupDeps, importData: importAllData });

        expect(result.ok).toBe(true);
        expect(rows().notes.map((note: any) => note.id)).toEqual([8]);
        const preRestore = store.files.get(result.preRestoreName!)!;
        expect(JSON.parse(preRestore).recoveryOnly).toBe(true);
        expect(validateBackupContents(preRestore)).toEqual({ valid: false, reason: 'recovery-only' });
        expect((await listBackups(backupDeps)).map((backup) => backup.name)).toContain(result.preRestoreName);
    });
});

describe('manual and automatic backups', () => {
    it('still write a recovery copy of a damaged collection, reported as not restorable', async () => {
        damageCollection();
        const result = await createBackupNow(backupDeps);
        expect(result.restorable).toBe(false);
        expect(validateBackupContents(store.files.get(result.fileName)!)).toEqual({ valid: false, reason: 'recovery-only' });
    });

    it('report a readable collection as restorable', async () => {
        expect((await createBackupNow(backupDeps)).restorable).toBe(true);
    });
});
