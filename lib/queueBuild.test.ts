import { describe, expect, it } from 'vitest';
import type { StudyCard } from './types';
import type { DeckConfig } from './models';
import {
    applyHierarchicalLimit,
    buryBuildTimeSiblings,
    interleaveNewWithReviews,
    sortReviewsDueThenRandom,
} from './queueBuild';

// interleaveNewWithReviews only reads array positions, so a thin stub stands in for StudyCard.
function review(id: number): StudyCard {
    return { cardId: id, kind: 'review' } as unknown as StudyCard;
}
function fresh(id: number): StudyCard {
    return { cardId: id, kind: 'new' } as unknown as StudyCard;
}

const kindOf = (card: StudyCard) => (card as unknown as { kind: string }).kind;

describe('interleaveNewWithReviews (Anki "mix with reviews")', () => {
    it('spreads new cards evenly through the reviews', () => {
        const reviews = Array.from({ length: 50 }, (_, i) => review(i));
        const news = Array.from({ length: 10 }, (_, i) => fresh(i));

        const mixed = interleaveNewWithReviews(reviews, news);

        // Every card survives exactly once.
        expect(mixed).toHaveLength(60);
        expect(mixed.filter((c) => kindOf(c) === 'review')).toHaveLength(50);
        expect(mixed.filter((c) => kindOf(c) === 'new')).toHaveLength(10);

        // New cards are distributed, not clumped: no run of new cards back to back.
        const maxNewRun = mixed.reduce(
            (acc, card) => {
                const run = kindOf(card) === 'new' ? acc.run + 1 : 0;
                return { run, max: Math.max(acc.max, run) };
            },
            { run: 0, max: 0 },
        ).max;
        expect(maxNewRun).toBe(1);
    });

    it('preserves the relative order within each list', () => {
        const reviews = [review(1), review(2), review(3), review(4)];
        const news = [fresh(10), fresh(20)];

        const mixed = interleaveNewWithReviews(reviews, news);

        const reviewIds = mixed.filter((c) => kindOf(c) === 'review').map((c) => c.cardId);
        const newIds = mixed.filter((c) => kindOf(c) === 'new').map((c) => c.cardId);
        expect(reviewIds).toEqual([1, 2, 3, 4]);
        expect(newIds).toEqual([10, 20]);
    });

    it('returns the non-empty list untouched when the other is empty', () => {
        const reviews = [review(1), review(2)];
        expect(interleaveNewWithReviews(reviews, [])).toBe(reviews);
        const news = [fresh(1)];
        expect(interleaveNewWithReviews([], news)).toBe(news);
    });
});

// applyHierarchicalLimit only reads deckId via the injected resolvers; a thin stub suffices.
function card(cardId: number, deck: string): StudyCard {
    return { cardId, deck } as unknown as StudyCard;
}
const deckOf = (c: StudyCard) => (c as unknown as { deck: string }).deck;
const ancestors = (name: string): string[] =>
    name.split('::').map((_, i, parts) => parts.slice(0, i + 1).join('::'));

describe('applyHierarchicalLimit (Anki "limits start from the top")', () => {
    it('lets a parent deck cap the combined intake of its subdecks', () => {
        // Parent "TUS" limit 3 caps the sum of its two children, even though each child allows 5.
        const cards = [
            card(1, 'TUS::Anatomi'), card(2, 'TUS::Anatomi'), card(3, 'TUS::Anatomi'),
            card(4, 'TUS::Fizyoloji'), card(5, 'TUS::Fizyoloji'),
        ];
        const limitForKey = (key: string) => (key === 'TUS' ? 3 : 5);

        const result = applyHierarchicalLimit(cards, 99, (c) => ancestors(deckOf(c)), limitForKey);

        expect(result.map((c) => c.cardId)).toEqual([1, 2, 3]);
    });

    it('still enforces each subdeck limit under a generous parent', () => {
        const cards = [
            card(1, 'TUS::Anatomi'), card(2, 'TUS::Anatomi'), card(3, 'TUS::Anatomi'),
            card(4, 'TUS::Fizyoloji'),
        ];
        const limitForKey = (key: string) => (key === 'TUS' ? 99 : 2);

        const result = applyHierarchicalLimit(cards, 99, (c) => ancestors(deckOf(c)), limitForKey);

        // Anatomi capped at 2; Fizyoloji still allowed.
        expect(result.map((c) => c.cardId)).toEqual([1, 2, 4]);
    });

    it('honours the global limit regardless of deck budgets', () => {
        const cards = [card(1, 'TUS'), card(2, 'TUS'), card(3, 'TUS')];
        const result = applyHierarchicalLimit(cards, 2, (c) => ancestors(deckOf(c)), () => 99);
        expect(result.map((c) => c.cardId)).toEqual([1, 2]);
    });
});

describe('buryBuildTimeSiblings', () => {
    function sib(cardId: number, noteId: number, status: 'new' | 'review' | 'learning', dueTime = 0): StudyCard {
        return { cardId, noteId, deckId: 1, state: { status, dueTime } } as unknown as StudyCard;
    }
    const allOn = { buryNewSiblings: true, buryReviewSiblings: true, buryInterdayLearningSiblings: true } as DeckConfig;
    const config = () => allOn;

    it('keeps one card per note and buries the rest', () => {
        const buried: number[] = [];
        const reviews = [sib(1, 100, 'review'), sib(2, 100, 'review'), sib(3, 200, 'review')];

        const result = buryBuildTimeSiblings([], reviews, [], config, (id) => buried.push(id));

        expect(result.reviews.map((c) => c.cardId)).toEqual([1, 3]); // first of each note kept
        expect(buried).toEqual([2]);                                 // the duplicate sibling buried
    });

    it('buries a new sibling of an already-seen review (learning > review > new)', () => {
        const buried: number[] = [];
        const learning = [sib(1, 100, 'learning', Date.now())]; // intraday learning of note 100
        const news = [sib(2, 100, 'new')];                      // its new sibling

        const result = buryBuildTimeSiblings(learning, [], news, config, (id) => buried.push(id));

        expect(result.learning.map((c) => c.cardId)).toEqual([1]);
        expect(result.news).toHaveLength(0);
        expect(buried).toEqual([2]);
    });

    it('respects the per-type toggle: keeps duplicates when burying is off', () => {
        const buried: number[] = [];
        const offConfig = () => ({ buryReviewSiblings: false } as DeckConfig);
        const reviews = [sib(1, 100, 'review'), sib(2, 100, 'review')];

        const result = buryBuildTimeSiblings([], reviews, [], offConfig, (id) => buried.push(id));

        expect(result.reviews.map((c) => c.cardId)).toEqual([1, 2]); // duplicate kept
        expect(buried).toEqual([]);
    });

    it('never buries intraday learning siblings (no Anki toggle for them)', () => {
        const buried: number[] = [];
        const learning = [sib(1, 100, 'learning', Date.now()), sib(2, 100, 'learning', Date.now())];

        const result = buryBuildTimeSiblings(learning, [], [], config, (id) => buried.push(id));

        expect(result.learning.map((c) => c.cardId)).toEqual([1, 2]);
        expect(buried).toEqual([]);
    });
});

describe('sortReviewsDueThenRandom', () => {
    function due(cardId: number, dueDate: string): StudyCard {
        return { cardId, state: { dueDate } } as unknown as StudyCard;
    }

    it('orders by due day first, regardless of input order', () => {
        const cards = [due(1, '2026-06-22'), due(2, '2026-06-20'), due(3, '2026-06-21')];
        const sorted = sortReviewsDueThenRandom(cards, 'seed', 0);
        expect(sorted.map((c) => c.cardId)).toEqual([2, 3, 1]);
    });

    it('is a stable shuffle within a due day for a fixed seed', () => {
        const ids = Array.from({ length: 20 }, (_, i) => i);
        const sameDay = ids.map((i) => due(i, '2026-06-20'));

        const a = sortReviewsDueThenRandom(sameDay, 'monday', 0).map((c) => c.cardId);
        const b = sortReviewsDueThenRandom(sameDay, 'monday', 0).map((c) => c.cardId);

        expect(a).toEqual(b);                          // deterministic per seed
        expect(a).not.toEqual(ids);                    // actually shuffled (20! makes identity ~impossible)
        expect([...a].sort((x, y) => x - y)).toEqual(ids); // no cards lost
    });
});
