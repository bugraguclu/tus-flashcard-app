// Behaviour ported from Anki's own unit tests, so divergences show up here rather than in study
// sessions: rslib/src/scheduler/states/review.rs (leech_threshold, extreme_multiplier_fuzz,
// low_hard_multiplier_does_not_pull_good_down), states/steps.rs (delay_secs, rounding_days),
// states/fuzz.rs (with_review_fuzz) and states/mod.rs (min_and_max_review_intervals).

import { describe, it, expect, vi } from 'vitest';
import type { AppSettings, CardState } from './types';

vi.mock('./db', () => ({
    getDB: () => ({ getFirstSync: () => null, runSync: () => undefined, getAllSync: () => [] }),
    buildFtsPrefixQuery: (q: string) => q,
    dbUpsertFtsCard: () => undefined,
}));

import {
    getScheduler,
    withReviewFuzz,
    minAndMaxReviewIntervals,
    learningDelayWithFuzz,
} from './scheduler';
import { isLeech } from './noteManager';
import type { AnkiCard } from './models';

const scheduler = getScheduler('ANKI_V3');

const baseSettings: AppSettings = {
    language: 'system',
    themeMode: 'system',
    keyBindings: { showAnswer: ' ', again: '1', hard: '2', good: '3', easy: '4', replayAudio: 'r', buryCard: '-', suspendCard: '@', markNote: '*' },
    autoAdvance: false,
    interruptAudioOnAnswer: true,
    showRemainingCount: true,
    showNextReviewTimes: true,
    dailyNewLimit: 20,
    dailyReviewLimit: 200,
    learningSteps: [1, 10],
    lapseSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseIntervalMultiplier: 0,
    minLapseInterval: 1,
    queueOrder: 'after',
    newCardOrder: 'sequential',
    newCardGatherOrder: 'topic',
    reviewSortOrder: 'dueRandom',
    autoPlayAudio: true,
    easyDays: [1, 1, 1, 1, 1, 1, 1],
    hardIntervalMultiplier: 1.2,
    easyBonus: 1.3,
    intervalModifier: 1.0,
    maxInterval: 36500,
    dayRolloverHour: 4,
    learnAheadMinutes: 0,
    algorithm: 'ANKI_V3',
};

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
    return { ...baseSettings, ...overrides };
}

function reviewCard(overrides: Partial<CardState> = {}): CardState {
    return {
        cardId: 1,
        interval: 10,
        repetition: 4,
        dueDate: '2026-03-11',
        dueTime: 0,
        status: 'review',
        suspended: false,
        buried: false,
        easeFactor: 2.5,
        learningStep: -1,
        relearningStep: -1,
        lastReviewedAtMs: Date.now() - 10 * 86400000,
        elapsedDays: 10,
        lapses: 0,
        ...overrides,
    };
}

function learningCard(overrides: Partial<CardState> = {}): CardState {
    return reviewCard({ status: 'learning', interval: 0, learningStep: 0, ...overrides });
}

function card(lapses: number): AnkiCard {
    return {
        id: 1, noteId: 1, deckId: 1, ord: 0, mod: 0, usn: -1, type: 2, queue: 2,
        due: 0, ivl: 10, factor: 2500, reps: 5, lapses, left: 0, odue: 0, odid: 0,
        flags: 0, lastReview: 0,
    };
}

// Ported from `leech_threshold` in rslib/src/scheduler/states/review.rs.
describe('isLeech', () => {
    it('fires at the threshold and every half threshold after, rounding the half up', () => {
        expect([0, 1, 2, 3, 4, 5, 6, 7].map((n) => isLeech(card(n), 3)))
            .toEqual([false, false, false, true, false, true, false, true]);
    });

    it('handles an even threshold', () => {
        expect([7, 8, 9, 10, 11, 12, 13].map((n) => isLeech(card(n), 8)))
            .toEqual([false, true, false, false, false, true, false]);
    });

    it('treats a zero threshold as off', () => {
        expect(isLeech(card(0), 0)).toBe(false);
        expect(isLeech(card(9), 0)).toBe(false);
    });

    it('never divides by zero: half of one is one', () => {
        expect([0, 1, 2, 3].map((n) => isLeech(card(n), 1)))
            .toEqual([false, true, true, true]);
    });
});

// Ported from `extreme_multiplier_fuzz` and `low_hard_multiplier_does_not_pull_good_down`.
describe('review intervals stay inside Anki\u2019s bounds', () => {
    it('respects the maximum interval no matter how large the multiplier', () => {
        const config = settings({ intervalModifier: 10, maxInterval: 5, easyBonus: 1.3 });
        const state = reviewCard({ interval: 1, easeFactor: 1.3, elapsedDays: 1 });
        const preview = scheduler.previewIntervals(state, config);
        for (const label of [preview.hard, preview.good, preview.easy]) {
            expect(label).toBe('5 gün');
        }
    });

    it('keeps a shrinking hard interval at one day rather than zero', () => {
        const config = settings({ hardIntervalMultiplier: 0.1 });
        const state = reviewCard({ interval: 2, easeFactor: 1.3, elapsedDays: 2 });
        expect(scheduler.previewIntervals(state, config).hard).toBe('1 gün');
    });
});

// Ported from `delay_secs` in rslib/src/scheduler/states/steps.rs.
describe('hard delay on the first learning step', () => {
    it('averages the first two steps without rounding away the half minute', () => {
        const preview = scheduler.previewIntervals(learningCard(), settings({ learningSteps: [1, 10] }));
        expect(preview.hardMinutes).toBe(5.5);
    });

    it('is 50% above the again delay when there is no second step', () => {
        const preview = scheduler.previewIntervals(learningCard(), settings({ learningSteps: [1] }));
        expect(preview.hardMinutes).toBe(1.5);
    });

    it('adds at most one day to the again delay', () => {
        const threeDays = 3 * 1440;
        const preview = scheduler.previewIntervals(learningCard(), settings({ learningSteps: [threeDays] }));
        expect(preview.hardMinutes).toBe(4 * 1440);
    });
});

// With no steps configured, every Anki button graduates the card (states/learning.rs).
describe('empty learning steps graduate the card', () => {
    it('graduates on Again instead of looping in learning', () => {
        const result = scheduler.schedule(learningCard(), 1, settings({ learningSteps: [] }));
        expect(result.isLearning).toBe(false);
        expect(result.interval).toBe(1);
        expect(result.stateUpdates.status).toBe('review');
    });

    it('graduates on Hard instead of looping in learning', () => {
        const result = scheduler.schedule(learningCard(), 2, settings({ learningSteps: [] }));
        expect(result.isLearning).toBe(false);
        expect(result.interval).toBe(1);
    });

    it('graduates a relearning card whose steps were removed', () => {
        const relearning = reviewCard({ status: 'learning', learningStep: -1, relearningStep: 0, interval: 12 });
        const result = scheduler.schedule(relearning, 1, settings({ lapseSteps: [], minLapseInterval: 1 }));
        expect(result.isLearning).toBe(false);
        expect(result.stateUpdates.status).toBe('review');
    });
});

// Ported from `with_review_fuzz` in rslib/src/scheduler/states/fuzz.rs. Anki's own table drives
// the fuzz factor to the bottom, middle and top of the range, which pins the bounds exactly.
describe('review fuzz bounds', () => {
    function lowerMiddleUpper(interval: number, minimum: number, maximum: number) {
        return [0.0, 0.5, 0.99].map((factor) => withReviewFuzz(factor, interval, minimum, maximum));
    }

    it('rounds and clamps when there is no fuzz factor', () => {
        expect(withReviewFuzz(null, 1.5, 1, 100)).toBe(2);
        expect(withReviewFuzz(null, 0.1, 1, 100)).toBe(1);
        expect(withReviewFuzz(null, 101.0, 1, 100)).toBe(100);
    });

    it('leaves intervals under 2.5 days alone', () => {
        expect(lowerMiddleUpper(1.0, 1, 1000)).toEqual([1, 1, 1]);
        expect(lowerMiddleUpper(2.49, 1, 1000)).toEqual([2, 2, 2]);
    });

    it('spreads a day from 2.5, then 0.15/0.1/0.05 per day in each range', () => {
        expect(lowerMiddleUpper(2.5, 1, 1000)).toEqual([2, 3, 4]);
        expect(lowerMiddleUpper(7.0, 1, 1000)).toEqual([5, 7, 9]);
        expect(lowerMiddleUpper(17.0, 1, 1000)).toEqual([14, 17, 20]);
        expect(lowerMiddleUpper(37.0, 1, 1000)).toEqual([33, 37, 41]);
    });

    it('widens a collapsed range only when the minimum allows it', () => {
        expect(lowerMiddleUpper(2.0, 2, 1000)).toEqual([2, 2, 2]);
        expect(lowerMiddleUpper(2.0, 3, 1000)).toEqual([3, 4, 4]);
        expect(lowerMiddleUpper(2.0, 3, 3)).toEqual([3, 3, 3]);
    });

    it('does not jump at the range transitions', () => {
        expect(lowerMiddleUpper(6.9, 3, 1000)).toEqual([5, 7, 9]);
        expect(lowerMiddleUpper(7.0, 3, 1000)).toEqual([5, 7, 9]);
        expect(lowerMiddleUpper(7.1, 3, 1000)).toEqual([5, 7, 9]);
        expect(lowerMiddleUpper(19.9, 3, 1000)).toEqual([17, 20, 23]);
        expect(lowerMiddleUpper(20.0, 3, 1000)).toEqual([17, 20, 23]);
        expect(lowerMiddleUpper(20.1, 3, 1000)).toEqual([17, 20, 23]);
    });

    it('keeps the spread uniform after the limits cut into it', () => {
        expect(lowerMiddleUpper(100.0, 101, 1000)).toEqual([101, 105, 108]);
        expect(lowerMiddleUpper(100.0, 1, 99)).toEqual([92, 96, 99]);
        expect(lowerMiddleUpper(100.0, 97, 103)).toEqual([97, 100, 103]);
    });
});

// Ported from `min_and_max_review_intervals` in rslib/src/scheduler/states/mod.rs.
describe('review interval bounds', () => {
    it('never returns a maximum below a day', () => {
        const config = settings({ maxInterval: 0 });
        expect(minAndMaxReviewIntervals(config, 0)).toEqual([1, 1]);
        expect(minAndMaxReviewIntervals(config, 2)).toEqual([1, 1]);
    });

    it('holds the minimum between one day and the maximum', () => {
        const config = settings({ maxInterval: 3 });
        expect(minAndMaxReviewIntervals(config, 0)).toEqual([1, 3]);
        expect(minAndMaxReviewIntervals(config, 2)).toEqual([2, 3]);
        expect(minAndMaxReviewIntervals(config, 4)).toEqual([3, 3]);
    });
});

// The graduating and easy intervals go through the same fuzz as any other review interval
// (states/learning.rs `answer_good` / `answer_easy`), and a one-day interval is never fuzzed.
describe('graduating from learning', () => {
    it('schedules a one-day graduating interval exactly, with no fuzz', () => {
        const config = settings({ learningSteps: [1], graduatingInterval: 1 });
        const card = learningCard({ learningStep: 0 });
        expect(scheduler.schedule(card, 3, config).interval).toBe(1);
    });

    it('picks the easy interval out of Anki\u2019s fuzz range', () => {
        const config = settings({ easyInterval: 4 });
        const interval = scheduler.schedule(learningCard(), 4, config).interval;
        expect(interval).toBeGreaterThanOrEqual(3);
        expect(interval).toBeLessThanOrEqual(5);
    });

    it('enters review as a fresh card, with the lapse count back at zero', () => {
        const card = learningCard({ learningStep: 0, lapses: 3 });
        const result = scheduler.schedule(card, 4, settings());
        expect(result.stateUpdates.lapses).toBe(0);
        expect(result.stateUpdates.easeFactor).toBe(baseSettings.startingEase);
    });
});

// Anki counts every answer, not only the ones that leave the learning steps
// (rslib answering/mod.rs `apply_normal_study_state`).
describe('review count', () => {
    it('rises on a learning step, a relearning step and a review alike', () => {
        const onStep = scheduler.schedule(learningCard({ repetition: 4 }), 3, settings());
        expect(onStep.stateUpdates.repetition).toBe(5);

        const relearning = reviewCard({ status: 'learning', learningStep: -1, relearningStep: 0, repetition: 4 });
        expect(scheduler.schedule(relearning, 1, settings()).stateUpdates.repetition).toBe(5);

        expect(scheduler.schedule(reviewCard({ repetition: 4 }), 3, settings()).stateUpdates.repetition).toBe(5);
    });
});

// Ported from `answer_again` / `answer_easy` in rslib/src/scheduler/states/relearning.rs.
describe('relearning', () => {
    it('re-applies the lapse multiplier when Again sends the card back to the first step', () => {
        const config = settings({ lapseSteps: [10], lapseIntervalMultiplier: 0.5, minLapseInterval: 1 });
        const relearning = reviewCard({
            status: 'learning', learningStep: -1, relearningStep: 0, interval: 20,
        });
        const result = scheduler.schedule(relearning, 1, config);

        expect(result.isLearning).toBe(true);
        // 20 * 0.5 = 10 days, fuzzed within Anki's range for 10.
        expect(result.stateUpdates.interval).toBeGreaterThanOrEqual(8);
        expect(result.stateUpdates.interval).toBeLessThanOrEqual(12);
    });

    it('leaves the interval alone when there is no step to go back to', () => {
        const config = settings({ lapseSteps: [], lapseIntervalMultiplier: 0.5 });
        const relearning = reviewCard({
            status: 'learning', learningStep: -1, relearningStep: 0, interval: 20,
        });
        const result = scheduler.schedule(relearning, 1, config);

        expect(result.isLearning).toBe(false);
        expect(result.stateUpdates.interval).toBe(20);
    });

    it('graduates Easy on the interval it already carries, plus a day', () => {
        const relearning = reviewCard({
            status: 'learning', learningStep: -1, relearningStep: 0, interval: 12,
        });
        const result = scheduler.schedule(relearning, 4, settings({ minLapseInterval: 5 }));

        expect(result.interval).toBe(13);
        expect(result.stateUpdates.status).toBe('review');
    });
});

// Ported from `learning_ivl_with_fuzz` in rslib/src/scheduler/answering/learning.rs.
describe('intraday step fuzz', () => {
    it('adds up to a quarter of the step', () => {
        for (const cardId of [1, 2, 3, 4, 5]) {
            const delay = learningDelayWithFuzz(600, cardId, 0);
            expect(delay).toBeGreaterThanOrEqual(600);
            expect(delay).toBeLessThan(750);
        }
    });

    it('never adds more than five minutes', () => {
        const delay = learningDelayWithFuzz(4 * 3600, 1, 0);
        expect(delay).toBeGreaterThanOrEqual(4 * 3600);
        expect(delay).toBeLessThan(4 * 3600 + 300);
    });

    it('leaves a step too short to fuzz untouched', () => {
        // A quarter of three seconds floors to nothing, so there is no range to draw from.
        expect(learningDelayWithFuzz(3, 1, 0)).toBe(3);
        expect(learningDelayWithFuzz(0, 1, 0)).toBe(0);
    });
});
