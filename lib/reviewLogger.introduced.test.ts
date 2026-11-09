// "New cards introduced today" feeds the daily new-card limit. These tests hold the fast queries to
// the definition they replaced: a card counts when the earliest answer that can introduce a card
// (rated, and not a filtered-deck preview) is from today.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
}));

import {
    getNewCardsIntroducedTodayInDeck,
    getTodayAnswerStats,
    getTodayLimitUsageByDeck,
    startOfStudyDayMs,
} from './reviewLogger';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

const DAY_MS = 86_400_000;
// Rollover far from "now" so the study-day boundary never straddles the test run.
const rolloverHour = (new Date().getHours() + 12) % 24;
const DECKS: Array<[number, string]> = [[1, 'TUS'], [2, 'TUS::Dahiliye'], [3, 'TUS::Cerrahi'], [4, 'Dil']];

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
    for (const [id, name] of DECKS) {
        db.runSync(
            'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
            id, name, JSON.stringify({ id, name }),
        );
    }
});

afterEach(() => db.close());

function addCard(id: number, deckId: number) {
    db.runSync(
        'INSERT OR IGNORE INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, 1, ?, 0, ?, ?, 0, -1, 0)',
        id, `N${id}`, '', '{}',
    );
    db.runSync(
        `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor,
            reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
         VALUES (?, ?, ?, 0, 2, 2, 0, 1, 2500, 0, 0, 0, 0, '{}', 0, ?, -1, 0)`,
        id, id, deckId, id,
    );
}

function log(id: number, cardId: number, ease: number, type: number, factor: number) {
    db.runSync(
        // Two generated answers can land on one millisecond; the log keeps the first.
        'INSERT OR IGNORE INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, 1, 0, ?, 1000, ?)',
        id, cardId, ease, factor, type,
    );
}

/** The definition, written the slow way: every card's earliest introducing answer. */
const FIRST_ANSWERS = `SELECT cardId, MIN(id) AS firstReview FROM revlog
    WHERE ease != 0 AND NOT (type = 3 AND factor = 0) GROUP BY cardId`;

function expectedCardIds(startMs: number): number[] {
    return db.getAllSync<{ cardId: number }>(
        `SELECT cardId FROM (${FIRST_ANSWERS}) WHERE firstReview >= ? ORDER BY cardId`, startMs,
    ).map((row) => row.cardId);
}

function deckOf(cardId: number): number | null {
    return db.getFirstSync<{ deckId: number }>('SELECT deckId FROM anki_cards WHERE id = ?', cardId)?.deckId ?? null;
}

/** Deterministic pseudo-random numbers in [0, 1). */
function seeded(seed: number) {
    let state = seed;
    return () => {
        state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
        return state / 4_294_967_296;
    };
}

describe('new cards introduced today', () => {
    it('matches the earliest-answer definition on a mixed review log', () => {
        const random = seeded(20261110);
        const now = Date.now();
        const startMs = startOfStudyDayMs(now, rolloverHour);
        // Cards 1–120 exist; 121–140 were answered and deleted since.
        for (let card = 1; card <= 120; card++) addCard(card, DECKS[card % DECKS.length][0]);
        for (let i = 0; i < 1500; i++) {
            const cardId = 1 + Math.floor(random() * 140);
            // Cards past 100 were never answered before today.
            const today = cardId > 100 || random() < 0.35;
            const id = today
                ? startMs + Math.floor(random() * (now - startMs))
                : startMs - 1 - Math.floor(random() * 30 * DAY_MS);
            const kind = random();
            // Rated answers, manual reschedules (ease 0) and filtered-deck previews (type 3, factor 0).
            if (kind < 0.7) log(id, cardId, 1 + Math.floor(random() * 4), Math.floor(random() * 3), 2500);
            else if (kind < 0.85) log(id, cardId, 0, 4, 2500);
            else log(id, cardId, 1 + Math.floor(random() * 4), 3, random() < 0.6 ? 0 : 2500);
        }
        // Answers on the very first and last millisecond around the boundary.
        log(startMs, 9001, 3, 0, 2500);
        log(startMs - 1, 9002, 3, 0, 2500);
        log(startMs + 1, 9002, 3, 0, 2500);

        const expected = expectedCardIds(startMs);
        expect(expected.length).toBeGreaterThan(10);
        expect(expected).toContain(9001);
        expect(expected).not.toContain(9002);

        expect(getTodayAnswerStats(rolloverHour).newCardsIntroduced).toBe(expected.length);

        const scope = Array.from({ length: 60 }, (_, index) => 1 + index * 2);
        expect(getTodayAnswerStats(rolloverHour, undefined, scope).newCardsIntroduced)
            .toBe(expected.filter((cardId) => scope.includes(cardId)).length);

        const byDeck = new Map<number, number>();
        for (const cardId of expected) {
            const deckId = deckOf(cardId);
            if (deckId !== null) byDeck.set(deckId, (byDeck.get(deckId) ?? 0) + 1);
        }
        const usage = getTodayLimitUsageByDeck(rolloverHour);
        for (const [deckId] of DECKS) {
            expect(usage.get(deckId)?.newIntroduced ?? 0).toBe(byDeck.get(deckId) ?? 0);
        }

        const subtree = (byDeck.get(1) ?? 0) + (byDeck.get(2) ?? 0) + (byDeck.get(3) ?? 0);
        expect(getNewCardsIntroducedTodayInDeck('TUS', rolloverHour)).toBe(subtree);
        expect(getTodayAnswerStats(rolloverHour, 'TUS').newCardsIntroduced).toBe(subtree);
        expect(getNewCardsIntroducedTodayInDeck('TUS::Dahiliye', rolloverHour)).toBe(byDeck.get(2) ?? 0);
        expect(getNewCardsIntroducedTodayInDeck('Dil', rolloverHour)).toBe(byDeck.get(4) ?? 0);
    });

    it('does not let a preview or a manual reschedule introduce a card, today or earlier', () => {
        const now = Date.now();
        addCard(1, 4);
        addCard(2, 4);
        addCard(3, 4);
        // Card 1: previewed last week, first real answer today.
        log(now - 7 * DAY_MS - 3, 1, 3, 3, 0);
        log(now - 3000, 1, 3, 0, 2500);
        // Card 2: rescheduled by hand last week, previewed today: never introduced.
        log(now - 7 * DAY_MS - 2, 2, 0, 4, 2500);
        log(now - 2000, 2, 3, 3, 0);
        // Card 3: answered last week and again today.
        log(now - 7 * DAY_MS - 1, 3, 3, 0, 2500);
        log(now - 1000, 3, 3, 1, 2500);

        expect(getTodayAnswerStats(rolloverHour).newCardsIntroduced).toBe(1);
        expect(getTodayLimitUsageByDeck(rolloverHour).get(4)?.newIntroduced).toBe(1);
        expect(getNewCardsIntroducedTodayInDeck('Dil', rolloverHour)).toBe(1);
        expect(getTodayAnswerStats(rolloverHour, undefined, [1, 2, 3]).newCardsIntroduced).toBe(1);
    });
});
