import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { AnkiCard } from './models';
import { dayNumberToYmd, localDayNumber } from './ankiState';

const dbMocks = vi.hoisted(() => ({
    getFirstSync: vi.fn(),
    getAllSync: vi.fn(),
    runSync: vi.fn(),
}));

vi.mock('./db', () => ({
    getDB: () => ({
        getFirstSync: dbMocks.getFirstSync,
        getAllSync: dbMocks.getAllSync,
        runSync: dbMocks.runSync,
    }),
}));

import { getFutureDueCounts, getTodayReviewCount, logReview } from './reviewLogger';

describe('reviewLogger rollover + due logic', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        dbMocks.getFirstSync.mockReset();
        dbMocks.getAllSync.mockReset();
        dbMocks.runSync.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('getTodayReviewCount respects dayRolloverHour boundary', () => {
        vi.setSystemTime(new Date(2026, 2, 12, 3, 30, 0, 0)); // before 04:00 cutoff
        dbMocks.getFirstSync.mockReturnValue({ cnt: 7 });

        const count = getTodayReviewCount(4);
        const expectedStart = new Date(2026, 2, 11, 4, 0, 0, 0).getTime();

        expect(count).toBe(7);
        expect(dbMocks.getFirstSync).toHaveBeenCalledTimes(1);
        expect(dbMocks.getFirstSync.mock.calls[0][1]).toBe(expectedStart);
    });

    it('getFutureDueCounts uses localDayNumber()+days and returns cumulative counts', () => {
        vi.setSystemTime(new Date(2026, 2, 12, 5, 0, 0, 0));
        const today = localDayNumber(Date.now(), 4);

        dbMocks.getAllSync.mockReturnValue([
            { due: today, cnt: 2 },
            { due: today + 2, cnt: 3 },
        ]);

        const result = getFutureDueCounts(4, 4);

        expect(dbMocks.getAllSync).toHaveBeenCalledTimes(1);
        expect(dbMocks.getAllSync.mock.calls[0][1]).toBe(today + 3);

        expect(result).toEqual([
            { date: dayNumberToYmd(today, 4), count: 2 },
            { date: dayNumberToYmd(today + 1, 4), count: 2 },
            { date: dayNumberToYmd(today + 2, 4), count: 5 },
            { date: dayNumberToYmd(today + 3, 4), count: 5 },
        ]);
    });

    it('returns empty list for non-positive day window', () => {
        const result = getFutureDueCounts(0, 4);
        expect(result).toEqual([]);
        expect(dbMocks.getAllSync).not.toHaveBeenCalled();
    });

    it('RL2: lumps overdue cards (due < today) into the first forecast bucket', () => {
        vi.setSystemTime(new Date(2026, 2, 12, 5, 0, 0, 0));
        const today = localDayNumber(Date.now(), 4);

        dbMocks.getAllSync.mockReturnValue([
            { due: today - 5, cnt: 4 }, // overdue
            { due: today, cnt: 2 },
            { due: today + 1, cnt: 1 },
        ]);

        const result = getFutureDueCounts(3, 4);

        expect(result).toEqual([
            { date: dayNumberToYmd(today, 4), count: 6 },      // 4 overdue + 2 due today
            { date: dayNumberToYmd(today + 1, 4), count: 7 },
            { date: dayNumberToYmd(today + 2, 4), count: 7 },
        ]);
    });
});

describe('logReview time clamping (RL1/RL5)', () => {
    beforeEach(() => {
        dbMocks.runSync.mockReset();
    });

    const card = { id: 1 } as unknown as AnkiCard;

    it('caps time at the deck max answer seconds', () => {
        const entry = logReview(card, 3, 10, 6, 2500, 200_000, 1, 60);
        expect(entry.time).toBe(60_000); // 200s clamped to the 60s cap
    });

    it('honours a custom max answer time', () => {
        const entry = logReview(card, 3, 10, 6, 2500, 90_000, 1, 120);
        expect(entry.time).toBe(90_000); // 90s < 120s cap, kept as-is
    });

    it('floors negative time at zero', () => {
        const entry = logReview(card, 3, 10, 6, 2500, -5, 1, 60);
        expect(entry.time).toBe(0);
    });
});
