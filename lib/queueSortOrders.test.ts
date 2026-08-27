import { describe, expect, it } from 'vitest';
import { normalizeNewCardGatherOrder, shuffleNewCardsByNote, sortNewCards, sortReviewCards } from './queueBuild';
import { ymdToLocalDayNumber } from './ankiState';
import type { NewCardSortOrder, ReviewSortOrder, StudyCard } from './types';

/**
 * Anki's queue sort orders.
 *
 * Review orders come from rslib/src/storage/card/mod.rs `review_order_sql`, new card orders from
 * rslib/src/scheduler/queue/builder/sorting.rs. Every review order appends the same per-card hash
 * as a tiebreaker, which is what stops equal keys collapsing into id order.
 */
function card(
    id: number,
    overrides: { due?: string; ivl?: number; ease?: number; deck?: number; note?: number; ord?: number } = {},
): StudyCard {
    const { due = '2026-01-10', ivl = 10, ease = 2.5, deck = 1, note = id, ord = 0 } = overrides;
    return {
        cardId: id,
        legacyCardId: id,
        noteId: note,
        deckId: deck,
        subject: 'S',
        topic: 'T',
        question: `Q${id}`,
        answer: `A${id}`,
        noteMarked: false,
        templateOrd: ord,
        state: {
            cardId: id,
            interval: ivl,
            repetition: 1,
            dueDate: due,
            dueTime: 0,
            status: 'review',
            suspended: false,
            buried: false,
            easeFactor: ease,
            learningStep: 0,
            relearningStep: 0,
            lastReviewedAtMs: 0,
            elapsedDays: 0,
            lapses: 0,
        },
    };
}

const ids = (cards: StudyCard[]) => cards.map((entry) => entry.cardId);
const sortReviews = (cards: StudyCard[], order: ReviewSortOrder, today = 100) =>
    ids(sortReviewCards(cards, order, { daySeed: '2026-01-10', fallbackDay: today, today }));

describe('review sort orders', () => {
    it('orders by due date, then by a stable shuffle', () => {
        const cards = [
            card(1, { due: '2026-01-12' }),
            card(2, { due: '2026-01-10' }),
            card(3, { due: '2026-01-11' }),
        ];
        expect(sortReviews(cards, 'dueRandom')).toEqual([2, 3, 1]);
    });

    it('breaks a tie the same way every time, but not by card id', () => {
        const cards = [card(1), card(2), card(3), card(4), card(5), card(6)];
        const first = sortReviews(cards, 'dueRandom');
        expect(sortReviews([...cards].reverse(), 'dueRandom')).toEqual(first);
        // A pure id sort would be a sign the tiebreaker is not doing anything.
        expect(first).not.toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('orders by interval in both directions', () => {
        const cards = [card(1, { ivl: 30 }), card(2, { ivl: 5 }), card(3, { ivl: 12 })];
        expect(sortReviews(cards, 'intervalsAsc')).toEqual([2, 3, 1]);
        expect(sortReviews(cards, 'intervalsDesc')).toEqual([1, 3, 2]);
    });

    it('orders by ease in both directions', () => {
        const cards = [card(1, { ease: 2.5 }), card(2, { ease: 1.9 }), card(3, { ease: 3.1 })];
        expect(sortReviews(cards, 'easeAsc')).toEqual([2, 1, 3]);
        expect(sortReviews(cards, 'easeDesc')).toEqual([3, 1, 2]);
    });

    it('puts the most overdue relative to its own interval first', () => {
        // Both fell due on the same day. Anki weighs how late a card is against its own interval,
        // so the short-interval card is the urgent one: -(1 + (today - due)/ivl) ascending.
        // `today` has to be a real day number here, because that is what the due dates parse to.
        const today = ymdToLocalDayNumber('2026-01-10', 0) + 5;
        const cards = [
            card(1, { due: '2026-01-10', ivl: 100 }),
            card(2, { due: '2026-01-10', ivl: 2 }),
        ];
        expect(sortReviews(cards, 'relativeOverdueness', today)).toEqual([2, 1]);
    });

    it('ranks a card that is late by a whole interval above one barely late', () => {
        const today = ymdToLocalDayNumber('2026-01-20', 0);
        const cards = [
            // 1 day late on a 10 day interval.
            card(1, { due: '2026-01-19', ivl: 10 }),
            // 10 days late on a 10 day interval.
            card(2, { due: '2026-01-10', ivl: 10 }),
        ];
        expect(sortReviews(cards, 'relativeOverdueness', today)).toEqual([2, 1]);
    });

    it('orders by deck and due date in both nestings', () => {
        const cards = [
            card(1, { deck: 2, due: '2026-01-10' }),
            card(2, { deck: 1, due: '2026-01-11' }),
            card(3, { deck: 1, due: '2026-01-10' }),
        ];
        const rank = (deckId: number) => deckId;
        const run = (order: ReviewSortOrder) => ids(sortReviewCards(cards, order, {
            daySeed: 'seed', fallbackDay: 100, today: 100, deckRank: rank,
        }));
        expect(run('deckThenDue')).toEqual([3, 2, 1]);
        expect(run('dueThenDeck')).toEqual([3, 1, 2]);
    });

    it('orders by note id for added and reverse added', () => {
        const cards = [card(3, { note: 30 }), card(1, { note: 10 }), card(2, { note: 20 })];
        expect(sortReviews(cards, 'added')).toEqual([1, 2, 3]);
        expect(sortReviews(cards, 'reverseAdded')).toEqual([3, 2, 1]);
    });

    it('shuffles for random but stays stable within a day', () => {
        const cards = [card(1), card(2), card(3), card(4), card(5)];
        const once = sortReviews(cards, 'random');
        expect(sortReviews([...cards].reverse(), 'random')).toEqual(once);
        expect(once).toHaveLength(5);
    });

    it('does not mutate the list it was given', () => {
        const cards = [card(3), card(1), card(2)];
        sortReviews(cards, 'intervalsAsc');
        expect(ids(cards)).toEqual([3, 1, 2]);
    });
});

describe('new card sort orders', () => {
    const run = (cards: StudyCard[], order: NewCardSortOrder) => ids(sortNewCards(cards, order, 'seed'));

    it('leaves the gather order alone for "order gathered"', () => {
        const cards = [card(3, { ord: 1 }), card(1, { ord: 0 }), card(2, { ord: 2 })];
        expect(run(cards, 'noSort')).toEqual([3, 1, 2]);
    });

    it('sorts by template ordinal while preserving gather order inside one ordinal', () => {
        const cards = [
            card(10, { ord: 1 }), card(11, { ord: 0 }), card(12, { ord: 1 }), card(13, { ord: 0 }),
        ];
        // Ordinal 0 first, and 11 stays ahead of 13 because that is how they were gathered.
        expect(run(cards, 'template')).toEqual([11, 13, 10, 12]);
    });

    it('keeps siblings together and in template order for random-note', () => {
        const cards = [
            card(1, { note: 100, ord: 1 }), card(2, { note: 200, ord: 0 }),
            card(3, { note: 100, ord: 0 }), card(4, { note: 200, ord: 1 }),
        ];
        const sorted = sortNewCards(cards, 'randomNoteThenTemplate', 'seed');
        const notes = sorted.map((entry) => entry.noteId);
        // Each note's two cards are adjacent...
        expect(notes[0]).toBe(notes[1]);
        expect(notes[2]).toBe(notes[3]);
        // ...and within a note, template order is kept.
        expect(sorted[0].templateOrd).toBe(0);
        expect(sorted[2].templateOrd).toBe(0);
    });

    it('groups by template first, then shuffles inside the group', () => {
        const cards = [1, 2, 3, 4, 5, 6].map((id) => card(id, { ord: id <= 3 ? 0 : 1 }));
        const sorted = sortNewCards(cards, 'templateThenRandom', 'seed');
        expect(sorted.slice(0, 3).every((entry) => entry.templateOrd === 0)).toBe(true);
        expect(sorted.slice(3).every((entry) => entry.templateOrd === 1)).toBe(true);
    });

    it('ignores template ordinal entirely for random card', () => {
        const cards = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => card(id, { ord: id % 2 }));
        const sorted = sortNewCards(cards, 'randomCard', 'seed');
        expect(sorted).toHaveLength(8);
        // Stable for the same seed.
        expect(ids(sortNewCards([...cards].reverse(), 'randomCard', 'seed'))).toEqual(ids(sorted));
    });

    it('does not mutate the list it was given', () => {
        const cards = [card(3, { ord: 2 }), card(1, { ord: 0 })];
        sortNewCards(cards, 'template', 'seed');
        expect(ids(cards)).toEqual([3, 1]);
    });

    it('keeps gather order inside an ordinal without depending on a stable engine sort', () => {
        // Every card shares one template ordinal, so the result must be the input order exactly.
        const gathered = [9, 4, 7, 1, 8, 2, 6, 3, 5].map((id) => card(id, { ord: 0 }));
        expect(run(gathered, 'template')).toEqual([9, 4, 7, 1, 8, 2, 6, 3, 5]);
    });
});

describe('new card gather orders', () => {
    it('accepts Anki\'s six names', () => {
        for (const order of [
            'deck', 'deckThenRandomNotes', 'ascendingPosition',
            'descendingPosition', 'randomNotes', 'randomCards',
        ] as const) {
            expect(normalizeNewCardGatherOrder(order)).toBe(order);
        }
    });

    it('maps the three names earlier builds stored to what they meant', () => {
        expect(normalizeNewCardGatherOrder('topic')).toBe('deck');
        expect(normalizeNewCardGatherOrder('position')).toBe('ascendingPosition');
        expect(normalizeNewCardGatherOrder('random')).toBe('randomCards');
    });

    it('falls back to deck order for anything unrecognised', () => {
        expect(normalizeNewCardGatherOrder(undefined)).toBe('deck');
        expect(normalizeNewCardGatherOrder('nonsense')).toBe('deck');
    });

    it('shuffles notes for random-notes gathering but never splits a note', () => {
        const cards = [
            card(1, { note: 100, ord: 1 }), card(2, { note: 200, ord: 0 }),
            card(3, { note: 100, ord: 0 }), card(4, { note: 300, ord: 0 }),
            card(5, { note: 200, ord: 1 }),
        ];
        const gathered = shuffleNewCardsByNote(cards, 'seed');
        const notes = gathered.map((entry) => entry.noteId);

        expect(gathered).toHaveLength(5);
        // Each note appears as one uninterrupted run...
        expect(new Set(notes).size).toBe(notes.filter((note, index) => note !== notes[index - 1]).length);
        // ...with its cards in template order, and the same seed gives the same walk.
        const note100 = gathered.filter((entry) => entry.noteId === 100).map((entry) => entry.templateOrd);
        expect(note100).toEqual([0, 1]);
        expect(ids(shuffleNewCardsByNote([...cards].reverse(), 'seed'))).toEqual(ids(gathered));
    });
});
