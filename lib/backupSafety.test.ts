// Independently derived from https://docs.ankiweb.net/backups.html (30-minute default and recovery).
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';
const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db, dbGetSchemaVersion: () => 10, initDB: () => {}, dbIndexAllCards: () => {}, dbUpsertFtsCard: () => {}, isPrimaryTab: () => true }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getAllKeys: async () => [], multiRemove: async () => {} } }));
import { exportAllData } from './backupData';
import { createBackupNow, importBackupContents, validateBackupContents, type BackupStore } from './backup';
import { DEFAULT_SETTINGS, validateSettings } from './settingsStore';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { h.db = createAppDb(SQL); });
function store() {
    const files = new Map<string, string>();
    const api: BackupStore = { list: async () => [...files].map(([name, s]) => ({ name, size: s.length, createdAt: 1 })), read: async name => files.get(name)!, write: async (name, s) => { files.set(name, s); }, remove: async name => { files.delete(name); } };
    return { files, api };
}
it('defaults to 30 minutes and retains explicitly configured backup settings', () => {
    expect(DEFAULT_SETTINGS.backupIntervalMinutes).toBe(30);
    expect(validateSettings({ ...DEFAULT_SETTINGS, backupIntervalMinutes: 45, backupDailyCopies: 6, backupWeeklyCopies: 5, backupMonthlyCopies: 4 })).toMatchObject({ backupIntervalMinutes: 45, backupDailyCopies: 6, backupWeeklyCopies: 5, backupMonthlyCopies: 4 });
});
it('preserves malformed raw rows in a recovery snapshot and refuses direct restore', async () => {
    h.db.runSync('INSERT INTO notes (id, data) VALUES (?, ?)', 9, '{broken');
    const s = store();
    const result = await createBackupNow({ store: s.api, exportData: exportAllData, setLastBackupAt: () => {} });
    const snapshot = JSON.parse(s.files.get(result.fileName)!);
    expect(snapshot.tables.notes[0].data).toBe('{broken');
    expect(snapshot.recoveryOnly).toBe(true);
    expect(validateBackupContents(s.files.get(result.fileName)!)).toEqual({ valid: false, reason: 'recovery-only' });
});
it('fails closed on a database read error, without writing a misleading empty snapshot', async () => {
    const read = h.db.getAllSync;
    h.db.getAllSync = (sql: string, ...params: any[]) => { if (sql.includes('SELECT * FROM notes')) throw new Error('database disk image is malformed'); return read(sql, ...params); };
    const s = store();
    await expect(createBackupNow({ store: s.api, exportData: exportAllData })).rejects.toThrow('database disk image is malformed');
    expect(s.files.size).toBe(0);
});
it('accepts a complete snapshot above the former 50 MiB ceiling', () => {
    const tables = { note_types: [], notes: [], anki_cards: [], decks: [], deck_configs: [], revlog: [], graves: [], session_stats: [] };
    const json = JSON.stringify({ version: 6, canonical: true, tables, padding: 'x'.repeat(51 * 1024 * 1024) });
    expect(validateBackupContents(json)).toEqual({ valid: true });
});
it('rejects protected catalog rows before exporting or importing live data', async () => {
    const data = JSON.parse(await exportAllData());
    data.tables.note_types.push({ id: 1, name: 'Basic', data: '{}' });
    data.tables.notes.push({ id: 1, noteTypeId: 1, sfld: '', csum: 1, tags: '', data: JSON.stringify({ catalogPack: 'bka-tus' }) });
    const exportData = vi.fn(exportAllData); const importData = vi.fn(async () => false);
    await expect(importBackupContents(JSON.stringify(data), { store: store().api, exportData, importData, isWriter: () => true })).rejects.toThrow();
    expect(exportData).not.toHaveBeenCalled(); expect(importData).not.toHaveBeenCalled();
});
it('keeps historical weekly restore points after a burst of same-day snapshots', async () => {
    const s = store(); const json = await exportAllData();
    for (const day of ['01', '08', '15', '22', '29']) s.files.set(`tus-backup-2026-09-${day}-120000000.json`, json);
    s.api.list = async () => [...s.files].map(([name, value]) => ({ name, size: value.length, createdAt: new Date(name.slice(11, 21) + 'T12:00:00').getTime() }));
    for (let minute = 0; minute < 8; minute++) await createBackupNow({ store: s.api, exportData: async () => json, setLastBackupAt: () => {}, now: () => new Date(2026, 9, 22, 12, minute) });
    expect(s.files.has('tus-backup-2026-09-01-120000000.json')).toBe(true);
    expect([...s.files.keys()].filter(name => name.includes('2026-10-22'))).toHaveLength(8);
});
it('captures catalog tags and opaque scheduler data without including catalog fields', async () => {
    h.db.runSync('INSERT INTO notes (id, data) VALUES (?, ?)', 11, JSON.stringify({ id: 11, guid: 'catalog-test', catalogPack: 'bka-tus', tags: ['marked', 'personal'], fields: ['Paid question', 'Paid answer'] }));
    h.db.runSync('INSERT INTO anki_cards (id, noteId, data) VALUES (?, ?, ?)', 31, 11, JSON.stringify({ id: 31, type: 2, queue: 2, reps: 4, ankiData: '{"s":9,"d":4,"pos":3}' }));
    const json = await exportAllData(); const data = JSON.parse(json);
    expect(json).not.toContain('Paid answer');
    expect(data.catalogLearnerData.notes['catalog-test']).toEqual(['marked', 'personal']);
    expect(data.catalogLearnerData.cards['31']).toBe('{"s":9,"d":4,"pos":3}');
});
it('reapplies catalog tags and FSRS data after the content installer recreates its rows', async () => {
    const { CATALOG_LEARNER_DATA_KEY, applyPendingCatalogLearnerData } = await import('./backupCatalogLearnerData');
    h.db.runSync('INSERT INTO settings VALUES (?, ?)', CATALOG_LEARNER_DATA_KEY, JSON.stringify({ notes: { g: ['marked', 'personal'] }, cards: { '31': '{"s":10,"d":4,"pos":6}' } }));
    h.db.runSync('INSERT INTO notes (id, data) VALUES (?, ?)', 11, JSON.stringify({ id: 11, guid: 'g', catalogPack: 'bka-tus', tags: ['base'], fields: ['Protected'] }));
    h.db.runSync('INSERT INTO anki_cards (id, noteId, data) VALUES (?, ?, ?)', 31, 11, JSON.stringify({ id: 31, reps: 5, ankiData: '' }));
    applyPendingCatalogLearnerData();
    expect(JSON.parse(h.db.getFirstSync('SELECT data FROM notes WHERE id = 11').data)).toMatchObject({ fields: ['Protected'], tags: ['marked', 'personal'] });
    expect(JSON.parse(h.db.getFirstSync('SELECT data FROM anki_cards WHERE id = 31').data)).toMatchObject({ reps: 5, ankiData: '{"s":10,"d":4,"pos":6}' });
});
it('migrates schema-9 filtered deck order when restoring into an already-current database', async () => {
    const { importAllData } = await import('./backupData');
    const data = JSON.parse(await exportAllData()); delete data.settings;
    data.schema_version = 9;
    data.tables.decks.push({ id: 12, name: 'Filtered', data: JSON.stringify({ id: 12, name: 'Filtered', isFiltered: true, searchOrder: 0, searchOrder2: 1 }) });
    expect(await importAllData(JSON.stringify(data))).toBe(true);
    expect(JSON.parse(h.db.getFirstSync('SELECT data FROM decks WHERE id = 12').data).searchOrder).toBe(6);
});
