import type {
    CardState,
    Grade,
    ScheduleResult,
    IntervalPreview,
    SchedulerEngine,
    AlgorithmType,
    AppSettings,
} from './types';
import { elapsedStudyDays, localDayNumber, ymdToLocalDayNumber } from './ankiState';
import { FsrsEngine } from './fsrsScheduler';
import {
    MINUTES_PER_DAY,
    addDaysLocalYMD,
    constrainInterval,
    formatDays,
    formatLearningDelay,
    formatMinutes,
    getToday,
    hardDelayMinutes,
    reviewFuzzFor,
    todayLocalYMD,
    type ReviewFuzz,
} from './schedulingIntervals';

// Ease deltas, matching Anki rslib/src/scheduler/states/review.rs.
const MINIMUM_EASE_FACTOR = 1.3;
const EASE_FACTOR_AGAIN_DELTA = -0.20;
const EASE_FACTOR_HARD_DELTA = -0.15;
const EASE_FACTOR_EASY_DELTA = 0.15;

/**
 * Post-lapse review interval: the old interval scaled by the lapse multiplier ("New interval"),
 * kept between the minimum lapse interval and the maximum interval, and fuzzed like any review
 * interval (Anki's SM-2 `failing_review_interval` goes through `with_review_fuzz`). Fuzz only
 * moves intervals of 2.5 days and more, so the default 0% multiplier is unaffected. Shared by the
 * Again button preview and the answer path so the label always matches scheduling.
 */
function lapsedReviewInterval(currentInterval: number, settings: AppSettings, fuzz?: ReviewFuzz): number {
    const cur = Math.max(1, currentInterval || 1);
    return constrainInterval(cur * settings.lapseIntervalMultiplier, settings.minLapseInterval, settings.maxInterval, fuzz);
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
    elapsedDays: number = 0,
    fuzz?: ReviewFuzz,
): { hard: number; good: number; easy: number } {
    const cur = Math.max(1, cs.interval || 1);
    const ef = cs.easeFactor || settings.startingEase;
    const hf = settings.hardIntervalMultiplier;
    const im = settings.intervalModifier;
    const max = settings.maxInterval;
    const daysLate = elapsedDays - cur;

    // Only filtered review contexts may carry negative days-late, even at zero elapsed days.
    if (daysLate < 0) {
        const elapsed = Math.max(0, elapsedDays);
        const scheduled = cur;

        const hard = constrainInterval(
            Math.max(elapsed * hf, scheduled * hf / 2) * im, 0, max,
        );
        const good = constrainInterval(
            Math.max(elapsed * ef, scheduled) * im, 0, max,
        );
        // Anki halves the easy bonus distance from 1.0 for early reviews.
        const reducedBonus = settings.easyBonus - (settings.easyBonus - 1.0) / 2.0;
        const easy = constrainInterval(
            Math.max(elapsed * ef, scheduled) * reducedBonus * im, 0, max,
        );
        return { hard, good, easy };
    }

    // Non-early path (answered on/after due). Minimums chain off the previous fuzzed value
    // so that hard <= good <= easy; hard minimum is 0 when hardFactor <= 1.0 (may shrink).
    const delay = Math.max(0, daysLate);

    const fp = fuzz;

    const hardMin = hf <= 1.0 ? 0 : cur + 1;
    const hard = constrainInterval(cur * hf * im, hardMin, max, fp);

    const goodMin = hf <= 1.0 ? cur + 1 : hard + 1;
    const good = constrainInterval((cur + delay / 2) * ef * im, goodMin, max, fp);

    const easy = constrainInterval((cur + delay) * ef * settings.easyBonus * im, good + 1, max, fp);

    return { hard, good, easy };
}

/**
 * The interval a relearning card returns to review on: the one its lapse already settled. The
 * minimum lapse interval was applied when the card lapsed and is not applied a second time here.
 */
function relearnedInterval(cs: CardState): number {
    return Math.max(1, Math.round(cs.interval || 1));
}

/** Relearning Easy interval: the preserved lapse interval + 1 day, as Anki adds it (no clamp). */
function computeRelearningEasyInterval(cs: CardState): number {
    return relearnedInterval(cs) + 1;
}

/**
 * Days since the card was last answered. The decoded state already carries Anki's fallback for
 * cards with no recorded review time (ankiState `elapsedSinceLastReview`), so a card imported
 * without a review log still reports a real elapsed count instead of "answered today".
 */
export function withClassicReviewContext(cs: CardState, filtered: boolean): CardState {
    return Object.assign({}, cs, { filteredReview: filtered });
}

function elapsedDaysFor(cs: CardState, now: number, settings: AppSettings): number {
    if (cs.status === 'review') {
        const today = localDayNumber(now, settings.dayRolloverHour);
        const due = ymdToLocalDayNumber(cs.dueDate, today);
        const daysLate = today - due;
        const filtered = (cs as CardState & { filteredReview?: boolean }).filteredReview;
        return Math.max(0, cs.interval + (filtered ? daysLate : Math.max(0, daysLate)));
    }
    if (cs.lastReviewedAtMs && cs.lastReviewedAtMs > 0) {
        return elapsedStudyDays(cs.lastReviewedAtMs, now, settings.dayRolloverHour);
    }
    return Math.max(0, cs.elapsedDays || 0);
}

const AnkiV3Engine: SchedulerEngine = {
    name: 'ANKI_V3',
    description: 'Anki V3 compatible scheduler (learning/relearning/review)',

    schedule: (cs, grade, settings, nowMs, context): ScheduleResult => {
        if (grade !== 1 && grade !== 2 && grade !== 3 && grade !== 4) {
            throw new Error(`Invalid grade: ${grade}. Expected 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).`);
        }
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        const elapsedDays = elapsedDaysFor(cs, now, settings);
        const isRelearning = cs.relearningStep !== undefined && cs.relearningStep >= 0;
        const isLearning = cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0);
        const fuzz = reviewFuzzFor(cs.cardId, cs.repetition, context?.balancer ?? null);

        if (isRelearning) return ankiV3Relearning(cs, grade, settings, now, elapsedDays, fuzz);
        if (isLearning) return ankiV3Learning(cs, grade, settings, now, elapsedDays, fuzz);
        return ankiV3Review(cs, grade, settings, now, elapsedDays, fuzz);
    },

    previewIntervals: (cs, settings, nowMs, context): IntervalPreview => {
        const now = nowMs ?? Date.now();
        // Use exactly the answer path, including the card-id/reps fuzz and load balancer.
        const results = ([1, 2, 3, 4] as const).map((grade) => AnkiV3Engine.schedule(cs, grade, settings, now, context));
        // A step that reaches past the next rollover is stored in days, so it is labelled in days.
        const label = (result: ScheduleResult) => result.isLearning
            ? formatLearningDelay(result.minutesUntilDue ?? 0, now, settings.dayRolloverHour)
            : formatDays(result.interval);
        const minutes = (result: ScheduleResult) => result.isLearning
            ? result.minutesUntilDue ?? 0
            : result.interval * MINUTES_PER_DAY;
        return {
            again: label(results[0]), hard: label(results[1]), good: label(results[2]), easy: label(results[3]),
            againMinutes: minutes(results[0]), hardMinutes: minutes(results[1]),
        };
    },
};

function ankiV3Learning(
    cs: CardState,
    grade: Grade,
    settings: AppSettings,
    now: number,
    elapsedDays: number,
    fuzz: ReviewFuzz,
): ScheduleResult {
    const steps = settings.learningSteps;
    const step = cs.learningStep || 0;
    const nextMin = steps[step + 1] ?? null;

    // With no learning steps Anki has nothing to repeat: Again and Hard graduate on the
    // graduating interval, like Good (rslib states/learning.rs, SM-2 branch).
    if (steps.length === 0 && (grade === 1 || grade === 2)) {
        const gradInterval = constrainInterval(settings.graduatingInterval, 1, settings.maxInterval, fuzz);
        return {
            interval: gradInterval,
            isLearning: false,
            stateUpdates: {
                learningStep: -1,
                relearningStep: -1,
                status: 'review',
                interval: gradInterval,
                easeFactor: settings.startingEase,
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    if (grade === 1) {
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: steps[0] || 1,
            stateUpdates: {
                learningStep: 0,
                relearningStep: -1,
                status: 'learning',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    if (grade === 2) {
        const delayMin = hardDelayMinutes(steps, step);
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: delayMin,
            stateUpdates: {
                learningStep: step,
                relearningStep: -1,
                status: 'learning',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    if (grade === 3) {
        if (nextMin !== null) {
            return {
                interval: 0,
                isLearning: true,
                minutesUntilDue: nextMin,
                stateUpdates: {
                    learningStep: step + 1,
                    relearningStep: -1,
                    status: 'learning',
                    lastReviewedAtMs: now,
                    elapsedDays,
                },
            };
        }

        // Graduate: fuzzed graduating interval + initial ease factor.
        const gradInterval = constrainInterval(settings.graduatingInterval, 1, settings.maxInterval, fuzz);
        return {
            interval: gradInterval,
            isLearning: false,
            stateUpdates: {
                learningStep: -1,
                relearningStep: -1,
                status: 'review',
                interval: gradInterval,
                easeFactor: settings.startingEase,
                repetition: (cs.repetition || 0) + 1,
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    // Easy: graduate immediately with the fuzzed easy interval + initial ease factor.
    const easyInt = constrainInterval(settings.easyInterval, 1, settings.maxInterval, fuzz);
    return {
        interval: easyInt,
        isLearning: false,
        stateUpdates: {
            learningStep: -1,
            relearningStep: -1,
            status: 'review',
            interval: easyInt,
            easeFactor: settings.startingEase,
            repetition: (cs.repetition || 0) + 1,
            lastReviewedAtMs: now,
            elapsedDays,
        },
    };
}

function ankiV3Relearning(
    cs: CardState,
    grade: Grade,
    settings: AppSettings,
    now: number,
    elapsedDays: number,
    fuzz: ReviewFuzz,
): ScheduleResult {
    const steps = settings.lapseSteps;
    const step = cs.relearningStep;
    const nextMin = steps[step + 1] ?? null;

    // With no relearning steps left to run, Anki returns the card to review on the interval it
    // was given when it lapsed (rslib states/relearning.rs, SM-2 branch).
    if (steps.length === 0 && grade !== 4) {
        const relearnInterval = relearnedInterval(cs);
        return {
            interval: relearnInterval,
            isLearning: false,
            stateUpdates: {
                relearningStep: -1,
                learningStep: -1,
                status: 'review',
                interval: relearnInterval,
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    if (grade === 1) {
        // Failing a relearning step lapses the pending interval once more: "New interval" applies
        // to it again (with fuzz), without counting another lapse or touching the ease.
        const reduced = lapsedReviewInterval(cs.interval, settings, fuzz);
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: steps[0] || 1,
            stateUpdates: {
                interval: reduced,
                relearningStep: 0,
                learningStep: -1,
                status: 'learning',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    if (grade === 2) {
        const delayMin = hardDelayMinutes(steps, step);
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: delayMin,
            stateUpdates: {
                relearningStep: step,
                learningStep: -1,
                status: 'learning',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    if (grade === 3) {
        if (nextMin !== null) {
            return {
                interval: 0,
                isLearning: true,
                minutesUntilDue: nextMin,
                stateUpdates: {
                    relearningStep: step + 1,
                    learningStep: -1,
                    status: 'learning',
                    lastReviewedAtMs: now,
                    elapsedDays,
                },
            };
        }

        const relearnInterval = relearnedInterval(cs);
        return {
            interval: relearnInterval,
            isLearning: false,
            stateUpdates: {
                relearningStep: -1,
                learningStep: -1,
                status: 'review',
                interval: relearnInterval,
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    // Easy: graduate with interval + 1. Anki does not change ease here.
    const relearnEasyInterval = computeRelearningEasyInterval(cs);
    return {
        interval: relearnEasyInterval,
        isLearning: false,
        stateUpdates: {
            relearningStep: -1,
            learningStep: -1,
            status: 'review',
            interval: relearnEasyInterval,
            lastReviewedAtMs: now,
            elapsedDays,
        },
    };
}

function ankiV3Review(
    cs: CardState,
    grade: Grade,
    settings: AppSettings,
    now: number,
    elapsedDays: number,
    fuzz: ReviewFuzz,
): ScheduleResult {
    const ef = cs.easeFactor || settings.startingEase;
    const cur = Math.max(1, cs.interval || 1);
    const lapseSteps = settings.lapseSteps;

    if (grade === 1) {
        const newInterval = lapsedReviewInterval(cur, settings, fuzz);
        const newEase = Math.max(MINIMUM_EASE_FACTOR, ef + EASE_FACTOR_AGAIN_DELTA);
        const lapses = (cs.lapses || 0) + 1;

        // With no relearning steps configured, Anki does not demote the card into relearning; it
        // returns straight to review with the reduced interval (rslib review.rs `again_review`).
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
            minutesUntilDue: lapseSteps[0] || 1,
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
    const intervals = computeReviewIntervals(cs, settings, elapsedDays, fuzz);

    if (grade === 2) {
        const newEase = Math.max(MINIMUM_EASE_FACTOR, ef + EASE_FACTOR_HARD_DELTA);

        return {
            interval: intervals.hard,
            isLearning: false,
            stateUpdates: {
                interval: intervals.hard,
                easeFactor: newEase,
                learningStep: -1,
                relearningStep: -1,
                repetition: (cs.repetition || 0) + 1,
                status: 'review',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    if (grade === 3) {
        return {
            interval: intervals.good,
            isLearning: false,
            stateUpdates: {
                interval: intervals.good,
                easeFactor: ef,
                learningStep: -1,
                relearningStep: -1,
                repetition: (cs.repetition || 0) + 1,
                status: 'review',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    const newEase = Math.max(MINIMUM_EASE_FACTOR, ef + EASE_FACTOR_EASY_DELTA);

    return {
        interval: intervals.easy,
        isLearning: false,
        stateUpdates: {
            interval: intervals.easy,
            easeFactor: newEase,
            learningStep: -1,
            relearningStep: -1,
            repetition: (cs.repetition || 0) + 1,
            status: 'review',
            lastReviewedAtMs: now,
            elapsedDays,
        },
    };
}

const engines: Record<AlgorithmType, SchedulerEngine> = {
    ANKI_V3: AnkiV3Engine,
    FSRS: FsrsEngine,
};

/**
 * Anki keeps one scheduler and switches only the interval maths, so the engine follows the
 * collection's FSRS toggle rather than a separately stored algorithm name.
 */
export function schedulerForSettings(settings: AppSettings): SchedulerEngine {
    return settings.fsrsEnabled ? FsrsEngine : AnkiV3Engine;
}

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
};
