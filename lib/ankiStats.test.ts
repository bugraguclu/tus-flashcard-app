import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
}));

import {
    getAddedCardDeckNames,
    getAddedDays,
    getAnkiStatsSnapshot,
    getDeckTypeCounts,
    getHourBreakdown,
    getReviewDays,
    rangeStudyDays,
    resolveStatsDateRange,
} from './ankiStats';
import { localDayNumber } from './ankiState';
import { getStatsScreenSnapshot } from './screenSnapshots';
import { DEFAULT_SETTINGS } from './storage';
import { getStudyStreak, getTodayAnswerStats } from './reviewLogger';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

const ROLLOVER = 4;
const DAY_MS = 86_400_000;
/** Tuesday 22 September 2026, noon local time. */
const NOW = new Date(2026, 8, 22, 12, 0, 0).getTime();
const TODAY = localDayNumber(NOW, ROLLOVER);
const at = (day: number, hour: number, minute: number = 0) => new Date(2026, 8, day, hour, minute).getTime();

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
});

afterEach(() => db.close());

function addDeck(id: number, name: string) {
    db.runSync(
        'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
        id, name, JSON.stringify({ id, name }),
    );
}

interface CardOptions {
    noteId?: number;
    type: number;
    queue: number;
    due: number;
    ivl?: number;
    createdAt?: number;
    data?: Record<string, unknown>;
}

function addCard(id: number, deckId: number, options: CardOptions) {
    const noteId = options.noteId ?? id;
    db.runSync(
        'INSERT OR IGNORE INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, 1, ?, 0, ?, ?, 0, -1, 0)',
        noteId, `N${noteId}`, '', '{}',
    );
    const data = { id, noteId, deckId, type: options.type, queue: options.queue, due: options.due, odue: 0, odid: 0, ...options.data };
    db.runSync(
        `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor,
            reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, 2500, 0, 0, 0, 0, ?, 0, ?, -1, 0)`,
        id, noteId, deckId, options.type, options.queue, options.due, options.ivl ?? 0,
        JSON.stringify(data), options.createdAt ?? id,
    );
}

function addReview(
    id: number,
    cardId: number,
    ease: number,
    options: { type?: number; lastIvl?: number; time?: number } = {},
) {
    db.runSync(
        'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, 10, ?, 2500, ?, ?)',
        id, cardId, ease, options.lastIvl ?? 10, options.time ?? 4000, options.type ?? 1,
    );
}

describe('statistics screen snapshot', () => {
    it('hands the screen the same figures the read model computes, scoped to the deck subtree', () => {
        const now = Date.now();
        const today = localDayNumber(now, ROLLOVER);
        addDeck(10, 'TUS');
        addDeck(11, 'TUS::Dahiliye');
        addDeck(12, 'Başka');
        addCard(1, 10, { type: 2, queue: 2, due: today + 1, ivl: 10, createdAt: now - 20_000 });
        addCard(2, 11, { type: 0, queue: 0, due: 1, createdAt: now - 10_000 });
        addCard(3, 12, { type: 2, queue: 2, due: today + 1, ivl: 60 });
        addReview(now - 1_000, 1, 3);
        addReview(now - 900, 3, 3);
        const range = resolveStatsDateRange('week', new Date(), new Date(), ROLLOVER, now);
        const settings = { ...DEFAULT_SETTINGS, dayRolloverHour: ROLLOVER };

        const screen = getStatsScreenSnapshot({
            deckName: 'TUS',
            range,
            settings,
            localeTag: 'tr-TR',
            includeBacklog: true,
        });

        expect(screen.ankiStats).toEqual(
            getAnkiStatsSnapshot('TUS', range, ROLLOVER, 'tr-TR', undefined, { includeBacklog: true }),
        );
        expect(screen.todayStats).toEqual(getTodayAnswerStats(ROLLOVER, 'TUS'));
        expect(screen.streak).toEqual(getStudyStreak(ROLLOVER));
        expect(screen.reviewDays).toEqual(getReviewDays('TUS', ROLLOVER));
        expect(screen.addedDays).toEqual(getAddedDays('TUS', ROLLOVER));
        expect(screen.hours).toEqual(getHourBreakdown('TUS', range));
        expect(screen.ankiStats.cardCounts.totalCards).toBe(2);
        expect(screen.reviewDays.reduce((sum, day) => sum + day.young, 0)).toBe(1);
        expect(screen.deckStats.map((deck) => deck.name)).toEqual(['TUS::Dahiliye']);
        expect(screen.deckStats[0]).toMatchObject({ total: 1, newCount: 1, studied: 0, pct: 0 });
    });

    it('measures deck progress by card type, so a suspended new card is not counted as studied', () => {
        addDeck(10, 'Kaynak');
        addDeck(11, 'Filtreli');
        addCard(1, 10, { type: 0, queue: -1, due: 1 });                         // new, suspended
        addCard(2, 10, { type: 2, queue: -1, due: TODAY, ivl: 30 });            // mature, suspended
        addCard(3, 10, { type: 3, queue: 1, due: NOW, ivl: 2 });                // relearning
        // Lent to a filtered deck: still progress of the deck it came from.
        addCard(4, 11, { type: 2, queue: 2, due: TODAY, ivl: 4, data: { odid: 10, odue: TODAY } });

        expect(getDeckTypeCounts().get(10)).toEqual({ total: 4, newCards: 1, learn: 1, young: 1, mature: 1 });
        expect(getDeckTypeCounts().has(11)).toBe(false);
    });
});

describe('Anki graphs', () => {
    it('uses the selected deck subtree and preserves Anki category rules', () => {
        const now = Date.now();
        const today = localDayNumber(now, ROLLOVER);
        addDeck(10, 'TUS');
        addDeck(11, 'TUS::Dahiliye');
        addDeck(12, 'Başka');

        addCard(1, 10, { type: 2, queue: 2, due: today + 1, ivl: 10 });  // young, due tomorrow
        addCard(2, 11, { type: 2, queue: 2, due: today + 2, ivl: 30 });  // mature future
        addCard(3, 11, { type: 2, queue: 2, due: today - 1, ivl: 45 });  // overdue, not future due
        addCard(4, 11, { type: 0, queue: 0, due: 1 });                   // unseen
        addCard(5, 11, { type: 2, queue: -1, due: 0 });                  // suspended
        addCard(6, 12, { type: 2, queue: 2, due: today + 1, ivl: 60 });  // unrelated deck

        addReview(now - 4_000, 1, 1, { lastIvl: 10 });  // Again on young
        addReview(now - 3_000, 2, 3, { lastIvl: 30 });  // Good on mature
        addReview(now - 2_000, 6, 4, { lastIvl: 60 });  // unrelated

        const range = { startMs: now - DAY_MS, endMs: now + 1, spanDays: 7 };
        const stats = getAnkiStatsSnapshot('TUS', range, ROLLOVER, 'tr-TR');

        expect(stats.futureDueTotal).toBe(2);
        expect(stats.dueTomorrow).toBe(1);
        expect(stats.answerButtons[0].young).toBe(1);
        expect(stats.answerButtons[2].mature).toBe(1);
        expect(stats.answerButtons.reduce((sum, point) => sum + point.learning + point.young + point.mature, 0)).toBe(2);
        expect(stats.cardCounts).toMatchObject({
            mature: 2,
            youngLearn: 1,
            unseen: 1,
            suspendedBuried: 1,
            totalCards: 5,
            totalNotes: 5,
        });
        expect(stats.longestInterval).toBe(45);
    });

    it('starts Future Due at today unless the backlog is asked for', () => {
        addDeck(1, 'Tıp');
        const today = localDayNumber(Date.now(), ROLLOVER);
        addCard(10, 1, { type: 2, queue: 2, due: today - 5, ivl: 30 });  // five days overdue
        addCard(11, 1, { type: 2, queue: 2, due: today, ivl: 30 });      // due today
        addCard(12, 1, { type: 2, queue: 2, due: today + 3, ivl: 30 });  // due in three days

        const range = resolveStatsDateRange('month', new Date(), new Date(), ROLLOVER);
        const withoutBacklog = getAnkiStatsSnapshot(null, range, ROLLOVER, 'tr-TR');
        // Anki's chart begins at today; an overdue card is simply not on it.
        expect(withoutBacklog.futureDueTodayIndex).toBe(0);
        expect(withoutBacklog.backlogTotal).toBe(0);
        expect(withoutBacklog.futureDueTotal).toBe(2);
        // The backlog view is computed alongside, so the switch does not have to query again.
        expect(withoutBacklog.futureDueWithBacklogTotal).toBe(3);
        expect(withoutBacklog.futureDueBacklogTotal).toBe(1);
        expect(withoutBacklog.futureDueWithBacklogTodayIndex).toBeGreaterThan(0);

        const withBacklog = getAnkiStatsSnapshot(null, range, ROLLOVER, 'tr-TR', undefined, {
            includeBacklog: true,
        });
        expect(withBacklog.backlogTotal).toBe(1);
        expect(withBacklog.futureDueTotal).toBe(3);
        // The divider must sit on a real bucket boundary so the dashed rule lands between the
        // overdue bars and today's.
        expect(withBacklog.futureDueTodayIndex).toBeGreaterThan(0);
        const beforeToday = withBacklog.futureDue
            .slice(0, withBacklog.futureDueTodayIndex)
            .reduce((sum, point) => sum + point.values[0] + point.values[1], 0);
        expect(beforeToday).toBe(1);
    });

    it('gives Future Due one bar per day of a week-long range', () => {
        addDeck(1, 'Dinamik');
        addCard(1, 1, { type: 2, queue: 2, due: localDayNumber(Date.now(), ROLLOVER) + 1, ivl: 10 });

        const range = resolveStatsDateRange('week', new Date(), new Date(), ROLLOVER);
        const stats = getAnkiStatsSnapshot('Dinamik', range, ROLLOVER, 'tr-TR');
        expect(stats.futureDue).toHaveLength(7);
        expect(stats.futureDue[1].values).toEqual([1, 0]);
    });

    it('can scope every chart to the live membership of a filtered deck', () => {
        const now = Date.now();
        const today = localDayNumber(now, ROLLOVER);
        addDeck(10, 'Bir');
        addDeck(11, 'İki');
        addCard(1, 10, { type: 2, queue: 2, due: today + 1, ivl: 10, createdAt: now - 30_000 });
        addCard(2, 11, { type: 2, queue: 2, due: today + 1, ivl: 30, createdAt: now - 20_000 });
        addReview(now - 1_000, 1, 3, { lastIvl: 10 });
        addReview(now - 500, 2, 3, { lastIvl: 30 });

        const range = { startMs: now - DAY_MS, endMs: now + 1, spanDays: 7 };
        const stats = getAnkiStatsSnapshot('Özel Çalışma Oturumu', range, ROLLOVER, 'tr-TR', [1]);
        expect(stats.cardCounts.totalCards).toBe(1);
        expect(stats.futureDueTotal).toBe(1);
        expect(stats.answerButtons.reduce((sum, point) => sum + point.learning + point.young + point.mature, 0)).toBe(1);

        const reviewDays = getReviewDays('Özel Çalışma Oturumu', ROLLOVER, [1]);
        expect(reviewDays.reduce((sum, day) => sum + day.young + day.mature, 0)).toBe(1);
        expect(getAddedDays('Özel Çalışma Oturumu', ROLLOVER, [1]).reduce((sum, day) => sum + day.count, 0)).toBe(1);
        expect(getHourBreakdown('Özel Çalışma Oturumu', range, [1]).reduce((sum, hour) => sum + hour.total, 0)).toBe(1);
        // A filtered deck that gathered nothing shows nothing, not the whole collection.
        expect(getAnkiStatsSnapshot('Boş', range, ROLLOVER, 'tr-TR', []).cardCounts.totalCards).toBe(0);
    });
});

describe('review and added history', () => {
    beforeEach(() => {
        addDeck(1, 'Tıp');
        addCard(1, 1, { type: 2, queue: 2, due: TODAY, ivl: 30, createdAt: at(1, 12) });
        addCard(2, 1, { type: 2, queue: 2, due: TODAY, ivl: 5, createdAt: at(1, 12) });
    });

    it('buckets answers into study days, split by kind, and ignores rescheduling rows', () => {
        addReview(at(22, 9), 1, 3, { type: 1, lastIvl: 30, time: 5000 });   // mature
        addReview(at(22, 9, 1), 2, 1, { type: 1, lastIvl: 5, time: 7000 });  // young
        addReview(at(22, 9, 2), 2, 3, { type: 2, lastIvl: 1, time: 3000 });  // relearning
        addReview(at(22, 9, 3), 2, 3, { type: 3, lastIvl: 5, time: 2000 });  // filtered
        addReview(at(22, 9, 4), 1, 0, { type: 5, time: 0 });                // Set Due Date bookkeeping
        // 02:30 belongs to the previous study day with a 04:00 rollover.
        addReview(at(22, 2, 30), 1, 3, { type: 0, lastIvl: 0, time: 9000 });

        const reviewDays = getReviewDays(null, ROLLOVER);
        expect(reviewDays).toHaveLength(2);
        expect(reviewDays[0]).toMatchObject({ day: TODAY - 1, learn: 1, learnMs: 9000 });
        expect(reviewDays[1]).toMatchObject({
            day: TODAY,
            learn: 0,
            young: 1,
            mature: 1,
            relearn: 1,
            filtered: 1,
            youngMs: 7000,
            matureMs: 5000,
            relearnMs: 3000,
            filteredMs: 2000,
        });
    });

    it('dates an imported card by when it was added here, not by its Anki id', () => {
        const sourceIdFrom2020 = new Date(2020, 0, 10, 12).getTime();
        addCard(sourceIdFrom2020, 1, { type: 0, queue: 0, due: 1, createdAt: at(21, 15) });
        expect(getAddedDays(null, ROLLOVER)).toEqual([
            { day: TODAY - 21, count: 2 },
            { day: TODAY - 1, count: 1 },
        ]);
    });

    it('names the decks the cards of an Added bar went into', () => {
        addDeck(10, 'TUS');
        addDeck(11, 'TUS::Farmakoloji');
        addDeck(12, 'TUS::Patoloji');
        addDeck(13, 'Default');
        addCard(10, 11, { type: 0, queue: 0, due: 1, createdAt: at(21, 10) });
        addCard(11, 11, { type: 0, queue: 0, due: 2, createdAt: at(21, 11) });
        addCard(12, 12, { type: 0, queue: 0, due: 3, createdAt: at(21, 12) });
        // 03:00 on the 22nd is still the 21st's study day with a 04:00 rollover.
        addCard(13, 13, { type: 0, queue: 0, due: 4, createdAt: at(22, 3) });
        addCard(14, 13, { type: 0, queue: 0, due: 5, createdAt: at(22, 9) });

        expect(getAddedCardDeckNames(null, TODAY - 1, TODAY - 1, ROLLOVER))
            .toEqual(['Default', 'TUS::Farmakoloji', 'TUS::Patoloji']);
        expect(getAddedCardDeckNames('TUS', TODAY - 1, TODAY - 1, ROLLOVER))
            .toEqual(['TUS::Farmakoloji', 'TUS::Patoloji']);
        expect(getAddedCardDeckNames(null, TODAY, TODAY, ROLLOVER)).toEqual(['Default']);
        expect(getAddedCardDeckNames('Özel Çalışma', TODAY - 1, TODAY, ROLLOVER, [12])).toEqual(['TUS::Patoloji']);
        expect(getAddedCardDeckNames(null, TODAY - 9, TODAY - 2, ROLLOVER)).toEqual([]);
    });

    it('groups answers by local clock hour, leaving filtered-deck answers out', () => {
        addReview(at(22, 9, 15), 1, 3, { type: 1 });
        addReview(at(22, 9, 45), 1, 1, { type: 1 });
        addReview(at(22, 21, 40), 1, 3, { type: 0 });
        addReview(at(22, 21, 41), 1, 3, { type: 3 });
        addReview(at(22, 21, 42), 1, 0, { type: 5 });
        addReview(new Date(2026, 0, 2, 9).getTime(), 1, 3, { type: 1 });   // outside the range

        const range = resolveStatsDateRange('week', new Date(), new Date(), ROLLOVER, NOW);
        const hours = getHourBreakdown(null, range);
        expect(hours).toHaveLength(24);
        expect(hours[9]).toEqual({ hour: 9, total: 2, correct: 1 });
        expect(hours[21]).toEqual({ hour: 21, total: 1, correct: 1 });
        expect(hours.reduce((sum, hour) => sum + hour.total, 0)).toBe(3);
    });
});

describe('ranges', () => {
    it('builds inclusive custom ranges at the configured rollover hour', () => {
        const range = resolveStatsDateRange('custom', new Date(2026, 7, 1), new Date(2026, 7, 3), ROLLOVER, NOW);
        expect(new Date(range.startMs).getHours()).toBe(ROLLOVER);
        expect(new Date(range.endMs).getDate()).toBe(4);
        expect(range.spanDays).toBe(3);
    });

    it('starts a relative range on the right study day and ends it with the current one', () => {
        const beforeRollover = new Date(2026, 7, 22, 2, 0).getTime();
        const range = resolveStatsDateRange('week', new Date(), new Date(), ROLLOVER, beforeRollover);
        expect(new Date(range.startMs).getDate()).toBe(15);
        expect(new Date(range.startMs).getHours()).toBe(ROLLOVER);
        // An answer given later that night still belongs to the range.
        expect(range.endMs).toBe(new Date(2026, 7, 22, ROLLOVER).getTime());
        expect(rangeStudyDays(range, ROLLOVER, null)).toEqual({
            firstDay: localDayNumber(beforeRollover, ROLLOVER) - 6,
            lastDay: localDayNumber(beforeRollover, ROLLOVER),
        });
    });

    it('starts an all-time range on the first day with data', () => {
        const range = resolveStatsDateRange('all', new Date(), new Date(), ROLLOVER, NOW);
        expect(rangeStudyDays(range, ROLLOVER, TODAY - 40)).toEqual({ firstDay: TODAY - 40, lastDay: TODAY });
        expect(rangeStudyDays(range, ROLLOVER, null)).toEqual({ firstDay: TODAY, lastDay: TODAY });
    });
});
