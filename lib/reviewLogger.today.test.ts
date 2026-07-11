// Tests for revlog-derived daily stats and the study streak — the persistent
// replacements for the session blob that reset to zero after OS sleep.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
}));

import { getStudyStreak, getTodayAnswerStats } from './reviewLogger';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

const DAY_MS = 86_400_000;
// Rollover far from "now" so the study-day boundary never straddles the test run.
const rolloverHour = (new Date().getHours() + 12) % 24;

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

function logAt(idMs: number, cardId: number, ease: number, timeMs = 4000) {
    db.runSync(
        'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, 1, 0, 2500, ?, 0)',
        idMs, cardId, ease, timeMs,
    );
}

describe('getTodayAnswerStats', () => {
    it('derives reviewed/passed/failed/time from today\'s revlog rows', () => {
        const now = Date.now();
        logAt(now - 3000, 1, 3, 5000);
        logAt(now - 2000, 1, 1, 3000);
        logAt(now - 1000, 2, 4, 2000);
        // A review from three days ago must not count toward today.
        logAt(now - 3 * DAY_MS, 3, 3, 9000);

        const stats = getTodayAnswerStats(rolloverHour);
        expect(stats.reviewed).toBe(3);
        expect(stats.failed).toBe(1);
        expect(stats.passed).toBe(2);
        expect(stats.studyTimeMs).toBe(10000);
    });

    it('counts a card as introduced only when its first-ever review is today', () => {
        const now = Date.now();
        // Card 1: genuinely new today (both reviews today).
        logAt(now - 5000, 1, 3);
        logAt(now - 1000, 1, 3);
        // Card 2: first seen three days ago, reviewed again today — not "new today".
        logAt(now - 3 * DAY_MS, 2, 3);
        logAt(now - 2000, 2, 3);

        const stats = getTodayAnswerStats(rolloverHour);
        expect(stats.newCardsIntroduced).toBe(1);
    });

    it('is empty when the revlog is empty (fresh install / after undo)', () => {
        const stats = getTodayAnswerStats(rolloverHour);
        expect(stats.reviewed).toBe(0);
        expect(stats.newCardsIntroduced).toBe(0);
    });
});

describe('getStudyStreak', () => {
    it('counts consecutive study days ending today', () => {
        const now = Date.now();
        logAt(now - 1000, 1, 3);
        logAt(now - DAY_MS, 2, 3);
        logAt(now - 2 * DAY_MS, 3, 3);
        // A gap: nothing 3 days ago, then one more far back.
        logAt(now - 5 * DAY_MS, 4, 3);

        const streak = getStudyStreak(rolloverHour);
        expect(streak.current).toBe(3);
        expect(streak.studiedToday).toBe(true);
        expect(streak.best).toBe(3);
    });

    it('keeps yesterday\'s streak alive before today\'s first review', () => {
        const now = Date.now();
        logAt(now - DAY_MS, 1, 3);
        logAt(now - 2 * DAY_MS, 2, 3);

        const streak = getStudyStreak(rolloverHour);
        expect(streak.current).toBe(2);
        expect(streak.studiedToday).toBe(false);
    });

    it('is zero after a full missed day', () => {
        const now = Date.now();
        logAt(now - 2 * DAY_MS, 1, 3);

        const streak = getStudyStreak(rolloverHour);
        expect(streak.current).toBe(0);
        expect(streak.best).toBe(1);
    });
});
