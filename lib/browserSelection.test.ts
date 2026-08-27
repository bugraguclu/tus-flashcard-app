import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnkiCard } from './models';
import type { AppSettings } from './types';

const harness = vi.hoisted(() => ({
    cards: new Map<number, AnkiCard>(),
    grades: [] as Array<{ cardId: number; grade: number }>,
}));

vi.mock('./noteManager', () => ({
    getAllAnkiCards: () => [...harness.cards.values()],
    getAnkiCard: (cardId: number) => harness.cards.get(cardId) ?? null,
    getCardsForNote: (noteId: number) => [...harness.cards.values()].filter((card) => card.noteId === noteId),
    saveAnkiCard: (card: AnkiCard) => harness.cards.set(card.id, { ...card }),
}));

vi.mock('./studyRepository', () => ({
    setCardSuspended: (cardId: number, suspended: boolean) => {
        const card = harness.cards.get(cardId)!;
        harness.cards.set(cardId, { ...card, queue: suspended ? -1 : card.type === 0 ? 0 : 2 });
    },
    setCardBuried: (cardId: number, buried: boolean) => {
        const card = harness.cards.get(cardId)!;
        harness.cards.set(cardId, { ...card, queue: buried ? -3 : card.type === 0 ? 0 : 2 });
    },
    forgetCard: (cardId: number) => {
        const card = harness.cards.get(cardId)!;
        harness.cards.set(cardId, { ...card, type: 0, queue: 0, ivl: 0, reps: 0, lapses: 0, left: 0 });
    },
    answerStudyCard: (cardId: number, grade: number) => {
        harness.grades.push({ cardId, grade });
    },
}));

import {
    expandSelectedCardsToNotes,
    gradeSelectedNow,
    parseDueRange,
    repositionSelectedNewCards,
    resetSelectedProgress,
    setSelectedDueDate,
    toggleSelectedBury,
    toggleSelectedSuspend,
} from './browserSelection';

const settings = { dayRolloverHour: 4 } as AppSettings;

function card(id: number, overrides: Partial<AnkiCard> = {}): AnkiCard {
    return {
        id,
        noteId: id,
        deckId: 1,
        ord: 0,
        mod: 0,
        usn: -1,
        type: 0,
        queue: 0,
        due: id,
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

beforeEach(() => {
    harness.cards.clear();
    harness.grades.length = 0;
});

describe('parseDueRange', () => {
    it('accepts Anki single-day, range, negative, and force-interval syntax', () => {
        expect(parseDueRange('5')).toEqual({ minDays: 5, maxDays: 5, forceInterval: false });
        expect(parseDueRange('7-3!')).toEqual({ minDays: 3, maxDays: 7, forceInterval: true });
        expect(parseDueRange('-2')).toEqual({ minDays: -2, maxDays: -2, forceInterval: false });
    });

    it('rejects malformed input', () => {
        expect(parseDueRange('tomorrow')).toBeNull();
        expect(parseDueRange('2..5')).toBeNull();
    });
});

describe('browser selection scheduling operations', () => {
    it('expands a notes-mode row selection to every sibling card without duplicates', () => {
        harness.cards.set(1, card(1, { noteId: 10, ord: 0 }));
        harness.cards.set(2, card(2, { noteId: 10, ord: 1 }));
        harness.cards.set(3, card(3, { noteId: 20, ord: 0 }));

        expect(expandSelectedCardsToNotes([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('toggles suspend and bury for every card based on the current card', () => {
        harness.cards.set(1, card(1));
        harness.cards.set(2, card(2, { queue: -1 }));

        expect(toggleSelectedSuspend([1, 2], 4)).toBe(2);
        expect([...harness.cards.values()].map((entry) => entry.queue)).toEqual([-1, -1]);
        expect(toggleSelectedSuspend([1, 2], 4)).toBe(2);
        expect([...harness.cards.values()].map((entry) => entry.queue)).toEqual([0, 0]);

        toggleSelectedBury([1, 2], 4);
        expect([...harness.cards.values()].map((entry) => entry.queue)).toEqual([-3, -3]);
    });

    it('repositions only new cards and shifts existing positions when requested', () => {
        harness.cards.set(1, card(1, { due: 1 }));
        harness.cards.set(2, card(2, { due: 2 }));
        harness.cards.set(3, card(3, { due: 3 }));
        harness.cards.set(4, card(4, { type: 2, queue: 2, due: 99 }));

        expect(repositionSelectedNewCards([3, 4], 2, 1, true)).toBe(1);
        expect(harness.cards.get(3)?.due).toBe(2);
        expect(harness.cards.get(2)?.due).toBe(3);
        expect(harness.cards.get(4)?.due).toBe(99);
    });

    it('preserves a review interval unless ! is used and gives new cards an interval', () => {
        harness.cards.set(1, card(1, { type: 2, queue: 2, ivl: 30 }));
        harness.cards.set(2, card(2));
        setSelectedDueDate([1, 2], { minDays: 5, maxDays: 5, forceInterval: false }, settings);
        expect(harness.cards.get(1)?.ivl).toBe(30);
        expect(harness.cards.get(2)?.ivl).toBe(5);
        expect(harness.cards.get(2)?.type).toBe(2);

        setSelectedDueDate([1], { minDays: 7, maxDays: 7, forceInterval: true }, settings);
        expect(harness.cards.get(1)?.ivl).toBe(7);
    });

    it('resets cards to the end of the new queue and grades through the scheduler path', () => {
        harness.cards.set(1, card(1, { type: 2, queue: 2, due: 100, ivl: 20, reps: 4 }));
        harness.cards.set(2, card(2, { due: 8 }));

        expect(resetSelectedProgress([1], settings)).toBe(1);
        expect(harness.cards.get(1)).toMatchObject({ type: 0, queue: 0, due: 9, ivl: 0, reps: 0 });

        expect(gradeSelectedNow([1, 2], 3, settings)).toBe(2);
        expect(harness.grades).toEqual([{ cardId: 1, grade: 3 }, { cardId: 2, grade: 3 }]);
    });
});
