// The parts of Anki's deck options that depend on the values in front of the learner: which
// settings the screen shows, which review orders it offers, and the non-blocking advice it prints
// under a control. All of it is a function of the form's own state, so it lives here rather than
// inside the screen, and each rule below is pinned by a test in `deckOptionsRules.test.ts`.
//
// Derived independently from the behaviour of these upstream files, not from their code:
//   ts/routes/deck-options/NewOptions.svelte, LapseOptions.svelte, AdvancedOptions.svelte,
//   DailyLimits.svelte, TimerOptions.svelte, FsrsOptions.svelte, EasyDays.svelte, choices.ts
// https://github.com/ankitects/anki/tree/main/ts/routes/deck-options

import type { ReviewSortOrder } from './types';

/**
 * A setting that only one of the two schedulers has any use for.
 *
 * Anki hides rather than disables these: with FSRS on, the ease multipliers are not consulted at
 * all, and a field that changes nothing is worse than no field. The same is true in reverse of
 * the FSRS-only inputs while the classic scheduler is running.
 */
export type DeckOptionsFieldId =
    | 'graduatingIvl'
    | 'easyIvl'
    | 'minIvl'
    | 'startingEase'
    | 'easyBonus'
    | 'ivlModifier'
    | 'hardIvl'
    | 'newIvlPercent'
    | 'desiredRetention'
    | 'fsrsParams'
    | 'historicalRetention'
    | 'ignoreRevlogsBefore';

/** Hidden while FSRS is on: the classic scheduler's day-scale inputs. */
const SM2_ONLY_FIELDS: ReadonlySet<DeckOptionsFieldId> = new Set([
    'graduatingIvl',
    'easyIvl',
    'minIvl',
    'startingEase',
    'easyBonus',
    'ivlModifier',
    'hardIvl',
    'newIvlPercent',
]);

/** Hidden while FSRS is off: nothing reads them, and optimizing needs the scheduler running. */
const FSRS_ONLY_FIELDS: ReadonlySet<DeckOptionsFieldId> = new Set([
    'desiredRetention',
    'fsrsParams',
    'historicalRetention',
    'ignoreRevlogsBefore',
]);

/** Whether the deck options screen shows `field` while `fsrsEnabled` is the scheduler in use. */
export function isDeckOptionFieldVisible(field: DeckOptionsFieldId, fsrsEnabled: boolean): boolean {
    if (SM2_ONLY_FIELDS.has(field)) return !fsrsEnabled;
    if (FSRS_ONLY_FIELDS.has(field)) return fsrsEnabled;
    return true;
}

/**
 * The label a review order is shown under. Two of them are named after the column the queue
 * actually sorts by, which changes with the scheduler, so the choice carries the label to use
 * rather than the screen guessing it back.
 */
export type ReviewSortOrderLabelId =
    | 'dueThenRandom'
    | 'dueThenDeck'
    | 'deckThenDue'
    | 'intervalsAsc'
    | 'intervalsDesc'
    | 'easeAsc'
    | 'easeDesc'
    | 'difficultyAsc'
    | 'difficultyDesc'
    | 'retrievabilityAsc'
    | 'retrievabilityDesc'
    | 'relativeOverdueness'
    | 'random'
    | 'added'
    | 'reverseAdded';

export interface ReviewSortOrderChoice {
    order: ReviewSortOrder;
    label: ReviewSortOrderLabelId;
}

/**
 * Anki's review order dropdown, in its order.
 *
 * The two ease orders keep their stored values under FSRS and change meaning: `easeAsc` sorts by
 * difficulty descending there, so it is labelled "descending difficulty" — and because a learner
 * reading the list expects ascending first, the pair is also swapped round. The retrievability
 * orders exist only while FSRS is on, since only then does a card carry the memory state they
 * read.
 */
export function reviewSortOrderChoices(fsrsEnabled: boolean): ReviewSortOrderChoice[] {
    const difficultyOrEase: ReviewSortOrderChoice[] = fsrsEnabled
        ? [
            { order: 'easeDesc', label: 'difficultyAsc' },
            { order: 'easeAsc', label: 'difficultyDesc' },
        ]
        : [
            { order: 'easeAsc', label: 'easeAsc' },
            { order: 'easeDesc', label: 'easeDesc' },
        ];
    const retrievability: ReviewSortOrderChoice[] = fsrsEnabled
        ? [
            { order: 'retrievabilityAsc', label: 'retrievabilityAsc' },
            { order: 'retrievabilityDesc', label: 'retrievabilityDesc' },
        ]
        : [];

    return [
        { order: 'dueRandom', label: 'dueThenRandom' },
        { order: 'dueThenDeck', label: 'dueThenDeck' },
        { order: 'deckThenDue', label: 'deckThenDue' },
        { order: 'intervalsAsc', label: 'intervalsAsc' },
        { order: 'intervalsDesc', label: 'intervalsDesc' },
        ...difficultyOrEase,
        ...retrievability,
        { order: 'relativeOverdueness', label: 'relativeOverdueness' },
        { order: 'random', label: 'random' },
        { order: 'added', label: 'added' },
        { order: 'reverseAdded', label: 'reverseAdded' },
    ];
}

/**
 * The order a stored value falls back to when the scheduler that offered it is switched off.
 *
 * Turning FSRS off with a retrievability order selected would otherwise leave the preset sorting
 * by a column no card has any more; Anki's dropdown simply cannot hold that value, so the screen
 * moves the preset to the nearest order the classic scheduler can honour.
 */
export function resolveReviewSortOrderForScheduler(
    order: ReviewSortOrder,
    fsrsEnabled: boolean,
): ReviewSortOrder {
    if (fsrsEnabled) return order;
    if (order === 'retrievabilityAsc' || order === 'retrievabilityDesc') {
        // Retrievability ascending is "least well remembered first", which is what relative
        // overdueness measures without a memory state.
        return 'relativeOverdueness';
    }
    return order;
}

export type DeckOptionsWarningId =
    | 'reviewsTooLow'
    | 'learningStepsAboveGraduating'
    | 'learningStepsTooLargeForFsrs'
    | 'goodAboveEasy'
    | 'insertionOrderRandom'
    | 'relearningStepsAboveMinimum'
    | 'relearningStepsTooLargeForFsrs'
    | 'maximumIntervalTooShort'
    | 'maximumAnswerSecsAboveRecommended'
    | 'desiredRetentionTooLow'
    | 'desiredRetentionTooHigh'
    | 'easyDaysNoNormalDays'
    | 'easyDaysNotRescheduled'
    | 'fsrsParamsStale';

/**
 * How loudly the advice is printed. Anki styles a warning that describes a setting the learner
 * probably did not mean (`alert-danger`) differently from one that merely explains a consequence
 * (`alert-info`); nothing here blocks a save.
 */
export type DeckOptionsWarningLevel = 'info' | 'warning' | 'danger';

export interface DeckOptionsWarning {
    id: DeckOptionsWarningId;
    /** The form field the advice belongs under, so the screen can print it where it applies. */
    field: string;
    level: DeckOptionsWarningLevel;
}

export interface DeckOptionsWarningInput {
    fsrsEnabled: boolean;
    /** Learning delays in minutes, or null while the field does not parse. */
    learningSteps: number[] | null;
    /** Relearning delays in minutes; an empty array is the deliberate "no relearning". */
    relearningSteps: number[] | null;
    insertionOrder: 'sequential' | 'random';
    /** Values that failed validation arrive as undefined and raise no advice of their own. */
    newPerDay?: number;
    reviewsPerDay?: number;
    graduatingIvl?: number;
    easyIvl?: number;
    minIvl?: number;
    maxIvl?: number;
    maxAnswerSecs?: number;
    desiredRetention?: number;
    easyDays: number[];
    /** Whether the easy-day factors differ from the ones the screen was opened on. */
    easyDaysChanged: boolean;
    /** Whether this save was asked to rewrite existing due dates. */
    rescheduleOnChange: boolean;
    /** Days since this preset's parameters were last fitted; undefined when they never were. */
    daysSinceOptimization?: number;
}

const MINUTES_PER_DAY = 1440;
/** Anki: below this the review limit cannot keep up with the new cards being introduced. */
const REVIEW_LIMIT_RATIO = 10;
const REVIEW_LIMIT_CEILING = 9999;
/** Anki warns below half a year, and calls it a mistake below fifty days. */
const SHORT_MAXIMUM_INTERVAL = 180;
const VERY_SHORT_MAXIMUM_INTERVAL = 50;
/** Recording more than ten minutes for a single answer is a stopwatch, not a review. */
const MAX_ANSWER_SECS_RECOMMENDED = 600;
const RETENTION_LOW = 0.8;
const RETENTION_HIGH = 0.95;
const RETENTION_VERY_LOW = 0.7;
const RETENTION_VERY_HIGH = 0.97;
/** Anki nudges a preset back to the optimizer once a month's worth of reviews has accumulated. */
const OPTIMIZATION_STALE_DAYS = 30;

function lastStepInDays(steps: number[] | null): number | null {
    if (!steps || steps.length === 0) return null;
    return steps[steps.length - 1] / MINUTES_PER_DAY;
}

/**
 * Anki's deck options advice, in the order the screen prints it.
 *
 * Every one of these is a warning and never a refusal: the learner is allowed to set a short
 * maximum interval or a steep retention, and Anki's own screen saves those happily. Only a value
 * that cannot be stored at all is an error, and that check lives with the form parsing.
 */
export function deckOptionsWarnings(input: DeckOptionsWarningInput): DeckOptionsWarning[] {
    const warnings: DeckOptionsWarning[] = [];
    const add = (id: DeckOptionsWarningId, field: string, level: DeckOptionsWarningLevel = 'warning') =>
        warnings.push({ id, field, level });

    // Daily limits: a review cap that cannot absorb the new cards being introduced builds a
    // backlog no matter how diligent the learner is.
    if (input.newPerDay !== undefined && input.reviewsPerDay !== undefined
        && Math.min(REVIEW_LIMIT_CEILING, input.newPerDay * REVIEW_LIMIT_RATIO) > input.reviewsPerDay) {
        add('reviewsTooLow', 'maxReviewsPerDay');
    }

    const learningStepDays = lastStepInDays(input.learningSteps);
    if (input.fsrsEnabled) {
        // A step of a day or more is FSRS's own job; leaving it to the steps takes the decision
        // away from the scheduler that is supposed to be making it.
        if (learningStepDays !== null && learningStepDays >= 1) {
            add('learningStepsTooLargeForFsrs', 'learningSteps');
        }
    } else {
        if (learningStepDays !== null && input.graduatingIvl !== undefined
            && learningStepDays > input.graduatingIvl) {
            add('learningStepsAboveGraduating', 'learningSteps');
        }
        if (input.graduatingIvl !== undefined && input.easyIvl !== undefined
            && input.graduatingIvl > input.easyIvl) {
            add('goodAboveEasy', 'easyIvl');
        }
    }

    if (input.insertionOrder === 'random') {
        add('insertionOrderRandom', 'insertionOrder', 'info');
    }

    const relearningStepDays = lastStepInDays(input.relearningSteps);
    if (input.fsrsEnabled) {
        if (relearningStepDays !== null && relearningStepDays >= 1) {
            add('relearningStepsTooLargeForFsrs', 'relearningSteps');
        }
    } else if (relearningStepDays !== null && input.minIvl !== undefined
        && relearningStepDays > input.minIvl) {
        add('relearningStepsAboveMinimum', 'relearningSteps');
    }

    if (input.fsrsEnabled && input.desiredRetention !== undefined) {
        if (input.desiredRetention < RETENTION_LOW) {
            add(
                'desiredRetentionTooLow',
                'desiredRetention',
                input.desiredRetention < RETENTION_VERY_LOW ? 'danger' : 'warning',
            );
        } else if (input.desiredRetention > RETENTION_HIGH) {
            add(
                'desiredRetentionTooHigh',
                'desiredRetention',
                input.desiredRetention > RETENTION_VERY_HIGH ? 'danger' : 'warning',
            );
        }
    }

    if (input.fsrsEnabled
        && input.daysSinceOptimization !== undefined
        && input.daysSinceOptimization > OPTIMIZATION_STALE_DAYS) {
        add('fsrsParamsStale', 'fsrsParams', 'info');
    }

    if (input.maxAnswerSecs !== undefined && input.maxAnswerSecs > MAX_ANSWER_SECS_RECOMMENDED) {
        add('maximumAnswerSecsAboveRecommended', 'maxAnswerSecs');
    }

    // Easy days move a due date inside the fuzz window, so with every day reduced there is
    // nowhere left to move a review to.
    if (input.easyDays.length === 7 && !input.easyDays.some((factor) => factor >= 1)) {
        add('easyDaysNoNormalDays', 'easyDays');
    }
    // Changing the factors only steers intervals calculated from now on, unless this save is
    // also rewriting the due dates that already exist.
    if (input.easyDaysChanged && !(input.fsrsEnabled && input.rescheduleOnChange)) {
        add('easyDaysNotRescheduled', 'easyDays', 'info');
    }

    if (input.maxIvl !== undefined && input.maxIvl < SHORT_MAXIMUM_INTERVAL) {
        add(
            'maximumIntervalTooShort',
            'maxIvl',
            input.maxIvl < VERY_SHORT_MAXIMUM_INTERVAL ? 'danger' : 'warning',
        );
    }

    return warnings;
}
