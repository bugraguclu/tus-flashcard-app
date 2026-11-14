/**
 * The FSRS simulator of Anki's deck options (Anki 24.11+): how many reviews, how much study time
 * and how many memorized cards a preset leads to over the coming days, if the learner studies
 * every day within the given limits.
 *
 * The behaviour follows the simulator Anki 26.09.3 runs (`simulate_review` in
 * rslib/src/scheduler/fsrs/simulator.rs, AGPL, studied as a behaviour reference only) on top of
 * fsrs-rs 6.6.2's `simulate` (src/simulation.rs, BSD-3-Clause,
 * https://github.com/open-spaced-repetition/fsrs-rs/blob/v6.6.2/src/simulation.rs). This is an
 * independent implementation; the memory model is the app's own: lib/fsrs.ts's forgetting curve
 * and next interval, and the same equations' f32 forward pass in FsrsTrainingModel for each answer.
 * Unlike fsrs-rs, an overdue card's recall is taken on the day it is reviewed, not on its due
 * day, and same-day steps follow the scheduler's own rule (Hard never lowers stability):
 *
 *  - Each day, cards due that day or earlier are reviewed first, in the preset's review order,
 *    until the review limit is reached; the rest wait for the next day. New cards follow, up to the
 *    new-card limit (and, unless new cards ignore the review limit, within what the review limit
 *    leaves). A card past the leech threshold is no longer reviewed, as if suspended.
 *  - A review is remembered with the card's retrievability on that day; a remembered review takes
 *    Hard, Good or Easy, a forgotten one Again followed by relearning steps. A new card's first
 *    answer and its learning steps are drawn the same way (lib/fsrsSimulatorModel.ts).
 *  - The next interval is the one that brings recall down to the desired retention, rounded and
 *    capped at the maximum interval, then placed in its fuzz window by the load balancer, which
 *    prefers days with fewer cards due and honours Easy Days, as Anki's simulator does.
 *  - "Memorized" on a day is the sum of every studied card's probability of recall that day.
 *
 * Randomness comes from one generator seeded with a fixed number, so a run is repeatable: the
 * same inputs always give the same days. Nothing here reads or writes the collection.
 */

import { AnkiStdRng } from './ankiRandom';
import { easyDaysModifiers, intervalToWeekday, parseEasyDays } from './loadBalancer';
import { constrainedFuzzBounds } from './schedulingIntervals';
import { clampFsrsParameters, fsrsNextInterval } from './fsrs';
import { fsrsEvaluationModel } from './fsrsTraining';
import type { SimulatorLearner } from './fsrsSimulatorModel';
import type { ReviewSortOrder } from './types';

/** A studied card as the simulation starts: day numbers count from today (0). */
export interface SimulatedCard {
    stability: number;
    difficulty: number;
    /** Day it is due; negative while overdue. */
    due: number;
    /** Day of its last review; 0 or earlier. */
    lastReview: number;
    interval: number;
    lapses: number;
}

export interface FsrsSimulationInput {
    params: readonly number[];
    desiredRetention: number;
    /** How many days to simulate, today first. */
    days: number;
    existing: readonly SimulatedCard[];
    /** New cards waiting: the preset's own plus the additional ones to simulate. */
    newCards: number;
    /** New cards already introduced today; they use up today's new-card limit. */
    introducedToday: number;
    newLimit: number;
    reviewLimit: number;
    maxInterval: number;
    newCardsIgnoreReviewLimit: boolean;
    /** Stop reviewing a card once it has lapsed this often; null keeps reviewing it. */
    leechThreshold: number | null;
    learningSteps: number;
    relearningSteps: number;
    reviewOrder: ReviewSortOrder;
    /** The preset's seven Easy Days percentages, Monday first. */
    easyDays: readonly number[];
    /** The next day rollover, which fixes the weekday of every simulated day. */
    nextDayAtMs: number;
    learner: SimulatorLearner;
    seed?: number;
    /**
     * Count memorized cards only on the last day of every `memorizedStride` days (and on the first
     * and last simulated day), the days a chart with bars that wide reads; the sum over every card
     * and day is the bulk of a long run. Other days hold NaN. 1, the default, counts every day.
     */
    memorizedStride?: number;
}

export interface FsrsSimulationResult {
    /** Reviews of studied cards each day (learning steps not counted). */
    reviews: number[];
    /** New cards studied for the first time each day. */
    newCards: number[];
    /** Study time each day, in seconds. */
    seconds: number[];
    /** Sum of every studied card's recall probability each day (see `memorizedStride`). */
    memorized: number[];
}

export const SIMULATOR_SEED = 42;
const MAX_SHORT_TERM_STEPS = 5;
/** Wall time spent between two yields to the screen. */
const SLICE_MS = 12;

export type SimulationProgress = (done: number, total: number) => boolean | void;

function pick(probabilities: readonly number[], draw: number): number {
    const total = probabilities.reduce((sum, value) => sum + value, 0);
    let threshold = draw * total;
    for (let index = 0; index < probabilities.length; index++) {
        threshold -= probabilities[index];
        if (threshold < 0) return index;
    }
    return probabilities.length - 1;
}

/** Same-day steps after a first answer or a lapse, until the steps are passed or Easy is pressed. */
function shortTermSteps(
    model: ReturnType<typeof fsrsEvaluationModel>,
    state: { stability: number; difficulty: number },
    firstRating: number,
    steps: number,
    transitions: readonly (readonly number[])[],
    costs: readonly number[],
    draw: () => number,
): { stability: number; difficulty: number; seconds: number } {
    let { stability, difficulty } = state;
    let rating = firstRating;
    let seconds = 0;
    let passed = 0;
    const needed = rating > 2 ? Math.max(0, steps - 1) : steps;
    for (let step = 0; step < MAX_SHORT_TERM_STEPS && passed < needed && rating < 4; step++) {
        rating = pick(transitions[rating - 1], draw()) + 1;
        ({ stability, difficulty } = model.step(stability, difficulty, 0, rating, false));
        seconds += costs[rating - 1];
        if (rating > 2) passed += 1;
        else if (rating === 1) passed = 0;
    }
    return { stability, difficulty, seconds };
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Run the simulation. Resolves null when the progress callback asks to stop; it hands the screen
 * back every few milliseconds, so a long run never freezes it.
 */
export async function simulateFsrs(input: FsrsSimulationInput, onProgress?: SimulationProgress): Promise<FsrsSimulationResult | null> {
    const days = Math.max(1, Math.floor(input.days));
    const model = fsrsEvaluationModel(input.params);
    const decay = clampFsrsParameters(input.params)[20];
    // lib/fsrs.ts `fsrsRetrievability`'s forgetting curve, evaluated in doubles: it runs for every
    // card on every day, and a probability to draw against needs no f32 rounding.
    const curveFactor = Math.pow(0.9, -1 / decay) - 1;
    const recallAfter = (elapsed: number, cardStability: number) => Math.pow(1 + curveFactor * Math.max(0, elapsed) / cardStability, -decay);
    const { learner } = input;
    const rng = new AnkiStdRng(BigInt(input.seed ?? SIMULATOR_SEED));
    const draw = () => rng.nextUnitF32();
    const reviewLimit = Math.max(0, input.reviewLimit);
    const newLimit = Math.max(0, input.newLimit);
    const maxInterval = Math.max(1, Math.floor(input.maxInterval));
    const leechThreshold = input.leechThreshold !== null && input.leechThreshold > 0 ? input.leechThreshold : Infinity;
    const easyDays = parseEasyDays(input.easyDays);
    const plainWeek = easyDays.every((day) => day === 'normal');
    const tomorrowWeekday = intervalToWeekday(1, input.nextDayAtMs);

    const capacity = input.existing.length + (newLimit > 0 ? Math.max(0, input.newCards) : 0);
    const stability = new Float64Array(capacity);
    const difficulty = new Float64Array(capacity);
    const due = new Float64Array(capacity);
    const lastReview = new Float64Array(capacity);
    const interval = new Float64Array(capacity);
    const lapses = new Int32Array(capacity);
    const order = new Float64Array(capacity);
    let count = 0;

    const result: FsrsSimulationResult = {
        reviews: new Array(days).fill(0),
        newCards: new Array(days).fill(0),
        seconds: new Array(days).fill(0),
        memorized: new Array(days).fill(0),
    };
    const memorized = new Float64Array(days);
    // Cards due on each day, which the load balancer weighs; a little past the end, as in Anki.
    const dueCounts = new Int32Array(days + Math.floor(days / 2));
    const buckets: number[][] = Array.from({ length: days }, () => []);

    const stride = Math.max(1, Math.floor(input.memorizedStride ?? 1));
    /** The next counted day at or after `day`. */
    const countedFrom = (day: number) => {
        if (stride === 1 || day === 0) return day;
        const next = Math.ceil((day + 1) / stride) * stride - 1;
        return Math.min(next, days - 1);
    };
    /** Add a card's recall probability to each counted day from its last review up to (not including) `until`. */
    const addMemorized = (card: number, until: number) => {
        const end = Math.min(until, days);
        for (let day = countedFrom(Math.max(0, lastReview[card])); day < end; day = day === days - 1 ? days : countedFrom(day + 1)) {
            memorized[day] += recallAfter(day - lastReview[card], stability[card]);
        }
    };

    const schedule = (card: number, today: number) => {
        const ideal = Math.min(maxInterval, Math.max(1, Math.round(fsrsNextInterval(stability[card], input.desiredRetention, decay))));
        const chosen = balancedInterval(ideal, today);
        lastReview[card] = today;
        interval[card] = chosen;
        due[card] = today + chosen;
        if (due[card] < days) buckets[due[card]].push(card);
        if (due[card] < dueCounts.length) dueCounts[due[card]] += 1;
    };

    /** The load balancer: a day in the fuzz window, weighted towards fewer cards due and Easy Days. */
    const balancedInterval = (target: number, today: number): number => {
        const { lower, upper } = constrainedFuzzBounds(target, 1, maxInterval);
        if (upper <= lower) return lower;
        const counts: number[] = [];
        for (let candidate = lower; candidate <= upper; candidate++) {
            const day = today + candidate;
            counts.push(day < dueCounts.length ? dueCounts[day] : 0);
        }
        const modifiers = plainWeek
            ? null
            : easyDaysModifiers(easyDays, counts.map((_, index) => (tomorrowWeekday + today + lower + index - 1) % 7), counts);
        // lib/loadBalancer.ts `selectWeightedInterval`: an empty day weighs 1, otherwise fewer
        // cards and a shorter interval weigh more.
        const weights = counts.map((dueThen, index) => (dueThen === 0
            ? 1
            : Math.pow(1 / dueThen, 2.15) * Math.pow(1 / (lower + index), 3) * (modifiers ? modifiers[index] : 1)));
        return lower + pick(weights, draw());
    };

    for (const card of input.existing) {
        if (!(card.stability > 1e-9) || count >= capacity) continue;
        const index = count++;
        stability[index] = card.stability;
        difficulty[index] = card.difficulty;
        due[index] = card.due;
        lastReview[index] = Math.min(0, card.lastReview);
        interval[index] = card.interval;
        lapses[index] = card.lapses;
        const day = Math.max(0, card.due);
        if (day < days) buckets[day].push(index);
        if (day < dueCounts.length) dueCounts[day] += 1;
    }

    const priority = (card: number): number => {
        switch (input.reviewOrder) {
            case 'dueRandom':
            case 'dueThenDeck':
            case 'deckThenDue':
                return lastReview[card] + interval[card];
            case 'intervalsAsc': return interval[card];
            case 'intervalsDesc': return -interval[card];
            case 'easeAsc': return -Math.trunc(difficulty[card] * 100);
            case 'retrievabilityAsc':
            case 'retrievabilityDesc': {
                const recall = Math.trunc(recallAfter(due[card] - lastReview[card], stability[card]) * 1000);
                return input.reviewOrder === 'retrievabilityAsc' ? recall : -recall;
            }
            case 'random': return draw();
            // Easiest first, the order fsrs-rs falls back on (Anki has none for these here).
            default: return Math.trunc(difficulty[card] * 100);
        }
    };

    let waitingNew = 0;
    let sliceStart = Date.now();
    const total = days + 1;
    const maybeYield = async (done: number): Promise<boolean> => {
        if (Date.now() - sliceStart < SLICE_MS) return true;
        if (onProgress?.(done, total) === false) return false;
        await nextTick();
        sliceStart = Date.now();
        return true;
    };

    for (let today = 0; today < days; today++) {
        let reviewed = 0;
        let learned = 0;
        const candidates = buckets[today];
        buckets[today] = [];
        for (const card of candidates) order[card] = priority(card);
        candidates.sort((a, b) => (due[a] - due[b]) || (order[a] - order[b]) || (a - b));

        for (const card of candidates) {
            if (lapses[card] >= leechThreshold) continue;
            if (reviewed + 1 > reviewLimit) {
                dueCounts[today] -= 1;
                due[card] = today + 1;
                if (today + 1 < days) buckets[today + 1].push(card);
                if (today + 1 < dueCounts.length) dueCounts[today + 1] += 1;
                continue;
            }
            const elapsed = today - lastReview[card];
            const recall = recallAfter(elapsed, stability[card]);
            addMemorized(card, today);
            let seconds: number;
            if (draw() < recall) {
                const rating = pick(learner.reviewRatingProb, draw()) + 2;
                ({ stability: stability[card], difficulty: difficulty[card] } = model.step(stability[card], difficulty[card], elapsed, rating, false));
                seconds = learner.costs[1][rating - 1];
            } else {
                lapses[card] += 1;
                const lapsed = model.step(stability[card], difficulty[card], elapsed, 1, false);
                const relearned = shortTermSteps(model, lapsed, 1, input.relearningSteps, learner.relearningTransitions, learner.costs[2], draw);
                stability[card] = relearned.stability;
                difficulty[card] = relearned.difficulty;
                seconds = learner.costs[1][0] + relearned.seconds;
            }
            reviewed += 1;
            result.seconds[today] += seconds;
            schedule(card, today);
        }

        if (newLimit > 0) {
            // New card i is introduced on day ⌊(introduced today + i) / limit⌋, as Anki deals them.
            const firstToday = Math.max(0, today * newLimit - input.introducedToday);
            const firstTomorrow = Math.max(0, (today + 1) * newLimit - input.introducedToday);
            waitingNew += Math.max(0, Math.min(input.newCards, firstTomorrow) - Math.min(input.newCards, firstToday));
            while (waitingNew > 0 && count < capacity) {
                const blocked = input.newCardsIgnoreReviewLimit
                    ? learned + 1 > newLimit
                    : learned + reviewed + 1 > reviewLimit || learned + 1 > newLimit;
                if (blocked) break;
                const card = count++;
                const firstRating = pick(learner.firstRatingProb, draw()) + 1;
                const initial = model.step(0, 0, 0, firstRating, true);
                const learnt = shortTermSteps(model, initial, firstRating, input.learningSteps, learner.learningTransitions, learner.costs[0], draw);
                stability[card] = learnt.stability;
                difficulty[card] = learnt.difficulty;
                result.seconds[today] += learner.costs[0][firstRating - 1] + learnt.seconds;
                learned += 1;
                waitingNew -= 1;
                schedule(card, today);
            }
        }
        result.reviews[today] = reviewed;
        result.newCards[today] = learned;
        if (!(await maybeYield(today + 1))) return null;
    }

    for (let card = 0; card < count; card++) {
        addMemorized(card, days);
        if (card % 512 === 511 && !(await maybeYield(days))) return null;
    }
    if (onProgress?.(total, total) === false) return null;
    result.memorized = Array.from(memorized, (value, day) => (countedFrom(day) === day ? value : NaN));
    return result;
}
