import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnkiCard } from './models';
import type { AppSettings } from './types';

const harness = vi.hoisted(() => ({
    cards: new Map<number, AnkiCard>(),
    grades: [] as Array<{ cardId: number; grade: number }>,
    dueDateCalls: [] as Array<{ cardIds: number[]; spec: unknown }>,
    forgetCalls: [] as Array<{ cardIds: number[]; options: unknown }>,
}));

vi.mock('./noteManager', () => ({
    getAllAnkiCards: () => [...harness.cards.values()],
    getAnkiCard: (cardId: number) => harness.cards.get(cardId) ?? null,
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
    setCardsDueDate: (cardIds: number[], spec: unknown) => {
        harness.dueDateCalls.push({ cardIds, spec });
        return cardIds.length;
    },
    forgetCards: (cardIds: number[], options: unknown) => {
        harness.forgetCalls.push({ cardIds, options });
        return cardIds.length;
    },
    answerStudyCard: (cardId: number, grade: number) => {
        harness.grades.push({ cardId, grade });
    },
}));

import {
    forgetSelectedCards,
    gradeSelectedNow,
    repositionSelectedNewCards,
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
    harness.dueDateCalls.length = 0;
    harness.forgetCalls.length = 0;
});

describe('browser selection scheduling operations', () => {
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

    it('passes the whole selection to Set Due Date', () => {
        const spec = { min: 3, max: 7, forceReset: true };
        expect(setSelectedDueDate([1, 2], spec, settings)).toBe(2);
        expect(harness.dueDateCalls).toEqual([{ cardIds: [1, 2], spec }]);
    });

    it('passes the whole selection to Forget, options included', () => {
        const options = { restorePosition: true, resetCounts: false };
        expect(forgetSelectedCards([1], options)).toBe(1);
        expect(harness.forgetCalls).toEqual([{ cardIds: [1], options }]);
    });

    it('grades through the scheduler path', () => {
        harness.cards.set(1, card(1, { type: 2, queue: 2, due: 100, ivl: 20, reps: 4 }));
        harness.cards.set(2, card(2, { due: 8 }));

        expect(gradeSelectedNow([1, 2], 3, settings)).toBe(2);
        expect(harness.grades).toEqual([{ cardId: 1, grade: 3 }, { cardId: 2, grade: 3 }]);
    });
});
