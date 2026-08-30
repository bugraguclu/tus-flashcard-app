import { describe, expect, it } from 'vitest';
import {
    MotionDuration,
    MotionSpring,
    resolveDuration,
    resolveDurationToken,
    resolveSpring,
    shouldAnimate,
} from './motion';

describe('resolveDuration', () => {
    it('keeps the base duration when reduced motion is off', () => {
        expect(resolveDuration(220, false)).toBe(220);
    });

    it('collapses to an instant transition when reduced motion is on', () => {
        expect(resolveDuration(220, true)).toBe(0);
    });

    it('never returns a negative or non-finite duration', () => {
        expect(resolveDuration(-40, false)).toBe(0);
        expect(resolveDuration(Number.NaN, false)).toBe(0);
        expect(resolveDuration(Number.POSITIVE_INFINITY, false)).toBe(0);
    });
});

describe('resolveDurationToken', () => {
    it('resolves every token to its declared duration', () => {
        for (const token of Object.keys(MotionDuration) as (keyof typeof MotionDuration)[]) {
            expect(resolveDurationToken(token, false)).toBe(MotionDuration[token]);
        }
    });

    it('zeroes every token under reduced motion', () => {
        for (const token of Object.keys(MotionDuration) as (keyof typeof MotionDuration)[]) {
            expect(resolveDurationToken(token, true)).toBe(0);
        }
    });
});

describe('shouldAnimate', () => {
    it('mirrors the reduced-motion flag', () => {
        expect(shouldAnimate(false)).toBe(true);
        expect(shouldAnimate(true)).toBe(false);
    });
});

describe('resolveSpring', () => {
    it('returns the config untouched when motion is allowed', () => {
        expect(resolveSpring(MotionSpring.panel, false)).toBe(MotionSpring.panel);
    });

    it('returns null under reduced motion so callers fall back to an instant transition', () => {
        expect(resolveSpring(MotionSpring.panel, true)).toBeNull();
        expect(resolveSpring(MotionSpring.lift, true)).toBeNull();
    });
});

describe('motion tokens', () => {
    it('declares only positive durations', () => {
        for (const value of Object.values(MotionDuration)) {
            expect(value).toBeGreaterThan(0);
        }
    });
});
