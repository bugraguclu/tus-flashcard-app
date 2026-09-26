import { describe, expect, it } from 'vitest';
import type { ReviewDay } from './ankiStats';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { compileCardMatcher, type CardSearchContext } from './cardSearchMatch';
import {
    addedSearchForDays,
    bucketHistory,
    historyPoints,
    historyUnit,
    hourHighlights,
    reviewValues,
    summarizeReviewPeriod,
    weekdayIndex,
} from './statsSeries';

const DAY_MS = 86_400_000;
const day = (year: number, month: number, date: number) => Math.floor(Date.UTC(year, month, date) / DAY_MS);

function reviewDay(dayNumber: number, counts: Partial<ReviewDay> = {}): ReviewDay {
    return {
        day: dayNumber,
        learn: 0, relearn: 0, young: 0, mature: 0, filtered: 0,
        learnMs: 0, relearnMs: 0, youngMs: 0, matureMs: 0, filteredMs: 0,
        ...counts,
    };
}

describe('history buckets', () => {
    it('picks bar widths the way a phone chart reads them', () => {
        expect(historyUnit(7)).toBe('day');
        expect(historyUnit(31)).toBe('day');
        expect(historyUnit(90)).toBe('week');
        expect(historyUnit(365)).toBe('month');
        expect(historyUnit(2000)).toBe('year');
    });

    it('knows Monday starts the week', () => {
        expect(weekdayIndex(day(2026, 8, 21))).toBe(0); // Monday
        expect(weekdayIndex(day(2026, 8, 27))).toBe(6); // Sunday
    });

    it('fills every day of the period, empty ones included', () => {
        const first = day(2026, 8, 16);
        const rows = [reviewDay(day(2026, 8, 18), { young: 3 }), reviewDay(day(2026, 8, 22), { mature: 2 })];
        const buckets = bucketHistory(rows, first, first + 6, 'day', 5, (row) => reviewValues(row, false));
        expect(buckets).toHaveLength(7);
        expect(buckets[2].values).toEqual([0, 3, 0, 0, 0]);
        expect(buckets[6].values).toEqual([2, 0, 0, 0, 0]);
        expect(buckets[0].values.every((value) => value === 0)).toBe(true);
    });

    it('aligns weeks to Monday and clips the ends to the period', () => {
        // Wednesday 2 September to Tuesday 22 September.
        const buckets = bucketHistory([], day(2026, 8, 2), day(2026, 8, 22), 'week', 1, () => [0]);
        expect(buckets.map((bucket) => [bucket.firstDay, bucket.lastDay])).toEqual([
            [day(2026, 8, 2), day(2026, 8, 6)],
            [day(2026, 8, 7), day(2026, 8, 13)],
            [day(2026, 8, 14), day(2026, 8, 20)],
            [day(2026, 8, 21), day(2026, 8, 22)],
        ]);
    });

    it('labels a clipped month by the days it holds and a whole month by name', () => {
        const buckets = bucketHistory([], day(2025, 8, 23), day(2026, 8, 22), 'month', 1, () => [0]);
        expect(buckets).toHaveLength(13);
        const points = historyPoints(buckets, 'month', 'en');
        expect(points[1].detail).toBe('October 2025');
        expect(points[0].detail).toContain('Sep 23');
        expect(points[0].label).toContain('25');
    });

    it('ignores rows outside the period', () => {
        const buckets = bucketHistory([reviewDay(day(2026, 0, 1), { young: 9 })], day(2026, 8, 1), day(2026, 8, 7), 'day', 5,
            (row) => reviewValues(row, false));
        expect(buckets.flatMap((bucket) => bucket.values).every((value) => value === 0)).toBe(true);
    });

    it('reports minutes on the same buckets as counts', () => {
        const row = reviewDay(0, { young: 2, youngMs: 90_000, mature: 1, matureMs: 30_000 });
        expect(reviewValues(row, false)).toEqual([1, 2, 0, 0, 0]);
        expect(reviewValues(row, true)).toEqual([0.5, 1.5, 0, 0, 0]);
    });
});

describe('summarizeReviewPeriod', () => {
    it("reproduces the table under Anki's Reviews graph", () => {
        const rows = [
            reviewDay(10, { young: 30, youngMs: 300_000 }),
            reviewDay(12, { mature: 10, matureMs: 100_000 }),
            reviewDay(30, { young: 99 }),
        ];
        const summary = summarizeReviewPeriod(rows, 10, 14);
        expect(summary).toMatchObject({ answers: 40, studiedDays: 2, periodDays: 5, perDay: 8, perStudiedDay: 20 });
        expect(summary.secondsPerAnswer).toBeCloseTo(10);
        expect(summary.cardsPerMinute).toBeCloseTo(6);
        expect(summary.minutesPerDay).toBeCloseTo(400_000 / 60_000 / 5);
    });
});

describe('hourHighlights', () => {
    it('ignores an hour with too few answers to judge', () => {
        const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, correct: 0 }));
        hours[3] = { hour: 3, total: 2, correct: 2 };
        hours[9] = { hour: 9, total: 100, correct: 95 };
        hours[21] = { hour: 21, total: 300, correct: 240 };
        const { busiest, strongest } = hourHighlights(hours);
        expect(busiest?.hour).toBe(21);
        expect(strongest?.hour).toBe(9);
        expect(hourHighlights(hours.map((hour) => ({ ...hour, total: 0, correct: 0 })))).toEqual({ busiest: null, strongest: null });
    });
});

describe('addedSearchForDays', () => {
    const ROLLOVER = 4;
    const NOW = new Date(2026, 8, 22, 12).getTime();
    const TODAY = localDayNumber(NOW, ROLLOVER);

    it("writes a bar's days as Anki's added: window", () => {
        expect(addedSearchForDays(TODAY, TODAY, TODAY)).toBe('added:1');
        expect(addedSearchForDays(TODAY - 6, TODAY, TODAY)).toBe('added:7');
        expect(addedSearchForDays(TODAY - 3, TODAY - 3, TODAY)).toBe('added:4 -added:3');
        expect(addedSearchForDays(TODAY - 30, TODAY - 24, TODAY)).toBe('added:31 -added:24');
    });

    it('finds in the browser exactly the cards the bar counted, rollover hour included', () => {
        const createdAt = [
            new Date(2026, 8, 22, 4, 30),   // today
            new Date(2026, 8, 22, 3, 30),   // before the rollover, so still yesterday's study day
            new Date(2026, 8, 20, 4, 0),    // the first moment of the 20th
            new Date(2026, 8, 20, 3, 59),   // the last minute of the 19th
            new Date(2026, 8, 14, 23, 0),
        ].map((date) => date.getTime());
        const cards = createdAt.map((createdAtMs, index): CardSearchContext => ({
            cardId: index + 1,
            noteId: index + 1,
            deckName: 'Tıp',
            text: '',
            tags: [],
            templateOrd: 0,
            queue: 0,
            type: 0,
            due: 0,
            ivl: 0,
            factor: 0,
            reps: 0,
            lapses: 0,
            flags: 0,
            createdAtMs,
        }));
        const options = {
            today: TODAY,
            nowMs: NOW,
            learnAheadMinutes: 20,
            // What the browser derives the day windows from.
            dayCutoffMs: nextRolloverMs(NOW, ROLLOVER) - DAY_MS,
        };
        const bars: [firstDay: number, lastDay: number, cardIds: number[]][] = [
            [TODAY, TODAY, [1]],
            [TODAY - 2, TODAY - 1, [2, 3]],
            [TODAY - 3, TODAY - 3, [4]],
            [TODAY - 8, TODAY - 4, [5]],
            [TODAY - 30, TODAY, [1, 2, 3, 4, 5]],
        ];
        for (const [firstDay, lastDay, cardIds] of bars) {
            // The cards the chart files under this bar…
            const counted = cards.filter((card) => {
                const studyDay = localDayNumber(card.createdAtMs!, ROLLOVER);
                return studyDay >= firstDay && studyDay <= lastDay;
            });
            expect(counted.map((card) => card.cardId)).toEqual(cardIds);
            // …are the ones its search finds.
            const matches = compileCardMatcher(addedSearchForDays(firstDay, lastDay, TODAY), options)!;
            expect(cards.filter(matches).map((card) => card.cardId)).toEqual(cardIds);
        }
    });
});
