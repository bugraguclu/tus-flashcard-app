/**
 * FSRS scheduling for the reviewer.
 *
 * FSRS replaces only the interval maths. Learning and relearning steps, leeches, daily limits and
 * the queue builder are untouched, which is exactly how Anki wires it: the memory state produces a
 * raw interval per button, and the surrounding state machine decides whether that interval keeps
 * the card in (re)learning or sends it back to review.
 *
 * The state machine follows Anki 26.05's `rslib/src/scheduler/states/{learning,review,relearning}.rs`
 * outcome for outcome: step delays in whole seconds, the same fuzz and load balancer, the interval
 * a relearning card keeps, and the ease factor each transition leaves behind.
 */

import {
    DEFAULT_FSRS_PARAMETERS,
    FSRS_DEFAULT_DESIRED_RETENTION,
    FSRS_DEFAULT_HISTORICAL_RETENTION,
    clampFsrsParameters,
    decayFromParameters,
    fsrsMemoryStateFromSm2,
    fsrsNextStates,
    normalizeFsrsParameters,
    type FsrsMemoryState,
    type FsrsNextStates,
} from './fsrs';
import { nextRolloverMs } from './ankiState';
import {
    MINUTES_PER_DAY,
    constrainInterval,
    formatDays,
    formatMinutes,
    hardDelaySecs,
    learningStepSecs,
    reviewFuzzFor,
    withReviewFuzz,
    type ReviewFuzz,
} from './schedulingIntervals';
import type {
    AppSettings,
    CardState,
    Grade,
    IntervalPreview,
    ScheduleContext,
    ScheduleResult,
    SchedulerEngine,
} from './types';

/** Anki's threshold for keeping a card in (re)learning instead of scheduling it in days. */
const SHORT_TERM_INTERVAL_DAYS = 0.5;
const SECONDS_PER_DAY = 86_400;
const MINIMUM_EASE_FACTOR = 1.3;
const EASE_FACTOR_AGAIN_DELTA = -0.2;
const EASE_FACTOR_HARD_DELTA = -0.15;
const EASE_FACTOR_EASY_DELTA = 0.15;

export interface FsrsOutcome {
    /** Where the card lands: a (re)learning step, or the review queue. */
    kind: 'learning' | 'review';
    /** Set when the card is (still) relearning a lapse. */
    relearning?: boolean;
    /** Seconds until a (re)learning step is due, before Anki's learning-step fuzz. */
    secs?: number;
    /** Step index to store while the card stays in (re)learning. */
    stepIndex?: number;
    /**
     * The card's `ivl` after the answer: the review interval in days, or for a relearning card the
     * interval it returns to. A learning card keeps the interval it had.
     */
    intervalDays: number;
    /** The ease factor the answer leaves on the card; FSRS keeps SM-2's bookkeeping going. */
    easeFactor: number;
    lapses: number;
    memory: FsrsMemoryState;
}

export function fsrsParametersFor(settings: AppSettings): number[] {
    return clampFsrsParameters(settings.fsrsParameters ?? [...DEFAULT_FSRS_PARAMETERS]);
}

export function desiredRetentionFor(settings: AppSettings): number {
    const value = Number(settings.desiredRetention);
    return Number.isFinite(value) && value > 0 ? value : FSRS_DEFAULT_DESIRED_RETENTION;
}

/** The decay Anki records on a card: from the preset's parameters as stored, not clamped. */
export function recordedDecayFor(settings: AppSettings): number {
    return decayFromParameters(normalizeFsrsParameters(settings.fsrsParameters ?? [...DEFAULT_FSRS_PARAMETERS]));
}

/**
 * Short-term scheduling needs the two same-day parameters to be non-zero; a parameter set trained
 * with short-term learning disabled zeroes them, and Anki then never keeps a card in learning on
 * an FSRS interval.
 */
export function fsrsAllowsShortTerm(params: readonly number[]): boolean {
    return params.length >= 19 && params[17] > 0 && params[18] > 0;
}

/**
 * Whole days between the last review and now, the way Anki measures them for FSRS: from the
 * last review to the *next* day rollover, in full 24-hour blocks
 * (`next_day_at.elapsed_days_since(last_review_time)`). A card with no known review is at 0.
 */
export function fsrsElapsedDays(lastReviewedAtMs: number, nowMs: number, rolloverHour: number): number {
    if (!(lastReviewedAtMs > 0)) return 0;
    const nextDayAtSecs = Math.floor(nextRolloverMs(nowMs, rolloverHour) / 1000);
    const lastReviewSecs = Math.floor(lastReviewedAtMs / 1000);
    return Math.max(0, Math.floor((nextDayAtSecs - lastReviewSecs) / SECONDS_PER_DAY));
}

/**
 * The memory state Anki schedules a card from. A card that has been answered before but carries
 * no state — imported from an SM-2 collection, or moved into an FSRS preset — gets one derived from
 * its review log before it is answered (`card_state_updater`). The caller supplies that derived
 * state when the card has a usable log; without one, Anki falls back to the card's own interval
 * and ease, and a card that never left learning starts from scratch.
 */
function memoryStateFor(cs: CardState, params: readonly number[], settings: AppSettings): FsrsMemoryState | null {
    const memory = cs.memoryState;
    if (memory && Number.isFinite(memory.stability) && memory.stability > 0) return memory;
    if (cs.status === 'new' || !(cs.interval > 0)) return null;
    return fsrsMemoryStateFromSm2(
        params,
        cs.easeFactor,
        cs.interval,
        settings.historicalRetention ?? FSRS_DEFAULT_HISTORICAL_RETENTION,
    );
}

/** What each answer can do, and the preset settings every branch needs. */
interface Branching {
    states: FsrsNextStates;
    fuzz: ReviewFuzz;
    maxInterval: number;
    allowShortTerm: boolean;
    shortTermWithSteps: boolean;
}

/** True when an FSRS interval below half a day keeps the card in (re)learning. */
function staysShortTerm(interval: number, steps: readonly number[], branching: Branching): boolean {
    return branching.allowShortTerm
        && (branching.shortTermWithSteps || steps.length === 0)
        && interval < SHORT_TERM_INTERVAL_DAYS;
}

/** A sub-day FSRS interval as the seconds a (re)learning step waits: `(interval * 86400) as u32`. */
function shortTermSecs(interval: number): number {
    return Math.max(0, Math.trunc(Math.fround(interval * SECONDS_PER_DAY)));
}

/** Rust's `interval.round().max(1.0)`: the whole-day interval a graduation starts from. */
function wholeDays(interval: number): number {
    return Math.max(1, Math.sign(interval) * Math.round(Math.abs(interval)));
}

/** A graduation or relearning exit: the rounded FSRS interval, fuzzed within [minimum, maximum]. */
function fuzzedReviewDays(interval: number, branching: Branching, minimum = 1): number {
    return withReviewFuzz(branching.fuzz, wholeDays(interval), minimum, Math.max(1, branching.maxInterval));
}

/** Easy always lands beyond whatever Good would have given (`answer_easy`). */
function easyReviewDays(branching: Branching): number {
    const maximum = Math.max(1, branching.maxInterval);
    const good = withReviewFuzz(branching.fuzz, branching.states.good.interval, 1, maximum);
    return fuzzedReviewDays(branching.states.easy.interval, branching, good + 1);
}

/** The step index a card is on, the way Anki derives it from the remaining-steps count. */
function currentStepIndex(stepIndex: number | undefined, steps: readonly number[]): number {
    if (steps.length === 0) return 0;
    return Math.max(0, Math.min(steps.length - 1, stepIndex ?? 0));
}

function learningOutcomes(cs: CardState, settings: AppSettings, branching: Branching): Record<Grade, FsrsOutcome> {
    const steps = settings.learningSteps;
    const step = cs.status === 'new' ? 0 : currentStepIndex(cs.learningStep, steps);
    const { states } = branching;
    const unchanged = { intervalDays: cs.interval || 0, easeFactor: cs.easeFactor, lapses: cs.lapses || 0 };
    const graduate = (days: number, memory: FsrsMemoryState): FsrsOutcome => ({
        kind: 'review',
        intervalDays: days,
        easeFactor: settings.startingEase,
        lapses: cs.lapses || 0,
        memory,
    });
    const stepOutcome = (secs: number, stepIndex: number, memory: FsrsMemoryState): FsrsOutcome => ({
        kind: 'learning', secs, stepIndex, memory, ...unchanged,
    });
    const leaveSteps = (interval: number, stepIndex: number, memory: FsrsMemoryState): FsrsOutcome => (
        staysShortTerm(interval, steps, branching)
            ? stepOutcome(shortTermSecs(interval), stepIndex, memory)
            : graduate(fuzzedReviewDays(interval, branching), memory)
    );

    const hardDelay = hardDelaySecs(steps, step);
    return {
        1: steps.length > 0
            ? stepOutcome(learningStepSecs(steps[0]), 0, states.again.memory)
            : leaveSteps(states.again.interval, 0, states.again.memory),
        2: hardDelay !== null
            ? stepOutcome(hardDelay, step, states.hard.memory)
            : leaveSteps(states.hard.interval, step, states.hard.memory),
        3: step + 1 < steps.length
            ? stepOutcome(learningStepSecs(steps[step + 1]), step + 1, states.good.memory)
            : leaveSteps(states.good.interval, step, states.good.memory),
        4: graduate(easyReviewDays(branching), states.easy.memory),
    };
}

function relearningOutcomes(cs: CardState, settings: AppSettings, branching: Branching): Record<Grade, FsrsOutcome> {
    const steps = settings.lapseSteps;
    const step = currentStepIndex(cs.relearningStep, steps);
    const { states } = branching;
    const lapses = cs.lapses || 0;
    const easeFactor = cs.easeFactor;
    const relearn = (secs: number, stepIndex: number, intervalDays: number, memory: FsrsMemoryState): FsrsOutcome => ({
        kind: 'learning', relearning: true, secs, stepIndex, intervalDays, easeFactor, lapses, memory,
    });
    const leaveSteps = (interval: number, stepIndex: number, memory: FsrsMemoryState): FsrsOutcome => {
        const days = fuzzedReviewDays(interval, branching);
        return staysShortTerm(interval, steps, branching)
            ? relearn(shortTermSecs(interval), stepIndex, days, memory)
            : { kind: 'review', intervalDays: days, easeFactor, lapses, memory };
    };

    const hardDelay = hardDelaySecs(steps, step);
    return {
        // Failing again restarts the steps and resets the interval the card will return to.
        1: steps.length > 0
            ? relearn(learningStepSecs(steps[0]), 0, wholeDays(states.again.interval), states.again.memory)
            : leaveSteps(states.again.interval, 0, states.again.memory),
        2: hardDelay !== null
            ? relearn(hardDelay, step, cs.interval, states.hard.memory)
            : leaveSteps(states.hard.interval, step, states.hard.memory),
        // Unlike a learning card, a relearning card that stays short-term on Good still uses up
        // the step it was on (`remaining_for_good`).
        3: step + 1 < steps.length
            ? relearn(learningStepSecs(steps[step + 1]), step + 1, cs.interval, states.good.memory)
            : leaveSteps(states.good.interval, step + 1, states.good.memory),
        4: { kind: 'review', intervalDays: easyReviewDays(branching), easeFactor, lapses, memory: states.easy.memory },
    };
}

function reviewOutcomes(cs: CardState, settings: AppSettings, branching: Branching): Record<Grade, FsrsOutcome> {
    const steps = settings.lapseSteps;
    const { states, fuzz } = branching;
    const scheduledDays = Math.max(0, cs.interval || 0);
    const easeFactor = cs.easeFactor;
    const lapses = cs.lapses || 0;

    // A lapse keeps FSRS's raw interval, neither fuzzed nor capped: fuzz is applied when the
    // card leaves relearning (`failing_review_interval`).
    const lapsed = {
        intervalDays: wholeDays(states.again.interval),
        easeFactor: Math.max(MINIMUM_EASE_FACTOR, easeFactor + EASE_FACTOR_AGAIN_DELTA),
        lapses: lapses + 1,
        memory: states.again.memory,
    };
    let again: FsrsOutcome;
    if (steps.length > 0) {
        again = { kind: 'learning', relearning: true, secs: learningStepSecs(steps[0]), stepIndex: 0, ...lapsed };
    } else if (staysShortTerm(states.again.interval, steps, branching)) {
        again = { kind: 'learning', relearning: true, secs: shortTermSecs(states.again.interval), stepIndex: 0, ...lapsed };
    } else {
        again = { kind: 'review', ...lapsed };
    }

    // Passing intervals chain, and fuzz may not take a grown interval back below the old one.
    const floorFor = (interval: number) => (wholeDays(interval) > scheduledDays ? scheduledDays + 1 : 0);
    const hard = constrainInterval(states.hard.interval, Math.max(floorFor(states.hard.interval), 1), branching.maxInterval, fuzz);
    const good = constrainInterval(states.good.interval, Math.max(floorFor(states.good.interval), hard + 1), branching.maxInterval, fuzz);
    const easy = constrainInterval(states.easy.interval, Math.max(floorFor(states.easy.interval), good + 1), branching.maxInterval, fuzz);

    return {
        1: again,
        2: { kind: 'review', intervalDays: hard, easeFactor: Math.max(MINIMUM_EASE_FACTOR, easeFactor + EASE_FACTOR_HARD_DELTA), lapses, memory: states.hard.memory },
        3: { kind: 'review', intervalDays: good, easeFactor, lapses, memory: states.good.memory },
        4: { kind: 'review', intervalDays: easy, easeFactor: easeFactor + EASE_FACTOR_EASY_DELTA, lapses, memory: states.easy.memory },
    };
}

/**
 * Outcomes for all four buttons. Both the answer path and the button labels read this, so a label
 * can never disagree with what pressing the button does: the fuzz comes from the card's id and
 * review count, and the load balancer from the context, exactly as in Anki.
 */
export function fsrsOutcomes(
    cs: CardState,
    settings: AppSettings,
    nowMs: number,
    context: ScheduleContext = {},
): Record<Grade, FsrsOutcome> {
    const params = fsrsParametersFor(settings);
    const memory = memoryStateFor(cs, params, settings);
    const elapsedDays = fsrsElapsedDays(cs.lastReviewedAtMs, nowMs, settings.dayRolloverHour);
    const branching: Branching = {
        states: fsrsNextStates(params, memory, desiredRetentionFor(settings), elapsedDays),
        fuzz: reviewFuzzFor(cs.cardId, cs.repetition, context.balancer ?? null),
        maxInterval: settings.maxInterval,
        allowShortTerm: fsrsAllowsShortTerm(params),
        shortTermWithSteps: settings.fsrsShortTermWithSteps ?? false,
    };

    if (cs.relearningStep !== undefined && cs.relearningStep >= 0) return relearningOutcomes(cs, settings, branching);
    if (cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0)) {
        return learningOutcomes(cs, settings, branching);
    }
    return reviewOutcomes(cs, settings, branching);
}

function scheduleResultFor(
    cs: CardState,
    outcome: FsrsOutcome,
    settings: AppSettings,
    nowMs: number,
): ScheduleResult {
    const shared = {
        memoryState: outcome.memory,
        desiredRetention: desiredRetentionFor(settings),
        decay: recordedDecayFor(settings),
        lastReviewedAtMs: nowMs,
        elapsedDays: fsrsElapsedDays(cs.lastReviewedAtMs, nowMs, settings.dayRolloverHour),
        interval: outcome.intervalDays,
        easeFactor: outcome.easeFactor,
        lapses: outcome.lapses,
    };

    if (outcome.kind === 'learning') {
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: (outcome.secs ?? 0) / 60,
            stateUpdates: {
                ...shared,
                status: 'learning',
                learningStep: outcome.relearning ? -1 : (outcome.stepIndex ?? 0),
                relearningStep: outcome.relearning ? (outcome.stepIndex ?? 0) : -1,
            },
        };
    }

    return {
        interval: outcome.intervalDays,
        isLearning: false,
        stateUpdates: {
            ...shared,
            status: 'review',
            learningStep: -1,
            relearningStep: -1,
        },
    };
}

function labelFor(outcome: FsrsOutcome): string {
    return outcome.kind === 'learning'
        ? formatMinutes((outcome.secs ?? 0) / 60)
        : formatDays(outcome.intervalDays);
}

export const FsrsEngine: SchedulerEngine = {
    name: 'FSRS',
    description: 'Free Spaced Repetition Scheduler (FSRS-6) with Anki learning steps',

    schedule: (cs, grade, settings, nowMs, context) => {
        if (grade !== 1 && grade !== 2 && grade !== 3 && grade !== 4) {
            throw new Error(`Invalid grade: ${grade}. Expected 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).`);
        }
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        const outcomes = fsrsOutcomes(cs, settings, now, context);
        return scheduleResultFor(cs, outcomes[grade], settings, now);
    },

    previewIntervals: (cs, settings, nowMs, context): IntervalPreview => {
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        const outcomes = fsrsOutcomes(cs, settings, now, context);
        const [again, hard] = [outcomes[1], outcomes[2]];

        return {
            again: labelFor(again),
            hard: labelFor(hard),
            good: labelFor(outcomes[3]),
            easy: labelFor(outcomes[4]),
            againMinutes: again.kind === 'learning'
                ? (again.secs ?? 0) / 60
                : again.intervalDays * MINUTES_PER_DAY,
            hardMinutes: hard.kind === 'learning' ? (hard.secs ?? 0) / 60 : undefined,
        };
    },
};
