import { describe, expect, it, vi } from 'vitest';
import {
    ANSWERS_BETWEEN_REBUILDS,
    avoidImmediateRepeat,
    cardKeptOnScreen,
    coordinatePostAnswerQueueRefresh,
    keepSessionOrder,
    queueWithFocusedCard,
    shouldRebuildAfterAnswer,
} from './reviewerQueueRefresh';

describe('reviewer queue refresh coordination', () => {
    it('runs getStudyQueue only once for an answer that needs an immediate rebuild', () => {
        const getStudyQueue = vi.fn();
        const scheduleDeferredRefresh = vi.fn();

        coordinatePostAnswerQueueRefresh(true, {
            refreshImmediately: getStudyQueue,
            scheduleDeferredRefresh,
        });

        expect(getStudyQueue).toHaveBeenCalledTimes(1);
        expect(scheduleDeferredRefresh).not.toHaveBeenCalled();
    });

    it('defers the sole queue query while the in-memory queue can advance locally', () => {
        const getStudyQueue = vi.fn();
        const scheduled: { current: (() => void) | null } = { current: null };

        coordinatePostAnswerQueueRefresh(false, {
            refreshImmediately: getStudyQueue,
            scheduleDeferredRefresh: () => { scheduled.current = getStudyQueue; },
        });

        expect(getStudyQueue).not.toHaveBeenCalled();
        expect(scheduled.current).not.toBeNull();
        scheduled.current?.();
        expect(getStudyQueue).toHaveBeenCalledTimes(1);
    });
});

describe('queueWithFocusedCard (CAL-4)', () => {
    const card = (cardId: number, state: Partial<{ suspended: boolean; buried: boolean }> = {}) => ({
        cardId, state: { suspended: false, buried: false, ...state },
    });

    it('moves the undone card to the front of the rebuilt queue', () => {
        expect(queueWithFocusedCard([card(1), card(2), card(3)], 3, () => null)?.map((c) => c.cardId)).toEqual([3, 1, 2]);
    });

    it('reads a card the rebuilt queue left out', () => {
        expect(queueWithFocusedCard([card(1)], 9, () => card(9))?.map((c) => c.cardId)).toEqual([9, 1]);
    });

    it('never shows a suspended, buried or missing card', () => {
        expect(queueWithFocusedCard([card(1)], 9, () => card(9, { suspended: true }))).toBeNull();
        expect(queueWithFocusedCard([card(1), card(2, { buried: true })], 2, () => null)).toBeNull();
        expect(queueWithFocusedCard([card(1)], 9, () => null)).toBeNull();
    });
});

describe('keepSessionOrder', () => {
    const card = (cardId: number, version = 0) => ({ cardId, version });
    const ids = (cards: Array<{ cardId: number }>) => cards.map((c) => c.cardId);

    it('deals the main queue in the order the session had, with the fresh cards\' data', () => {
        // The fresh build spread the same cards differently; learning (1, 9) leads and trails.
        const previous = [card(3), card(4), card(5), card(6)];
        const fresh = [card(1), card(4, 1), card(3, 1), card(6, 1), card(5, 1), card(9)];
        const kept = keepSessionOrder(previous, fresh, { start: 1, end: 5 });
        expect(ids(kept)).toEqual([1, 3, 4, 5, 6, 9]);
        expect(kept.slice(1, 5).every((c) => c.version === 1)).toBe(true);
    });

    it('leaves out what the fresh build no longer holds and keeps a card new to it in its own place', () => {
        // 4 was buried elsewhere; 7 is the next card of a new-card window.
        const kept = keepSessionOrder([card(3), card(4), card(5), card(6)], [card(6), card(7), card(5), card(3)], { start: 0, end: 4 });
        expect(ids(kept)).toEqual([3, 7, 5, 6]);
    });

    it('ignores learning cards and repeats in the previous queue', () => {
        const kept = keepSessionOrder([card(1), card(5), card(1), card(3), card(5)], [card(1), card(3), card(5)], { start: 1, end: 3 });
        expect(ids(kept)).toEqual([1, 5, 3]);
    });

    it('is the fresh build when the session held none of its cards', () => {
        expect(ids(keepSessionOrder([], [card(2), card(1)], { start: 0, end: 2 }))).toEqual([2, 1]);
    });
});

describe('shouldRebuildAfterAnswer', () => {
    const base = {
        queueLengthBefore: 5, queueLengthAfter: 4, answersSinceRebuild: 1,
        learningComesDueAt: null, nextCardIsLearningAhead: false, nowMs: 1_000_000,
    };

    it('waits while the in-memory queue still deals the cards Anki would', () => {
        expect(shouldRebuildAfterAnswer(base)).toBe(false);
        expect(shouldRebuildAfterAnswer({ ...base, learningComesDueAt: 1_000_001 })).toBe(false);
    });

    it('rebuilds when the queue runs out, after a batch, once a learning card is due, and at learning dealt ahead', () => {
        expect(shouldRebuildAfterAnswer({ ...base, queueLengthAfter: 0 })).toBe(true);
        expect(shouldRebuildAfterAnswer({ ...base, queueLengthBefore: 1 })).toBe(true);
        expect(shouldRebuildAfterAnswer({ ...base, answersSinceRebuild: ANSWERS_BETWEEN_REBUILDS })).toBe(true);
        expect(shouldRebuildAfterAnswer({ ...base, learningComesDueAt: 1_000_000 })).toBe(true);
        expect(shouldRebuildAfterAnswer({ ...base, nextCardIsLearningAhead: true })).toBe(true);
    });
});

describe('avoidImmediateRepeat', () => {
    const cards = [{ cardId: 1 }, { cardId: 2 }, { cardId: 3 }];
    const ids = (list: Array<{ cardId: number }>) => list.map((c) => c.cardId);

    it('puts the answered card behind the next learning card once the main queue is empty', () => {
        expect(ids(avoidImmediateRepeat(cards, { start: 0, end: 0 }, 1))).toEqual([2, 1, 3]);
    });

    it('leaves the queue alone with main cards left, a different card in front or nothing else waiting', () => {
        expect(ids(avoidImmediateRepeat(cards, { start: 1, end: 2 }, 1))).toEqual([1, 2, 3]);
        expect(ids(avoidImmediateRepeat(cards, { start: 0, end: 0 }, 2))).toEqual([1, 2, 3]);
        expect(ids(avoidImmediateRepeat([{ cardId: 1 }], { start: 0, end: 0 }, 1))).toEqual([1]);
    });
});

// A background rebuild (the 45-second refresh, a change saved on another screen) keeps the card on
// screen in front. It shows the card as the fresh build has it, so a Deck Options step change reaches
// its answer buttons, and it keeps a card that left the queue only for unsaved ink on the whiteboard.
describe('cardKeptOnScreen', () => {
    type Card = { cardId: number; step: string; state: { suspended: boolean; buried: boolean } };
    const card = (cardId: number, step: string, state: Partial<Card['state']> = {}): Card => ({
        cardId, step, state: { suspended: false, buried: false, ...state },
    });
    const keep = (input: Partial<Parameters<typeof cardKeptOnScreen<Card>>[0]>) => cardKeptOnScreen<Card>({
        current: card(1, 'old'),
        sessionCards: [],
        whiteboardOn: false,
        hasInk: false,
        reload: () => card(1, 'stored'),
        ...input,
    });

    it('shows a card still in the queue as the fresh build has it', () => {
        expect(keep({ sessionCards: [card(2, 'fresh'), card(1, 'fresh')] })?.step).toBe('fresh');
        expect(keep({ sessionCards: [card(1, 'fresh')], whiteboardOn: true, hasInk: true })?.step).toBe('fresh');
    });

    it('keeps a card that left the queue only for ink on the board, read as it is stored now', () => {
        expect(keep({ whiteboardOn: true, hasInk: true })?.step).toBe('stored');
        expect(keep({ whiteboardOn: true, hasInk: false })).toBeNull();
        expect(keep({ whiteboardOn: false, hasInk: true })).toBeNull();
        expect(keep({})).toBeNull();
    });

    it('lets go of a card the editor deleted, or one suspended or buried elsewhere, ink or not', () => {
        expect(keep({ whiteboardOn: true, hasInk: true, reload: () => null })).toBeNull();
        expect(keep({ whiteboardOn: true, hasInk: true, reload: () => card(1, 'stored', { suspended: true }) })).toBeNull();
        expect(keep({ whiteboardOn: true, hasInk: true, reload: () => card(1, 'stored', { buried: true }) })).toBeNull();
    });

    it('keeps nothing when the rebuild does not keep the card on screen', () => {
        expect(keep({ current: null, sessionCards: [card(1, 'fresh')] })).toBeNull();
    });
});
