import { describe, it, expect } from 'vitest';
import type { AnkiCard } from './models';
import { aggregateBuckets } from './statsHelpers';

function makeCard(overrides: Partial<AnkiCard>): AnkiCard {
    return {
        id: 1,
        noteId: 1,
        deckId: 1,
        ord: 0,
        mod: 0,
        usn: -1,
        type: 0,
        queue: 0,
        due: 0,
        ivl: 0,
        factor: 2500,
        reps: 0,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0,
        lastReview: 0,
        ...overrides,
    };
}

describe('statsHelpers', () => {
    it('splits review cards into young (<21d) and mature (>=21d), Anki-style', () => {
        const cards: AnkiCard[] = [
            makeCard({ id: 1, queue: 2, type: 2, ivl: 7 }),   // young
            makeCard({ id: 2, queue: 2, type: 2, ivl: 30 }),  // mature
            makeCard({ id: 3, queue: 2, type: 2, ivl: 120 }), // mature (no separate "mastered")
        ];

        const buckets = aggregateBuckets(cards);
        expect(buckets.reviewCount).toBe(3);
        expect(buckets.youngCount).toBe(1);
        expect(buckets.matureCount).toBe(2);
    });

    it('treats intervals just under the cutoff as young', () => {
        const cards: AnkiCard[] = [
            makeCard({ id: 10, queue: 2, type: 2, ivl: 1 }),
            makeCard({ id: 11, queue: 2, type: 2, ivl: 20 }),
            makeCard({ id: 12, queue: 2, type: 2, ivl: 21 }),
        ];

        const buckets = aggregateBuckets(cards);
        expect(buckets.reviewCount).toBe(3);
        expect(buckets.youngCount).toBe(2);
        expect(buckets.matureCount).toBe(1); // ivl === 21 is mature
    });

    it('buckets non-review cards by queue', () => {
        const cards: AnkiCard[] = [
            makeCard({ id: 20, queue: 0 }),   // new
            makeCard({ id: 21, queue: 1 }),   // learning
            makeCard({ id: 22, queue: 3 }),   // day-learning -> learning
            makeCard({ id: 23, queue: -1 }),  // suspended
            makeCard({ id: 24, queue: -2 }),  // buried
        ];

        const buckets = aggregateBuckets(cards);
        expect(buckets.newCount).toBe(1);
        expect(buckets.learningCount).toBe(2);
        expect(buckets.suspendedCount).toBe(1);
        expect(buckets.buriedCount).toBe(1);
    });
});
