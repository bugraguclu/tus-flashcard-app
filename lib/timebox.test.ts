import { describe, expect, it, vi } from 'vitest';
import { TimeboxTracker, checkTimeboxAfterAnswer } from './timebox';

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

// The reviewer's check after an answer. The answer's own bookkeeping (a study-ahead card leaving its
// one-shot pass) must hold when the learner chooses Finish at the checkpoint, or the card is dealt
// again ahead of its step on the next visit.
describe('checkTimeboxAfterAnswer', () => {
    it('completes the answer before asking, and Finish keeps it', async () => {
        const tracker = new TimeboxTracker(0);
        const order: string[] = [];
        const keepStudying = await checkTimeboxAfterAnswer({
            tracker,
            limitMinutes: 1,
            completeRepetition: () => order.push('complete'),
            ask: async (checkpoint) => {
                order.push(`ask ${checkpoint.cards}`);
                return false;
            },
            now: () => 60_001,
        });
        expect(keepStudying).toBe(false);
        expect(order).toEqual(['complete', 'ask 1']);
    });

    it('Continue starts a new block', async () => {
        const tracker = new TimeboxTracker(0);
        const completeRepetition = vi.fn();
        const ask = vi.fn(async () => true);
        expect(await checkTimeboxAfterAnswer({ tracker, limitMinutes: 1, completeRepetition, ask, now: () => 60_001 })).toBe(true);
        expect(completeRepetition).toHaveBeenCalledTimes(1);
        expect(tracker.checkpoint(1, 120_001)).toBeNull();
        expect(tracker.checkpoint(1, 120_002)).toEqual({ cards: 0, minutes: 1 });
    });

    it('asks nothing inside the block or with Timebox off', async () => {
        const ask = vi.fn(async () => false);
        const completeRepetition = vi.fn();
        expect(await checkTimeboxAfterAnswer({ tracker: new TimeboxTracker(0), limitMinutes: 1, completeRepetition, ask, now: () => 30_000 })).toBe(true);
        expect(await checkTimeboxAfterAnswer({ tracker: new TimeboxTracker(0), limitMinutes: 0, completeRepetition, ask, now: () => 3_600_000 })).toBe(true);
        expect(ask).not.toHaveBeenCalled();
        expect(completeRepetition).toHaveBeenCalledTimes(2);
    });
});
