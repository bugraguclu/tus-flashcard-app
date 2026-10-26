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
        expect(db.getFirstSync('SELECT pass, breakMs, source, kind, breakCount, note FROM study_sessions'))
            .toEqual({ pass: 1, breakMs: 0, source: 'timer', kind: 'pass', breakCount: 0, note: '' });

        // Opening the collection again leaves the table and its rows alone.
        runMigrations(db as never);
        expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM study_sessions')?.n).toBe(1);
    });

    describe('a Kronometre table from before the session type, break count and note', () => {
        const OLD_COLUMNS = 'id, subject, pass, startMs, endMs, studyMs, breakMs, source';

        beforeEach(() => {
            db.execSync(`
                DROP TABLE study_sessions;
                CREATE TABLE study_sessions (
                    id INTEGER PRIMARY KEY, subject TEXT NOT NULL, pass INTEGER NOT NULL DEFAULT 1,
                    startMs INTEGER NOT NULL, endMs INTEGER NOT NULL, studyMs INTEGER NOT NULL,
                    breakMs INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'timer'
                );
            `);
            db.runSync(`INSERT INTO study_sessions (${OLD_COLUMNS}) VALUES (7, 'Patoloji', 3, 1000, 4201000, 3000000, 1200000, 'manual')`);
        });

        it('gains the columns with defaults that read its rows as "N. Tekrar", no breaks counted and no note', () => {
            runMigrations(db as never);

            expect(schemaVersion()).toBe(newest);
            expect(db.getAllSync('SELECT * FROM study_sessions')).toEqual([{
                id: 7, subject: 'Patoloji', pass: 3, startMs: 1000, endMs: 4201000, studyMs: 3000000, breakMs: 1200000,
                source: 'manual', kind: 'pass', breakCount: 0, note: '',
            }]);

            // A second open finds the columns already there and changes nothing.
            runMigrations(db as never);
            expect(db.getAllSync<{ name: string }>('PRAGMA table_info(study_sessions)').map((column) => column.name))
                .toEqual(['id', 'subject', 'pass', 'startMs', 'endMs', 'studyMs', 'breakMs', 'source', 'kind', 'breakCount', 'note']);
        });

        it('still takes a session written by a build that names only the old columns', () => {
            runMigrations(db as never);
            db.runSync(`INSERT INTO study_sessions (${OLD_COLUMNS}) VALUES (8, 'Anatomi', 1, 5000, 65000, 60000, 0, 'timer')`);
            db.runSync("UPDATE study_sessions SET kind = 'video', note = 'Kas sistemi' WHERE id = 7");
            // An older build editing the session rewrites only the columns it knows.
            db.runSync('UPDATE study_sessions SET pass = 4 WHERE id = 7');

            expect(db.getAllSync('SELECT id, kind, pass, breakCount, note FROM study_sessions ORDER BY id')).toEqual([
                { id: 7, kind: 'video', pass: 4, breakCount: 0, note: 'Kas sistemi' },
                { id: 8, kind: 'pass', pass: 1, breakCount: 0, note: '' },
            ]);
        });
    });
});

