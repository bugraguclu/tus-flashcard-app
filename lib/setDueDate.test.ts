import { describe, it, expect } from 'vitest';
import type { AnkiCard } from './models';
import {
    cardScheduledAsNew,
    cardWithDueDate,
    lastPosition,
    parseDueDateStr,
    sampleDaysFromToday,
} from './setDueDate';

function newCard(overrides: Partial<AnkiCard> = {}): AnkiCard {
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
        factor: 0,
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

// Ported from Anki's own `parse` test in rslib/src/scheduler/reviews.rs.
describe('parseDueDateStr', () => {
    it('rejects input that is not a plain day or range', () => {
        expect(parseDueDateStr('')).toBeNull();
        expect(parseDueDateStr('x')).toBeNull();
        expect(parseDueDateStr('-5')).toBeNull();
        expect(parseDueDateStr('1.5')).toBeNull();
        expect(parseDueDateStr('5!!')).toBeNull();
        expect(parseDueDateStr('!5')).toBeNull();
    });

    it('accepts a single day', () => {
        expect(parseDueDateStr('5')).toEqual({ min: 5, max: 5, forceReset: false });
    });

    it('accepts a single day with a forced interval', () => {
        expect(parseDueDateStr('5!')).toEqual({ min: 5, max: 5, forceReset: true });
    });

    it('accepts a range', () => {
        expect(parseDueDateStr('50-70')).toEqual({ min: 50, max: 70, forceReset: false });
    });

    it('normalises a reversed range and keeps the forced interval', () => {
        expect(parseDueDateStr('70-50!')).toEqual({ min: 50, max: 70, forceReset: true });
    });

    it('ignores surrounding whitespace', () => {
        expect(parseDueDateStr('  3-7  ')).toEqual({ min: 3, max: 7, forceReset: false });
    });
});

describe('sampleDaysFromToday', () => {
    it('returns the single day when the range has no span', () => {
        expect(sampleDaysFromToday({ min: 4, max: 4, forceReset: false }, () => 0.99)).toBe(4);
    });

    it('covers both ends of the range inclusively', () => {
        const spec = { min: 3, max: 7, forceReset: false };
        expect(sampleDaysFromToday(spec, () => 0)).toBe(3);
        expect(sampleDaysFromToday(spec, () => 0.999999)).toBe(7);
    });
});

// Ported from Anki's own `due_date` test in rslib/src/scheduler/reviews.rs.
describe('cardWithDueDate', () => {
    it('matches Anki step for step', () => {
        // Setting the due date of a new card converts it into a review card.
        let card = cardWithDueDate(newCard(), 5, 2, 1800, false);
        expect(card.type).toBe(2);
        expect(card.due).toBe(7);
        expect(card.ivl).toBe(2);
        expect(card.factor).toBe(1800);

        // Rescheduling the next day shifts it from day 7 to day 9 without touching the interval.
        card = cardWithDueDate(card, 6, 3, 2500, false);
        expect(card.due).toBe(9);
        expect(card.ivl).toBe(2);
        expect(card.factor).toBe(1800);

        // Cards can be brought forward too.
        card = cardWithDueDate(card, 6, 1, 2400, false);
        expect(card.due).toBe(7);
        expect(card.ivl).toBe(2);
        expect(card.factor).toBe(1800);

        // "!" forces the interval to be reset instead of shifted.
        card = cardWithDueDate(card, 6, 3, 2300, true);
        expect(card.due).toBe(9);
        expect(card.ivl).toBe(3);
        expect(card.factor).toBe(1800);

        // It works on a card sitting in a filtered deck, which is pulled back home.
        card = { ...card, ivl: 2, factor: 0, odue: 7, odid: 9, due: -10000, queue: 0 };
        card = cardWithDueDate(card, 6, 1, 2200, false);
        expect(card.due).toBe(7);
        expect(card.ivl).toBe(2);
        expect(card.factor).toBe(2200);
        expect(card.queue).toBe(2);
        expect(card.odue).toBe(0);
        expect(card.odid).toBe(0);
        expect(card.deckId).toBe(9);

        // Relearning cards are treated like reviews: the interval survives.
        card = { ...card, type: 3, odue: card.due, due: 12345678 };
        card = cardWithDueDate(card, 6, 10, 2100, false);
        expect(card.due).toBe(16);
        expect(card.ivl).toBe(2);
        expect(card.factor).toBe(2200);
    });

    it('never leaves a zero interval when the card is made due today', () => {
        const card = cardWithDueDate(newCard(), 10, 0, 2500, false);
        expect(card.due).toBe(10);
        expect(card.ivl).toBe(1);
    });

    it('records where a new card sat so Forget can put it back', () => {
        const card = cardWithDueDate(newCard({ due: 42 }), 5, 3, 2500, false);
        expect(card.originalPosition).toBe(42);
    });

    it('brings a suspended card back into the review queue, as Anki does', () => {
        const card = cardWithDueDate(newCard({ queue: -1 }), 5, 3, 2500, false);
        expect(card.queue).toBe(2);
    });
});

// Ported from Anki's `scheduling_as_new` test in rslib/src/scheduler/new.rs.
describe('cardScheduledAsNew', () => {
    const studied = newCard({ type: 2, queue: 2, due: 100, ivl: 30, factor: 2500, reps: 4, lapses: 2, originalPosition: 42 });

    it('restores the original position and keeps the counters', () => {
        const { card, positionUsed } = cardScheduledAsNew(studied, 1, { restorePosition: true, resetCounts: false });
        expect([card.due, card.reps, card.lapses]).toEqual([42, 4, 2]);
        expect(positionUsed).toBe(false);
    });

    it('uses the next queue position and zeroes the counters when asked', () => {
        const { card, positionUsed } = cardScheduledAsNew(studied, 1, { restorePosition: false, resetCounts: true });
        expect([card.due, card.reps, card.lapses]).toEqual([1, 0, 0]);
        expect(positionUsed).toBe(true);
    });

    it('resets the card to brand new', () => {
        const { card } = cardScheduledAsNew(studied, 1, { restorePosition: false, resetCounts: false });
        expect(card.type).toBe(0);
        expect(card.queue).toBe(0);
        expect(card.ivl).toBe(0);
        expect(card.factor).toBe(0);
        expect(card.originalPosition).toBeUndefined();
    });

    it('falls back to the next position when nothing was recorded', () => {
        const { card, positionUsed } = cardScheduledAsNew(
            newCard({ type: 2, queue: 2, due: 100, ivl: 30 }),
            77,
            { restorePosition: true, resetCounts: false },
        );
        expect(card.due).toBe(77);
        expect(positionUsed).toBe(true);
    });
});

describe('lastPosition', () => {
    it('reads a new card position out of its due field', () => {
        expect(lastPosition(newCard({ due: 12 }))).toBe(12);
    });

    it('reads a filtered new card position out of odue', () => {
        expect(lastPosition(newCard({ due: -10000, odue: 12, odid: 3 }))).toBe(12);
    });
});
