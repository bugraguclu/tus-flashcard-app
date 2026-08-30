/**
 * FSRS scheduling for the reviewer.
 *
 * FSRS replaces only the interval maths. Learning and relearning steps, leeches, daily limits and
 * the queue builder are untouched, which is exactly how Anki wires it: the memory state produces a
 * raw interval per button, and the surrounding state machine decides whether that interval keeps
 * the card in (re)learning or sends it back to review.
 *
 * The state machine mirrors `rslib/src/scheduler/states/{learning,review,relearning}.rs`.
 */

import { elapsedStudyDays } from './ankiState';
import {
    DEFAULT_FSRS_PARAMETERS,
    FSRS_DEFAULT_DESIRED_RETENTION,
    clampFsrsParameters,
    decayFromParameters,
    fsrsNextStates,
    type FsrsMemoryState,
    type FsrsNextStates,
} from './fsrs';
import {
    MINUTES_PER_DAY,
    constrainInterval,
    formatDays,
    formatMinutes,
    hardDelayMinutes,
    minimumReviewFuzzInterval,
    type FuzzSeed,
} from './schedulingIntervals';
import type {
    AppSettings,
    CardState,
    Grade,
    IntervalPreview,
    ScheduleResult,
    SchedulerEngine,
} from './types';

/** Anki's threshold for keeping a card in (re)learning instead of scheduling it in days. */
const SHORT_TERM_INTERVAL_DAYS = 0.5;

const GRADES: Grade[] = [1, 2, 3, 4];

interface FsrsOutcome {
    /** Where the card lands: an intraday (re)learning step, or the review queue. */
    kind: 'learning' | 'review';
    /** Set for `kind: 'learning'`. */
    minutesUntilDue?: number;
    /** Whole-day interval stored on the card; while relearning this is the interval it returns to. */
    intervalDays: number;
    memory: FsrsMemoryState;
    /** Step index to store when the card stays in (re)learning. */
    stepIndex?: number;
    relearning?: boolean;
}

export function fsrsParametersFor(settings: AppSettings): number[] {
    return clampFsrsParameters(settings.fsrsParameters ?? [...DEFAULT_FSRS_PARAMETERS]);
}

export function desiredRetentionFor(settings: AppSettings): number {
    const value = Number(settings.desiredRetention);
    return Number.isFinite(value) && value > 0 ? value : FSRS_DEFAULT_DESIRED_RETENTION;
}

/**
 * Short-term scheduling needs the two same-day parameters to be non-zero; a parameter set trained
 * with short-term learning disabled zeroes them, and Anki then never keeps a card in learning on
 * an FSRS interval.
 */
export function fsrsAllowsShortTerm(params: readonly number[]): boolean {
    return params.length >= 19 && params[17] > 0 && params[18] > 0;
}

function elapsedDaysFor(cs: CardState, nowMs: number, settings: AppSettings): number {
    if (cs.lastReviewedAtMs && cs.lastReviewedAtMs > 0) {
        return elapsedStudyDays(cs.lastReviewedAtMs, nowMs, settings.dayRolloverHour);
    }
    return Math.max(0, cs.elapsedDays || 0);
}

function memoryStateFor(cs: CardState): FsrsMemoryState | null {
    const memory = cs.memoryState;
    if (!memory || !Number.isFinite(memory.stability) || memory.stability <= 0) return null;
    return memory;
}

/** True when an FSRS interval below half a day should keep the card in (re)learning. */
function keepsShortTerm(
    intervalDays: number,
    settings: AppSettings,
    params: readonly number[],
    steps: number[],
): boolean {
    if (intervalDays >= SHORT_TERM_INTERVAL_DAYS) return false;
    if (!fsrsAllowsShortTerm(params)) return false;
    return (settings.fsrsShortTermWithSteps ?? false) || steps.length === 0;
}

function shortTermMinutes(intervalDays: number): number {
    return Math.max(1, Math.round(intervalDays * MINUTES_PER_DAY));
}

/**
 * Outcomes for all four buttons. Both the answer path and the button labels read this, so a label
 * can never disagree with what pressing the button does — the fuzz seed is deterministic per card
 * and study day.
 */
export function fsrsOutcomes(
    cs: CardState,
    settings: AppSettings,
    nowMs: number,
): Record<Grade, FsrsOutcome> {
    const params = fsrsParametersFor(settings);
    const desiredRetention = desiredRetentionFor(settings);
    const elapsedDays = elapsedDaysFor(cs, nowMs, settings);
    const memory = memoryStateFor(cs);
    const states = fsrsNextStates(params, memory, desiredRetention, elapsedDays);

    const fuzz: FuzzSeed = { cardId: cs.cardId, nowMs, rolloverHour: settings.dayRolloverHour };
    const maxInterval = settings.maxInterval;
    const isRelearning = cs.relearningStep !== undefined && cs.relearningStep >= 0;
    const isLearning = cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0);

    if (isRelearning) return relearningOutcomes(cs, settings, states, params, fuzz, maxInterval);
    if (isLearning) return learningOutcomes(cs, settings, states, params, fuzz, maxInterval);
    return reviewOutcomes(cs, settings, states, params, fuzz, maxInterval);
}

/** Graduate on an FSRS interval, or stay in (re)learning when that interval is under half a day. */
function graduateOrStayShort(
    intervalDays: number,
    memory: FsrsMemoryState,
    settings: AppSettings,
    params: readonly number[],
    steps: number[],
    stepIndex: number,
    relearning: boolean,
    fuzz: FuzzSeed,
    maxInterval: number,
    minimumDays: number = 1,
): FsrsOutcome {
    if (keepsShortTerm(intervalDays, settings, params, steps)) {
        return {
            kind: 'learning',
            minutesUntilDue: shortTermMinutes(intervalDays),
            intervalDays: Math.max(1, Math.round(intervalDays)),
            memory,
            stepIndex,
            relearning,
        };
    }
    const days = constrainInterval(Math.max(1, Math.round(intervalDays)), minimumDays, maxInterval, fuzz);
    return { kind: 'review', intervalDays: days, memory };
}

function learningOutcomes(
    cs: CardState,
    settings: AppSettings,
    states: FsrsNextStates,
    params: readonly number[],
    fuzz: FuzzSeed,
    maxInterval: number,
): Record<Grade, FsrsOutcome> {
    const steps = settings.learningSteps;
    const step = Math.max(0, cs.learningStep || 0);
    const nextStepMinutes = steps[step + 1];

    const again: FsrsOutcome = steps.length > 0
        ? {
            kind: 'learning',
            minutesUntilDue: steps[0] || 1,
            intervalDays: Math.max(1, Math.round(states.again.interval)),
            memory: states.again.memory,
            stepIndex: 0,
        }
        : graduateOrStayShort(states.again.interval, states.again.memory, settings, params, steps, 0, false, fuzz, maxInterval);

    const hard: FsrsOutcome = steps.length > 0
        ? {
            kind: 'learning',
            minutesUntilDue: hardDelayMinutes(steps, step),
            intervalDays: Math.max(1, Math.round(states.hard.interval)),
            memory: states.hard.memory,
            stepIndex: step,
        }
        : graduateOrStayShort(states.hard.interval, states.hard.memory, settings, params, steps, step, false, fuzz, maxInterval);

    const good: FsrsOutcome = nextStepMinutes !== undefined
        ? {
            kind: 'learning',
            minutesUntilDue: nextStepMinutes,
            intervalDays: Math.max(1, Math.round(states.good.interval)),
            memory: states.good.memory,
            stepIndex: step + 1,
        }
        : graduateOrStayShort(states.good.interval, states.good.memory, settings, params, steps, step, false, fuzz, maxInterval);

    // Easy always graduates, and must land beyond whatever Good would have given.
    const goodDays = constrainInterval(Math.max(1, states.good.interval), 1, maxInterval, fuzz);
    const easyDays = constrainInterval(
        Math.max(1, Math.round(states.easy.interval)),
        Math.min(goodDays + 1, maxInterval),
        maxInterval,
        fuzz,
    );

    return {
        1: again,
        2: hard,
        3: good,
        4: { kind: 'review', intervalDays: easyDays, memory: states.easy.memory },
    };
}

function relearningOutcomes(
    cs: CardState,
    settings: AppSettings,
    states: FsrsNextStates,
    params: readonly number[],
    fuzz: FuzzSeed,
    maxInterval: number,
): Record<Grade, FsrsOutcome> {
    const steps = settings.lapseSteps;
    const step = Math.max(0, cs.relearningStep || 0);
    const nextStepMinutes = steps[step + 1];

    const again: FsrsOutcome = steps.length > 0
        ? {
            kind: 'learning',
            minutesUntilDue: steps[0] || 1,
            intervalDays: Math.max(1, Math.round(states.again.interval)),
            memory: states.again.memory,
            stepIndex: 0,
            relearning: true,
        }
        : graduateOrStayShort(states.again.interval, states.again.memory, settings, params, steps, 0, true, fuzz, maxInterval);

    const hardDelay = steps.length > 0 ? hardDelayMinutes(steps, step) : undefined;
    const hard: FsrsOutcome = hardDelay !== undefined
        ? {
            kind: 'learning',
            minutesUntilDue: hardDelay,
            intervalDays: Math.max(1, Math.round(states.hard.interval)),
            memory: states.hard.memory,
            stepIndex: step,
            relearning: true,
        }
        : graduateOrStayShort(states.hard.interval, states.hard.memory, settings, params, steps, step, true, fuzz, maxInterval);

    const good: FsrsOutcome = nextStepMinutes !== undefined
        ? {
            kind: 'learning',
            minutesUntilDue: nextStepMinutes,
            intervalDays: Math.max(1, Math.round(states.good.interval)),
            memory: states.good.memory,
            stepIndex: step + 1,
            relearning: true,
        }
        : graduateOrStayShort(states.good.interval, states.good.memory, settings, params, steps, step, true, fuzz, maxInterval);

    const goodDays = constrainInterval(Math.max(1, states.good.interval), 1, maxInterval, fuzz);
    const easyDays = constrainInterval(
        Math.max(1, Math.round(states.easy.interval)),
        Math.min(goodDays + 1, maxInterval),
        maxInterval,
        fuzz,
    );

    return {
        1: again,
        2: hard,
        3: good,
        4: { kind: 'review', intervalDays: easyDays, memory: states.easy.memory },
    };
}

function reviewOutcomes(
    cs: CardState,
    settings: AppSettings,
    states: FsrsNextStates,
    params: readonly number[],
    fuzz: FuzzSeed,
    maxInterval: number,
): Record<Grade, FsrsOutcome> {
    const steps = settings.lapseSteps;
    const scheduledDays = Math.max(1, cs.interval || 1);

    // Failing keeps FSRS's raw interval: fuzz is applied later, when the card leaves relearning.
    const againInterval = Math.max(1, Math.round(states.again.interval));
    const again: FsrsOutcome = steps.length > 0
        ? {
            kind: 'learning',
            minutesUntilDue: steps[0] || 1,
            intervalDays: Math.min(maxInterval, againInterval),
            memory: states.again.memory,
            stepIndex: 0,
            relearning: true,
        }
        : keepsShortTerm(states.again.interval, settings, params, steps)
            ? {
                kind: 'learning',
                minutesUntilDue: shortTermMinutes(states.again.interval),
                intervalDays: Math.min(maxInterval, againInterval),
                memory: states.again.memory,
                stepIndex: 0,
                relearning: true,
            }
            : { kind: 'review', intervalDays: Math.min(maxInterval, againInterval), memory: states.again.memory };

    // Passing intervals chain, and fuzz may never pull one below the interval the card already had.
    const hardDays = constrainInterval(
        states.hard.interval,
        Math.max(1, minimumReviewFuzzInterval(states.hard.interval, scheduledDays, maxInterval)),
        maxInterval,
        fuzz,
    );
    const goodDays = constrainInterval(
        states.good.interval,
        Math.max(hardDays + 1, minimumReviewFuzzInterval(states.good.interval, scheduledDays, maxInterval)),
        maxInterval,
        fuzz,
    );
    const easyDays = constrainInterval(
        states.easy.interval,
        Math.max(goodDays + 1, minimumReviewFuzzInterval(states.easy.interval, scheduledDays, maxInterval)),
        maxInterval,
        fuzz,
    );

    return {
        1: again,
        2: { kind: 'review', intervalDays: hardDays, memory: states.hard.memory },
        3: { kind: 'review', intervalDays: goodDays, memory: states.good.memory },
        4: { kind: 'review', intervalDays: easyDays, memory: states.easy.memory },
    };
}

// Anki keeps the SM-2 ease factor moving even while FSRS decides the intervals, so switching the
// scheduler off later resumes from a sensible value rather than a stale one.
const MINIMUM_EASE_FACTOR = 1.3;
const EASE_FACTOR_DELTA: Record<Grade, number> = { 1: -0.2, 2: -0.15, 3: 0, 4: 0.15 };

function nextEaseFactor(cs: CardState, grade: Grade, settings: AppSettings, graduating: boolean): number {
    const current = graduating ? settings.startingEase : (cs.easeFactor || settings.startingEase);
    if (graduating) return current;
    return Math.max(MINIMUM_EASE_FACTOR, current + EASE_FACTOR_DELTA[grade]);
}

function scheduleResultFor(
    cs: CardState,
    grade: Grade,
    outcome: FsrsOutcome,
    settings: AppSettings,
    nowMs: number,
    elapsedDays: number,
): ScheduleResult {
    const params = fsrsParametersFor(settings);
    const shared = {
        memoryState: outcome.memory,
        desiredRetention: desiredRetentionFor(settings),
        decay: decayFromParameters(params),
        lastReviewedAtMs: nowMs,
        elapsedDays,
    };
    const wasReview = cs.status === 'review'
        && (cs.relearningStep === undefined || cs.relearningStep < 0);
    const lapses = (cs.lapses || 0) + (grade === 1 && wasReview ? 1 : 0);
    // A card leaving (re)learning for the review queue starts from the preset's initial ease.
    const graduating = outcome.kind === 'review' && !wasReview;
    const easeFactor = nextEaseFactor(cs, grade, settings, graduating);

    if (outcome.kind === 'learning') {
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: outcome.minutesUntilDue ?? 1,
            stateUpdates: {
                ...shared,
                status: 'learning',
                interval: outcome.intervalDays,
                learningStep: outcome.relearning ? -1 : (outcome.stepIndex ?? 0),
                relearningStep: outcome.relearning ? (outcome.stepIndex ?? 0) : -1,
                easeFactor,
                lapses,
            },
        };
    }

    return {
        interval: outcome.intervalDays,
        isLearning: false,
        stateUpdates: {
            ...shared,
            status: 'review',
            interval: outcome.intervalDays,
            learningStep: -1,
            relearningStep: -1,
            easeFactor,
            repetition: (cs.repetition || 0) + 1,
            lapses,
        },
    };
}

function labelFor(outcome: FsrsOutcome): string {
    return outcome.kind === 'learning'
        ? formatMinutes(outcome.minutesUntilDue ?? 1)
        : formatDays(outcome.intervalDays);
}

export const FsrsEngine: SchedulerEngine = {
    name: 'FSRS',
    description: 'Free Spaced Repetition Scheduler (FSRS-6) with Anki learning steps',

    schedule: (cs: CardState, grade: Grade, settings: AppSettings, nowMs?: number): ScheduleResult => {
        if (grade !== 1 && grade !== 2 && grade !== 3 && grade !== 4) {
            throw new Error(`Invalid grade: ${grade}. Expected 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).`);
        }
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        const elapsedDays = elapsedDaysFor(cs, now, settings);
        const outcomes = fsrsOutcomes(cs, settings, now);
        return scheduleResultFor(cs, grade, outcomes[grade], settings, now, elapsedDays);
    },

    previewIntervals: (cs: CardState, settings: AppSettings, nowMs?: number): IntervalPreview => {
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        const outcomes = fsrsOutcomes(cs, settings, now);
        const [again, hard] = [outcomes[1], outcomes[2]];

        return {
            again: labelFor(again),
            hard: labelFor(hard),
            good: labelFor(outcomes[3]),
            easy: labelFor(outcomes[4]),
            againMinutes: again.kind === 'learning'
                ? again.minutesUntilDue ?? 1
                : again.intervalDays * MINUTES_PER_DAY,
            hardMinutes: hard.kind === 'learning' ? hard.minutesUntilDue : undefined,
        };
    },
};

/** Every grade's outcome, for screens that explain what each button would do. */
export function fsrsPreviewOutcomes(cs: CardState, settings: AppSettings, nowMs: number = Date.now()) {
    const outcomes = fsrsOutcomes(cs, settings, nowMs);
    return GRADES.map((grade) => ({ grade, outcome: outcomes[grade] }));
}
