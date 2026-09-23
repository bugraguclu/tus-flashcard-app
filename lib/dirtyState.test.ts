import { describe, expect, it } from 'vitest';
import { hasSnapshotChanged, stableSnapshot } from './dirtyState';

describe('dirty state snapshots', () => {
    it('ignores object key order and undefined persistence noise', () => {
        const first = stableSnapshot({ b: 2, a: 1, optional: undefined });
        const same = stableSnapshot({ a: 1, b: 2 });
        expect(first).toBe(same);
        expect(hasSnapshotChanged(first, { a: 1, b: 2 })).toBe(false);
    });

    it('keeps array order meaningful while treating reverted values as clean', () => {
        const initial = stableSnapshot({ steps: ['1m', '10m'] });
        expect(hasSnapshotChanged(initial, { steps: ['10m', '1m'] })).toBe(true);
        expect(hasSnapshotChanged(initial, { steps: ['1m', '10m'] })).toBe(false);
    });
});

