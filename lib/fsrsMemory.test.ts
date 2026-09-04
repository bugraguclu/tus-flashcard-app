import { describe, expect, it } from 'vitest';
import { DEFAULT_FSRS_PARAMETERS, fsrsMemoryStateFromReviews, fsrsMemoryStateFromSm2 } from './fsrs';
import {
    REVLOG_KIND,
    fsrsLastReviewInfo,
    fsrsMemoryStateForCard,
    fsrsReviewHistory,
    type FsrsRevlogEntry,
} from './fsrsMemory';

const DAY_MS = 86_400_000;
// Next rollover after the last review in each fixture.
const NEXT_DAY_AT = Date.UTC(2026, 2, 12, 4, 0, 0);

function entry(daysAgo: number, overrides: Partial<FsrsRevlogEntry> = {}): FsrsRevlogEntry {
    return {
        id: NEXT_DAY_AT - daysAgo * DAY_MS - 3_600_000,
        ease: 3,
        ivl: 5,
        factor: 2500,
        type: REVLOG_KIND.review,
        ...overrides,
    };
}

describe('selecting reviews for FSRS', () => {
    it('replays a complete history from the learning run, with the gaps between reviews', () => {
        const history = fsrsReviewHistory([
            entry(30, { type: REVLOG_KIND.learning, ease: 1, ivl: -600 }),
            entry(30, { type: REVLOG_KIND.learning, ease: 3, ivl: 1 }),
            entry(29, { ease: 3, ivl: 3 }),
            entry(26, { ease: 3, ivl: 8 }),
        ], NEXT_DAY_AT);

        expect(history).not.toBeNull();
        expect(history!.complete).toBe(true);
        expect(history!.reviews).toEqual([
            { rating: 1, deltaDays: 0 },
            { rating: 3, deltaDays: 0 },
            { rating: 3, deltaDays: 1 },
            { rating: 3, deltaDays: 3 },
        ]);
    });

    it('ignores cramming reviews from a non-rescheduling filtered deck', () => {
        const history = fsrsReviewHistory([
            entry(10, { type: REVLOG_KIND.learning, ease: 3, ivl: 1 }),
            entry(8, { type: REVLOG_KIND.filtered, factor: 0, ease: 3 }),
            entry(5, { ease: 4, ivl: 12 }),
        ], NEXT_DAY_AT);

        expect(history!.reviews).toEqual([
            { rating: 3, deltaDays: 0 },
            { rating: 4, deltaDays: 5 },
        ]);
    });

    it('drops manual entries, which carry no answer', () => {
        const history = fsrsReviewHistory([
            entry(10, { type: REVLOG_KIND.learning, ease: 3, ivl: 1 }),
            entry(7, { type: REVLOG_KIND.manual, ease: 0, factor: 2500, ivl: 20 }),
            entry(4, { ease: 3, ivl: 25 }),
        ], NEXT_DAY_AT);

        expect(history!.reviews.map((review) => review.rating)).toEqual([3, 3]);
    });

    it('starts over after a reset, and reports nothing when no answer followed it', () => {
        const afterReset = fsrsReviewHistory([
            entry(40, { type: REVLOG_KIND.learning, ease: 3, ivl: 1 }),
            entry(20, { ease: 3, ivl: 15 }),
            entry(10, { type: REVLOG_KIND.manual, ease: 0, factor: 0, ivl: 0 }),
            entry(9, { type: REVLOG_KIND.learning, ease: 3, ivl: 1 }),
            entry(8, { ease: 3, ivl: 3 }),
        ], NEXT_DAY_AT);
        expect(afterReset!.reviews).toHaveLength(2);
        expect(afterReset!.complete).toBe(true);

        const resetOnly = fsrsReviewHistory([
            entry(40, { type: REVLOG_KIND.learning, ease: 3, ivl: 1 }),
            entry(10, { type: REVLOG_KIND.manual, ease: 0, factor: 0, ivl: 0 }),
        ], NEXT_DAY_AT);
        expect(resetOnly).toBeNull();
    });

    it('marks a history without a learning run as incomplete', () => {
        const history = fsrsReviewHistory([
            entry(20, { ease: 3, ivl: 10, factor: 2300 }),
            entry(10, { ease: 3, ivl: 20 }),
        ], NEXT_DAY_AT);

        expect(history!.complete).toBe(false);
        expect(history!.firstGraded?.ivl).toBe(10);
    });

    it('respects the ignore-before cutoff', () => {
        const entries = [
            entry(40, { type: REVLOG_KIND.learning, ease: 3, ivl: 1 }),
            entry(20, { ease: 3, ivl: 15, factor: 2400 }),
            entry(5, { ease: 3, ivl: 30 }),
        ];
        const cutoff = NEXT_DAY_AT - 30 * DAY_MS;
        const history = fsrsReviewHistory(entries, NEXT_DAY_AT, cutoff);

        // The learning run predates the cutoff, so the history is seeded from SM-2 instead.
        expect(history!.complete).toBe(false);
        expect(history!.firstGraded?.ivl).toBe(15);
    });

    it('returns nothing when there is no usable entry at all', () => {
        expect(fsrsReviewHistory([], NEXT_DAY_AT)).toBeNull();
        expect(fsrsReviewHistory([entry(3, { type: REVLOG_KIND.filtered, factor: 0 })], NEXT_DAY_AT)).toBeNull();
    });
});

describe('memory state for a card', () => {
    const card = { interval: 30, easeFactor: 2.5, isNew: false };

    it('replays a complete history through the model', () => {
        const history = fsrsReviewHistory([
            entry(10, { type: REVLOG_KIND.learning, ease: 3, ivl: 1 }),
            entry(9, { ease: 3, ivl: 3 }),
            entry(6, { ease: 3, ivl: 8 }),
        ], NEXT_DAY_AT)!;

        const state = fsrsMemoryStateForCard(DEFAULT_FSRS_PARAMETERS, history, card);
        expect(state).toEqual(fsrsMemoryStateFromReviews(DEFAULT_FSRS_PARAMETERS, history.reviews));
    });

    it('seeds a truncated history from the first surviving review', () => {
        const history = fsrsReviewHistory([
            entry(20, { ease: 3, ivl: 10, factor: 2300 }),
            entry(10, { ease: 3, ivl: 20 }),
        ], NEXT_DAY_AT)!;

        const state = fsrsMemoryStateForCard(DEFAULT_FSRS_PARAMETERS, history, card)!;
        const seed = fsrsMemoryStateFromSm2(DEFAULT_FSRS_PARAMETERS, 2.3, 10, 0.9);
        const expected = fsrsMemoryStateFromReviews(DEFAULT_FSRS_PARAMETERS, history.reviews.slice(1), seed);
        expect(state.stability).toBeCloseTo(expected!.stability, 6);
    });

    it('falls back to the card’s own interval and ease when no history survives', () => {
        const state = fsrsMemoryStateForCard(DEFAULT_FSRS_PARAMETERS, null, card)!;
        expect(state.stability).toBeCloseTo(30, 4);
    });

    it('leaves a new card without a memory state', () => {
        expect(fsrsMemoryStateForCard(DEFAULT_FSRS_PARAMETERS, null, { interval: 0, easeFactor: 2.5, isNew: true }))
            .toBeNull();
    });
});

describe('last-review info for rescheduling', () => {
    // Mirrors Anki's `get_last_revlog_info` (rslib/src/scheduler/fsrs/memory_state.rs): the fuzz
    // floor is the interval the card had *before* its most recent passing answer.
    it('takes the previous interval from the last passing answer', () => {
        const info = fsrsLastReviewInfo([
            entry(30, { type: REVLOG_KIND.learning, ease: 3, ivl: 1, lastIvl: 0 }),
            entry(20, { ease: 3, ivl: 9, lastIvl: 1 }),
            entry(5, { ease: 2, ivl: 12, lastIvl: 9 }),
        ]);

        expect(info.previousInterval).toBe(9);
        expect(info.lastReviewedAtMs).toBe(entry(5).id);
    });

    it('leaves no floor after a lapse, because Again may legitimately shrink the interval', () => {
        const info = fsrsLastReviewInfo([
            entry(20, { ease: 3, ivl: 30, lastIvl: 10 }),
            entry(5, { ease: 1, ivl: -600, lastIvl: 30 }),
        ]);

        expect(info.previousInterval).toBe(0);
        expect(info.lastReviewedAtMs).toBe(entry(5).id);
    });

    it('forgets everything before a reset, and ignores cramming entries', () => {
        const reset = entry(10, { type: REVLOG_KIND.manual, ease: 0, ivl: 0, factor: 0 });
        expect(fsrsLastReviewInfo([
            entry(20, { ease: 3, ivl: 30, lastIvl: 10 }),
            reset,
        ])).toEqual({ lastReviewedAtMs: null, previousInterval: 0 });

        expect(fsrsLastReviewInfo([
            entry(20, { ease: 3, ivl: 30, lastIvl: 10 }),
            entry(2, { type: REVLOG_KIND.filtered, ease: 3, ivl: 30, factor: 0, lastIvl: 30 }),
        ]).previousInterval).toBe(10);
    });
});
