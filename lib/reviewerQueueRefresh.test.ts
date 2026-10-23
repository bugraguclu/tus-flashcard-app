import { describe, expect, it, vi } from 'vitest';
import { coordinatePostAnswerQueueRefresh, queueWithFocusedCard } from './reviewerQueueRefresh';

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
