/**
 * Interval primitives shared by both schedulers: day arithmetic around the rollover hour,
 * Anki's review fuzz, learning-step delays and the duration labels shown on the answer buttons.
 *
 * SM-2 and FSRS differ only in how they arrive at a raw interval; everything that happens to that
 * interval afterwards — fuzz, bounds, rounding, formatting — is common, so it lives here.
 */

import { AnkiStdRng, ankiCardSeed, ankiFuzzFactor } from './ankiRandom';

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

const f32 = Math.fround;
const DAY_SECS = 86_400;

/** Rust's `f32::round`: halves round away from zero. */
function roundHalfAwayFromZero(value: number): number {
    return Math.sign(value) * Math.round(Math.abs(value));
}

/** Rust's `as u32` from a float: truncate toward zero, saturating at the type's bounds. */
function floatToU32(value: number): number {
    if (!(value > 0)) return 0;
    return Math.min(0xffff_ffff, Math.trunc(value));
}

/** The fuzz ranges of Anki's `fuzz.rs`: 15% of the days in 2.5–7, 10% in 7–20, 5% above 20. */
const FUZZ_RANGES: ReadonlyArray<readonly [start: number, end: number, factor: number]> = [
    [2.5, 7.0, f32(0.15)],
    [7.0, 20.0, f32(0.1)],
    [20.0, 3.4028234663852886e38, f32(0.05)],
];

/**
 * Days of fuzz in each direction (`fuzz_delta`): none below 2.5 days, otherwise one day plus a
 * share of the days in each range. Computed in f32 like Anki, so a window edge that sits on a
 * half day rounds the same way.
 */
export function fuzzDelta(interval: number): number {
    const value = f32(interval);
    if (value < 2.5) return 0;
    let delta = 1;
    for (const [start, end, factor] of FUZZ_RANGES) {
        delta = f32(delta + f32(factor * Math.max(0, f32(Math.min(value, end) - start))));
    }
    return delta;
}

/**
 * Anki's `constrained_fuzz_bounds`: the fuzz window around an interval, clamped into
 * [minimum, maximum] and widened by a day when the clamp collapsed it and there is room.
 */
export function constrainedFuzzBounds(
    interval: number,
    minimum: number,
    maximum: number,
): { lower: number; upper: number } {
    const low = Math.min(minimum, maximum);
    const clamped = Math.min(maximum, Math.max(low, f32(interval)));
    const delta = fuzzDelta(clamped);
    let lower = floatToU32(roundHalfAwayFromZero(f32(clamped - delta)));
    let upper = floatToU32(roundHalfAwayFromZero(f32(clamped + delta)));
    lower = Math.min(maximum, Math.max(low, lower));
    upper = Math.min(maximum, Math.max(low, upper));
    if (upper === lower && upper > 2 && upper < maximum) upper = lower + 1;
    return { lower, upper };
}

/**
 * Something that can place a review inside its fuzz window better than chance: Anki's load
 * balancer. Returning null hands the choice back to plain fuzz.
 */
export interface IntervalBalancer {
    findInterval(interval: number, minimum: number, maximum: number): number | null;
}

/** How one answer's review intervals are fuzzed. */
export interface ReviewFuzz {
    /** Anki's per-answer fuzz factor in [0, 1), drawn from `card id + reps`; null disables fuzz. */
    factor: number | null;
    /** The load balancer, when one is active for the card's preset. */
    balancer?: IntervalBalancer | null;
}

/**
 * The fuzz Anki applies to a card answered now: the factor comes from the card's id and its
 * review count before this answer (`get_fuzz_seed(card, false)`).
 */
export function reviewFuzzFor(
    cardId: number,
    reps: number,
    balancer: IntervalBalancer | null = null,
): ReviewFuzz {
    return { factor: ankiFuzzFactor(ankiCardSeed(cardId, reps)), balancer };
}

/**
 * Anki's `with_review_fuzz`: let the load balancer pick a day when it is active, otherwise take
 * the day the fuzz factor points at inside the window. Without a factor the interval is only
 * rounded and clamped.
 */
export function withReviewFuzz(
    fuzz: ReviewFuzz | null | undefined,
    interval: number,
    minimum: number,
    maximum: number,
): number {
    const balanced = fuzz?.balancer?.findInterval(interval, minimum, maximum);
    if (balanced !== undefined && balanced !== null) return balanced;
    if (fuzz && fuzz.factor !== null) {
        const { lower, upper } = constrainedFuzzBounds(interval, minimum, maximum);
        return Math.floor(f32(lower + f32(fuzz.factor * (1 + upper - lower))));
    }
    return Math.min(maximum, Math.max(minimum, floatToU32(roundHalfAwayFromZero(f32(interval)))));
}

/**
 * Anki's `constrain_passing_interval` without the SM-2 interval modifier: keep a passing review
 * interval at or above `minimum` (and at least 1), at or below the maximum interval, and fuzz it
 * when `fuzz` is given.
 */
export function constrainInterval(
    interval: number,
    minimum: number,
    maximum: number,
    fuzz?: ReviewFuzz | null,
): number {
    const upperBound = Math.max(1, maximum);
    const lowerBound = Math.min(upperBound, Math.max(1, minimum));
    if (fuzz) return withReviewFuzz(fuzz, interval, lowerBound, upperBound);
    return Math.min(upperBound, Math.max(lowerBound, floatToU32(roundHalfAwayFromZero(f32(interval)))));
}

/** One learning step as whole seconds, the way Anki reads a step given in minutes. */
export function learningStepSecs(minutes: number): number {
    return floatToU32(f32(f32(minutes) * 60));
}

/** Round durations over a day to whole days, matching Anki's `maybe_round_in_days` (states/steps.rs). */
export function maybeRoundInDays(secs: number): number {
    if (secs > DAY_SECS) return roundHalfAwayFromZero(f32(f32(secs) / DAY_SECS)) * DAY_SECS;
    return secs;
}

/**
 * Hard-button delay for learning/relearning steps in seconds, matching Anki's `hard_delay_secs`.
 * On the first step it is the midpoint of the first two steps, or half again the first step (at
 * most a day more) when there is only one; on later steps it repeats the current step. Anki does
 * this in whole seconds with integer division, so steps of 1m and 10m give 5m30s, not 6m.
 * Returns null when there are no steps at all.
 */
export function hardDelaySecs(stepsMinutes: readonly number[], stepIndex: number): number | null {
    if (stepsMinutes.length === 0) return null;
    const index = Math.max(0, Math.min(stepsMinutes.length - 1, stepIndex));
    const current = learningStepSecs(stepsMinutes[index]);
    if (index !== 0) return current;
    if (stepsMinutes.length > 1) {
        return maybeRoundInDays(Math.floor((current + learningStepSecs(stepsMinutes[1])) / 2));
    }
    return maybeRoundInDays(Math.min(Math.floor((current * 3) / 2), current + DAY_SECS));
}

/** `hardDelaySecs` in minutes, for callers that schedule in minutes. */
export function hardDelayMinutes(steps: number[], stepIndex: number): number {
    return (hardDelaySecs(steps, stepIndex) ?? 60) / 60;
}

/**
 * Anki's `learning_ivl_with_fuzz`: an intraday (re)learning step is pushed back by up to a
 * quarter of its length, never more than five minutes, drawn from the card's seed.
 */
export function learningIntervalWithFuzz(seed: bigint | null, secs: number): number {
    if (seed === null) return secs;
    const upperExclusive = secs + floatToU32(Math.floor(Math.min(f32(f32(secs) * 0.25), 300)));
    if (secs >= upperExclusive) return secs;
    return new AnkiStdRng(seed).rangeU32(secs, upperExclusive);
}

/**
 * Anki's `IntervalKind::maybe_as_days`: a delay that reaches past the next day rollover is
 * counted in days instead — one for crossing the boundary plus one per further full day.
 */
export function learningDelayAsDays(secs: number, secsUntilRollover: number): number | null {
    if (secs < secsUntilRollover) return null;
    return Math.floor((secs - secsUntilRollover) / DAY_SECS) + 1;
}

export interface DueRange {
    minDays: number;
    maxDays: number;
    forceInterval: boolean;
}

/**
 * Parse Anki's Set Due Date syntax: `5`, `3-7`, `-2`, and an optional trailing `!`.
 *
 * The same grammar backs the browser dialog and the reviewer sheet, because in Anki they are the
 * same dialog. `!` means "also make the interval this many days"; a range picks a day inside it.
 */
export function parseDueRange(input: string): DueRange | null {
    const match = input.trim().match(/^(-?\d+)(?:\s*-\s*(-?\d+))?\s*(!)?$/);
    if (!match) return null;
    const first = Number(match[1]);
    const second = match[2] === undefined ? first : Number(match[2]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second)) return null;
    return {
        minDays: Math.min(first, second),
        maxDays: Math.max(first, second),
        forceInterval: match[3] === '!',
    };
}

/**
 * The interval `Set Due Date` writes (Anki 26.05, `Card::set_due_date` in
 * `rslib/src/scheduler/reviews.rs`).
 *
 * What decides is whether the card carries an FSRS memory state, not the collection switch. Such a
 * card keeps describing the whole gap it will go unseen: the days since its recorded last review
 * plus the requested days, or — with no recorded review time — its old interval moved by as many
 * days as its due date moves. The trailing `!` does not apply to it.
 *
 * Any other card takes the requested days (at least one) when it is new or still learning, or when
 * `!` asks for it, and otherwise keeps the interval it earned.
 */
export function setDueDateInterval(options: {
    hasMemoryState: boolean;
    isReviewOrRelearning: boolean;
    currentInterval: number;
    /** Epoch ms of the card's recorded last review (Anki's `lrt`), or null when it has none. */
    lastReviewTimeMs: number | null;
    nextDayAtMs: number;
    /** Days from today to the card's current due day (negative when overdue). */
    daysUntilCurrentDue: number;
    requestedDays: number;
    forceInterval: boolean;
}): number {
    if (options.hasMemoryState) {
        if (options.lastReviewTimeMs !== null && options.lastReviewTimeMs > 0) {
            const nextDayAtSecs = Math.floor(options.nextDayAtMs / 1000);
            const lastReviewSecs = Math.floor(options.lastReviewTimeMs / 1000);
            const elapsed = Math.floor(Math.max(0, nextDayAtSecs - lastReviewSecs) / DAY_SECS);
            return Math.max(0, elapsed + options.requestedDays);
        }
        return Math.max(0, options.currentInterval + options.requestedDays - options.daysUntilCurrentDue);
    }
    if (options.forceInterval || !options.isReviewOrRelearning) return Math.max(1, options.requestedDays);
    return Math.max(1, options.currentInterval);
}
