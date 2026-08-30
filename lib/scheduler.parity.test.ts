// Behaviour ported from Anki's own unit tests, so divergences show up here rather than in study
// sessions: rslib/src/scheduler/states/review.rs (leech_threshold, extreme_multiplier_fuzz,
// low_hard_multiplier_does_not_pull_good_down) and states/steps.rs (delay_secs).

import { describe, it, expect, vi } from 'vitest';
import type { AppSettings, CardState } from './types';

vi.mock('./db', () => ({
    getDB: () => ({ getFirstSync: () => null, runSync: () => undefined, getAllSync: () => [] }),
    buildFtsPrefixQuery: (q: string) => q,
    dbUpsertFtsCard: () => undefined,
}));

import { getScheduler } from './scheduler';
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
