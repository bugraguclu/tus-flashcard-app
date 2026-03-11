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
        stability: 0,
        difficulty: 0,
        lastReview: 0,
        ...overrides,
    };
}

describe('statsHelpers', () => {
    it('separates young, mature, and mastered review cards', () => {
        const cards: AnkiCard[] = [
            makeCard({ id: 1, queue: 2, type: 2, ivl: 7 }),
            makeCard({ id: 2, queue: 2, type: 2, ivl: 30 }),
            makeCard({ id: 3, queue: 2, type: 2, ivl: 120 }),
        ];

        const buckets = aggregateBuckets(cards);
        expect(buckets.reviewCount).toBe(3);
        expect(buckets.youngCount).toBe(1);
        expect(buckets.matureCount).toBe(1);
        expect(buckets.masteredCount).toBe(1);
    });

    it('does not classify all review cards as mastered', () => {
        const cards: AnkiCard[] = [
            makeCard({ id: 10, queue: 2, type: 2, ivl: 1 }),
            makeCard({ id: 11, queue: 2, type: 2, ivl: 5 }),
            makeCard({ id: 12, queue: 2, type: 2, ivl: 20 }),
        ];

        const buckets = aggregateBuckets(cards);
        expect(buckets.reviewCount).toBe(3);
        expect(buckets.masteredCount).toBe(0);
        expect(buckets.youngCount).toBe(3);
    });
});
