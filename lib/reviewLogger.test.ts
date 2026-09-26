import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { AnkiCard } from './models';

const dbMocks = vi.hoisted(() => ({
    getFirstSync: vi.fn(),
    runSync: vi.fn(),
}));

vi.mock('./db', () => ({
    getDB: () => ({
        getFirstSync: dbMocks.getFirstSync,
        runSync: dbMocks.runSync,
    }),
}));

import { getTodayReviewCount, logReview } from './reviewLogger';

describe('reviewLogger rollover logic', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        dbMocks.getFirstSync.mockReset();
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
