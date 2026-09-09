import { describe, expect, it } from 'vitest';
import {
    deckOptionsWarnings,
    isDeckOptionFieldVisible,
    resolveReviewSortOrderForScheduler,
    reviewSortOrderChoices,
    type DeckOptionsWarningInput,
} from './deckOptionsRules';

describe('which deck options each scheduler shows', () => {
    it('hides the classic scheduler’s multipliers once FSRS is on', () => {
        for (const field of ['graduatingIvl', 'easyIvl', 'minIvl', 'startingEase', 'easyBonus', 'ivlModifier', 'hardIvl', 'newIvlPercent'] as const) {
            expect(isDeckOptionFieldVisible(field, false)).toBe(true);
            expect(isDeckOptionFieldVisible(field, true)).toBe(false);
        }
    });

    it('hides the FSRS inputs while the classic scheduler is running', () => {
        for (const field of ['desiredRetention', 'fsrsParams', 'historicalRetention', 'ignoreRevlogsBefore'] as const) {
            expect(isDeckOptionFieldVisible(field, true)).toBe(true);
            expect(isDeckOptionFieldVisible(field, false)).toBe(false);
        }
    });
});

describe('review order choices', () => {
    it('offers Anki’s eleven classic orders, in Anki’s order', () => {
        expect(reviewSortOrderChoices(false).map((choice) => choice.order)).toEqual([
            'dueRandom', 'dueThenDeck', 'deckThenDue', 'intervalsAsc', 'intervalsDesc',
            'easeAsc', 'easeDesc', 'relativeOverdueness', 'random', 'added', 'reverseAdded',
        ]);
    });

    it('renames the ease pair to difficulty under FSRS, and swaps it so ascending leads', () => {
        // The stored value is unchanged — `easeDesc` is what sorts by ascending difficulty — so
        // a preset keeps its ordinal when the scheduler is switched, exactly as Anki's does.
        const fsrsChoices = reviewSortOrderChoices(true);
        const difficulty = fsrsChoices.filter((choice) => choice.label.startsWith('difficulty'));

        expect(difficulty).toEqual([
            { order: 'easeDesc', label: 'difficultyAsc' },
            { order: 'easeAsc', label: 'difficultyDesc' },
        ]);
        expect(fsrsChoices.some((choice) => choice.label === 'easeAsc')).toBe(false);
    });

    it('adds the two retrievability orders only while FSRS is on', () => {
        const withFsrs = reviewSortOrderChoices(true).map((choice) => choice.order);

        expect(withFsrs).toContain('retrievabilityAsc');
        expect(withFsrs).toContain('retrievabilityDesc');
        // They sit between the difficulty pair and relative overdueness.
        expect(withFsrs.slice(5, 10)).toEqual([
            'easeDesc', 'easeAsc', 'retrievabilityAsc', 'retrievabilityDesc', 'relativeOverdueness',
        ]);
        expect(reviewSortOrderChoices(false).map((choice) => choice.order))
            .not.toContain('retrievabilityAsc');
    });

    it('moves a retrievability order to the nearest classic one when FSRS is switched off', () => {
        expect(resolveReviewSortOrderForScheduler('retrievabilityAsc', false)).toBe('relativeOverdueness');
        expect(resolveReviewSortOrderForScheduler('retrievabilityDesc', false)).toBe('relativeOverdueness');
        expect(resolveReviewSortOrderForScheduler('retrievabilityAsc', true)).toBe('retrievabilityAsc');
        expect(resolveReviewSortOrderForScheduler('intervalsAsc', false)).toBe('intervalsAsc');
    });
});

describe('deck options advice', () => {
    function input(overrides: Partial<DeckOptionsWarningInput> = {}): DeckOptionsWarningInput {
        return {
            fsrsEnabled: false,
            learningSteps: [1, 10],
            relearningSteps: [10],
            insertionOrder: 'sequential',
            newPerDay: 20,
            reviewsPerDay: 200,
            graduatingIvl: 1,
            easyIvl: 4,
            minIvl: 1,
            maxIvl: 36500,
            maxAnswerSecs: 60,
            desiredRetention: 0.9,
            easyDays: [1, 1, 1, 1, 1, 1, 1],
            easyDaysChanged: false,
            rescheduleOnChange: false,
            ...overrides,
        };
    }

    const ids = (overrides: Partial<DeckOptionsWarningInput> = {}) =>
        deckOptionsWarnings(input(overrides)).map((warning) => warning.id);

    it('says nothing about a preset left on the defaults', () => {
        expect(deckOptionsWarnings(input())).toEqual([]);
    });

    it('flags a review limit that cannot absorb the new cards', () => {
        expect(ids({ newPerDay: 30, reviewsPerDay: 200 })).toContain('reviewsTooLow');
        expect(ids({ newPerDay: 20, reviewsPerDay: 200 })).not.toContain('reviewsTooLow');
        // The ratio stops climbing at the field's own ceiling, so a huge new limit does not
        // demand a review limit that cannot be typed.
        expect(ids({ newPerDay: 9999, reviewsPerDay: 9999 })).not.toContain('reviewsTooLow');
    });

    it('warns when a learning step outlives the interval it graduates to', () => {
        expect(ids({ learningSteps: [1, 2880], graduatingIvl: 1 })).toContain('learningStepsAboveGraduating');
        expect(ids({ learningSteps: [1, 10], graduatingIvl: 1 })).not.toContain('learningStepsAboveGraduating');
    });

    it('warns when Good graduates further out than Easy', () => {
        // Anki prints this and still saves: a learner may want them equal, or inverted for a
        // deck they intend to see again quickly.
        expect(ids({ graduatingIvl: 7, easyIvl: 4 })).toContain('goodAboveEasy');
        expect(ids({ graduatingIvl: 4, easyIvl: 4 })).not.toContain('goodAboveEasy');
    });

    it('warns about day-long steps only once FSRS is scheduling', () => {
        const dayLongSteps = { learningSteps: [1, 1440], relearningSteps: [1440] };

        expect(ids({ ...dayLongSteps, fsrsEnabled: true }))
            .toEqual(expect.arrayContaining(['learningStepsTooLargeForFsrs', 'relearningStepsTooLargeForFsrs']));
        expect(ids({ ...dayLongSteps, fsrsEnabled: false, graduatingIvl: 30, minIvl: 30 }))
            .not.toContain('learningStepsTooLargeForFsrs');
    });

    it('drops the classic-scheduler advice when FSRS hides the fields it talks about', () => {
        const warnings = ids({
            fsrsEnabled: true,
            graduatingIvl: 7,
            easyIvl: 4,
            learningSteps: [1, 10],
            relearningSteps: [10],
            minIvl: 1,
        });

        expect(warnings).not.toContain('goodAboveEasy');
        expect(warnings).not.toContain('learningStepsAboveGraduating');
        expect(warnings).not.toContain('relearningStepsAboveMinimum');
    });

    it('warns when relearning ends further out than the minimum interval allows', () => {
        expect(ids({ relearningSteps: [2880], minIvl: 1 })).toContain('relearningStepsAboveMinimum');
        expect(ids({ relearningSteps: [], minIvl: 1 })).not.toContain('relearningStepsAboveMinimum');
    });

    it('explains what random insertion means for the queue', () => {
        const warnings = deckOptionsWarnings(input({ insertionOrder: 'random' }));

        expect(warnings.find((warning) => warning.id === 'insertionOrderRandom')?.level).toBe('info');
    });

    it('grades the maximum interval by how far below the recommendation it is', () => {
        const warn = (maxIvl: number) => deckOptionsWarnings(input({ maxIvl }))
            .find((warning) => warning.id === 'maximumIntervalTooShort');

        expect(warn(36500)).toBeUndefined();
        expect(warn(179)?.level).toBe('warning');
        expect(warn(30)?.level).toBe('danger');
    });

    it('flags an answer cap that would record a coffee break as study time', () => {
        expect(ids({ maxAnswerSecs: 601 })).toContain('maximumAnswerSecsAboveRecommended');
        expect(ids({ maxAnswerSecs: 600 })).not.toContain('maximumAnswerSecsAboveRecommended');
    });

    it('grades desired retention, and only while FSRS reads it', () => {
        const warn = (desiredRetention: number, fsrsEnabled = true) =>
            deckOptionsWarnings(input({ desiredRetention, fsrsEnabled }))
                .find((warning) => warning.id.startsWith('desiredRetention'));

        expect(warn(0.9)).toBeUndefined();
        expect(warn(0.75)).toMatchObject({ id: 'desiredRetentionTooLow', level: 'warning' });
        // The field itself stops at 0.70, so the loud band below it is only reachable by a
        // preset that arrived in a package — which is exactly when it is worth shouting about.
        expect(warn(0.7)).toMatchObject({ id: 'desiredRetentionTooLow', level: 'warning' });
        expect(warn(0.65)).toMatchObject({ id: 'desiredRetentionTooLow', level: 'danger' });
        expect(warn(0.96)).toMatchObject({ id: 'desiredRetentionTooHigh', level: 'warning' });
        expect(warn(0.98)).toMatchObject({ id: 'desiredRetentionTooHigh', level: 'danger' });
        expect(warn(0.98, false)).toBeUndefined();
    });

    it('warns when every day has been marked easy', () => {
        expect(ids({ easyDays: [0.5, 0.5, 0.5, 0, 0.5, 0.5, 0.5] })).toContain('easyDaysNoNormalDays');
        expect(ids({ easyDays: [1, 0.5, 0.5, 0, 0.5, 0.5, 0.5] })).not.toContain('easyDaysNoNormalDays');
    });

    it('says an easy-day change only steers future intervals unless the save rewrites due dates', () => {
        expect(ids({ easyDaysChanged: true })).toContain('easyDaysNotRescheduled');
        expect(ids({ easyDaysChanged: true, fsrsEnabled: true, rescheduleOnChange: true }))
            .not.toContain('easyDaysNotRescheduled');
        // Rescheduling is an FSRS operation; asking for it with the classic scheduler changes
        // nothing, so the advice stands.
        expect(ids({ easyDaysChanged: true, fsrsEnabled: false, rescheduleOnChange: true }))
            .toContain('easyDaysNotRescheduled');
    });

    it('keeps quiet about fields that failed validation', () => {
        expect(deckOptionsWarnings(input({
            newPerDay: undefined,
            reviewsPerDay: undefined,
            graduatingIvl: undefined,
            easyIvl: undefined,
            minIvl: undefined,
            maxIvl: undefined,
            maxAnswerSecs: undefined,
            desiredRetention: undefined,
            learningSteps: null,
            relearningSteps: null,
        }))).toEqual([]);
    });
});

describe('when a preset is due for another optimization', () => {
    const input = {
        fsrsEnabled: true,
        learningSteps: [1, 10],
        relearningSteps: [10],
        insertionOrder: 'sequential' as const,
        newPerDay: 20,
        reviewsPerDay: 200,
        maxIvl: 36500,
        maxAnswerSecs: 60,
        desiredRetention: 0.9,
        easyDays: [1, 1, 1, 1, 1, 1, 1],
        easyDaysChanged: false,
        rescheduleOnChange: false,
    };

    it('nudges after a month, and stays quiet before it', () => {
        const ids = (daysSinceOptimization?: number) =>
            deckOptionsWarnings({ ...input, daysSinceOptimization }).map((warning) => warning.id);

        expect(ids(31)).toContain('fsrsParamsStale');
        expect(ids(30)).not.toContain('fsrsParamsStale');
        // Never optimized is not the same as stale: those parameters are the shipped defaults,
        // and the optimize button says so on its own.
        expect(ids(undefined)).not.toContain('fsrsParamsStale');
        expect(deckOptionsWarnings({ ...input, fsrsEnabled: false, daysSinceOptimization: 400 })
            .map((warning) => warning.id)).not.toContain('fsrsParamsStale');
    });
});
