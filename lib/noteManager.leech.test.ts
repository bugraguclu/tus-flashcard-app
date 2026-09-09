// Leech threshold parity with Anki.
//
// Anki fires the leech action at the threshold and then every *half* threshold, where the half is
// rounded UP for odd thresholds:
//
//   let half_threshold = (threshold as f32 / 2.0).ceil().max(1.0) as u32;
//   lapses >= threshold && (lapses - threshold) % half_threshold == 0
//
// The cast to f32 happens before the division, so a threshold of 3 gives ceil(1.5) = 2, not 1.
// Flooring instead collapses odd thresholds towards a half of 1, which makes the modulo always
// zero and fires the action on every single lapse past the threshold.
//
// Source: rslib/src/scheduler/states/review.rs `leech_threshold_met`
// https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/review.rs

import { describe, it, expect, vi } from 'vitest';

vi.mock('./db', () => ({
    getDB: () => ({
        getFirstSync: () => null,
        getAllSync: () => [],
        runSync: () => undefined,
        execSync: () => undefined,
    }),
}));

const { isLeech } = await import('./noteManager');

function cardWithLapses(lapses: number) {
    return { lapses } as any;
}

/** Lapse counts in `range` that trip the leech action for a given threshold. */
function firingLapses(threshold: number, upTo: number): number[] {
    const hits: number[] = [];
    for (let lapses = 0; lapses <= upTo; lapses += 1) {
        if (isLeech(cardWithLapses(lapses), threshold)) hits.push(lapses);
    }
    return hits;
}

describe('isLeech', () => {
    it('never fires below the threshold', () => {
        expect(isLeech(cardWithLapses(7), 8)).toBe(false);
        expect(isLeech(cardWithLapses(0), 8)).toBe(false);
    });

    it('treats a zero threshold as "never a leech"', () => {
        expect(isLeech(cardWithLapses(50), 0)).toBe(false);
    });

    it('fires at the threshold and every half threshold after it (even threshold)', () => {
        // Anki's default. half = 8 / 2 = 4.
        expect(firingLapses(8, 20)).toEqual([8, 12, 16, 20]);
    });

    it('rounds the half threshold up, matching upstream for threshold 3', () => {
        // half = ceil(3 / 2) = 2, so 3, 5, 7 fire and 4, 6 do not. Flooring would fire on every
        // lapse from 3 upwards, which is the bug this pins.
        expect(isLeech(cardWithLapses(3), 3)).toBe(true);
        expect(isLeech(cardWithLapses(4), 3)).toBe(false);
        expect(isLeech(cardWithLapses(5), 3)).toBe(true);
        expect(isLeech(cardWithLapses(6), 3)).toBe(false);
        expect(isLeech(cardWithLapses(7), 3)).toBe(true);
    });

    it('rounds the half threshold up for a larger odd threshold', () => {
        // half = ceil(7 / 2) = 4. Flooring would give 3 and fire on 7, 10, 13.
        expect(firingLapses(7, 15)).toEqual([7, 11, 15]);
    });

    it('keeps a half threshold of at least one', () => {
        // half = ceil(1 / 2) = 1, so every lapse from the first onwards fires.
        expect(firingLapses(1, 4)).toEqual([1, 2, 3, 4]);
    });
});
