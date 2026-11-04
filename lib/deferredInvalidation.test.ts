import { describe, expect, it, vi } from 'vitest';
import { changesStudyQueue, consumeSchedulingRevision, DeferredSchedulingInvalidation } from './deferredInvalidation';

describe('deferred scheduling invalidation', () => {
    it('refreshes deck counts when the deck screen regains focus, not when an answer is marked', () => {
        const invalidation = new DeferredSchedulingInvalidation();
        let visibleRevision = invalidation.current();
        let visibleDeckCount = 3;
        const readDeckCounts = vi.fn(() => 2);

        invalidation.markStale();

        expect(visibleDeckCount).toBe(3);
        expect(readDeckCounts).not.toHaveBeenCalled();

        visibleRevision = consumeSchedulingRevision(
            visibleRevision,
            invalidation.current(),
            () => { visibleDeckCount = readDeckCounts(); },
        );

        expect(visibleRevision).toBe(1);
        expect(visibleDeckCount).toBe(2);
        expect(readDeckCounts).toHaveBeenCalledTimes(1);

        consumeSchedulingRevision(visibleRevision, invalidation.current(), readDeckCounts);
        expect(readDeckCounts).toHaveBeenCalledTimes(1);
    });
});

// https://github.com/ankitects/anki/blob/main/rslib/src/ops.rs (`requires_study_queue_rebuild`)
describe('changes that rebuild the study queue', () => {
    it('keeps the queue only for a change marked as keeping it', () => {
        expect(changesStudyQueue({ keepsStudyQueue: true })).toBe(false);
        expect(changesStudyQueue(undefined)).toBe(true);
        expect(changesStudyQueue({ keepsStudyQueue: false })).toBe(true);
    });

    it('rebuilds for anything else a handler passes through, such as a press event', () => {
        expect(changesStudyQueue({ nativeEvent: {}, keepsStudyQueue: 'yes' })).toBe(true);
        expect(changesStudyQueue('keepsStudyQueue')).toBe(true);
    });
});
