import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnkiCard } from './models';
import type { AppSettings } from './types';
import { localDayNumber } from './ankiState';
import { logManualEntry } from './reviewLogger';

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

vi.mock('./reviewLogger', () => ({
    logManualEntry: vi.fn(() => ({ id: 1 })),
    // The real rule, reduced to what these tests look at: FSRS cards log their difficulty.
    revlogFactorForScheduling: (memory: { difficulty: number } | null, ease: number) => (
        memory ? Math.trunc(((memory.difficulty - 1) / 9 + 0.1) * 1000) : ease
    ),
}));

vi.mock('./studyCardRows', () => ({
    resolveSettingsForDeck: () => ({ startingEase: 2.5, dayRolloverHour: 4 }),
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
        // Mirrors the real helper: a forgotten card goes to the back of the new queue, because
        // `due` is a queue position once the card is new again.
        const position = [...harness.cards.values()]
            .filter((other) => other.id !== cardId && other.type === 0)
            .reduce((max, other) => Math.max(max, other.due), 0) + 1;
        harness.cards.set(cardId, { ...card, type: 0, queue: 0, due: position, ivl: 0, reps: 0, lapses: 0, left: 0 });
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
    setDueDateInterval,
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

    it('pins a card into the review queue on the requested day, negatives included', () => {
        harness.cards.set(1, card(1, { type: 0, queue: 0 }));
        harness.cards.set(2, card(2, { type: 2, queue: 2, ivl: 6 }));
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);

        setSelectedDueDate([1], { minDays: 3, maxDays: 3, forceInterval: false }, settings);
        expect(harness.cards.get(1)).toMatchObject({ type: 2, queue: 2, due: today + 3 });

        // Anki's dialog accepts a negative day to make a card overdue on purpose.
        setSelectedDueDate([2], { minDays: -5, maxDays: -5, forceInterval: false }, settings);
        expect(harness.cards.get(2)).toMatchObject({ due: today - 5, ivl: 6 });
    });

    it('records a reschedule rather than a reset, and hands the row back for undo', () => {
        harness.cards.set(1, card(1, { type: 2, queue: 2, ivl: 6 }));
        vi.mocked(logManualEntry).mockClear().mockReturnValue({ id: 900 } as never);

        const written = setSelectedDueDate([1], { minDays: 3, maxDays: 3, forceInterval: false }, settings);

        // Anki logs Set Due Date as a manual row that carries the card's ease, so it never reads
        // as the factor-0 reset marker that would wipe the memory state.
        expect(logManualEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'manual', 6, 6, 2500);
        expect(written).toEqual([{ id: 900 }]);
    });

    it('measures an FSRS card from its recorded last review and ignores the forcing "!"', () => {
        const nowMs = Date.now();
        const lastReviewSecs = Math.floor(nowMs / 1000) - 12 * 86_400;
        harness.cards.set(1, card(1, {
            type: 2,
            queue: 2,
            ivl: 10,
            ankiData: JSON.stringify({ s: 20, d: 5.5, lrt: lastReviewSecs }),
        }));
        vi.mocked(logManualEntry).mockClear();

        setSelectedDueDate([1], { minDays: 5, maxDays: 5, forceInterval: true }, settings);

        // Reviewed twelve days ago (counted to the next rollover) and pushed five days out.
        const ivl = harness.cards.get(1)!.ivl;
        expect([17, 18]).toContain(ivl);
        expect(logManualEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'manual', ivl, 10, 600);
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

describe('setDueDateInterval', () => {
    // Anki 26.05, `Card::set_due_date` in rslib/src/scheduler/reviews.rs.
    const NEXT_DAY_AT = Date.UTC(2026, 2, 12, 1, 0, 0);
    const base = {
        hasMemoryState: false,
        isReviewOrRelearning: true,
        currentInterval: 30,
        lastReviewTimeMs: null as number | null,
        nextDayAtMs: NEXT_DAY_AT,
        daysUntilCurrentDue: 2,
        requestedDays: 5,
        forceInterval: false,
    };

    it('keeps the earned interval of a review card without a memory state unless forced', () => {
        expect(setDueDateInterval(base)).toBe(30);
        expect(setDueDateInterval({ ...base, forceInterval: true })).toBe(5);
    });

    it('gives a new or learning card without a memory state the requested days', () => {
        expect(setDueDateInterval({ ...base, isReviewOrRelearning: false, currentInterval: 0 })).toBe(5);
        expect(setDueDateInterval({ ...base, isReviewOrRelearning: false, requestedDays: 0 })).toBe(1);
    });

    it('extends an FSRS card across the whole unseen gap, whatever "!" says', () => {
        // Reviewed 12 whole days before the next rollover and pushed 5 days out: 17 days unseen.
        const lastReviewTimeMs = NEXT_DAY_AT - 12 * 86_400_000 - 3_600_000;
        expect(setDueDateInterval({ ...base, hasMemoryState: true, lastReviewTimeMs })).toBe(17);
        expect(setDueDateInterval({ ...base, hasMemoryState: true, lastReviewTimeMs, forceInterval: true })).toBe(17);
    });

    it('moves an FSRS card without a recorded review by as many days as its due date moves', () => {
        // Due in 2 days, now due in 5: the interval grows by 3.
        expect(setDueDateInterval({ ...base, hasMemoryState: true })).toBe(33);
        // Pulled in from 10 days out to today, a short interval stops at zero.
        expect(setDueDateInterval({
            ...base, hasMemoryState: true, currentInterval: 2, daysUntilCurrentDue: 10, requestedDays: 0,
        })).toBe(0);
    });
});
