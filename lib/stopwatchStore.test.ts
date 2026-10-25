import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({ getDB: () => dbHolder.db }));

import {
    deleteStudySession,
    fetchStudySessionsBetween,
    insertStudySession,
    latestStudyPass,
    loadRunningStopwatch,
    loadStopwatchPrefs,
    readStudySessionsForBackup,
    recentStudySubjects,
    replaceStudySessions,
    saveRunningStopwatch,
    saveStopwatchPrefs,
    updateStudySession,
} from './stopwatchStore';
import { DEFAULT_STOPWATCH_PREFS, startStopwatch, type StudySessionDraft } from './stopwatch';

const MINUTE = 60_000;
const T0 = new Date('2026-10-03T09:00:00').getTime();

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
});

afterEach(() => {
    db.close();
});

function draft(subject: string, startMs: number, studyMinutes: number, pass = 1): StudySessionDraft {
    return { subject, pass, startMs, endMs: startMs + studyMinutes * MINUTE, studyMs: studyMinutes * MINUTE, breakMs: 0 };
}

describe('study sessions', () => {
    it('stores a session and reads it back in its window', () => {
        const record = insertStudySession(draft('Fizyoloji', T0, 50), 'timer', T0 + 50 * MINUTE);
        expect(record.id).toBe(T0 + 50 * MINUTE);
        expect(fetchStudySessionsBetween(T0 - MINUTE, T0 + MINUTE)).toEqual([record]);
        expect(fetchStudySessionsBetween(T0 + 2 * 60 * MINUTE, T0 + 3 * 60 * MINUTE)).toEqual([]);
    });

    it('finds a session that started before the window but runs into it', () => {
        insertStudySession(draft('Anatomi', T0, 120), 'timer', T0);
        expect(fetchStudySessionsBetween(T0 + 60 * MINUTE, T0 + 90 * MINUTE)).toHaveLength(1);
    });

    it('gives every session its own id, even two saved in the same millisecond', () => {
        const first = insertStudySession(draft('Anatomi', T0, 10), 'manual', T0);
        const second = insertStudySession(draft('Anatomi', T0 + 20 * MINUTE, 10), 'manual', T0);
        expect(second.id).toBe(first.id + 1);
    });

    it('repairs a draft whose end is earlier than its own time, and refuses one without a subject', () => {
        const record = insertStudySession({ ...draft('Patoloji', T0, 30), endMs: T0 }, 'manual', T0);
        expect(record.endMs).toBe(T0 + 30 * MINUTE);
        expect(() => insertStudySession(draft('   ', T0, 30), 'manual', T0)).toThrow();
    });

    it('edits and deletes a session by id', () => {
        const record = insertStudySession(draft('Biyokimya', T0, 30), 'timer', T0);
        updateStudySession(record.id, draft('Biyokimya', T0, 45, 2));
        const [edited] = readStudySessionsForBackup();
        expect(edited).toMatchObject({ id: record.id, source: 'timer', pass: 2, studyMs: 45 * MINUTE });
        deleteStudySession(record.id);
        expect(readStudySessionsForBackup()).toEqual([]);
    });

    it('continues a subject from the pass of its latest session', () => {
        insertStudySession(draft('Dahiliye', T0, 30, 1), 'timer', T0);
        insertStudySession(draft('Dahiliye', T0 + 60 * MINUTE, 30, 2), 'timer', T0 + 60 * MINUTE);
        expect(latestStudyPass('Dahiliye')).toBe(2);
        expect(latestStudyPass('Pediatri')).toBeNull();
    });

    it('lists recent subjects newest first without repeats', () => {
        insertStudySession(draft('Anatomi', T0, 10), 'timer', T0);
        insertStudySession(draft('Fizyoloji', T0 + 30 * MINUTE, 10), 'timer', T0 + 30 * MINUTE);
        insertStudySession(draft('Anatomi', T0 + 60 * MINUTE, 10), 'timer', T0 + 60 * MINUTE);
        expect(recentStudySubjects(5)).toEqual(['Anatomi', 'Fizyoloji']);
        expect(recentStudySubjects(1)).toEqual(['Anatomi']);
    });

    it('replaces every session with a restored set', () => {
        insertStudySession(draft('Anatomi', T0, 10), 'timer', T0);
        const restored = { id: 42, subject: 'Mikrobiyoloji', pass: 3, startMs: T0, endMs: T0 + 20 * MINUTE, studyMs: 15 * MINUTE, breakMs: 5 * MINUTE, source: 'manual' as const };
        replaceStudySessions([restored]);
        expect(readStudySessionsForBackup()).toEqual([restored]);
    });
});

describe('preferences and the running stopwatch', () => {
    it('reads defaults until something is saved, then what was saved', () => {
        expect(loadStopwatchPrefs()).toEqual(DEFAULT_STOPWATCH_PREFS);
        const saved = saveStopwatchPrefs({ ...DEFAULT_STOPWATCH_PREFS, dailyGoalMinutes: 390, examDate: '2027-03-21' });
        expect(loadStopwatchPrefs()).toEqual(saved);
        expect(saved.dailyGoalMinutes).toBe(390);
    });

    it('keeps the running stopwatch until it is cleared', () => {
        const state = startStopwatch('Farmakoloji', 1, T0);
        saveRunningStopwatch(state);
        expect(loadRunningStopwatch()).toEqual(state);
        saveRunningStopwatch(null);
        expect(loadRunningStopwatch()).toBeNull();
    });
});
