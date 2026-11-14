/**
 * Anki's "Evaluate" button for one preset: how well a set of FSRS parameters explains the
 * preset's own review history, as two numbers where smaller is better.
 *
 *  - Log loss is exactly what the optimizer compares parameters by (`fsrsLogLoss`, lib/fsrsTraining.ts):
 *    the recency-weighted binary cross-entropy of each training item's predicted recall.
 *  - RMSE(bins) groups the same predictions into bins of similar reviews and measures how far the
 *    average prediction of each bin lies from the share of those reviews that were actually
 *    recalled, weighting each bin by its items' recency weights.
 *
 * The history is the optimizer's (`collectFsrsTrainingItems`): every unsuspended card of the
 * preset's decks, its log made into training items the way Anki makes them, ordered by the review
 * that ends each item, with the same "ignore reviews before" date. Nothing is written.
 *
 * The binning follows the algorithm fsrs-rs 6.6.2 documents and runs in `evaluate`
 * (`FSRSItem::r_matrix_index` in src/dataset.rs, `rmse_bins` in src/inference.rs, BSD-3-Clause,
 * https://github.com/open-spaced-repetition/fsrs-rs/blob/v6.6.2/src/inference.rs), which Anki
 * 26.09.3 calls from its Evaluate button. This is an independent implementation of that
 * description; lib/fsrsEvaluate.test.ts checks it against values Anki 26.09.3 itself reported
 * (`test/fixtures/anki-26.09-evaluate.json`, scripts/anki-oracle/gen_evaluate.py).
 */

import { collectFsrsTrainingItems } from './fsrsMaintenance';
import type { FsrsTrainingItem } from './fsrsMemory';
import { fsrsEvaluationModel, fsrsLogLossOfPredictions, recencyWeights, type TrainingProgress } from './fsrsTraining';
import type { AppSettings } from './types';

const f32 = Math.fround;

/** Items predicted between two progress reports; the screen gets the main thread back after each. */
const CHUNK_ITEMS = 2048;

/** Rust's `f64::round` for the non-negative values the bins produce: halves round up. */
function roundHalfUp(value: number): number {
    return Math.floor(value + 0.5);
}

/**
 * Which of the geometric classes `base^k <= value < base^(k+1)` a value falls in, labelled by
 * `scale * base^k` rounded, as fsrs-rs labels its bins. Zero falls below every class.
 */
function geometricBin(value: number, base: number, scale: number): number {
    if (value <= 0) return 0;
    const exponent = Math.floor(Math.log(value) / Math.log(base));
    return roundHalfUp(scale * Math.pow(base, exponent));
}

/**
 * The bin one training item is scored in: three numbers, each a class on a geometric scale.
 *
 *  - the days since the review before the item's last one (classes of ×3.62, labelled
 *    248, 898, 3250 … for 1, 4–13, 14–47 … days);
 *  - one more than the number of the item's reviews that came on a later day than the one before
 *    (classes of ×1.89);
 *  - the lapses among the earlier reviews: Again answers on a later day than the review before
 *    (none is its own bin, then classes of ×1.73).
 */
export function fsrsEvaluationBin(item: FsrsTrainingItem): [number, number, number] {
    const last = item.length - 1;
    let spacedReviews = 0;
    let lapses = 0;
    for (let index = 0; index <= last; index++) {
        const review = item.reviews[index];
        if (review.deltaDays <= 0) continue;
        spacedReviews += 1;
        if (index < last && review.rating === 1) lapses += 1;
    }
    return [
        geometricBin(item.reviews[last].deltaDays, 3.62, 248),
        geometricBin(spacedReviews + 1, 1.89, 1.99),
        lapses === 0 ? 0 : geometricBin(lapses, 1.73, 1.65),
    ];
}

/**
 * RMSE(bins) of raw predictions, one per item in the items' order, with the items' recency
 * weights. Within a bin the predictions, outcomes, counts and weights are summed in item order in
 * 32-bit floats, as fsrs-rs sums them; the bins are then combined in the order they first appear
 * (fsrs-rs walks a hash map, so its own result varies in the last bits between runs).
 */
export function fsrsRmseBins(
    predictions: ArrayLike<number>,
    items: readonly FsrsTrainingItem[],
    weights: readonly number[] = recencyWeights(items.length),
): number {
    if (!items.length) throw new Error('NotEnoughData');
    const bins = new Map<string, { predicted: number; actual: number; count: number; weight: number }>();
    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const key = fsrsEvaluationBin(item).join(',');
        let bin = bins.get(key);
        if (!bin) {
            bin = { predicted: 0, actual: 0, count: 0, weight: 0 };
            bins.set(key, bin);
        }
        bin.predicted = f32(bin.predicted + predictions[index]);
        bin.actual = f32(bin.actual + (item.reviews[item.length - 1].rating > 1 ? 1 : 0));
        bin.count = f32(bin.count + 1);
        bin.weight = f32(bin.weight + weights[index]);
    }
    let squared = 0;
    let weightSum = 0;
    for (const bin of bins.values()) {
        const gap = f32(f32(bin.predicted / bin.count) - f32(bin.actual / bin.count));
        squared = f32(squared + f32(f32(gap * gap) * bin.weight));
        weightSum = f32(weightSum + bin.weight);
    }
    return f32(Math.sqrt(f32(squared / weightSum)));
}

export interface FsrsEvaluation {
    /** Weighted log loss, as the optimizer measures it. */
    logLoss: number;
    /** RMSE(bins), a fraction: 0.0412 is shown as 4.12%. */
    rmseBins: number;
}

/**
 * The figures as Anki's Evaluate prints them ("Log loss: 0.3218, RMSE(bins): 4.12%"): log loss
 * to four places and RMSE(bins) as a percentage to two, with the decimal mark the copy asks for.
 */
export function fsrsEvaluationFigures(evaluation: FsrsEvaluation, decimalMark: '.' | ',' = '.'): { logLoss: string; rmsePercent: string } {
    const mark = (text: string) => (decimalMark === '.' ? text : text.replace('.', decimalMark));
    return {
        logLoss: mark(evaluation.logLoss.toFixed(4)),
        rmsePercent: mark((evaluation.rmseBins * 100).toFixed(2)),
    };
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Evaluate parameters on training items. The items of one card share their review list, so each
 * card's memory is followed once and every item read off along the way. Resolves null when the
 * progress callback asks to stop; rejects with `NotEnoughData` for no items and `InvalidInput`
 * when the parameters predict something that is not a probability.
 */
export async function evaluateFsrsItems(
    params: readonly number[],
    items: readonly FsrsTrainingItem[],
    onProgress?: TrainingProgress,
): Promise<FsrsEvaluation | null> {
    if (!items.length) throw new Error('NotEnoughData');
    const model = fsrsEvaluationModel(params);
    const groups = new Map<FsrsTrainingItem['reviews'], number[]>();
    items.forEach((item, index) => {
        const group = groups.get(item.reviews);
        if (group) group.push(index);
        else groups.set(item.reviews, [index]);
    });

    const predictions = new Float64Array(items.length);
    let done = 0;
    let sinceReport = 0;
    for (const [reviews, indexes] of groups) {
        const values = model.predictPrefixes(reviews, indexes.map((index) => items[index].length));
        indexes.forEach((itemIndex, position) => {
            if (!Number.isFinite(values[position])) throw new Error('InvalidInput');
            predictions[itemIndex] = values[position];
        });
        done += indexes.length;
        sinceReport += indexes.length;
        if (sinceReport >= CHUNK_ITEMS || done === items.length) {
            sinceReport = 0;
            if (onProgress?.(done, items.length) === false) return null;
            if (done < items.length) await nextTick();
        }
    }

    const logLoss = fsrsLogLossOfPredictions(predictions, items);
    const rmseBins = fsrsRmseBins(predictions, items);
    if (!Number.isFinite(rmseBins)) throw new Error('InvalidInput');
    return { logLoss, rmseBins };
}

export interface FsrsEvaluateResult {
    /** Training items the history produced; 0 means there was nothing to evaluate. */
    items: number;
    /** Answers those items draw on, as the optimizer counts them. */
    reviews: number;
    /** Null when there was no usable history. */
    evaluation: FsrsEvaluation | null;
}

/**
 * Evaluate one preset's parameters on the history Optimize trains on. Resolves null when the
 * progress callback asked to stop. Read-only: nothing in the collection changes.
 */
export async function evaluateFsrsPreset(options: {
    deckIds: number[];
    settings: AppSettings;
    parameters: readonly number[];
    ignoreRevlogsBeforeMs: number;
    onProgress?: TrainingProgress;
    nowMs?: number;
}): Promise<FsrsEvaluateResult | null> {
    const { items, reviews } = collectFsrsTrainingItems(options.deckIds, options.settings, options.ignoreRevlogsBeforeMs, options.nowMs);
    if (items.length === 0) return { items: 0, reviews, evaluation: null };
    const evaluation = await evaluateFsrsItems(options.parameters, items, options.onProgress);
    if (evaluation === null) return null;
    return { items: items.length, reviews, evaluation };
}
