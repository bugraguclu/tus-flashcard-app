// Backups and the Kronometre, against real SQLite: sessions and preferences travel with a backup,
// a backup made before them restores without wiping them, and a reset clears them.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));
const asyncStorageState = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getAllKeys: async () => Array.from(asyncStorageState.keys()),
        getItem: async (key: string) => asyncStorageState.get(key) ?? null,
        setItem: async (key: string, value: string) => { asyncStorageState.set(key, value); },
        removeItem: async (key: string) => { asyncStorageState.delete(key); },
        multiGet: async (keys: string[]) => keys.map((key) => [key, asyncStorageState.get(key) ?? null]),
        multiRemove: async (keys: string[]) => { keys.forEach((key) => asyncStorageState.delete(key)); },
    },
}));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
    initDB: vi.fn(),
    dbIndexAllCards: vi.fn(),
    dbGetSchemaVersion: () => 10,
}));

vi.mock('./deckManager', () => ({
    getDeckConfig: () => ({
        id: 1,
        newPerDay: 20,
        maxReviewsPerDay: 200,
        learningSteps: [1, 10],
        relearningSteps: [10],
        graduatingIvl: 1,
        easyIvl: 4,
        startingEase: 2500,
        newIvlPercent: 0,
        insertionOrder: 'sequential',
        hardIvl: 1.2,
        easyBonus: 1.3,
        ivlModifier: 1,
        maxIvl: 36500,
    }),
    saveDeckConfig: vi.fn(),
}));
// Settings sync their default preset through deckPresets, which deckManager re-exports.
vi.mock('./deckPresets', () => import('./deckManager'));

vi.mock('./legacyMigration', () => ({
    migrateLegacyCardStatesToAnki: vi.fn(),
    migrateLegacyCustomCardsToAnki: vi.fn(),
}));

vi.mock('./ankiInit', () => ({
    initAnkiData: vi.fn(),
    migrateLegacySubjectTopicsToDecks: vi.fn(),
}));

vi.mock('./noteManager', () => ({
    getSearchIndexCards: () => [],
}));

import { exportAllData, importAllData, resetAllData } from './storage';
import { DEFAULT_STOPWATCH_PREFS } from './stopwatch';
import {
    insertStudySession,
    loadStopwatchPrefs,
    readStudySessionsForBackup,
    saveStopwatchPrefs,
} from './stopwatchStore';

const MINUTE = 60_000;
const T0 = new Date('2026-10-01T09:00:00').getTime();

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    asyncStorageState.clear();
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.runSync("INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (1, 'Basic', '{}', 0, -1, 0)");
    db.runSync("INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (10, 1, 'Q', 1, '', '{}', 0, -1, 0)");
    db.runSync("INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (30, 'Deck', '{}', 0, -1, 0)");
    db.runSync(`INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
                VALUES (20, 10, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '{}', 0, 1, -1, 0)`);
    db.runSync("INSERT INTO deck_configs (id, data) VALUES (1, '{}')");
});

afterEach(() => {
    vi.restoreAllMocks();
    db.close();
});

function addSession(subject: string, startMs: number, studyMinutes: number) {
    return insertStudySession(
        { subject, pass: 1, startMs, endMs: startMs + studyMinutes * MINUTE, studyMs: studyMinutes * MINUTE, breakMs: 0 },
        'timer',
        startMs + studyMinutes * MINUTE,
    );
}

describe('Kronometre data in backups', () => {
    it('travels with a backup and comes back on restore', async () => {
        const first = addSession('Fizyoloji', T0, 50);
        const second = addSession('Anatomi', T0 + 2 * 60 * MINUTE, 30);
        saveStopwatchPrefs({ ...DEFAULT_STOPWATCH_PREFS, dailyGoalMinutes: 360, examDate: '2027-03-21' });

        const exported = await exportAllData();
        const parsed = JSON.parse(exported);
        expect(parsed.version).toBe(6);
        expect(parsed.tables.study_sessions).toEqual([first, second]);
        expect(parsed.stopwatchPrefs).toMatchObject({ dailyGoalMinutes: 360, examDate: '2027-03-21' });

        db.runSync('DELETE FROM study_sessions');
        saveStopwatchPrefs(DEFAULT_STOPWATCH_PREFS);

        expect(await importAllData(exported)).toBe(true);
        expect(readStudySessionsForBackup()).toEqual([first, second]);
        expect(loadStopwatchPrefs()).toMatchObject({ dailyGoalMinutes: 360, examDate: '2027-03-21' });
    });

    it('keeps the sessions on the device when the backup was made before them', async () => {
        const parsed = JSON.parse(await exportAllData());
        delete parsed.tables.study_sessions;
        delete parsed.stopwatchPrefs;
        const kept = addSession('Patoloji', T0, 40);

        expect(await importAllData(JSON.stringify(parsed))).toBe(true);
        expect(readStudySessionsForBackup()).toEqual([kept]);
    });

    it('restores an empty session table as empty', async () => {
        const exported = await exportAllData();
        addSession('Patoloji', T0, 40);

        expect(await importAllData(exported)).toBe(true);
        expect(readStudySessionsForBackup()).toEqual([]);
    });

    it('rejects a backup with a malformed session and changes nothing', async () => {
        const parsed = JSON.parse(await exportAllData());
        parsed.tables.study_sessions = [{ id: 1, subject: 'Fizyoloji', pass: 1, startMs: T0, endMs: T0, studyMs: MINUTE, breakMs: 0, source: 'timer' }];
        const kept = addSession('Biyokimya', T0, 20);

        expect(await importAllData(JSON.stringify(parsed))).toBe(false);
        expect(readStudySessionsForBackup()).toEqual([kept]);
    });

    it('is cleared by a full reset', async () => {
        addSession('Farmakoloji', T0, 25);
        await resetAllData();
        expect(readStudySessionsForBackup()).toEqual([]);
    });
});
