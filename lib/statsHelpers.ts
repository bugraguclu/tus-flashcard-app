import type { AnkiCard } from './models';

export interface CardBuckets {
    newCount: number;
    learningCount: number;
    reviewCount: number;
    youngCount: number;
    matureCount: number;
    masteredCount: number;
    suspendedCount: number;
    buriedCount: number;
}

const DEFAULT_BUCKETS: CardBuckets = {
    newCount: 0,
    learningCount: 0,
    reviewCount: 0,
    youngCount: 0,
    matureCount: 0,
    masteredCount: 0,
    suspendedCount: 0,
    buriedCount: 0,
};

export function bucketCard(card: AnkiCard): Partial<CardBuckets> {
    if (card.queue === -1) {
        return { suspendedCount: 1 };
    }

    if (card.queue === -2 || card.queue === -3) {
        return { buriedCount: 1 };
    }

    if (card.queue === 0) {
        return { newCount: 1 };
    }

    if (card.queue === 1 || card.queue === 3) {
        return { learningCount: 1 };
    }

    if (card.queue === 2) {
        if (card.ivl >= 90) {
            return { reviewCount: 1, masteredCount: 1 };
        }

        if (card.ivl >= 21) {
            return { reviewCount: 1, matureCount: 1 };
        }

        return { reviewCount: 1, youngCount: 1 };
    }

    return {};
}

export function aggregateBuckets(cards: AnkiCard[]): CardBuckets {
    const result: CardBuckets = { ...DEFAULT_BUCKETS };

    for (const card of cards) {
        const bucket = bucketCard(card);
        result.newCount += bucket.newCount ?? 0;
        result.learningCount += bucket.learningCount ?? 0;
        result.reviewCount += bucket.reviewCount ?? 0;
        result.youngCount += bucket.youngCount ?? 0;
        result.matureCount += bucket.matureCount ?? 0;
        result.masteredCount += bucket.masteredCount ?? 0;
        result.suspendedCount += bucket.suspendedCount ?? 0;
        result.buriedCount += bucket.buriedCount ?? 0;
    }

    return result;
}
