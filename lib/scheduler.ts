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

const HOUR_MS = 3600000;
const MINUTES_PER_DAY = 1440;

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

/** DJB2 hash → deterministic 32-bit unsigned int, so a card gets stable fuzz within a day. */
function hashSeed(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    }
    return h >>> 0;
}

/**
 * Fuzz range for an interval, matching Anki's fuzz_delta (states/fuzz.rs).
 * Ranges: 2.5–7d 15%, 7–20d 10%, 20d+ 5%. Base delta: 1 day.
 */
function fuzzRangeForInterval(interval: number): { min: number; max: number } {
    if (interval < 2.5) {
        return { min: Math.max(1, Math.round(interval)), max: Math.max(1, Math.round(interval)) };
    }

    const RANGES: [number, number, number][] = [
        [2.5, 7.0, 0.15],
        [7.0, 20.0, 0.10],
        [20.0, Infinity, 0.05],
    ];

    let delta = 1.0;
    for (const [start, end, factor] of RANGES) {
        delta += Math.max(0, Math.min(interval, end) - start) * factor;
    }

    let min = Math.max(2, Math.round(interval - delta));
    let max = Math.round(interval + delta);

    if (max - min < 2) {
        max = min + 2;
    }

    return { min, max };
}

/** Round durations over a day to whole days, matching Anki's maybe_round_in_days (states/steps.rs). */
function maybeRoundInDays(minutes: number): number {
    if (minutes > MINUTES_PER_DAY) {
        return Math.round(minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
    }
    return minutes;
}

/**
 * Hard-button delay for learning/relearning steps, matching Anki's hard_delay_secs (states/steps.rs).
 * Step 0: avg(current, next) if a next step exists, else current × 1.5 capped at +1 day.
 * Later steps: the current step delay, unchanged.
 */
function hardDelayMinutes(steps: number[], stepIndex: number): number {
    const curMin = steps[stepIndex] ?? 1;

    if (stepIndex === 0) {
        const nextMin = steps[1];
        if (nextMin !== undefined) {
            return maybeRoundInDays(Math.round((curMin + nextMin) / 2));
        }
        const hardMin = Math.ceil(curMin * 1.5);
        const cappedMin = Math.min(hardMin, curMin + MINUTES_PER_DAY);
        return maybeRoundInDays(Math.max(1, cappedMin));
    }

    return curMin;
}

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
 * Constrain (and optionally fuzz) an interval within [minimum, maximum].
 * Matches Anki's constrain_passing_interval + with_review_fuzz + constrained_fuzz_bounds.
 */
function constrainInterval(
    interval: number,
    minimum: number,
    maximum: number,
    fuzz?: { cardId: number; nowMs: number; rolloverHour: number },
): number {
    if (fuzz) {
        const clamped = Math.max(minimum, Math.min(maximum, interval));
        const range = fuzzRangeForInterval(clamped);

        let lower = Math.max(minimum, Math.min(maximum, range.min));
        let upper = Math.max(minimum, Math.min(maximum, range.max));

        if (upper === lower && upper > 2 && upper < maximum) {
            upper = lower + 1;
        }

        if (lower === upper) return lower;

        const seed = hashSeed(`${todayLocalYMD(new Date(fuzz.nowMs), fuzz.rolloverHour)}-${fuzz.cardId}`);
        const span = upper - lower + 1;
        return lower + (seed % span);
    }

    return Math.max(minimum, Math.min(maximum, Math.round(interval)));
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
};
