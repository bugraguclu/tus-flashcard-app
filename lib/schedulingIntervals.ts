/**
 * Interval primitives shared by both schedulers: day arithmetic around the rollover hour,
 * Anki's review fuzz, learning-step delays and the duration labels shown on the answer buttons.
 *
 * SM-2 and FSRS differ only in how they arrive at a raw interval; everything that happens to that
 * interval afterwards — fuzz, bounds, rounding, formatting — is common, so it lives here.
 */

const HOUR_MS = 3600000;
export const MINUTES_PER_DAY = 1440;

/** Shift a Date back by the rollover hour to derive the Anki "study day". */
function toRolloverShiftedDate(input: Date, rolloverHour: number): Date {
    return new Date(input.getTime() - rolloverHour * HOUR_MS);
}

function formatYMD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** Today's study day as YYYY-MM-DD, respecting the rollover hour. */
export function todayLocalYMD(now?: Date, rolloverHour: number = 4): string {
    return formatYMD(toRolloverShiftedDate(now ?? new Date(), rolloverHour));
}

/** The study day `days` after `baseDate` as YYYY-MM-DD. */
export function addDaysLocalYMD(days: number, baseDate?: Date, rolloverHour: number = 4): string {
    const shifted = toRolloverShiftedDate(baseDate ?? new Date(), rolloverHour);
    const result = new Date(shifted.getTime());
    result.setDate(result.getDate() + days);
    return formatYMD(result);
}

export function getToday(rolloverHour: number = 4): string {
    return todayLocalYMD(undefined, rolloverHour);
}

/** Duration label for a whole-day interval. Turkish strings are the app's UI language. */
export function formatDays(days: number): string {
    if (days <= 0) return '< 1dk';
    if (days === 1) return '1 gün';
    if (days < 30) return `${days} gün`;
    if (days < 365) {
        const months = days / 30;
        return months < 1.5 ? '1 ay' : `${Math.round(months)} ay`;
    }
    return `${(days / 365).toFixed(1)} yıl`;
}

export function formatMinutes(minutes: number): string {
    if (minutes < 60) return `${Math.round(minutes)}dk`;
    if (minutes < MINUTES_PER_DAY) return `${Math.round(minutes / 60)}sa`;
    return formatDays(Math.round(minutes / MINUTES_PER_DAY));
}

/** DJB2-style hash → deterministic 32-bit unsigned int, so a card gets stable fuzz within a day. */
export function hashSeed(text: string): number {
    let hash = 0;
    for (let index = 0; index < text.length; index++) {
        hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    }
    return hash >>> 0;
}

/**
 * Fuzz range for an interval, matching Anki's fuzz_delta (states/fuzz.rs).
 * Ranges: 2.5–7d 15%, 7–20d 10%, 20d+ 5%. Base delta: 1 day.
 */
export function fuzzRangeForInterval(interval: number): { min: number; max: number } {
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

/**
 * Anki's constrained_fuzz_bounds: the fuzz window clamped into [minimum, maximum], widened by a
 * day when the clamp collapsed it and there is room to widen.
 */
export function constrainedFuzzBounds(
    interval: number,
    minimum: number,
    maximum: number,
): { lower: number; upper: number } {
    const low = Math.min(minimum, maximum);
    const clampedInterval = Math.max(low, Math.min(maximum, interval));
    const range = fuzzRangeForInterval(clampedInterval);

    let lower = Math.max(low, Math.min(maximum, range.min));
    let upper = Math.max(low, Math.min(maximum, range.max));
    if (upper === lower && upper > 2 && upper < maximum) upper = lower + 1;

    return { lower, upper };
}

export interface FuzzSeed {
    cardId: number;
    nowMs: number;
    rolloverHour: number;
}

/**
 * Constrain (and optionally fuzz) an interval within [minimum, maximum].
 * Matches Anki's constrain_passing_interval + with_review_fuzz + constrained_fuzz_bounds.
 */
export function constrainInterval(
    interval: number,
    minimum: number,
    maximum: number,
    fuzz?: FuzzSeed,
): number {
    if (fuzz) {
        const { lower, upper } = constrainedFuzzBounds(interval, minimum, maximum);
        if (lower === upper) return lower;

        const seed = hashSeed(`${todayLocalYMD(new Date(fuzz.nowMs), fuzz.rolloverHour)}-${fuzz.cardId}`);
        const span = upper - lower + 1;
        return lower + (seed % span);
    }

    return Math.max(minimum, Math.min(maximum, Math.round(interval)));
}

/**
 * Anki's minimum_review_fuzz_interval: the floor to use when fuzzing a new review interval, so
 * fuzz can never pull a grown interval back below the one the card already had. A genuinely
 * shrunken interval (changed FSRS parameters or desired retention) keeps no floor at all.
 */
export function minimumReviewFuzzInterval(
    interval: number,
    previousInterval: number,
    maximumInterval: number,
): number {
    const rounded = Math.round(interval);
    const { upper } = constrainedFuzzBounds(interval, 1, maximumInterval);

    if (rounded > previousInterval) return previousInterval + 1;
    if (previousInterval <= upper) return previousInterval;
    return 0;
}

/** Round durations over a day to whole days, matching Anki's maybe_round_in_days (states/steps.rs). */
export function maybeRoundInDays(minutes: number): number {
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
export function hardDelayMinutes(steps: number[], stepIndex: number): number {
    const currentMinutes = steps[stepIndex] ?? 1;

    if (stepIndex === 0) {
        const nextMinutes = steps[1];
        if (nextMinutes !== undefined) {
            return maybeRoundInDays(Math.round((currentMinutes + nextMinutes) / 2));
        }
        const hardMinutes = Math.ceil(currentMinutes * 1.5);
        const capped = Math.min(hardMinutes, currentMinutes + MINUTES_PER_DAY);
        return maybeRoundInDays(Math.max(1, capped));
    }

    return currentMinutes;
}
