import { describe, expect, it, vi } from 'vitest';
import { consumeSchedulingRevision, DeferredSchedulingInvalidation } from './deferredInvalidation';

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
