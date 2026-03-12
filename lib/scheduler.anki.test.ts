import { describe, it, expect } from 'vitest';
import { getScheduler, formatMinutes, formatDays } from './scheduler';
import type { AppSettings, CardState, Grade } from './types';

const defaultSettings: AppSettings = {
    dailyNewLimit: 20,
    dailyReviewLimit: 200,
    learningSteps: [1, 10],
    lapseSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseNewInterval: 0.7,
    queueOrder: 'learning-review-new',
    newCardOrder: 'sequential',
    hardIntervalMultiplier: 1.2,
    easyBonus: 1.3,
    intervalModifier: 1.0,
    maxInterval: 36500,
    dayRolloverHour: 4,
    algorithm: 'ANKI_V3',
    desiredRetention: 0.9,
};

function makeNewCard(): CardState {
    return {
        cardId: 101,
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
        cardId: 202,
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

    it('relearning Easy graduates to a larger interval than Good', () => {
        const card = makeReviewCard({
            status: 'learning',
            learningStep: -1,
            relearningStep: 0,
            interval: 10,
        });

        const now = new Date(2026, 2, 12, 12, 0, 0, 0).getTime();
        const good = engine.schedule(card, 3 as Grade, defaultSettings, now).interval;
        const easy = engine.schedule(card, 4 as Grade, defaultSettings, now).interval;

        expect(easy).toBeGreaterThan(good);
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

    it('does not apply intervalModifier on Hard, but applies it on Good/Easy', () => {
        const card = makeReviewCard({ interval: 20, easeFactor: 2.5, cardId: 314 });
        const lowModifier = { ...defaultSettings, intervalModifier: 0.5, hardIntervalMultiplier: 1.2 };
        const neutralModifier = { ...defaultSettings, intervalModifier: 1.0, hardIntervalMultiplier: 1.2 };

        const now = new Date(2026, 2, 12, 12, 0, 0, 0).getTime();

        const hardWithLowModifier = engine.schedule(card, 2 as Grade, lowModifier, now).interval;
        const hardWithNeutralModifier = engine.schedule(card, 2 as Grade, neutralModifier, now).interval;
        const goodWithLowModifier = engine.schedule(card, 3 as Grade, lowModifier, now).interval;
        const goodWithNeutralModifier = engine.schedule(card, 3 as Grade, neutralModifier, now).interval;

        expect(hardWithLowModifier).toBe(hardWithNeutralModifier);
        expect(goodWithLowModifier).toBeLessThan(goodWithNeutralModifier);
    });

    it('uses deterministic fuzz based on study day + card id', () => {
        const baseCard = makeReviewCard({ interval: 30, easeFactor: 2.5, cardId: 42 });
        const now = new Date(2026, 2, 12, 13, 0, 0, 0).getTime();

        const first = engine.schedule(baseCard, 3 as Grade, defaultSettings, now).interval;
        const second = engine.schedule(baseCard, 3 as Grade, defaultSettings, now + 60_000).interval;
        expect(first).toBe(second);

        const differentCards = [77, 78, 79].map((cardId) => (
            engine.schedule({ ...baseCard, cardId }, 3 as Grade, defaultSettings, now).interval
        ));
        const nextDay = engine.schedule(baseCard, 3 as Grade, defaultSettings, now + 24 * 3600 * 1000).interval;

        expect(differentCards.some((value) => value !== first)).toBe(true);
        expect(nextDay).not.toBe(first);
    });

    it('never drops ease below 1.3', () => {
        const card = makeReviewCard({ easeFactor: 1.3 });
        const result = engine.schedule(card, 1 as Grade, defaultSettings);
        expect(result.stateUpdates.easeFactor).toBe(1.3);
    });

    it('tracks elapsedDays from previous review at answer time', () => {
        const now = new Date(2026, 2, 12, 12, 0, 0, 0).getTime();
        const lastReview = now - 3 * 86400000;
        const card = makeReviewCard({ lastReviewedAtMs: lastReview, cardId: 333 });

        const result = engine.schedule(card, 3 as Grade, defaultSettings, now);
        expect(result.stateUpdates.elapsedDays).toBe(3);
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
