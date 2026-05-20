import type {
    CardState,
    Grade,
    ScheduleResult,
    IntervalPreview,
    SchedulerEngine,
    AlgorithmType,
    AppSettings,
} from './types';

// Time constants
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const MINUTES_PER_DAY = 1440;

// Ease factor constants (Anki rslib/src/scheduler/states/review.rs)
const MINIMUM_EASE_FACTOR = 1.3;
const EASE_FACTOR_AGAIN_DELTA = -0.20;
const EASE_FACTOR_HARD_DELTA = -0.15;
const EASE_FACTOR_EASY_DELTA = 0.15;

// ---------------------------------------------------------------------------
// Section 1: Day-boundary helpers
// ---------------------------------------------------------------------------

/** Shifts a Date back by rolloverHour to derive the Anki "study day". */
function toRolloverShiftedDate(input: Date, rolloverHour: number): Date {
    return new Date(input.getTime() - rolloverHour * HOUR_MS);
}

/** Formats a Date as YYYY-MM-DD. Pure function. */
function formatYMD(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/** Returns today's Anki study day as YYYY-MM-DD, respecting rollover hour. */
function todayLocalYMD(now?: Date, rolloverHour: number = 4): string {
    return formatYMD(toRolloverShiftedDate(now ?? new Date(), rolloverHour));
}

/** Returns the Anki study day `days` after `baseDate` as YYYY-MM-DD. */
function addDaysLocalYMD(days: number, baseDate?: Date, rolloverHour: number = 4): string {
    const shifted = toRolloverShiftedDate(baseDate ?? new Date(), rolloverHour);
    const result = new Date(shifted.getTime());
    result.setDate(result.getDate() + days);
    return formatYMD(result);
}

function getToday(rolloverHour: number = 4): string {
    return todayLocalYMD(undefined, rolloverHour);
}

// UI format functions (Turkish locale strings are intentional)
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

// ---------------------------------------------------------------------------
// Section 2: Deterministic fuzz
// ---------------------------------------------------------------------------

/**
 * DJB2 hash producing a deterministic 32-bit unsigned integer.
 * Guarantees the same card receives the same fuzz within a study day.
 */
function hashSeed(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    }
    return h >>> 0;
}

/**
 * Computes the fuzz range for a given interval.
 * Matches Anki's fuzz_delta (rslib/src/scheduler/states/fuzz.rs).
 *
 * Ranges: 2.5-7d 15%, 7-20d 10%, 20+d 5%. Base delta: 1 day.
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

// ---------------------------------------------------------------------------
// Section 3: Learning/relearning step delays
// ---------------------------------------------------------------------------

/**
 * Rounds durations exceeding 1 day to the nearest whole day (in minutes).
 * Matches Anki's maybe_round_in_days (rslib/src/scheduler/states/steps.rs).
 */
function maybeRoundInDays(minutes: number): number {
    if (minutes > MINUTES_PER_DAY) {
        return Math.round(minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY;
    }
    return minutes;
}

/**
 * Computes the Hard button delay for learning/relearning steps.
 * Matches Anki's hard_delay_secs (rslib/src/scheduler/states/steps.rs).
 *
 * step 0: next exists -> avg(current, next); else current * 1.5, cap +1 day.
 * step >0: current step delay unchanged.
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

// ---------------------------------------------------------------------------
// Section 4: Review interval formulas
// ---------------------------------------------------------------------------

/** Clamps an interval to [1, maxInterval]. Used for non-review contexts. */
function clampInterval(interval: number, settings: AppSettings): number {
    return Math.max(1, Math.min(settings.maxInterval, Math.round(interval)));
}

/**
 * Constrains and optionally fuzzes an interval within [minimum, maximum].
 * Matches Anki's constrain_passing_interval + with_review_fuzz + constrained_fuzz_bounds.
 *
 * With fuzz: deterministic fuzz constrained to [minimum, maximum].
 * Without fuzz: rounds and clamps to [minimum, maximum].
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

        // Ensure at least 2 selectable values when possible (matches Anki)
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
 * Computes review intervals for Hard/Good/Easy.
 * Handles both early and non-early review paths from Anki's review.rs.
 *
 * Early path (days_late < 0): uses elapsed days as base, no fuzz, no chained minimums.
 * Non-early path (days_late >= 0): uses current interval + overdue bonus, fuzzed, chained minimums.
 *
 * Verified against Anki Rust source (rslib/src/scheduler/states/review.rs):
 * - intervalModifier applies to ALL grades in both paths.
 * - Early reviews use reduced easy bonus: easyBonus - (easyBonus - 1) / 2.
 * - Non-early hard minimum is 0 when hardFactor <= 1.0 (interval may shrink).
 * - Non-early minimums chain off previous FUZZED value (hard <= good <= easy).
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

    // Early review path: card answered before due date (Anki: passing_early_review_intervals)
    // Guard: elapsedDays > 0 prevents false early detection for cards with no review history.
    if (daysLate < 0 && elapsedDays > 0) {
        const elapsed = Math.max(1, elapsedDays);
        const scheduled = cur;

        // No fuzz, no chained minimums — all minimums are 0
        const hard = constrainInterval(
            Math.max(elapsed * hf, scheduled * hf / 2) * im, 0, max,
        );
        const good = constrainInterval(
            Math.max(elapsed * ef, scheduled) * im, 0, max,
        );
        // Anki halves the distance of easy bonus from 1.0 for early reviews
        const reducedBonus = settings.easyBonus - (settings.easyBonus - 1.0) / 2.0;
        const easy = constrainInterval(
            Math.max(elapsed * ef, scheduled) * reducedBonus * im, 0, max,
        );
        return { hard, good, easy };
    }

    // Non-early review path: card answered on or after due date (Anki: passing_nonearly_review_intervals)
    const delay = Math.max(0, daysLate);

    const fp = fuzz
        ? { cardId: cs.cardId, nowMs: fuzz.nowMs, rolloverHour: settings.dayRolloverHour }
        : undefined;

    // Anki: hard minimum is 0 when hard_factor <= 1.0 (allows interval to shrink)
    const hardMin = hf <= 1.0 ? 0 : cur + 1;
    const hard = constrainInterval(cur * hf * im, hardMin, max, fp);

    // Anki: good minimum is cur+1 when hard_factor <= 1.0, else fuzzed hard+1
    const goodMin = hf <= 1.0 ? cur + 1 : hard + 1;
    const good = constrainInterval((cur + delay / 2) * ef * im, goodMin, max, fp);

    const easy = constrainInterval((cur + delay) * ef * settings.easyBonus * im, good + 1, max, fp);

    return { hard, good, easy };
}

/** Relearning Easy interval: preserved lapse interval + 1 day. */
function computeRelearningEasyInterval(cs: CardState, settings: AppSettings): number {
    const relearnGood = clampInterval(Math.max(settings.minLapseInterval, cs.interval || 1), settings);
    return clampInterval(relearnGood + 1, settings);
}

// ---------------------------------------------------------------------------
// Section support: Elapsed days
// ---------------------------------------------------------------------------

/**
 * Computes whole days elapsed between two review timestamps,
 * accounting for the rollover hour. Returns 0 if no previous review.
 */
function computeElapsedDays(lastReviewedAtMs: number, nowMs: number, rolloverHour: number): number {
    if (!lastReviewedAtMs || lastReviewedAtMs <= 0) return 0;

    const nowShifted = toRolloverShiftedDate(new Date(nowMs), rolloverHour);
    const prevShifted = toRolloverShiftedDate(new Date(lastReviewedAtMs), rolloverHour);

    const nowDay = new Date(nowShifted.getFullYear(), nowShifted.getMonth(), nowShifted.getDate());
    const prevDay = new Date(prevShifted.getFullYear(), prevShifted.getMonth(), prevShifted.getDate());

    return Math.max(0, Math.round((nowDay.getTime() - prevDay.getTime()) / DAY_MS));
}

// ---------------------------------------------------------------------------
// Sections 5-9: State handlers and engine
// ---------------------------------------------------------------------------

const AnkiV3Engine: SchedulerEngine = {
    name: 'ANKI_V3',
    description: 'Anki V3 compatible scheduler (learning/relearning/review)',

    schedule: (cs: CardState, grade: Grade, settings: AppSettings, nowMs?: number): ScheduleResult => {
        if (grade !== 1 && grade !== 2 && grade !== 3 && grade !== 4) {
            throw new Error(`Invalid grade: ${grade}. Expected 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy).`);
        }
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        const elapsedDays = computeElapsedDays(cs.lastReviewedAtMs || 0, now, settings.dayRolloverHour);
        const isRelearning = cs.relearningStep !== undefined && cs.relearningStep >= 0;
        const isLearning = cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0);

        if (isRelearning) return ankiV3Relearning(cs, grade, settings, now, elapsedDays);
        if (isLearning) return ankiV3Learning(cs, grade, settings, now, elapsedDays);
        return ankiV3Review(cs, grade, settings, now, elapsedDays);
    },

    previewIntervals: (cs: CardState, settings: AppSettings, nowMs?: number): IntervalPreview => {
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        const elapsedDays = computeElapsedDays(cs.lastReviewedAtMs || 0, now, settings.dayRolloverHour);
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

        // Review state: unfuzzed preview (base intervals for button labels)
        const preview = computeReviewIntervals(cs, settings, elapsedDays);
        return {
            again: formatMinutes(lapseSteps[0] || 1),
            hard: formatDays(preview.hard),
            good: formatDays(preview.good),
            easy: formatDays(preview.easy),
            againMinutes: lapseSteps[0] || 1,
        };
    },
};

// Section 5: Learning state handler
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

        // Graduate to review. Anki: fuzzed_graduating_interval_good + initial_ease_factor.
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

    // Grade 4 (Easy): graduate immediately. Anki: fuzzed_graduating_interval_easy + initial_ease_factor.
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

// Section 6: Relearning state handler
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

    // Grade 4 (Easy): graduate with interval + 1 (Anki does NOT change ease here)
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

// Section 7: Review state handler
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
        const newInterval = clampInterval(
            Math.max(settings.minLapseInterval, Math.round(cur * settings.lapseIntervalMultiplier)),
            settings,
        );
        const newEase = Math.max(MINIMUM_EASE_FACTOR, ef + EASE_FACTOR_AGAIN_DELTA);

        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: lapseSteps[0] || 1,
            stateUpdates: {
                interval: newInterval,
                easeFactor: newEase,
                relearningStep: 0,
                learningStep: -1,
                lapses: (cs.lapses || 0) + 1,
                status: 'learning',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    // Fuzzed intervals with chained minimums — guarantees hard <= good <= easy
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

    // Grade 4 (Easy)
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
