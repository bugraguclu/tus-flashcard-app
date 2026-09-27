import { DEFAULT_FSRS_PARAMETERS, FSRS_STABILITY_MIN } from './fsrs';
import type { FsrsTrainingItem } from './fsrsMemory';

/**
 * The first half of FSRS training as fsrs-rs 5.2.0 runs it (`src/dataset.rs` `filter_outlier`
 * and `src/parameter_initialization.rs`, BSD-3-Clause): set aside the items that end on a card's
 * first spaced review, drop rare or extreme (first rating, first interval) pairs from them and
 * from the training set, and fit each first rating's initial stability to those pairs by ternary
 * search. The arithmetic follows upstream's own types: f64 for the search, f32 for the results.
 *
 * Ported from fsrs-rs, Copyright (c) 2023, Open Spaced Repetition, under the BSD 3-Clause License.
 */

const f32 = Math.fround;
const INIT_S_MAX = 100;
const DEFAULT_S0 = DEFAULT_FSRS_PARAMETERS.slice(0, 4).map(f32);

export function longTermReviewCount(item: FsrsTrainingItem): number {
    let count = 0;
    for (let index = 0; index < item.length; index++) if (item.reviews[index].deltaDays > 0) count += 1;
    return count;
}

function firstLongTermDelta(item: FsrsTrainingItem): number {
    for (let index = 0; index < item.length; index++) {
        if (item.reviews[index].deltaDays > 0) return item.reviews[index].deltaDays;
    }
    throw new Error('FSRS item without a spaced review');
}

/** `prepare_training_data`: the pre-training set, and every item left after dropping outliers. */
export function prepareTrainingData(items: readonly FsrsTrainingItem[]): {
    initialization: FsrsTrainingItem[];
    training: FsrsTrainingItem[];
} {
    const groups = new Map<number, Map<number, FsrsTrainingItem[]>>();
    for (const item of items) {
        if (longTermReviewCount(item) !== 1) continue;
        const rating = item.reviews[0].rating;
        const delta = item.reviews[item.length - 1].deltaDays;
        const byDelta = groups.get(rating) ?? new Map<number, FsrsTrainingItem[]>();
        const group = byDelta.get(delta) ?? [];
        group.push(item);
        byDelta.set(delta, group);
        groups.set(rating, byDelta);
    }

    const initialization: FsrsTrainingItem[] = [];
    const removed = new Map<number, Set<number>>();
    for (const rating of [...groups.keys()].sort((a, b) => a - b)) {
        const subGroups = [...groups.get(rating)!.entries()]
            .sort(([deltaA, a], [deltaB, b]) => b.length - a.length || deltaB - deltaA);
        const total = subGroups.reduce((sum, [, group]) => sum + group.length, 0);
        const removedDeltas = removed.get(rating) ?? new Set<number>();
        removed.set(rating, removedDeltas);
        let removedCount = 0;
        for (let index = subGroups.length - 1; index >= 0; index--) {
            const [delta, group] = subGroups[index];
            if (removedCount + group.length >= Math.max(20, Math.floor(total / 20))) {
                if (group.length >= 6 && delta <= (rating !== 4 ? 100 : 365)) initialization.push(...group);
                else removedDeltas.add(delta);
            } else {
                removedCount += group.length;
                removedDeltas.add(delta);
            }
        }
    }
    const training = items.filter((item) => !removed.get(item.reviews[0].rating)?.has(firstLongTermDelta(item)));
    return { initialization, training };
}

/** `calculate_average_recall`: the share of items whose last answer was not Again, in f32. */
export function averageRecall(items: readonly FsrsTrainingItem[]): number {
    if (items.length === 0) return 0;
    let recalled = 0;
    for (const item of items) if (item.reviews[item.length - 1].rating > 1) recalled += 1;
    return f32(f32(recalled) / f32(items.length));
}

interface AverageRecall {
    delta: number;
    recall: number;
    count: number;
}

/** ndarray's `sum`: eight running sums, paired off, then the leftovers. Order changes the bits. */
export function unrolledSum(values: ArrayLike<number>, round: (value: number) => number = (value) => value): number {
    const partial = [0, 0, 0, 0, 0, 0, 0, 0];
    let index = 0;
    for (; index + 8 <= values.length; index += 8) {
        for (let lane = 0; lane < 8; lane++) partial[lane] = round(partial[lane] + values[index + lane]);
    }
    let total = 0;
    for (let lane = 0; lane < 4; lane++) total = round(total + round(partial[lane] + partial[lane + 4]));
    for (; index < values.length; index++) total = round(total + values[index]);
    return total;
}

function pretrainLoss(data: readonly AverageRecall[], recall: readonly number[], s0: number, defaultS0: number): number {
    const decay = -f32(DEFAULT_FSRS_PARAMETERS[20]);
    const factor = 0.9 ** (1 / decay) - 1;
    const terms = data.map((point, index) => {
        const predicted = (point.delta / s0 * factor + 1) ** decay;
        return -(recall[index] * Math.log(predicted) + (1 - recall[index]) * Math.log(1 - predicted)) * point.count;
    });
    return unrolledSum(terms) + Math.abs(s0 - defaultS0) / 16;
}

/**
 * `initialize_stability_parameters`: a starting stability for each first rating, and how many
 * pre-training items each rating had. Throws when there is nothing to fit, as upstream errors.
 */
export function initializeStability(items: readonly FsrsTrainingItem[], recallRate: number): {
    stability: number[];
    ratingCounts: Map<number, number>;
} {
    const byRating = new Map<number, Map<number, number[]>>();
    for (const item of items) {
        if (longTermReviewCount(item) !== 1) continue;
        const rating = item.reviews[0].rating;
        const delta = firstLongTermDelta(item);
        const label = item.reviews[item.length - 1].rating > 1 ? 1 : 0;
        const byDelta = byRating.get(rating) ?? new Map<number, number[]>();
        const labels = byDelta.get(delta) ?? [];
        labels.push(label);
        byDelta.set(delta, labels);
        byRating.set(rating, byDelta);
    }

    const stabilities = new Map<number, number>();
    const ratingCounts = new Map<number, number>();
    for (const [rating, byDelta] of byRating) {
        const data: AverageRecall[] = [...byDelta.entries()]
            .map(([delta, labels]) => ({ delta, recall: unrolledSum(labels) / labels.length, count: labels.length }))
            .sort((a, b) => a.delta - b.delta);
        ratingCounts.set(rating, data.reduce((sum, point) => sum + point.count, 0));
        stabilities.set(rating, searchStability(data, rating, recallRate));
    }
    return { stability: smoothAndFill(stabilities, ratingCounts), ratingCounts };
}

/** `search_parameters` for one first rating: ternary search on the smoothed recall curve. */
function searchStability(data: readonly AverageRecall[], rating: number, recallRate: number): number {
    const defaultS0 = DEFAULT_S0[rating - 1];
    const recall = data.map((point) => (point.recall * point.count + recallRate) / (point.count + 1));
    let low = f32(FSRS_STABILITY_MIN);
    let high = INIT_S_MAX;
    let optimal = defaultS0;
    for (let iteration = 0; high - low > Number.EPSILON && iteration < 1000; iteration++) {
        const mid1 = low + (high - low) / 3;
        const mid2 = high - (high - low) / 3;
        if (pretrainLoss(data, recall, mid1, defaultS0) < pretrainLoss(data, recall, mid2, defaultS0)) high = mid2;
        else low = mid1;
        optimal = (high + low) / 2;
    }
    return f32(optimal);
}

const W1 = f32(0.41);
const W2 = f32(0.54);
const pow32 = (base: number, exponent: number) => f32(f32(base) ** f32(exponent));
const one = (value: number) => f32(1 - value);

/**
 * `smooth_and_fill`: keep the starting stabilities rising with the rating (the better-attested
 * rating wins a conflict), derive missing ones from the others, and clamp all four.
 */
export function smoothAndFill(stabilities: Map<number, number>, ratingCounts: Map<number, number>): number[] {
    const values = new Map([...stabilities].filter(([rating]) => ratingCounts.has(rating)));
    for (const [small, big] of [[1, 2], [2, 3], [3, 4], [1, 3], [2, 4], [1, 4]] as const) {
        const smallValue = values.get(small);
        const bigValue = values.get(big);
        if (smallValue === undefined || bigValue === undefined || !(smallValue > bigValue)) continue;
        if (ratingCounts.get(small)! > ratingCounts.get(big)!) values.set(big, smallValue);
        else values.set(small, bigValue);
    }

    let s: Array<number | undefined> = [undefined, values.get(1), values.get(2), values.get(3), values.get(4)];
    const known = values.size;
    if (known === 0) throw new Error('NotEnoughData');
    if (known === 1) {
        const [rating, value] = [...values][0];
        const factor = f32(value / DEFAULT_S0[rating - 1]);
        s = [undefined, ...DEFAULT_S0.map((x) => f32(x * factor)).sort((a, b) => a - b)];
    } else if (known === 2) {
        const [, r1, r2, r3, r4] = s;
        if (r1 === undefined && r2 === undefined && r3 !== undefined && r4 !== undefined) {
            const inv = f32(1 / one(W2));
            s[2] = f32(pow32(r3, inv) * pow32(r4, one(inv)));
            s[1] = f32(pow32(s[2], f32(1 / W1)) * pow32(r3, one(f32(1 / W1))));
        } else if (r1 === undefined && r2 !== undefined && r3 === undefined && r4 !== undefined) {
            s[3] = f32(pow32(r2, one(W2)) * pow32(r4, W2));
            s[1] = f32(pow32(r2, f32(1 / W1)) * pow32(s[3], one(f32(1 / W1))));
        } else if (r1 === undefined && r2 !== undefined && r3 !== undefined && r4 === undefined) {
            s[4] = f32(pow32(r2, one(f32(1 / W2))) * pow32(r3, f32(1 / W2)));
            s[1] = f32(pow32(r2, f32(1 / W1)) * pow32(r3, one(f32(1 / W1))));
        } else if (r1 !== undefined && r2 === undefined && r3 === undefined && r4 !== undefined) {
            // `w1.mul_add(-w2, w1 + w2)` is fused: one rounding of w1 + w2 - w1·w2.
            const fused = f32(W1 * -W2 + f32(W1 + W2));
            s[2] = f32(pow32(r1, f32(W1 / fused)) * pow32(r4, one(f32(W1 / fused))));
            s[3] = f32(pow32(r1, one(f32(W2 / fused))) * pow32(r4, f32(W2 / fused)));
        } else if (r1 !== undefined && r2 === undefined && r3 !== undefined && r4 === undefined) {
            s[2] = f32(pow32(r1, W1) * pow32(r3, one(W1)));
            s[4] = f32(pow32(s[2], one(f32(1 / W2))) * pow32(r3, f32(1 / W2)));
        } else if (r1 !== undefined && r2 !== undefined && r3 === undefined && r4 === undefined) {
            const inv = f32(1 / one(W1));
            s[3] = f32(pow32(r1, one(inv)) * pow32(r2, inv));
            s[4] = f32(pow32(r2, one(f32(1 / W2))) * pow32(s[3], f32(1 / W2)));
        }
    } else if (known === 3) {
        const [, r1, r2, r3, r4] = s;
        if (r1 === undefined && r2 !== undefined && r3 !== undefined) {
            s[1] = f32(pow32(r2, f32(1 / W1)) * pow32(r3, one(f32(1 / W1))));
        } else if (r1 !== undefined && r2 === undefined && r3 !== undefined) {
            s[2] = f32(pow32(r1, W1) * pow32(r3, one(W1)));
        } else if (r2 !== undefined && r3 === undefined && r4 !== undefined) {
            s[3] = f32(pow32(r2, one(W2)) * pow32(r4, W2));
        } else if (r2 !== undefined && r3 !== undefined && r4 === undefined) {
            s[4] = f32(pow32(r2, one(f32(1 / W2))) * pow32(r3, f32(1 / W2)));
        }
    }
    const filled = s.slice(1).filter((value): value is number => value !== undefined);
    return filled.slice(0, 4).map((value) => Math.min(INIT_S_MAX, Math.max(f32(FSRS_STABILITY_MIN), value)));
}
