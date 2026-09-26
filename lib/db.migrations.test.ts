import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
import { runMigrations } from './db';

describe('schema migrations', () => {
    let SQL: Awaited<ReturnType<typeof initSqlJs>>;
    let db: SyncDb;
    let newest: number;

    const schemaVersion = () => (
        db.getFirstSync<{ version: number }>('SELECT version FROM schema_version')?.version
    );

    beforeAll(async () => {
        SQL = await initSqlJs();
    });

    beforeEach(() => {
        db = createAppDb(SQL);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        // The test build of sql.js has no FTS5, so the collection starts past the FTS migrations,
        // as the filtered-deck migration test does, and is brought to the newest version from there.
        db.execSync('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);');
        db.runSync('INSERT INTO schema_version (version) VALUES (9)');
        runMigrations(db as never);
        newest = schemaVersion()!;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        db.close();
    });

    it('refuses a collection a newer build has already migrated, leaving it untouched', () => {
        db.runSync('UPDATE schema_version SET version = ?', newest + 1);
        db.runSync("INSERT INTO settings (key, value) VALUES ('probe', 'kept')");

        expect(() => runMigrations(db as never)).toThrow(/newer than this build supports/);
        expect(schemaVersion()).toBe(newest + 1);
        expect(db.getFirstSync<{ value: string }>("SELECT value FROM settings WHERE key = 'probe'")?.value).toBe('kept');
    });

    it('opens a collection already at the newest known version without running anything', () => {
        const log = vi.spyOn(console, 'log');
        log.mockClear();

        expect(() => runMigrations(db as never)).not.toThrow();
        expect(schemaVersion()).toBe(newest);
        expect(log).not.toHaveBeenCalled();
    });
});
