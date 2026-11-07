import { describe, expect, it } from 'vitest';
import { MotionSpring } from '../constants/motion';
import {
    areaPreservingStretch,
    BADGE_START_SCALE,
    criticallyDampedSpring,
    cubicBezier,
    dampingRatio,
    easedWindow,
    EXIT_RATIO,
    exitDuration,
    keyframes,
    KNOB_STRETCH,
    MotionCurve,
    MotionDuration,
    POPOVER_START_SCALE,
    PRESS_SCALE,
    rubberBand,
    rubberBandClamp,
    STAGGER_STEP_MS,
    staggerDelay,
    staggeredDuration,
} from './motion';

describe('motion tokens', () => {
    it('keeps menus within 150–250 ms and every exit a fifth shorter than its entrance', () => {
        expect(MotionDuration.popover).toBeGreaterThanOrEqual(150);
        expect(MotionDuration.popover).toBeLessThanOrEqual(250);
        expect(EXIT_RATIO).toBe(0.8);
        expect(exitDuration(200)).toBe(160);
        expect(exitDuration(250)).toBe(200);
        expect(exitDuration(-5)).toBe(0);
    });

    it('grows popovers from 95% and sinks pressed buttons to 97%, never from or to nothing', () => {
        expect(POPOVER_START_SCALE).toBe(0.95);
        expect(PRESS_SCALE).toBe(0.97);
        expect(BADGE_START_SCALE).toBeGreaterThan(0.5);
        expect(BADGE_START_SCALE).toBeLessThan(POPOVER_START_SCALE);
    });

    it('eases entrances out (fast start) and on-screen moves in and out (slow at both ends)', () => {
        const [x1, y1, x2, y2] = MotionCurve.easeOut;
        // The first control point sits above the diagonal: the curve leaves quickly.
        expect(y1 / x1).toBeGreaterThan(1);
        expect(y2).toBe(1);
        expect(x2).toBeLessThan(1);
        const [ix1, iy1, ix2, iy2] = MotionCurve.easeInOut;
        expect(ix1).toBeGreaterThan(iy1);
        expect(ix2).toBeLessThan(iy2);
    });
});

describe('staggerDelay', () => {
    it('starts each row 30 ms after the one before and caps a long list', () => {
        expect(STAGGER_STEP_MS).toBe(30);
        expect([0, 1, 2, 3].map((index) => staggerDelay(index))).toEqual([0, 30, 60, 90]);
        expect(staggerDelay(40)).toBe(staggerDelay(6));
        expect(staggerDelay(-1)).toBe(0);
        expect(staggerDelay(2, 50)).toBe(100);
    });
});

describe('cubicBezier', () => {
    it('follows the CSS definition: linear stays linear, ease-out runs ahead and lands softly', () => {
        const linear = cubicBezier([0, 0, 1, 1]);
        for (const t of [0, 0.1, 0.5, 0.9, 1]) expect(linear(t)).toBeCloseTo(t, 5);
        const easeOut = cubicBezier(MotionCurve.easeOut);
        expect(easeOut(0)).toBe(0);
        expect(easeOut(1)).toBe(1);
        expect(easeOut(0.25)).toBeGreaterThan(0.6);
        expect(easeOut(0.5)).toBeGreaterThan(0.85);
        // The last fifth of the time covers only the last few percent: a soft landing.
        expect(1 - easeOut(0.8)).toBeLessThan(0.02);
        const samples = Array.from({ length: 51 }, (_, i) => easeOut(i / 50));
        for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    });

    it('is slow at both ends for moves', () => {
        const easeInOut = cubicBezier(MotionCurve.easeInOut);
        expect(easeInOut(0.1)).toBeLessThan(0.05);
        expect(easeInOut(0.5)).toBeGreaterThan(0.4);
        expect(easeInOut(0.5)).toBeLessThan(0.7);
        expect(easeInOut(0.9)).toBeGreaterThan(0.95);
    });
});

describe('easedWindow', () => {
    it('gives each staggered row its own slice of one clock, eased out within it', () => {
        // Three rows of 200 ms, 30 ms apart: the clock runs 260 ms.
        expect(staggeredDuration(3, 200)).toBe(260);
        expect(staggeredDuration(1, 200)).toBe(200);
        const windows = [0, 1, 2].map((index) => {
            const start = staggerDelay(index) / 260;
            return easedWindow(start, start + 200 / 260);
        });
        expect(windows.map((window) => window.inputRange[0])).toEqual([0, 30 / 260, 60 / 260]);
        expect(windows[2].inputRange.at(-1)).toBeCloseTo(1, 10);
        for (const { inputRange, outputRange } of windows) {
            expect(outputRange[0]).toBe(0);
            expect(outputRange.at(-1)).toBe(1);
            for (let i = 1; i < inputRange.length; i += 1) {
                expect(inputRange[i]).toBeGreaterThan(inputRange[i - 1]);
                expect(outputRange[i]).toBeGreaterThanOrEqual(outputRange[i - 1]);
            }
            // Halfway through its slice a row is most of the way in.
            expect(outputRange[outputRange.length >> 1]).toBeGreaterThan(0.85);
        }
    });

    it('keeps the range inside the clock and never zero-length', () => {
        const { inputRange } = easedWindow(0.9, 1.4, MotionCurve.easeOut, 4);
        expect(inputRange[0]).toBe(0.9);
        expect(inputRange.at(-1)).toBe(1);
        const degenerate = easedWindow(0.5, 0.5);
        expect(degenerate.inputRange.at(-1)).toBeGreaterThan(degenerate.inputRange[0]);
    });
});

describe('keyframes', () => {
    it('plays grow, hold and fade as one clock: each step lands on its value at its moment', () => {
        const { inputRange, outputRange } = keyframes(0, [
            { at: 0.3, value: 1 },
            { at: 0.75, value: 1 },
            { at: 1, value: 0 },
        ]);
        for (let i = 1; i < inputRange.length; i += 1) expect(inputRange[i]).toBeGreaterThan(inputRange[i - 1]);
        expect([inputRange[0], outputRange[0]]).toEqual([0, 0]);
        const at = (input: number) => outputRange[inputRange.findIndex((value) => Math.abs(value - input) < 1e-9)];
        expect(at(0.3)).toBe(1);
        expect(at(0.75)).toBe(1);
        expect(at(1)).toBe(0);
        // The hold is a single flat step, not eight.
        expect(inputRange.filter((value) => value > 0.3 && value <= 0.75)).toEqual([0.75]);
        // Eased: a third of the way into the growth it is already more than half grown.
        expect(outputRange[inputRange.findIndex((value) => value > 0.1)]).toBeGreaterThan(0.5);
    });

    it('holds the last value to the end of the clock and ignores steps past it', () => {
        const pulse = keyframes(1, [{ at: 0.4, value: 1.06 }]);
        expect(pulse.inputRange.at(-1)).toBe(1);
        expect(pulse.outputRange.at(-1)).toBeCloseTo(1.06, 10);
        const clipped = keyframes(0, [{ at: 1, value: 1 }, { at: 1.5, value: 0 }]);
        expect(clipped.inputRange.at(-1)).toBe(1);
        expect(clipped.outputRange.at(-1)).toBe(1);
    });
});

describe('rubberBand', () => {
    it('follows the finger at first, gives less and less, and never passes the limit', () => {
        expect(rubberBand(0, 100)).toBe(0);
        const travels = [5, 20, 80, 320, 5000].map((overshoot) => rubberBand(overshoot, 100));
        for (let i = 1; i < travels.length; i += 1) expect(travels[i]).toBeGreaterThan(travels[i - 1]);
        expect(travels.at(-1)).toBeLessThan(100);
        // Each further 60 pt of pull moves it less than the 60 pt before.
        const step = (from: number) => rubberBand(from + 60, 100) - rubberBand(from, 100);
        expect(step(60)).toBeLessThan(step(0));
        expect(step(300)).toBeLessThan(step(60));
        // Near the edge it moves at a little over half the finger's speed, as a UIKit scroll view does.
        expect(rubberBand(1, 100)).toBeCloseTo(0.55, 2);
    });

    it('works the same way in both directions and ignores nonsense input', () => {
        expect(rubberBand(-40, 100)).toBeCloseTo(-rubberBand(40, 100));
        expect(rubberBand(40, 0)).toBe(0);
        expect(rubberBand(Number.NaN, 100)).toBe(0);
    });

    it('clamps a value into its range with a give past either end', () => {
        expect(rubberBandClamp(50, 0, 300, 13)).toBe(50);
        const over = rubberBandClamp(400, 0, 300, 13);
        expect(over).toBeGreaterThan(300);
        expect(over).toBeLessThan(313);
        const under = rubberBandClamp(-400, 0, 300, 13);
        expect(under).toBeLessThan(0);
        expect(under).toBeGreaterThan(-13);
    });
});

describe('springs', () => {
    it('settles everyday controls without overshoot: critical damping', () => {
        const spring = criticallyDampedSpring(420);
        expect(dampingRatio(spring)).toBeCloseTo(1, 10);
        expect(spring.overshootClamping).toBe(true);
        expect(dampingRatio(criticallyDampedSpring(260, 0.8))).toBeCloseTo(1, 10);
        for (const config of Object.values(MotionSpring)) expect(dampingRatio(config)).toBeCloseTo(1, 10);
    });

    it('recognises the bouncy springs it replaced', () => {
        // The card options panel used damping 24 for stiffness 260 and mass 0.8: it overshot.
        expect(dampingRatio({ stiffness: 260, damping: 24, mass: 0.8 })).toBeLessThan(1);
    });
});

describe('areaPreservingStretch', () => {
    it('widens a knob by 12% and narrows it to keep its area', () => {
        const { scaleX, scaleY } = areaPreservingStretch(KNOB_STRETCH);
        expect(scaleX).toBeCloseTo(1.12);
        expect(scaleX * scaleY).toBeCloseTo(1);
        expect(areaPreservingStretch(-1)).toEqual({ scaleX: 1, scaleY: 1 });
    });
});
