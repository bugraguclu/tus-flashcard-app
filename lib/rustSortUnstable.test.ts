import { describe, expect, it } from 'vitest';
import { rustSortUnstableIndicesByKey } from './rustSortUnstable';

// The exact orders are pinned against Anki's own rescheduling in lib/fsrsAnkiParity.test.ts;
// these checks cover the properties every path of the port must keep.

function keysFrom(seed: number, length: number, distinct: number): number[] {
    let state = seed >>> 0;
    const keys: number[] = [];
    for (let index = 0; index < length; index++) {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
        keys.push(state % distinct);
    }
    return keys;
}

describe('Rust unstable sort order', () => {
    it('returns every index once, sorted by key, across all sizes and duplicate densities', () => {
        for (const length of [0, 1, 2, 17, 20, 21, 32, 33, 63, 64, 65, 200, 1500]) {
            for (const distinct of [1, 3, 12, 1000]) {
                const keys = keysFrom(length * 31 + distinct, length, distinct);
                const order = rustSortUnstableIndicesByKey(keys);
                expect([...order].sort((a, b) => a - b)).toEqual(keys.map((_, index) => index));
                for (let index = 1; index < order.length; index++) {
                    expect(keys[order[index - 1]]).toBeLessThanOrEqual(keys[order[index]]);
                }
            }
        }
    });

    it('keeps equal keys in input order up to 20 elements, where Rust uses insertion sort', () => {
        const keys = [3, 1, 3, 2, 1, 3, 2, 1, 1, 2, 3, 3, 1, 2, 2, 1, 3, 1, 2, 3];
        const order = rustSortUnstableIndicesByKey(keys);
        const stable = keys.map((key, index) => ({ key, index }))
            .sort((a, b) => a.key - b.key || a.index - b.index)
            .map((entry) => entry.index);
        expect(order).toEqual(stable);
    });

    it('leaves an already sorted slice alone and reverses a strictly descending one', () => {
        const ascending = Array.from({ length: 50 }, (_, index) => Math.floor(index / 3));
        expect(rustSortUnstableIndicesByKey(ascending)).toEqual(ascending.map((_, index) => index));
        const descending = Array.from({ length: 50 }, (_, index) => 100 - index);
        expect(rustSortUnstableIndicesByKey(descending)).toEqual(descending.map((_, index) => 49 - index));
    });

    it('does not keep equal keys in input order once quicksort takes over', () => {
        // The point of reproducing the unstable sort: a stable sort would visit these differently.
        const keys = keysFrom(7, 120, 4);
        const order = rustSortUnstableIndicesByKey(keys);
        const stable = keys.map((key, index) => ({ key, index }))
            .sort((a, b) => a.key - b.key || a.index - b.index)
            .map((entry) => entry.index);
        expect(order).not.toEqual(stable);
    });
});
