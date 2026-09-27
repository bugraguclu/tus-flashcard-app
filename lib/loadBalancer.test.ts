import { describe, expect, it } from 'vitest';
import { AnkiStdRng, ankiCardSeed, ankiWeightedIndex } from './ankiRandom';
import {
    LOAD_BALANCE_DAYS,
    easyDaysModifiers,
    emptyLoadBalancerDays,
    loadBalancedInterval,
    parseEasyDays,
    selectWeightedInterval,
    type LoadBalancerState,
} from './loadBalancer';

// Behaviour from rslib/src/scheduler/states/load_balancer.rs (Anki 26.05); the exact days it
// picks are pinned against Anki's own output in lib/fsrsAnkiParity.test.ts.

const NEXT_DAY_AT = Date.UTC(2026, 8, 28, 1, 0, 0);

function state(counts: Record<number, number>, easyDays: number[] = [1, 1, 1, 1, 1, 1, 1]): LoadBalancerState {
    const days = emptyLoadBalancerDays();
    let nextId = 1;
    for (const [day, count] of Object.entries(counts)) {
        for (let index = 0; index < count; index++) {
            days[Number(day)].cardIds.push(nextId);
            days[Number(day)].noteIds.add(nextId);
            nextId += 1;
        }
    }
    return {
        nextDayAtMs: NEXT_DAY_AT,
        daysByPreset: new Map([[1, days]]),
        easyDaysByPreset: new Map([[1, parseEasyDays(easyDays)]]),
    };
}

describe('Anki random generator', () => {
    it('is deterministic per seed and draws floats in [0, 1)', () => {
        const seed = ankiCardSeed(1_790_000_000_000, 7);
        const first = new AnkiStdRng(seed);
        const second = new AnkiStdRng(seed);
        for (let index = 0; index < 200; index++) {
            const value = first.nextUnitF32();
            expect(value).toBe(second.nextUnitF32());
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('keeps integer draws inside the half-open range', () => {
        const rng = new AnkiStdRng(ankiCardSeed(42, 0));
        for (let index = 0; index < 500; index++) {
            const value = rng.rangeU32(600, 750);
            expect(value).toBeGreaterThanOrEqual(600);
            expect(value).toBeLessThan(750);
        }
    });

    it('never picks a zero-weight item and refuses an all-zero list', () => {
        const rng = new AnkiStdRng(ankiCardSeed(9, 3));
        for (let index = 0; index < 100; index++) {
            expect(ankiWeightedIndex([0, 1, 0], rng)).toBe(1);
        }
        expect(ankiWeightedIndex([0, 0], rng)).toBeNull();
        expect(ankiWeightedIndex([1, -1], rng)).toBeNull();
    });
});

describe('load balancer', () => {
    it('leaves intervals beyond 90 days, and presets with nothing due, to plain fuzz', () => {
        expect(loadBalancedInterval(state({ 95: 1 }), 91, 1, 36500, 1, 1n, null)).toBeNull();
        expect(loadBalancedInterval(state({ 10: 1 }), 10, 1, 36500, 2, 1n, null)).toBeNull();
        expect(LOAD_BALANCE_DAYS).toBe(99);
    });

    it('prefers an empty day inside the fuzz window over a busy one', () => {
        // A 10-day interval fuzzes over days 8-12; only day 11 is free.
        const busy = state({ 8: 30, 9: 30, 10: 30, 11: 0, 12: 30 });
        const picks = new Set<number>();
        for (let seed = 0n; seed < 40n; seed++) {
            picks.add(loadBalancedInterval(busy, 10, 1, 36500, 1, seed, null)!);
        }
        expect(picks).toEqual(new Set([11]));
    });

    it('treats a minimum easy day as nearly excluded and a reduced one as capped at half its share', () => {
        const days = [0, 1, 2, 3, 4, 5, 6];
        // Monday minimum, every other day normal: the minimum day's weight share is 0.0001.
        const minimum = easyDaysModifiers(parseEasyDays([0, 1, 1, 1, 1, 1, 1]), days, [5, 5, 5, 5, 5, 5, 5]);
        expect(minimum[0]).toBeCloseTo(0.0001, 6);
        expect(minimum.slice(1)).toEqual([1, 1, 1, 1, 1, 1]);
        // A reduced day stays open while it carries no more than half of an average day.
        const underShare = easyDaysModifiers(parseEasyDays([0.5, 1, 1, 1, 1, 1, 1]), days, [2, 5, 5, 5, 5, 5, 5]);
        const overShare = easyDaysModifiers(parseEasyDays([0.5, 1, 1, 1, 1, 1, 1]), days, [4, 5, 5, 5, 5, 5, 5]);
        expect(underShare[0]).toBe(1);
        expect(overShare[0]).toBeCloseTo(0.0001, 6);
    });

    it('weighs an empty day fully, whatever its easy-day setting', () => {
        const picked = selectWeightedInterval([
            { targetInterval: 8, reviewCount: 0, siblingModifier: 1, easyDaysModifier: 0.0001 },
            { targetInterval: 9, reviewCount: 50, siblingModifier: 1, easyDaysModifier: 1 },
        ], 5n);
        expect(picked).toBe(8);
    });

    it('steers a card away from a day that already holds a sibling when siblings are buried', () => {
        const withSibling = state({ 8: 1, 9: 1, 10: 1, 11: 1, 12: 1 });
        withSibling.daysByPreset.get(1)![10].noteIds.add(777);
        const picks = new Set<number>();
        for (let seed = 0n; seed < 60n; seed++) {
            picks.add(loadBalancedInterval(withSibling, 10, 1, 36500, 1, seed, 777)!);
        }
        expect(picks.has(10)).toBe(false);
    });
});
