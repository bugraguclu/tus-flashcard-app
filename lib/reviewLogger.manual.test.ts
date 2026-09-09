// Every revlog query has to survive the rating-less rows that "Forget" and "Set Due Date" leave
// behind. Two things are checked here at once, against a real database:
// 1. each query still parses and runs, and
// 2. none of them counts a bookkeeping row as an answer.
// Several of these functions have no other test, so this file is also what proves their SQL is
// well-formed at all.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({ getDB: () => dbHolder.db }));

import {
    getAverageAnswerMs,
    getButtonDistribution,
    getDailyReviewCounts,
    getHourlyBreakdown,
    getReviewStats,
    getStudiedDaysBetween,
    getStudyStreak,
    getTodayAnswerStats,
    getTodayLimitUsageByDeck,
    getTodayReviewCount,
    getTodayStudyTimeMs,
} from './reviewLogger';
import { localDayNumber } from './ankiState';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

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

function addAnswer(idMs: number, cardId: number, ease: number, timeMs = 4000) {
    db.runSync(
        'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, 1, 0, 2500, ?, 1)',
        idMs, cardId, ease, timeMs,
    );
}

function addCard(id: number, deckId: number) {
    db.runSync(
        `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, usn)
         VALUES (?, ?, ?, 0, 2, 2, 0, 1, 2500, 1, 0, 0, 0, '{}', -1)`,
        id, id, deckId,
    );
}

/** What logManualEntry writes: no rating, no time. type 4 = reset, type 5 = rescheduled. */
function addManualEntry(idMs: number, cardId: number, type: 4 | 5) {
    db.runSync(
        'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, 0, 0, 0, 0, 0, ?)',
        idMs, cardId, type,
    );
}

describe('revlog queries ignore rating-less bookkeeping rows', () => {
    it('counts one answer, not the reset and reschedule around it', () => {
        const now = Date.now();
        addManualEntry(now - 4000, 1, 4);
        addAnswer(now - 3000, 1, 3, 5000);
        addManualEntry(now - 2000, 1, 5);

        expect(getTodayReviewCount(rolloverHour)).toBe(1);
        expect(getTodayStudyTimeMs(rolloverHour)).toBe(5000);

        const stats = getTodayAnswerStats(rolloverHour);
        expect(stats.reviewed).toBe(1);
        expect(stats.studyTimeMs).toBe(5000);
        // The card was introduced by the answer, not by the reset that preceded it.
        expect(stats.newCardsIntroduced).toBe(1);
    });

    it('reports no study at all for a day that only holds bookkeeping rows', () => {
        const now = Date.now();
        addManualEntry(now - 3000, 1, 4);
        addManualEntry(now - 2000, 2, 5);

        expect(getTodayReviewCount(rolloverHour)).toBe(0);
        expect(getTodayStudyTimeMs(rolloverHour)).toBe(0);
        expect(getTodayAnswerStats(rolloverHour).reviewed).toBe(0);
        // A forgotten card must not light up the streak as if the user had studied.
        expect(getStudyStreak(rolloverHour).current).toBe(0);

        const today = localDayNumber(now, rolloverHour);
        expect(getStudiedDaysBetween(today, today, rolloverHour).size).toBe(0);
    });

    it('keeps bookkeeping rows out of the averages and distributions', () => {
        const now = Date.now();
        addAnswer(now - 3000, 1, 3, 6000);
        addManualEntry(now - 2000, 1, 5);

        // A zero-time row would halve the average if it were counted.
        expect(getAverageAnswerMs(rolloverHour, 7)).toBe(6000);

        const buttons = getButtonDistribution();
        expect(buttons.some((entry) => entry.ease === 0)).toBe(false);
        expect(buttons.find((entry) => entry.ease === 3)?.count).toBe(1);

        expect(getHourlyBreakdown().reduce((sum, hour) => sum + hour.count, 0)).toBe(1);
        expect(getReviewStats(now - 60_000, now).totalReviews).toBe(1);
        expect(getDailyReviewCounts(2, rolloverHour).reduce((sum, day) => sum + day.count, 0)).toBe(1);
    });

    it('scopes to a deck subtree without counting bookkeeping rows', () => {
        // This path rebuilds its WHERE clause around the new guard, so it needs its own case:
        // the added parentheses are what keep the deck filter from binding to the guard alone.
        const now = Date.now();
        db.runSync("INSERT INTO decks (id, name, usn) VALUES (5, 'Mikrobiyoloji', -1)");
        db.runSync("INSERT INTO decks (id, name, usn) VALUES (6, 'Anatomi', -1)");
        addCard(1, 5);
        addCard(2, 6);

        addAnswer(now - 3000, 1, 3, 5000);
        addManualEntry(now - 2000, 1, 5);
        // An answer in a different subtree must stay out of the scoped totals entirely.
        addAnswer(now - 1000, 2, 3, 7000);

        const scoped = getTodayAnswerStats(rolloverHour, 'Mikrobiyoloji');
        expect(scoped.reviewed).toBe(1);
        expect(scoped.studyTimeMs).toBe(5000);
        expect(scoped.newCardsIntroduced).toBe(1);
    });

    it('runs the per-deck limit query without counting a reset as a new card', () => {
        const now = Date.now();
        addCard(1, 5);
        addManualEntry(now - 2000, 1, 4);

        expect(getTodayLimitUsageByDeck(rolloverHour).get(5)?.newIntroduced ?? 0).toBe(0);
    });
});
