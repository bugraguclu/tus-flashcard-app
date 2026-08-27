import { describe, expect, it } from 'vitest';
import { TimeboxTracker } from './timebox';

describe('TimeboxTracker', () => {
    it('is disabled when the configured limit is zero', () => {
        const tracker = new TimeboxTracker(1_000);
        tracker.recordRepetition();

        expect(tracker.checkpoint(0, 3_601_000)).toBeNull();
    });

    it('checks only after the configured boundary has passed', () => {
        const tracker = new TimeboxTracker(1_000);
        tracker.recordRepetition();

        expect(tracker.checkpoint(5, 301_000)).toBeNull();
        expect(tracker.checkpoint(5, 301_001)).toEqual({ cards: 1, minutes: 5 });
    });

    it('reports the configured block length and every repetition in the block', () => {
        const tracker = new TimeboxTracker(10_000);
        tracker.recordRepetition();
        tracker.recordRepetition();
        tracker.recordRepetition();

        expect(tracker.checkpoint(10, 1_810_000)).toEqual({ cards: 3, minutes: 10 });
    });

    it('starts a clean block after Continue', () => {
        const tracker = new TimeboxTracker(0);
        tracker.recordRepetition();
        expect(tracker.checkpoint(1, 60_001)).toEqual({ cards: 1, minutes: 1 });

        tracker.reset(90_000);
        tracker.recordRepetition();
        tracker.recordRepetition();

        expect(tracker.checkpoint(1, 150_000)).toBeNull();
        expect(tracker.checkpoint(1, 150_001)).toEqual({ cards: 2, minutes: 1 });
    });

    it('does not reach the limit when the clock moves backwards', () => {
        const tracker = new TimeboxTracker(5_000);
        tracker.recordRepetition();

        expect(tracker.checkpoint(1, 4_000)).toBeNull();
    });
});
