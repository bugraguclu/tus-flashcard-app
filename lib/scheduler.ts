import type {
    CardState,
    Grade,
    ScheduleResult,
    IntervalPreview,
    SchedulerEngine,
    AlgorithmType,
    AppSettings,
} from './types';

const HOUR_MS = 3600000;
const MINUTES_PER_DAY = 1440;
const SECONDS_PER_DAY = 86400;

// Ease deltas, matching Anki rslib/src/scheduler/states/review.rs.
const MINIMUM_EASE_FACTOR = 1.3;
const EASE_FACTOR_AGAIN_DELTA = -0.20;
const EASE_FACTOR_HARD_DELTA = -0.15;
const EASE_FACTOR_EASY_DELTA = 0.15;

/** Shift a Date back by the rollover hour to derive the Anki "study day". */
function toRolloverShiftedDate(input: Date, rolloverHour: number): Date {
    return new Date(input.getTime() - rolloverHour * HOUR_MS);
}

function formatYMD(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/** Today's study day as YYYY-MM-DD, respecting the rollover hour. */
function todayLocalYMD(now?: Date, rolloverHour: number = 4): string {
    return formatYMD(toRolloverShiftedDate(now ?? new Date(), rolloverHour));
}

/** The study day `days` after `baseDate` as YYYY-MM-DD. */
function addDaysLocalYMD(days: number, baseDate?: Date, rolloverHour: number = 4): string {
    const shifted = toRolloverShiftedDate(baseDate ?? new Date(), rolloverHour);
    const result = new Date(shifted.getTime());
    result.setDate(result.getDate() + days);
    return formatYMD(result);
}

function getToday(rolloverHour: number = 4): string {
    return todayLocalYMD(undefined, rolloverHour);
}

// Duration formatting for the UI (Turkish strings are intentional).
function formatDays(days: number): string {
    if (days <= 0) return '< 1dk';
    if (days === 1) return '1 gün';
    if (days < 30) return `${days} gün`;
    if (days < 365) {
        const months = days / 30;
        return months < 1.5 ? '1 ay' : `${Math.round(months)} ay`;
    }
    return `${(days / 365).toFixed(1)} yıl`;
}

function formatMinutes(minutes: number): string {
    if (minutes < 60) return `${Math.round(minutes)}dk`;
    if (minutes < MINUTES_PER_DAY) return `${Math.round(minutes / 60)}sa`;
    return formatDays(Math.round(minutes / MINUTES_PER_DAY));
}

/**
 * Fuzz factor in [0, 1) for one answer, seeded the way Anki seeds it (rslib answering/mod.rs
 * `get_fuzz_seed`): the card id plus the reviews the card had before this answer, so all four
 * buttons of one answer share a factor and it moves on at the next review. Anki draws the
 * factor from rand's ChaCha-based StdRng; this uses a splitmix32 mix instead, so the fuzz
 * range below is Anki's exactly while the day picked inside it is a different draw.
 */
function fuzzFactorFor(cardId: number, repetition: number): number {
    let z = ((cardId >>> 0) + (repetition >>> 0) + 0x9e3779b9) >>> 0;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    z = (z ^ (z >>> 15)) >>> 0;
    return z / 4294967296;
}

// Start day, end day and factor of each of Anki's FUZZ_RANGES (states/fuzz.rs).
const FUZZ_RANGES: [number, number, number][] = [
    [2.5, 7.0, 0.15],
    [7.0, 20.0, 0.10],
    [20.0, Infinity, 0.05],
];

/** Anki's fuzz_delta: intervals under 2.5 days get none, the rest a day plus the range factors. */
function fuzzDelta(interval: number): number {
    if (interval < 2.5) return 0;
    let delta = 1.0;
    for (const [start, end, factor] of FUZZ_RANGES) {
        delta += factor * Math.max(0, Math.min(interval, end) - start);
    }
    return delta;
}

/** Anki's fuzz_bounds: the unconstrained fuzz range around an interval. */
function fuzzBounds(interval: number): [number, number] {
    const delta = fuzzDelta(interval);
    return [Math.round(interval - delta), Math.round(interval + delta)];
}

/** Anki's constrained_fuzz_bounds: that range, held inside [minimum, maximum]. */
function constrainedFuzzBounds(interval: number, minimum: number, maximum: number): [number, number] {
    const min = Math.min(minimum, maximum);
    const clamped = Math.min(Math.max(interval, min), maximum);
    const [rawLower, rawUpper] = fuzzBounds(clamped);

    const lower = Math.min(Math.max(rawLower, min), maximum);
    let upper = Math.min(Math.max(rawUpper, min), maximum);
    if (upper === lower && upper > 2 && upper < maximum) {
        upper = lower + 1;
    }

    return [lower, upper];
}

/** Anki's with_review_fuzz: a day out of the fuzz range, or a rounded clamp when fuzz is off. */
function withReviewFuzz(
    fuzzFactor: number | null,
    interval: number,
    minimum: number,
    maximum: number,
): number {
    if (fuzzFactor === null) {
        return Math.min(Math.max(Math.round(interval), minimum), maximum);
    }
    const [lower, upper] = constrainedFuzzBounds(interval, minimum, maximum);
    return Math.floor(lower + fuzzFactor * (1 + upper - lower));
}

/** Anki's min_and_max_review_intervals: at least a day, and a minimum never beats the maximum. */
function minAndMaxReviewIntervals(settings: AppSettings, minimum: number): [number, number] {
    const maximum = Math.max(1, Math.round(settings.maxInterval));
    return [Math.min(Math.max(Math.round(minimum), 1), maximum), maximum];
}

/** Anki's constrain_passing_interval: the interval modifier, then the bounds, then fuzz. */
function constrainPassingInterval(
    settings: AppSettings,
    interval: number,
    minimum: number,
    fuzzFactor: number | null,
): number {
    const [min, max] = minAndMaxReviewIntervals(settings, minimum);
    return withReviewFuzz(fuzzFactor, interval * settings.intervalModifier, min, max);
}

/** A graduating interval as Anki schedules it: rounded, at least a day, fuzzed, capped. */
function graduatingInterval(settings: AppSettings, days: number, fuzzFactor: number | null): number {
    const [minimum, maximum] = minAndMaxReviewIntervals(settings, 1);
    return withReviewFuzz(fuzzFactor, Math.max(1, Math.round(days)), minimum, maximum);
}

/**
 * Post-lapse review interval, matching Anki's failing_review_interval (states/review.rs): the
 * scheduled days scaled by the lapse multiplier, fuzzed, with the minimum lapse interval as the
 * lower bound. The interval modifier deliberately does not apply here.
 */
function failingReviewInterval(
    cs: CardState,
    settings: AppSettings,
    fuzzFactor: number | null,
): number {
    const [minimum, maximum] = minAndMaxReviewIntervals(settings, settings.minLapseInterval);
    const scheduled = Math.max(1, Math.round(cs.interval || 0));
    return withReviewFuzz(fuzzFactor, scheduled * settings.lapseIntervalMultiplier, minimum, maximum);
}

/** The days a relearning card carries back to review: the interval it already holds. */
function relearnReviewInterval(cs: CardState): number {
    return Math.max(0, Math.round(cs.interval || 0));
}

/** Anki keeps steps as minutes but schedules in whole seconds (states/steps.rs `to_secs`). */
function stepSecs(minutes: number): number {
    return Math.trunc(minutes * 60);
}

/** The same step in minutes, truncated to the whole second Anki would have used. */
function stepMinutes(minutes: number): number {
    return stepSecs(minutes) / 60;
}

/** Anki's maybe_round_in_days: past a day, round to whole days. Seconds in, seconds out. */
function maybeRoundInDays(secs: number): number {
    if (secs > SECONDS_PER_DAY) {
        return Math.round(secs / SECONDS_PER_DAY) * SECONDS_PER_DAY;
    }
    return secs;
}

/**
 * Hard-button delay for learning/relearning steps, matching Anki's hard_delay_secs
 * (states/steps.rs). Step 0: the average of the first two steps, or 50% more than the first one
 * capped at +1 day when it stands alone. Later steps: the current step delay, unchanged.
 */
function hardDelaySecs(steps: number[], stepIndex: number): number | null {
    // No steps left to sit on: Anki graduates the card instead of inventing a delay.
    if (steps.length === 0) return null;

    // Anki derives the index from the remaining steps and clamps it to the last one, so a card
    // keeps working after the preset's step list is shortened underneath it.
    const index = Math.min(Math.max(0, stepIndex), steps.length - 1);
    const current = stepSecs(steps[index]);

    if (index !== 0) return current;

    const next = steps[1];
    if (next !== undefined) {
        return maybeRoundInDays(Math.floor((current + stepSecs(next)) / 2));
    }
    return maybeRoundInDays(Math.min(Math.floor((current * 3) / 2), current + SECONDS_PER_DAY));
}

/** The same delay in minutes, the unit the rest of the app schedules learning steps in. */
function hardDelayMinutes(steps: number[], stepIndex: number): number | null {
    const secs = hardDelaySecs(steps, stepIndex);
    return secs === null ? null : secs / 60;
}

/**
 * Anki adds up to 25% (never more than 5 minutes) to an intraday step before it writes the due
 * time, so cards answered together do not all come back together
 * (rslib answering/learning.rs `learning_ivl_with_fuzz`). Seconds in, seconds out.
 */
function learningDelayWithFuzz(secs: number, cardId: number, repetition: number): number {
    const base = Math.max(0, Math.trunc(secs));
    const upperExclusive = base + Math.floor(Math.min(base * 0.25, 300));
    if (base >= upperExclusive) return base;
    return base + Math.floor(fuzzFactorFor(cardId, repetition) * (upperExclusive - base));
}

/**
 * Review intervals for Hard/Good/Easy, covering both paths from Anki's review.rs:
 *  - Early (days_late < 0): elapsed days as base, no fuzz, no chained minimums, reduced easy bonus.
 *  - Non-early (days_late >= 0): current interval + overdue bonus, fuzzed, chained minimums.
 * intervalModifier applies to all grades in both paths.
 */
function computeReviewIntervals(
    cs: CardState,
    settings: AppSettings,
    elapsedDays: number,
    fuzzFactor: number | null,
): { hard: number; good: number; easy: number } {
    const scheduledDays = Math.max(0, Math.round(cs.interval || 0));
    const cur = Math.max(1, scheduledDays);
    const ef = cs.easeFactor || settings.startingEase;
    const hf = settings.hardIntervalMultiplier;
    const daysLate = elapsedDays - scheduledDays;

    // Early path (answered before due). `elapsedDays` comes from the card's due date the way
    // Anki derives it, so a normal-deck card can never land here — only a filtered one.
    if (daysLate < 0) {
        const elapsed = elapsedDays;

        const hard = constrainPassingInterval(
            settings, Math.max(elapsed * hf, cur * (hf / 2)), 0, null,
        );
        const good = constrainPassingInterval(settings, Math.max(elapsed * ef, cur), 0, null);
        // Anki halves the easy bonus distance from 1.0 for early reviews.
        const reducedBonus = settings.easyBonus - (settings.easyBonus - 1.0) / 2.0;
        const easy = constrainPassingInterval(
            settings, Math.max(elapsed * ef, cur) * reducedBonus, 0, null,
        );
        return { hard, good, easy };
    }

    // Non-early path (answered on/after due). Minimums chain off the previous fuzzed value
    // so that hard <= good <= easy; hard minimum is 0 when hardFactor <= 1.0 (may shrink).
    const delay = Math.max(0, daysLate);

    const hardMin = hf <= 1.0 ? 0 : scheduledDays + 1;
    const hard = constrainPassingInterval(settings, cur * hf, hardMin, fuzzFactor);

    const goodMin = hf <= 1.0 ? scheduledDays + 1 : hard + 1;
    const good = constrainPassingInterval(settings, (cur + delay / 2) * ef, goodMin, fuzzFactor);

    const easy = constrainPassingInterval(
        settings, (cur + delay) * ef * settings.easyBonus, good + 1, fuzzFactor,
    );

    return { hard, good, easy };
}

const AnkiV3Engine: SchedulerEngine = {
    name: 'ANKI_V3',
    description: 'Anki V3 compatible scheduler (learning/relearning/review)',

    schedule: (cs: CardState, grade: Grade, settings: AppSettings, nowMs?: number): ScheduleResult => {
        if (grade !== 1 && grade !== 2 && grade !== 3 && grade !== 4) {
            throw new Error(`Invalid grade: ${grade}. Expected 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).`);
        }
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        const elapsedDays = Math.max(0, cs.elapsedDays || 0);
        const fuzzFactor = fuzzFactorFor(cs.cardId, cs.repetition || 0);
        const isRelearning = cs.relearningStep !== undefined && cs.relearningStep >= 0;
        const isLearning = cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0);

        const result = isRelearning
            ? ankiV3Relearning(cs, grade, settings, now, elapsedDays, fuzzFactor)
            : isLearning
                ? ankiV3Learning(cs, grade, settings, now, elapsedDays, fuzzFactor)
                : ankiV3Review(cs, grade, settings, now, elapsedDays, fuzzFactor);

        // Anki counts every answer, including the ones that only walk a card along its learning
        // steps (rslib answering/mod.rs `apply_normal_study_state`).
        return {
            ...result,
            stateUpdates: { ...result.stateUpdates, repetition: (cs.repetition || 0) + 1 },
        };
    },

    previewIntervals: (cs: CardState, settings: AppSettings): IntervalPreview => {
        const elapsedDays = Math.max(0, cs.elapsedDays || 0);
        // Anki labels the buttons from the very states it is about to apply, fuzz included, so a
        // label always names the day the card will land on (answering `get_scheduling_states`).
        const fuzzFactor = fuzzFactorFor(cs.cardId, cs.repetition || 0);
        const learningSteps = settings.learningSteps;
        const lapseSteps = settings.lapseSteps;
        const isRelearning = cs.relearningStep !== undefined && cs.relearningStep >= 0;
        const isLearning = cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0);

        if (isLearning && !isRelearning) {
            const step = cs.learningStep || 0;
            const nextStep = learningSteps[step + 1];
            const nextMin = nextStep !== undefined ? stepMinutes(nextStep) : null;
            const hardMin = hardDelayMinutes(learningSteps, step);
            const graduating = graduatingInterval(settings, settings.graduatingInterval, fuzzFactor);
            const easyDays = graduatingInterval(settings, settings.easyInterval, fuzzFactor);
            // Without steps every button graduates the card, so Again and Hard show days too.
            const noSteps = learningSteps.length === 0;

            return {
                again: noSteps ? formatDays(graduating) : formatMinutes(stepMinutes(learningSteps[0])),
                hard: hardMin === null ? formatDays(graduating) : formatMinutes(hardMin),
                good: nextMin !== null ? formatMinutes(nextMin) : formatDays(graduating),
                easy: formatDays(easyDays),
                againMinutes: noSteps ? graduating * MINUTES_PER_DAY : stepMinutes(learningSteps[0]),
                hardMinutes: hardMin ?? graduating * MINUTES_PER_DAY,
            };
        }

        if (isRelearning) {
            const step = cs.relearningStep;
            const nextStep = lapseSteps[step + 1];
            const nextMin = nextStep !== undefined ? stepMinutes(nextStep) : null;
            const hardMin = hardDelayMinutes(lapseSteps, step);
            const reviewInterval = relearnReviewInterval(cs);

            // With the relearning steps removed, Anki hands the card straight back to review
            // carrying the interval it already holds.
            const noSteps = lapseSteps.length === 0;

            return {
                again: noSteps ? formatDays(reviewInterval) : formatMinutes(stepMinutes(lapseSteps[0])),
                hard: hardMin === null ? formatDays(reviewInterval) : formatMinutes(hardMin),
                good: nextMin !== null ? formatMinutes(nextMin) : formatDays(reviewInterval),
                easy: formatDays(reviewInterval + 1),
                againMinutes: noSteps ? reviewInterval * MINUTES_PER_DAY : stepMinutes(lapseSteps[0]),
                hardMinutes: hardMin ?? reviewInterval * MINUTES_PER_DAY,
            };
        }

        // Review state: the same fuzzed intervals the answer itself will apply.
        const preview = computeReviewIntervals(cs, settings, elapsedDays, fuzzFactor);
        // With no relearning steps, Again returns to review with the reduced interval (days),
        // so label it as days rather than the first relearning step.
        const lapsedInterval = failingReviewInterval(cs, settings, fuzzFactor);
        return {
            again: lapseSteps.length === 0
                ? formatDays(lapsedInterval)
                : formatMinutes(stepMinutes(lapseSteps[0])),
            hard: formatDays(preview.hard),
            good: formatDays(preview.good),
            easy: formatDays(preview.easy),
            againMinutes: lapseSteps.length === 0
                ? lapsedInterval * MINUTES_PER_DAY
                : stepMinutes(lapseSteps[0]),
        };
    },
};

function ankiV3Learning(
    cs: CardState,
    grade: Grade,
    settings: AppSettings,
    now: number,
    elapsedDays: number,
    fuzzFactor: number | null,
): ScheduleResult {
    const steps = settings.learningSteps;
    const step = cs.learningStep || 0;
    const nextStep = steps[step + 1];
    const nextMin = nextStep !== undefined ? stepMinutes(nextStep) : null;

    /**
     * Anki graduates on any button once there are no steps left to sit on (states/learning.rs).
     * The card enters review as a fresh one: initial ease, and the lapse count back at zero.
     */
    const graduate = (days: number): ScheduleResult => {
        const interval = graduatingInterval(settings, days, fuzzFactor);
        return {
            interval,
            isLearning: false,
            stateUpdates: {
                learningStep: -1,
                relearningStep: -1,
                status: 'review',
                interval,
                easeFactor: settings.startingEase,
                lapses: 0,
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    };

    /** Stay in learning, sitting on `stepIndex` until `minutes` have passed. */
    const onStep = (stepIndex: number, minutes: number): ScheduleResult => ({
        interval: 0,
        isLearning: true,
        minutesUntilDue: minutes,
        stateUpdates: {
            learningStep: stepIndex,
            relearningStep: -1,
            status: 'learning',
            lastReviewedAtMs: now,
            elapsedDays,
        },
    });

    if (grade === 1) {
        if (steps.length === 0) return graduate(settings.graduatingInterval);
        return onStep(0, stepMinutes(steps[0]));
    }

    if (grade === 2) {
        const delayMin = hardDelayMinutes(steps, step);
        if (delayMin === null) return graduate(settings.graduatingInterval);
        return onStep(step, delayMin);
    }

    if (grade === 3) {
        if (nextMin !== null) return onStep(step + 1, nextMin);
        return graduate(settings.graduatingInterval);
    }

    // Easy graduates immediately, on the easy interval rather than the graduating one.
    return graduate(settings.easyInterval);
}

function ankiV3Relearning(
    cs: CardState,
    grade: Grade,
    settings: AppSettings,
    now: number,
    elapsedDays: number,
    fuzzFactor: number | null,
): ScheduleResult {
    const steps = settings.lapseSteps;
    const step = cs.relearningStep;
    const nextStep = steps[step + 1];
    const nextMin = nextStep !== undefined ? stepMinutes(nextStep) : null;
    const reviewInterval = relearnReviewInterval(cs);

    /**
     * With no relearning steps left, Anki hands the card back to the review state it was already
     * carrying — the lapse multiplier was applied when the card first failed.
     */
    const backToReview = (interval: number): ScheduleResult => ({
        interval,
        isLearning: false,
        stateUpdates: {
            relearningStep: -1,
            learningStep: -1,
            status: 'review',
            interval,
            lastReviewedAtMs: now,
            elapsedDays,
        },
    });

    /** Stay in relearning, sitting on `stepIndex` until `minutes` have passed. */
    const onStep = (
        stepIndex: number,
        minutes: number,
        interval?: number,
    ): ScheduleResult => ({
        interval: 0,
        isLearning: true,
        minutesUntilDue: minutes,
        stateUpdates: {
            relearningStep: stepIndex,
            learningStep: -1,
            status: 'learning',
            ...(interval === undefined ? null : { interval }),
            lastReviewedAtMs: now,
            elapsedDays,
        },
    });

    if (grade === 1) {
        // Anki re-applies the lapse multiplier when it sends the card back to the first step,
        // but leaves the interval alone when there is no step to go back to
        // (states/relearning.rs `answer_again`).
        if (steps.length === 0) return backToReview(reviewInterval);
        return onStep(0, stepMinutes(steps[0]), failingReviewInterval(cs, settings, fuzzFactor));
    }

    if (grade === 2) {
        const delayMin = hardDelayMinutes(steps, step);
        if (delayMin === null) return backToReview(reviewInterval);
        return onStep(step, delayMin);
    }

    if (grade === 3) {
        if (nextMin !== null) return onStep(step + 1, nextMin);
        return backToReview(reviewInterval);
    }

    // Easy: back to review with a day added. Anki does not touch the ease factor here.
    return backToReview(reviewInterval + 1);
}

function ankiV3Review(
    cs: CardState,
    grade: Grade,
    settings: AppSettings,
    now: number,
    elapsedDays: number,
    fuzzFactor: number | null,
): ScheduleResult {
    const ef = cs.easeFactor || settings.startingEase;
    const lapseSteps = settings.lapseSteps;

    if (grade === 1) {
        const newInterval = failingReviewInterval(cs, settings, fuzzFactor);
        const newEase = Math.max(MINIMUM_EASE_FACTOR, ef + EASE_FACTOR_AGAIN_DELTA);
        const lapses = (cs.lapses || 0) + 1;

        // With no relearning steps configured, Anki does not demote the card into relearning; it
        // returns straight to review with the reduced interval (rslib review.rs `answer_again`).
        if (lapseSteps.length === 0) {
            return {
                interval: newInterval,
                isLearning: false,
                stateUpdates: {
                    interval: newInterval,
                    easeFactor: newEase,
                    relearningStep: -1,
                    learningStep: -1,
                    lapses,
                    status: 'review',
                    lastReviewedAtMs: now,
                    elapsedDays,
                },
            };
        }

        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: stepMinutes(lapseSteps[0]),
            stateUpdates: {
                interval: newInterval,
                easeFactor: newEase,
                relearningStep: 0,
                learningStep: -1,
                lapses,
                status: 'learning',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    // Fuzzed intervals with chained minimums guarantee hard <= good <= easy.
    const intervals = computeReviewIntervals(cs, settings, elapsedDays, fuzzFactor);

    /** Land back in review on `interval` days with `easeFactor`. */
    const toReview = (interval: number, easeFactor: number): ScheduleResult => ({
        interval,
        isLearning: false,
        stateUpdates: {
            interval,
            easeFactor,
            learningStep: -1,
            relearningStep: -1,
            status: 'review',
            lastReviewedAtMs: now,
            elapsedDays,
        },
    });

    if (grade === 2) {
        return toReview(intervals.hard, Math.max(MINIMUM_EASE_FACTOR, ef + EASE_FACTOR_HARD_DELTA));
    }

    if (grade === 3) {
        return toReview(intervals.good, ef);
    }

    // Anki does not floor the easy ease at the minimum: the delta only ever raises it.
    return toReview(intervals.easy, ef + EASE_FACTOR_EASY_DELTA);
}

const engines: Record<AlgorithmType, SchedulerEngine> = {
    ANKI_V3: AnkiV3Engine,
};

export function getScheduler(type: AlgorithmType = 'ANKI_V3'): SchedulerEngine {
    return engines[type] || AnkiV3Engine;
}

export function getAvailableAlgorithms(): { type: AlgorithmType; name: string; description: string }[] {
    return Object.entries(engines).map(([type, engine]) => ({
        type: type as AlgorithmType,
        name: engine.name,
        description: engine.description,
    }));
}

export {
    formatDays,
    formatMinutes,
    getToday,
    todayLocalYMD,
    addDaysLocalYMD,
    learningDelayWithFuzz,
    withReviewFuzz,
    constrainedFuzzBounds,
    minAndMaxReviewIntervals,
};
