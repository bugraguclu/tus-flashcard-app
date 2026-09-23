import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RepeatPressController } from './repeatPress';

describe('RepeatPressController', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('triggers onTick exactly once on a quick tap release', () => {
        let count = 0;
        const controller = new RepeatPressController(() => { count++; });

        controller.onPressIn();
        vi.advanceTimersByTime(100);
        controller.onPressOut();
        controller.onPress();

        expect(count).toBe(1);
        expect(controller.repeating).toBe(false);
    });

    it('does not repeat before initialDelayMs is reached', () => {
        let count = 0;
        const controller = new RepeatPressController(() => { count++; }, {
            initialDelayMs: 400,
        });

        controller.onPressIn();
        vi.advanceTimersByTime(399);
        expect(count).toBe(0);
        expect(controller.repeating).toBe(false);

        controller.onPressOut();
        controller.onPress();
        expect(count).toBe(1);
    });

    it('starts repeating after initialDelayMs and accelerates', () => {
        let count = 0;
        const controller = new RepeatPressController(() => { count++; }, {
            initialDelayMs: 400,
            intervalMs: 80,
            accelerationFactor: 0.9,
            minIntervalMs: 40,
        });

        controller.onPressIn();

        // At 400ms: first repeat tick
        vi.advanceTimersByTime(400);
        expect(count).toBe(1);
        expect(controller.repeating).toBe(true);

        // Next tick: 80 * 0.9 = 72ms
        vi.advanceTimersByTime(72);
        expect(count).toBe(2);

        // Next tick: 72 * 0.9 = 65ms (rounded)
        vi.advanceTimersByTime(65);
        expect(count).toBe(3);

        // Next tick: 65 * 0.9 = 59ms (rounded)
        vi.advanceTimersByTime(59);
        expect(count).toBe(4);

        // Releasing touch
        controller.onPressOut();
        controller.onPress();

        // Should not fire an extra tick on release
        expect(count).toBe(4);
        expect(controller.repeating).toBe(false);
    });

    it('clamps the minimum interval to minIntervalMs', () => {
        let count = 0;
        const controller = new RepeatPressController(() => { count++; }, {
            initialDelayMs: 100,
            intervalMs: 50,
            accelerationFactor: 0.5,
            minIntervalMs: 30,
        });

        controller.onPressIn();
        vi.advanceTimersByTime(100); // count = 1, next interval: max(30, 25) = 30
        expect(count).toBe(1);

        vi.advanceTimersByTime(29);
        expect(count).toBe(1);

        vi.advanceTimersByTime(1);
        expect(count).toBe(2); // count = 2 at 30ms

        vi.advanceTimersByTime(30);
        expect(count).toBe(3); // count = 3 at another 30ms

        controller.onPressOut();
        controller.onPress();
        expect(count).toBe(3);
    });

    it('cancels repeating when touch is cancelled without onPress', () => {
        let count = 0;
        const controller = new RepeatPressController(() => { count++; }, {
            initialDelayMs: 200,
            intervalMs: 50,
        });

        controller.onPressIn();
        vi.advanceTimersByTime(200);
        expect(count).toBe(1);

        // Cancel touch (e.g. gesture was cancelled or finger dragged away)
        controller.onPressOut();

        // Additional time passes
        vi.advanceTimersByTime(500);
        expect(count).toBe(1);
    });

    it('stop() cleanly terminates any pending timers', () => {
        let count = 0;
        const controller = new RepeatPressController(() => { count++; }, {
            initialDelayMs: 200,
        });

        controller.onPressIn();
        controller.stop();

        vi.advanceTimersByTime(500);
        expect(count).toBe(0);
    });
});
