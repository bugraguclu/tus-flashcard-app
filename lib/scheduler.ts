import type {
    CardState,
    Grade,
    ScheduleResult,
    IntervalPreview,
    SchedulerEngine,
    AlgorithmType,
    AppSettings,
} from './types';
import { elapsedStudyDays } from './ankiState';
import { FsrsEngine } from './fsrsScheduler';
import {
    MINUTES_PER_DAY,
    addDaysLocalYMD,
    constrainInterval,
    formatDays,
    formatMinutes,
    getToday,
    hardDelayMinutes,
    todayLocalYMD,
} from './schedulingIntervals';

// Ease deltas, matching Anki rslib/src/scheduler/states/review.rs.
const MINIMUM_EASE_FACTOR = 1.3;
const EASE_FACTOR_AGAIN_DELTA = -0.20;
const EASE_FACTOR_HARD_DELTA = -0.15;
const EASE_FACTOR_EASY_DELTA = 0.15;

/** Clamp an interval to [1, maxInterval]. */
function clampInterval(interval: number, settings: AppSettings): number {
    return Math.max(1, Math.min(settings.maxInterval, Math.round(interval)));
}

/**
 * Post-lapse review interval: the old interval scaled by the lapse multiplier, floored at
 * minLapseInterval and clamped (rslib answering.rs `lapsed_interval`). Shared by the Again
 * button preview and the actual review-answer path so the label always matches scheduling.
 */
function lapsedReviewInterval(currentInterval: number, settings: AppSettings): number {
    const cur = Math.max(1, currentInterval || 1);
    return clampInterval(
        Math.max(settings.minLapseInterval, Math.round(cur * settings.lapseIntervalMultiplier)),
        settings,
    );
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
    fuzz?: { cardId: number; nowMs: number },
): { hard: number; good: number; easy: number } {
    const cur = Math.max(1, cs.interval || 1);
    const ef = cs.easeFactor || settings.startingEase;
    const hf = settings.hardIntervalMultiplier;
    const im = settings.intervalModifier;
    const max = settings.maxInterval;
    const daysLate = elapsedDays - cur;

    // Early path (answered before due). Guard elapsedDays > 0 to avoid false early detection
    // for cards with no review history.
    if (daysLate < 0 && elapsedDays > 0) {
        const elapsed = Math.max(1, elapsedDays);
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

    const fp = fuzz
        ? { cardId: cs.cardId, nowMs: fuzz.nowMs, rolloverHour: settings.dayRolloverHour }
        : undefined;

    const hardMin = hf <= 1.0 ? 0 : cur + 1;
    const hard = constrainInterval(cur * hf * im, hardMin, max, fp);

    const goodMin = hf <= 1.0 ? cur + 1 : hard + 1;
    const good = constrainInterval((cur + delay / 2) * ef * im, goodMin, max, fp);

    const easy = constrainInterval((cur + delay) * ef * settings.easyBonus * im, good + 1, max, fp);

    return { hard, good, easy };
}

/** Relearning Easy interval: the preserved lapse interval + 1 day. */
function computeRelearningEasyInterval(cs: CardState, settings: AppSettings): number {
    const relearnGood = clampInterval(Math.max(settings.minLapseInterval, cs.interval || 1), settings);
    return clampInterval(relearnGood + 1, settings);
}

/**
 * Days since the card was last answered. The decoded state already carries Anki's fallback for
 * cards with no recorded review time (ankiState `elapsedSinceLastReview`), so a card imported
 * without a review log still reports a real elapsed count instead of "answered today".
 */
function elapsedDaysFor(cs: CardState, now: number, settings: AppSettings): number {
    if (cs.lastReviewedAtMs && cs.lastReviewedAtMs > 0) {
        return elapsedStudyDays(cs.lastReviewedAtMs, now, settings.dayRolloverHour);
    }
    return Math.max(0, cs.elapsedDays || 0);
}

const AnkiV3Engine: SchedulerEngine = {
    name: 'ANKI_V3',
    description: 'Anki V3 compatible scheduler (learning/relearning/review)',

    schedule: (cs: CardState, grade: Grade, settings: AppSettings, nowMs?: number): ScheduleResult => {
        if (grade !== 1 && grade !== 2 && grade !== 3 && grade !== 4) {
            throw new Error(`Invalid grade: ${grade}. Expected 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).`);
        }
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        const elapsedDays = elapsedDaysFor(cs, now, settings);
        const isRelearning = cs.relearningStep !== undefined && cs.relearningStep >= 0;
        const isLearning = cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0);

        if (isRelearning) return ankiV3Relearning(cs, grade, settings, now, elapsedDays);
        if (isLearning) return ankiV3Learning(cs, grade, settings, now, elapsedDays);
        return ankiV3Review(cs, grade, settings, now, elapsedDays);
    },

    previewIntervals: (cs: CardState, settings: AppSettings, nowMs?: number): IntervalPreview => {
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        const elapsedDays = elapsedDaysFor(cs, now, settings);
        const learningSteps = settings.learningSteps;
        const lapseSteps = settings.lapseSteps;
        const isRelearning = cs.relearningStep !== undefined && cs.relearningStep >= 0;
        const isLearning = cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0);

        if (isLearning && !isRelearning) {
            const step = cs.learningStep || 0;
            const nextMin = learningSteps[step + 1] ?? null;
            const hardMin = hardDelayMinutes(learningSteps, step);

            return {
                again: formatMinutes(learningSteps[0] || 1),
                hard: formatMinutes(hardMin),
                good: nextMin !== null ? formatMinutes(nextMin) : `${settings.graduatingInterval} gün`,
                easy: `${settings.easyInterval} gün`,
                againMinutes: learningSteps[0] || 1,
                hardMinutes: hardMin,
            };
        }

        if (isRelearning) {
            const step = cs.relearningStep;
            const nextMin = lapseSteps[step + 1] ?? null;
            const hardMin = hardDelayMinutes(lapseSteps, step);
            const relearnInterval = clampInterval(Math.max(settings.minLapseInterval, cs.interval || 1), settings);
            const relearnEasyInterval = computeRelearningEasyInterval(cs, settings);

            return {
                again: formatMinutes(lapseSteps[0] || 1),
                hard: formatMinutes(hardMin),
                good: nextMin !== null ? formatMinutes(nextMin) : `${relearnInterval} gün`,
                easy: `${relearnEasyInterval} gün`,
                againMinutes: lapseSteps[0] || 1,
                hardMinutes: hardMin,
            };
        }

        // Review state: unfuzzed base intervals for the button labels.
        const preview = computeReviewIntervals(cs, settings, elapsedDays);
        // With no relearning steps, Again returns to review with the reduced interval (days),
        // so label it as days rather than the first relearning step.
        const lapsedInterval = lapsedReviewInterval(cs.interval, settings);
        return {
            again: lapseSteps.length === 0 ? formatDays(lapsedInterval) : formatMinutes(lapseSteps[0] || 1),
            hard: formatDays(preview.hard),
            good: formatDays(preview.good),
            easy: formatDays(preview.easy),
            againMinutes: lapseSteps.length === 0 ? lapsedInterval * MINUTES_PER_DAY : lapseSteps[0] || 1,
        };
    },
};

function ankiV3Learning(
    cs: CardState,
    grade: Grade,
    settings: AppSettings,
    now: number,
    elapsedDays: number,
): ScheduleResult {
    const steps = settings.learningSteps;
    const step = cs.learningStep || 0;
    const nextMin = steps[step + 1] ?? null;

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
        const gradInterval = constrainInterval(
            settings.graduatingInterval,
            1,
            settings.maxInterval,
            { cardId: cs.cardId, nowMs: now, rolloverHour: settings.dayRolloverHour },
        );
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
    const easyInt = constrainInterval(
        settings.easyInterval,
        1,
        settings.maxInterval,
        { cardId: cs.cardId, nowMs: now, rolloverHour: settings.dayRolloverHour },
    );
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
): ScheduleResult {
    const steps = settings.lapseSteps;
    const step = cs.relearningStep;
    const nextMin = steps[step + 1] ?? null;

    if (grade === 1) {
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: steps[0] || 1,
            stateUpdates: {
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

        const relearnInterval = clampInterval(Math.max(settings.minLapseInterval, cs.interval || 1), settings);
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
    const relearnEasyInterval = computeRelearningEasyInterval(cs, settings);
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
): ScheduleResult {
    const ef = cs.easeFactor || settings.startingEase;
    const cur = Math.max(1, cs.interval || 1);
    const lapseSteps = settings.lapseSteps;

    if (grade === 1) {
        const newInterval = lapsedReviewInterval(cur, settings);
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
    const intervals = computeReviewIntervals(cs, settings, elapsedDays, { cardId: cs.cardId, nowMs: now });

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
