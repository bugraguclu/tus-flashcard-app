import { describe, expect, it } from 'vitest';
import { ActiveElapsedTimer } from './activeElapsedTimer';

describe('ActiveElapsedTimer', () => {
    it('counts active time and excludes time spent in the background', () => {
        const timer = new ActiveElapsedTimer(1_000, true);

        timer.setActive(false, 4_000);
        expect(timer.elapsed(20_000)).toBe(3_000);

        timer.setActive(true, 20_000);
        expect(timer.elapsed(22_500)).toBe(5_500);
    });

    it('handles duplicate lifecycle events without double-counting', () => {
        const timer = new ActiveElapsedTimer(1_000, true);

        timer.setActive(true, 2_000);
        timer.setActive(false, 3_000);
        timer.setActive(false, 8_000);

        expect(timer.elapsed(9_000)).toBe(2_000);
    });

    it('resets for the next card even when it has the same card id', () => {
        const timer = new ActiveElapsedTimer(1_000, true);
        expect(timer.elapsed(6_000)).toBe(5_000);

        timer.reset(6_000, true);
        expect(timer.elapsed(7_500)).toBe(1_500);
    });

    it('never creates negative elapsed time when a clock moves backwards', () => {
        const timer = new ActiveElapsedTimer(5_000, true);
        timer.setActive(false, 4_000);
        expect(timer.elapsed(3_000)).toBe(0);
    });
});
