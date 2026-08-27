import { describe, expect, it, vi } from 'vitest';
import { coordinatePostAnswerQueueRefresh } from './reviewerQueueRefresh';

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
