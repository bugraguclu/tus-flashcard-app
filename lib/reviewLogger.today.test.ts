// Tests for revlog-derived daily stats and the study streak — the persistent
// replacements for the session blob that reset to zero after OS sleep.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
}));

import { getStudiedDaysBetween, getStudyStreak, getTodayAnswerStats } from './reviewLogger';
import { localDayNumber, dayNumberToYmd } from './ankiState';

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

        const filteredDeckScope = getTodayAnswerStats(rolloverHour, undefined, [1]);
        expect(filteredDeckScope.reviewed).toBe(2);
        expect(filteredDeckScope.failed).toBe(1);
        expect(filteredDeckScope.passed).toBe(1);
        expect(filteredDeckScope.newCardsIntroduced).toBe(1);
        expect(filteredDeckScope.studyTimeMs).toBe(8000);
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

    it('scopes every number to the deck subtree when a deck name is given', () => {
        const addDeck = (id: number, name: string) => db.runSync(
            'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
            id, name, JSON.stringify({ id, name }),
        );
        const addCard = (id: number, deckId: number) => db.runSync(
            `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor,
                reps, lapses, "left", flags, data, updated_at, usn, tombstone)
             VALUES (?, ?, ?, 0, 0, 0, 0, 0, 2500, 0, 0, 0, 0, '{}', 0, -1, 0)`,
            id, id, deckId,
        );

        addDeck(10, 'Python');
        addDeck(11, 'Python::Fonksiyonlar');
        addDeck(12, 'Tarih');
        addCard(1, 10);
        addCard(2, 11);
        addCard(3, 12);

        const now = Date.now();
        logAt(now - 3000, 1, 3, 5000);  // Python root
        logAt(now - 2000, 2, 1, 3000);  // Python subdeck, failed
        logAt(now - 1000, 3, 4, 2000);  // unrelated deck

        const scoped = getTodayAnswerStats(rolloverHour, 'Python');
        expect(scoped.reviewed).toBe(2);
        expect(scoped.failed).toBe(1);
        expect(scoped.passed).toBe(1);
        expect(scoped.studyTimeMs).toBe(8000);
        expect(scoped.newCardsIntroduced).toBe(2);

        // The global numbers still cover everything.
        expect(getTodayAnswerStats(rolloverHour).reviewed).toBe(3);
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

describe('getStudiedDaysBetween', () => {
    it('marks exactly the studied days inside the window (the weekly strip query)', () => {
        const now = Date.now();
        const today = localDayNumber(now, rolloverHour);

        logAt(now - 1000, 1, 3);            // today
        logAt(now - 2 * DAY_MS, 2, 3);      // two days ago
        logAt(now - 9 * DAY_MS, 3, 3);      // outside a 7-day window ending today

        const days = getStudiedDaysBetween(today - 6, today, rolloverHour);
        expect(days.has(dayNumberToYmd(today, rolloverHour))).toBe(true);
        expect(days.has(dayNumberToYmd(today - 2, rolloverHour))).toBe(true);
        expect(days.has(dayNumberToYmd(today - 1, rolloverHour))).toBe(false);
        expect(days.has(dayNumberToYmd(today - 9, rolloverHour))).toBe(false);
        expect(days.size).toBe(2);
    });

    it('returns an empty set for an inverted or review-free range', () => {
        const today = localDayNumber(Date.now(), rolloverHour);
        expect(getStudiedDaysBetween(today, today - 1, rolloverHour).size).toBe(0);
        expect(getStudiedDaysBetween(today - 6, today, rolloverHour).size).toBe(0);
    });
});
