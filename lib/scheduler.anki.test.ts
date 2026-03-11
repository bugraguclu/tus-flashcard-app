import { describe, it, expect } from 'vitest';
import { getScheduler, formatMinutes, formatDays } from './scheduler';
import type { AppSettings, CardState, Grade } from './types';

const defaultSettings: AppSettings = {
    dailyNewLimit: 20,
    learningSteps: [1, 10],
    lapseSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseNewInterval: 0.7,
    algorithm: 'ANKI_V3',
    desiredRetention: 0.9,
};

function makeNewCard(): CardState {
    return {
        interval: 0,
        repetition: 0,
        dueDate: '2026-03-11',
        dueTime: 0,
        status: 'new',
        suspended: false,
        buried: false,
        easeFactor: 2.5,
        learningStep: 0,
        relearningStep: -1,
        lastReviewedAtMs: 0,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        lapses: 0,
    };
}

function makeReviewCard(overrides: Partial<CardState> = {}): CardState {
    return {
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
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        lapses: 0,
        ...overrides,
    };
}

const engine = getScheduler('ANKI_V3');

describe('ANKI_V3 scheduler', () => {
    it('uses configured learning steps for new card Again', () => {
        const result = engine.schedule(makeNewCard(), 1 as Grade, defaultSettings);
        expect(result.isLearning).toBe(true);
        expect(result.minutesUntilDue).toBe(1);
        expect(result.stateUpdates.learningStep).toBe(0);
    });

    it('graduates new card after final learning step on Good', () => {
        const card = { ...makeNewCard(), status: 'learning' as const, learningStep: 1 };
        const result = engine.schedule(card, 3 as Grade, defaultSettings);

        expect(result.isLearning).toBe(false);
        expect(result.interval).toBe(1);
        expect(result.stateUpdates.status).toBe('review');
        expect(result.stateUpdates.learningStep).toBe(-1);
    });

    it('uses lapseNewInterval and lapseSteps on review Again', () => {
        const card = makeReviewCard({ interval: 20 });
        const result = engine.schedule(card, 1 as Grade, defaultSettings);

        expect(result.isLearning).toBe(true);
        expect(result.minutesUntilDue).toBe(10); // lapseSteps[0]
        expect(result.stateUpdates.interval).toBe(14); // 20 * 0.7
        expect(result.stateUpdates.relearningStep).toBe(0);
        expect(result.stateUpdates.lapses).toBe(1);
    });

    it('uses lapseSteps (not learningSteps) during relearning', () => {
        const card = makeReviewCard({
            status: 'learning',
            learningStep: -1,
            relearningStep: 0,
            interval: 7,
        });

        const resultAgain = engine.schedule(card, 1 as Grade, defaultSettings);
        expect(resultAgain.minutesUntilDue).toBe(10);

        const resultGood = engine.schedule(card, 3 as Grade, defaultSettings);
        expect(resultGood.isLearning).toBe(false);
        expect(resultGood.stateUpdates.status).toBe('review');
        expect(resultGood.stateUpdates.interval).toBe(7);
    });

    it('keeps review interval ordering hard < good < easy', () => {
        const card = makeReviewCard({ interval: 12, easeFactor: 2.3 });
        const hard = engine.schedule(card, 2 as Grade, defaultSettings).interval;
        const good = engine.schedule(card, 3 as Grade, defaultSettings).interval;
        const easy = engine.schedule(card, 4 as Grade, defaultSettings).interval;

        expect(hard).toBeGreaterThan(0);
        expect(good).toBeGreaterThan(hard);
        expect(easy).toBeGreaterThan(good);
    });

    it('never drops ease below 1.3', () => {
        const card = makeReviewCard({ easeFactor: 1.3 });
        const result = engine.schedule(card, 1 as Grade, defaultSettings);
        expect(result.stateUpdates.easeFactor).toBe(1.3);
    });

    it('preview uses relearning step durations', () => {
        const card = makeReviewCard({
            status: 'learning',
            learningStep: -1,
            relearningStep: 0,
            interval: 9,
        });
        const preview = engine.previewIntervals(card, defaultSettings);
        expect(preview.again).toBe('10dk');
        expect(preview.good).toContain('g');
    });

    it('formats minutes and days for button labels', () => {
        expect(formatMinutes(5)).toBe('5dk');
        expect(formatMinutes(90)).toBe('2sa');
        expect(formatDays(14)).toContain('14');
    });
});
