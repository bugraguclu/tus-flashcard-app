import { describe, expect, it } from 'vitest';
import type { StudyCard } from './types';
import type { DeckConfig } from './models';
import {
    applyHierarchicalLimit,
    buryBuildTimeSiblings,
    interleaveNewWithReviews,
    sortReviewCards,
    splitIntradayLearning,
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

describe('splitIntradayLearning (Anki learn-ahead serving order)', () => {
    function learn(cardId: number, dueTime: number): StudyCard {
        return { cardId, state: { status: 'learning', dueTime } } as unknown as StudyCard;
    }
    const now = 1_750_000_000_000;

    it('separates expired step timers from cards still inside the learn-ahead window', () => {
        const cards = [
            learn(1, now - 60000),  // timer expired a minute ago
            learn(2, now + 60000),  // due in a minute -> learn-ahead pool
            learn(3, now),          // due exactly now counts as due
        ];

        const { dueNow, learnAhead } = splitIntradayLearning(cards, now);

        expect(dueNow.map((c) => c.cardId)).toEqual([1, 3]);
        expect(learnAhead.map((c) => c.cardId)).toEqual([2]);
    });

    it('treats interday learning cards (dueTime 0) as due now', () => {
        const interday = learn(1, 0);
        const { dueNow, learnAhead } = splitIntradayLearning([interday], now);

        expect(dueNow).toEqual([interday]);
        expect(learnAhead).toHaveLength(0);
    });

    it('preserves due order within each partition', () => {
        const cards = [
            learn(1, now + 120000),
            learn(2, now - 1),
            learn(3, now + 60000),
            learn(4, now - 2),
        ];

        const { dueNow, learnAhead } = splitIntradayLearning(cards, now);

        expect(dueNow.map((c) => c.cardId)).toEqual([2, 4]);
        expect(learnAhead.map((c) => c.cardId)).toEqual([1, 3]);
    });
});

describe('sortReviewCards: due date, then random', () => {
    function due(cardId: number, dueDate: string): StudyCard {
        return { cardId, state: { dueDate } } as unknown as StudyCard;
    }

    const dueRandom = (cards: StudyCard[], daySeed: string) =>
        sortReviewCards(cards, 'dueRandom', { daySeed, fallbackDay: 0, today: 0 });

    it('orders by due day first, regardless of input order', () => {
        const cards = [due(1, '2026-06-22'), due(2, '2026-06-20'), due(3, '2026-06-21')];
        const sorted = dueRandom(cards, 'seed');
        expect(sorted.map((c) => c.cardId)).toEqual([2, 3, 1]);
    });

    it('is a stable shuffle within a due day for a fixed seed', () => {
        const ids = Array.from({ length: 20 }, (_, i) => i);
        const sameDay = ids.map((i) => due(i, '2026-06-20'));

        const a = dueRandom(sameDay, 'monday').map((c) => c.cardId);
        const b = dueRandom(sameDay, 'monday').map((c) => c.cardId);

        expect(a).toEqual(b);                          // deterministic per seed
        expect(a).not.toEqual(ids);                    // actually shuffled (20! makes identity ~impossible)
        expect([...a].sort((x, y) => x - y)).toEqual(ids); // no cards lost
    });
});

describe('sortReviewCards: the orders that read FSRS columns', () => {
    const TODAY = 100;
    const NOW_MS = Date.UTC(2026, 8, 8, 12);
    const DAY_MS = 86_400_000;

    /** A review card with an FSRS memory state, due `dueIn` days from today. */
    function fsrsCard(cardId: number, options: {
        stability?: number;
        difficulty?: number;
        daysSinceReview?: number;
        interval?: number;
        easeFactor?: number;
        desiredRetention?: number;
        memory?: boolean;
    } = {}): StudyCard {
        const daysSinceReview = options.daysSinceReview ?? 10;
        const interval = options.interval ?? 10;
        return {
            cardId,
            noteId: cardId,
            state: {
                dueDate: '2026-06-20',
                interval,
                easeFactor: options.easeFactor ?? 2500,
                lastReviewedAtMs: NOW_MS - daysSinceReview * DAY_MS,
                desiredRetention: options.desiredRetention ?? 0.9,
                memoryState: options.memory === false
                    ? null
                    : { stability: options.stability ?? 10, difficulty: options.difficulty ?? 5 },
            },
        } as unknown as StudyCard;
    }

    const sort = (cards: StudyCard[], order: Parameters<typeof sortReviewCards>[1], fsrs: boolean) =>
        sortReviewCards(cards, order, {
            daySeed: 'seed',
            fallbackDay: TODAY,
            today: TODAY,
            fsrs,
            nowMs: NOW_MS,
        }).map((card) => card.cardId);

    it('sorts by ease factor while FSRS is off', () => {
        const cards = [
            fsrsCard(1, { easeFactor: 2500, difficulty: 9 }),
            fsrsCard(2, { easeFactor: 1900, difficulty: 2 }),
        ];

        expect(sort(cards, 'easeAsc', false)).toEqual([2, 1]);
        expect(sort(cards, 'easeDesc', false)).toEqual([1, 2]);
    });

    it('reads difficulty, reversed, while FSRS is on', () => {
        // Anki keeps the ordinals and swaps the column: EASE_ASCENDING sorts by difficulty
        // descending, because the hardest card is the one with the lowest ease. The dropdown
        // relabels the entries for the same reason.
        const cards = [
            fsrsCard(1, { easeFactor: 2500, difficulty: 9 }),
            fsrsCard(2, { easeFactor: 1900, difficulty: 2 }),
        ];

        expect(sort(cards, 'easeAsc', true)).toEqual([1, 2]);
        expect(sort(cards, 'easeDesc', true)).toEqual([2, 1]);
    });

    it('orders by retrievability, with memory-less cards where SQL would put its NULLs', () => {
        // Longer since the last review against the same stability means less is remembered.
        const fresh = fsrsCard(1, { stability: 30, daysSinceReview: 1 });
        const faded = fsrsCard(2, { stability: 30, daysSinceReview: 25 });
        const unscheduled = fsrsCard(3, { memory: false });

        expect(sort([faded, fresh, unscheduled], 'retrievabilityAsc', true)).toEqual([3, 2, 1]);
        expect(sort([faded, fresh, unscheduled], 'retrievabilityDesc', true)).toEqual([1, 2, 3]);
    });

    it('measures relative overdueness against retrievability once FSRS is on', () => {
        // Same days late, different stability: the fragile card has fallen further past its
        // target and has to come first, which the interval-only measure cannot see.
        const fragile = fsrsCard(1, { stability: 5, interval: 5, daysSinceReview: 15 });
        const durable = fsrsCard(2, { stability: 60, interval: 5, daysSinceReview: 15 });

        expect(sort([durable, fragile], 'relativeOverdueness', true)).toEqual([1, 2]);
    });

    it('keeps the SM-2 measure for a card FSRS has never scheduled', () => {
        const noMemory = fsrsCard(1, { memory: false, interval: 2 });
        const scheduled = fsrsCard(2, { stability: 200, interval: 2, daysSinceReview: 2 });

        // The memory-less card falls back to interval overdueness rather than being dropped to
        // an end of the queue, exactly as the SQL helper's fallback branch does.
        expect(sort([scheduled, noMemory], 'relativeOverdueness', true)).toHaveLength(2);
    });
});
