/**
 * Anki's load balancer and Easy Days (Anki 24.11+, on by default).
 *
 * Plain fuzz picks a review day at random inside the fuzz window. The load balancer picks inside
 * the same window, but weights each day by how many cards of the same preset are already due
 * then, so the daily workload evens out; a sibling of the card on a nearby day, or an "easy day"
 * that should carry fewer reviews, lowers a day's weight further. The draw uses the card's own
 * seed, so the choice is as deterministic as fuzz.
 *
 * Follows `rslib/src/scheduler/states/load_balancer.rs` (answering) and
 * `rslib/src/scheduler/fsrs/rescheduler.rs` (rescheduling after a preset change) in Anki 26.05,
 * including their f32 arithmetic. Everything here is pure; lib/loadBalancerSession.ts reads the
 * collection and keeps the per-session state.
 */

import { AnkiStdRng, ankiWeightedIndex } from './ankiRandom';
import { constrainedFuzzBounds } from './schedulingIntervals';

const f32 = Math.fround;
const DAY_MS = 86_400_000;

/** Beyond this interval the need to balance is low, and Anki leaves the choice to plain fuzz. */
export const MAX_LOAD_BALANCE_INTERVAL = 90;
/** Days of due counts kept per preset: the maximum interval plus 10% (`(90 * 1.1) as usize`). */
export const LOAD_BALANCE_DAYS = 99;

/** Days around a sibling's due day get a weight multiplier that grows with distance. */
const SIBLING_MODIFIER_STEPS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
const SIBLING_MODIFIER_RANGE = [1.0, 0.8, 0.6, 0.4, 0.2, 0.000001, 0.2, 0.4, 0.6, 0.8, 1.0].map(f32);

export type EasyDay = 'minimum' | 'reduced' | 'normal';

/** A weekday's easy-day setting: exactly 1 is normal, exactly 0 is minimum, anything else reduced. */
function easyDayFrom(percentage: number): EasyDay {
    const value = f32(percentage);
    if (value === 1) return 'normal';
    if (value === 0) return 'minimum';
    return 'reduced';
}

/** Weight share of each easy-day kind; minimum is not zero, so an all-minimum week still works. */
function loadModifier(day: EasyDay): number {
    if (day === 'minimum') return f32(0.0001);
    if (day === 'reduced') return 0.5;
    return 1;
}

/** A preset's seven easy days, Monday first. A list that is not seven long reads as all normal. */
export function parseEasyDays(percentages: readonly number[] | null | undefined): EasyDay[] {
    if (!Array.isArray(percentages) || percentages.length !== 7) return Array(7).fill('normal');
    return percentages.map((value) => easyDayFrom(Number(value)));
}

/**
 * `calculate_easy_days_modifiers`: a normal day is always a candidate and a minimum day almost
 * never is. A reduced day stays a candidate only while it carries no more than its share of the
 * reviews in the window.
 */
export function easyDaysModifiers(
    easyDays: readonly EasyDay[],
    weekdays: readonly number[],
    reviewCounts: readonly number[],
): number[] {
    const totalReviews = reviewCounts.reduce((sum, count) => sum + count, 0);
    let totalPercents = 0;
    for (const weekday of weekdays) totalPercents = f32(totalPercents + loadModifier(easyDays[weekday]));

    return weekdays.map((weekday, index) => {
        let day = easyDays[weekday];
        if (day === 'reduced') {
            const otherDaysReviews = f32(totalReviews - reviewCounts[index]);
            const otherDaysPercents = f32(totalPercents - 0.5);
            const normalizedCount = f32(f32(reviewCounts[index]) / 0.5);
            const threshold = f32(otherDaysReviews / otherDaysPercents);
            day = normalizedCount > threshold ? 'minimum' : 'normal';
        }
        return loadModifier(day);
    });
}

export interface LoadBalancerInterval {
    targetInterval: number;
    reviewCount: number;
    siblingModifier: number;
    easyDaysModifier: number;
}

/**
 * `select_weighted_interval`: an empty day weighs 1; otherwise fewer cards and a shorter interval
 * weigh more — `(1/count)^2.15 * (1/interval)^3`, scaled by the sibling and easy-day modifiers —
 * and one weighted draw from the card's seed picks the day.
 */
export function selectWeightedInterval(
    intervals: readonly LoadBalancerInterval[],
    seed: bigint | null,
): number | null {
    if (seed === null || intervals.length === 0) return null;
    const weights = intervals.map((interval) => {
        if (interval.reviewCount === 0) return 1;
        const countWeight = f32(Math.pow(f32(1 / interval.reviewCount), f32(2.15)));
        const inverseInterval = f32(1 / interval.targetInterval);
        const intervalWeight = f32(f32(inverseInterval * inverseInterval) * inverseInterval);
        return f32(f32(f32(countWeight * intervalWeight) * interval.siblingModifier) * interval.easyDaysModifier);
    });
    const index = ankiWeightedIndex(weights, new AnkiStdRng(seed));
    return index === null ? null : intervals[index].targetInterval;
}

/**
 * Monday-first weekday of the study day `interval` days from today (`interval_to_weekday`): the
 * next rollover plus `interval - 1` whole days, read in local time.
 */
export function intervalToWeekday(interval: number, nextDayAtMs: number): number {
    return (new Date(nextDayAtMs + (interval - 1) * DAY_MS).getDay() + 6) % 7;
}

/** The cards due on one day of the balancing window, and their notes for the sibling check. */
export interface LoadBalancerDay {
    cardIds: number[];
    noteIds: Set<number>;
}

/**
 * What the load balancer knows, as Anki builds it with the study queue: for each preset, the
 * cards due on each of the next `LOAD_BALANCE_DAYS` days (today first), and each preset's easy
 * days. A preset with nothing due in the window has no entry, and plain fuzz then applies.
 */
export interface LoadBalancerState {
    nextDayAtMs: number;
    daysByPreset: Map<number, LoadBalancerDay[]>;
    easyDaysByPreset: Map<number, EasyDay[]>;
}

export function emptyLoadBalancerDays(): LoadBalancerDay[] {
    return Array.from({ length: LOAD_BALANCE_DAYS }, () => ({ cardIds: [], noteIds: new Set<number>() }));
}

/**
 * `LoadBalancer::find_interval`: the day to review a card inside its fuzz window, or null when
 * the interval is too long to balance, the preset has no counts, or no weight is positive.
 * `noteId` is given only when the preset buries review siblings.
 */
export function loadBalancedInterval(
    state: LoadBalancerState,
    interval: number,
    minimum: number,
    maximum: number,
    presetId: number,
    seed: bigint | null,
    noteId: number | null,
): number | null {
    if (Math.trunc(f32(interval)) > MAX_LOAD_BALANCE_INTERVAL || minimum > MAX_LOAD_BALANCE_INTERVAL) return null;

    const { lower, upper } = constrainedFuzzBounds(interval, minimum, maximum);
    const days = state.daysByPreset.get(presetId);
    const easyDays = state.easyDaysByPreset.get(presetId);
    if (!days || !easyDays) return null;

    const window = days.slice(lower, upper + 1);
    const reviewCounts = window.map((day) => day.cardIds.length);
    const weekdays = window.map((_, index) => intervalToWeekday(index + lower, state.nextDayAtMs));
    const easy = easyDaysModifiers(easyDays, weekdays, reviewCounts);
    const siblings = siblingModifiers(state, lower, upper, noteId);

    return selectWeightedInterval(
        window.map((_, index) => ({
            targetInterval: index + lower,
            reviewCount: reviewCounts[index],
            siblingModifier: siblings[index],
            easyDaysModifier: easy[index],
        })),
        seed,
    );
}

/**
 * Gently push a card away from days where one of its siblings is due, in any preset: the
 * sibling's day is nearly excluded and its neighbours lose 80%, 60%… of their weight.
 */
function siblingModifiers(state: LoadBalancerState, lower: number, upper: number, noteId: number | null): number[] {
    const modifiers = Array<number>(upper - lower + 1).fill(1);
    if (noteId === null) return modifiers;

    const siblingDays = new Set<number>();
    for (const days of state.daysByPreset.values()) {
        days.forEach((day, index) => {
            if (day.noteIds.has(noteId)) siblingDays.add(index);
        });
    }
    for (const siblingDay of siblingDays) {
        SIBLING_MODIFIER_STEPS.forEach((step, stepIndex) => {
            const target = siblingDay + step - lower;
            if (target >= 0 && target < modifiers.length) {
                modifiers[target] = f32(modifiers[target] * SIBLING_MODIFIER_RANGE[stepIndex]);
            }
        });
    }
    return modifiers;
}

/** `LoadBalancer::add_card`: a card just answered into the review queue now counts on its day. */
export function addLoadBalancedCard(
    state: LoadBalancerState,
    cardId: number,
    noteId: number,
    presetId: number,
    interval: number,
): void {
    const day = state.daysByPreset.get(presetId)?.[interval];
    if (!day) return;
    day.cardIds.push(cardId);
    day.noteIds.add(noteId);
}

/**
 * The counts Anki's rescheduler balances against when a preset change reschedules every review
 * card (`Rescheduler`): review cards due per day by preset, and today's workload — the backlog due
 * today or earlier plus the cards already reviewed today.
 */
export interface ReschedulerState {
    today: number;
    nextDayAtMs: number;
    dueCountsByPreset: Map<number, Map<number, number>>;
    dueTodayByPreset: Map<number, number>;
    reviewedTodayByPreset: Map<number, number>;
    easyDaysByPreset: Map<number, EasyDay[]>;
}

/**
 * `Rescheduler::find_interval`: like the load balancer, but for a card last reviewed
 * `daysElapsed` days ago, so candidate intervals are counted from that review. A card already
 * overdue for the whole window is left to plain fuzz; otherwise no day in the past is chosen.
 */
export function rescheduledInterval(
    state: ReschedulerState,
    interval: number,
    minimum: number,
    maximum: number,
    daysElapsed: number,
    presetId: number,
    seed: bigint | null,
): number | null {
    const bounds = constrainedFuzzBounds(interval, minimum, maximum);
    if (bounds.upper < daysElapsed) return null;
    const lower = Math.max(bounds.lower, daysElapsed);
    const easyDays = state.easyDaysByPreset.get(presetId);
    if (!easyDays) return null;

    const candidates: number[] = [];
    for (let candidate = lower; candidate <= bounds.upper; candidate++) candidates.push(candidate);
    const counts = state.dueCountsByPreset.get(presetId);
    const reviewCounts = candidates.map((candidate) => {
        if (candidate > daysElapsed) return counts?.get(state.today + candidate - daysElapsed) ?? 0;
        return (state.dueTodayByPreset.get(presetId) ?? 0) + (state.reviewedTodayByPreset.get(presetId) ?? 0);
    });
    const weekdays = candidates.map((candidate) => (
        new Date(state.nextDayAtMs - daysElapsed * DAY_MS + (candidate - 1) * DAY_MS).getDay() + 6
    ) % 7);
    const easy = easyDaysModifiers(easyDays, weekdays, reviewCounts);

    return selectWeightedInterval(
        candidates.map((candidate, index) => ({
            targetInterval: candidate,
            reviewCount: reviewCounts[index],
            siblingModifier: 1,
            easyDaysModifier: easy[index],
        })),
        seed,
    );
}

/** `Rescheduler::update_due_cnt_per_day`: move one card's count from its old day to its new one. */
export function moveRescheduledDue(state: ReschedulerState, dueBefore: number, dueAfter: number, presetId: number): void {
    const counts = state.dueCountsByPreset.get(presetId);
    if (counts) {
        const before = counts.get(dueBefore);
        if (before !== undefined) counts.set(dueBefore, before - 1);
        counts.set(dueAfter, (counts.get(dueAfter) ?? 0) + 1);
    }
    if (dueBefore <= state.today && dueAfter > state.today) {
        const dueToday = state.dueTodayByPreset.get(presetId);
        if (dueToday !== undefined) state.dueTodayByPreset.set(presetId, dueToday - 1);
    }
    if (dueBefore > state.today && dueAfter <= state.today) {
        state.dueTodayByPreset.set(presetId, (state.dueTodayByPreset.get(presetId) ?? 0) + 1);
    }
}
