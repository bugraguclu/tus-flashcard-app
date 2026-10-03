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

    it('creates the Kronometre table without moving the schema version, so older builds still open the collection', () => {
        db.execSync('DROP TABLE study_sessions;');
        runMigrations(db as never);

        expect(schemaVersion()).toBe(newest);
        db.runSync(
            "INSERT INTO study_sessions (id, subject, startMs, endMs, studyMs) VALUES (1, 'Fizyoloji', 1000, 61000, 60000)",
        );
        expect(db.getFirstSync<{ pass: number; breakMs: number; source: string }>('SELECT pass, breakMs, source FROM study_sessions'))
            .toEqual({ pass: 1, breakMs: 0, source: 'timer' });

        // Opening the collection again leaves the table and its rows alone.
        runMigrations(db as never);
        expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM study_sessions')?.n).toBe(1);
    });
});

