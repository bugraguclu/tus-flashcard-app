/**
 * FSRS parameter optimization.
 *
 * The model predicts, for every review in the collection's history, the probability that the
 * learner would recall the card at that moment. Optimizing means searching for the 21 parameters
 * that make those predictions match what actually happened.
 *
 * The objective is the standard one for FSRS: binary cross-entropy (log loss) of predicted
 * retrievability against the observed outcome, where "recalled" means anything but Again. The
 * search is mini-batch Adam over numerically estimated gradients, clamped to each parameter's
 * legal range, and the result is only adopted when it beats the parameters the preset already has.
 *
 * This is deliberately not a port of Anki's trainer: upstream runs full backpropagation through a
 * tensor framework with recency weighting and a separate initial-stability pretraining pass.
 * The objective, the parameter bounds and the accept/reject rule are the same, so the outcome is
 * comparable, but the numbers will not be identical to Anki's for the same collection.
 */

import {
    clampFsrsParameters,
    type FsrsClampOptions,
    decayFromParameters,
    fsrsRetrievability,
    fsrsStep,
    type FsrsMemoryState,
    type FsrsReview,
} from './fsrs';

/** One training example: a review sequence whose final answer is the value being predicted. */
export interface FsrsTrainingItem {
    reviews: FsrsReview[];
}

export interface FsrsFitMetrics {
    /** Mean binary cross-entropy; lower is better. */
    logLoss: number;
    /** Root mean squared error between predicted and observed recall. */
    rmse: number;
    /** How many reviews the metric was measured over. */
    reviewCount: number;
}

export interface FsrsOptimizeOptions {
    /** Parameters to start from; defaults to the preset's current values. */
    initialParameters?: readonly number[];
    /** Full passes over the data. */
    iterations?: number;
    batchSize?: number;
    learningRate?: number;
    /** Called with 0..1 so a screen can show progress; return false to stop early. */
    onProgress?: (progress: number) => boolean | void;
    /** Deterministic shuffling for tests. */
    randomSeed?: number;
    /**
     * The preset's shape, so training explores the same parameter box Anki's trainer explores:
     * more than one relearning step lowers the w17/w18 ceiling, and short-term scheduling puts a
     * floor under w19. Omitted, the scheduling-time bounds are used.
     */
    clamp?: FsrsClampOptions;
}

export interface FsrsOptimizeResult {
    parameters: number[];
    before: FsrsFitMetrics;
    after: FsrsFitMetrics;
    /** True when the search improved on the starting parameters and its result was adopted. */
    improved: boolean;
    iterationsRun: number;
}

/** Anki trains on cards with at least this many reviews; below it the signal is noise. */
export const FSRS_MIN_TRAINING_REVIEWS = 8;
/** Upstream warns below roughly a thousand reviews; the UI repeats that warning. */
export const FSRS_RECOMMENDED_TRAINING_REVIEWS = 400;

const EPSILON = 1e-7;

/**
 * Expand card histories into training items: every review that happened on a later day than the
 * one before it becomes a prediction target, with the reviews before it as its context.
 */
export function buildFsrsTrainingItems(
    histories: ReadonlyArray<{ reviews: FsrsReview[]; complete: boolean }>,
    maxItems: number = 20_000,
): FsrsTrainingItem[] {
    const items: FsrsTrainingItem[] = [];
    for (const history of histories) {
        // A history that does not reach back to a learning step has no trustworthy starting
        // state, so training would be fitting noise.
        if (!history.complete) continue;
        for (let index = 1; index < history.reviews.length; index++) {
            if (history.reviews[index].deltaDays <= 0) continue;
            items.push({ reviews: history.reviews.slice(0, index + 1) });
            if (items.length >= maxItems) return items;
        }
    }
    return items;
}

/** Predicted recall probability for the final review of an item. */
function predict(params: readonly number[], item: FsrsTrainingItem): number {
    const decay = decayFromParameters(params);
    let state: FsrsMemoryState = { stability: 0, difficulty: 0 };

    for (let index = 0; index < item.reviews.length - 1; index++) {
        const review = item.reviews[index];
        state = fsrsStep(params, state, review.deltaDays, review.rating, index === 0);
    }

    const last = item.reviews[item.reviews.length - 1];
    return Math.min(1 - EPSILON, Math.max(EPSILON, fsrsRetrievability(state.stability, last.deltaDays, decay)));
}

function observed(item: FsrsTrainingItem): number {
    return item.reviews[item.reviews.length - 1].rating > 1 ? 1 : 0;
}

/** Mean log loss and RMSE of a parameter set over the given items. */
export function evaluateFsrsParameters(
    params: readonly number[],
    items: readonly FsrsTrainingItem[],
    clampOptions: FsrsClampOptions = {},
): FsrsFitMetrics {
    if (items.length === 0) return { logLoss: 0, rmse: 0, reviewCount: 0 };

    const clamped = clampFsrsParameters(params, clampOptions);
    let logLoss = 0;
    let squaredError = 0;

    for (const item of items) {
        const prediction = predict(clamped, item);
        const actual = observed(item);
        logLoss -= actual * Math.log(prediction) + (1 - actual) * Math.log(1 - prediction);
        squaredError += (prediction - actual) ** 2;
    }

    return {
        logLoss: logLoss / items.length,
        rmse: Math.sqrt(squaredError / items.length),
        reviewCount: items.length,
    };
}

function batchLoss(params: readonly number[], batch: readonly FsrsTrainingItem[]): number {
    let loss = 0;
    for (const item of batch) {
        const prediction = predict(params, item);
        const actual = observed(item);
        loss -= actual * Math.log(prediction) + (1 - actual) * Math.log(1 - prediction);
    }
    return loss / Math.max(1, batch.length);
}

/** Small deterministic PRNG so a run can be reproduced from a seed. */
function createRandom(seed: number): () => number {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 0x1_0000_0000;
    };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
}

/**
 * Fit the parameters to the collection's own review history.
 *
 * Gradients are estimated by forward differences on each mini-batch: with only 21 parameters this
 * is affordable and avoids hand-deriving (and mis-deriving) the analytic gradient of the model.
 */
export function optimizeFsrsParameters(
    items: readonly FsrsTrainingItem[],
    options: FsrsOptimizeOptions = {},
): FsrsOptimizeResult {
    const clampOptions = options.clamp ?? {};
    const start = clampFsrsParameters(options.initialParameters ?? [], clampOptions);
    const before = evaluateFsrsParameters(start, items, clampOptions);

    if (items.length < FSRS_MIN_TRAINING_REVIEWS) {
        return { parameters: start, before, after: before, improved: false, iterationsRun: 0 };
    }

    const iterations = Math.max(1, Math.min(500, Math.floor(options.iterations ?? 60)));
    const batchSize = Math.max(8, Math.min(512, Math.floor(options.batchSize ?? 128)));
    const learningRate = options.learningRate ?? 0.01;
    const random = createRandom(options.randomSeed ?? 0x9e3779b9);

    // Adam moments.
    let params = [...start];
    const firstMoment = new Array(params.length).fill(0);
    const secondMoment = new Array(params.length).fill(0);
    const beta1 = 0.9;
    const beta2 = 0.999;
    const stepEpsilon = 1e-8;
    // A relative step keeps the finite difference meaningful for both tiny and large parameters.
    const differenceStep = (value: number) => Math.max(1e-4, Math.abs(value) * 1e-3);

    let step = 0;
    let stopped = false;
    // Keep the best parameters seen rather than whatever the last step produced: a mini-batch
    // gradient can overshoot, and an optimizer that can return a worse model is not usable.
    let bestParams = [...start];
    let bestLoss = before.logLoss;

    for (let iteration = 0; iteration < iterations && !stopped; iteration++) {
        const order = shuffled(items, random);
        for (let offset = 0; offset < order.length && !stopped; offset += batchSize) {
            const batch = order.slice(offset, offset + batchSize);
            const baseLoss = batchLoss(params, batch);
            step += 1;

            for (let index = 0; index < params.length; index++) {
                const delta = differenceStep(params[index]);
                const probe = [...params];
                probe[index] += delta;
                const gradient = (batchLoss(clampFsrsParameters(probe, clampOptions), batch) - baseLoss) / delta;

                firstMoment[index] = beta1 * firstMoment[index] + (1 - beta1) * gradient;
                secondMoment[index] = beta2 * secondMoment[index] + (1 - beta2) * gradient * gradient;
                const correctedFirst = firstMoment[index] / (1 - Math.pow(beta1, step));
                const correctedSecond = secondMoment[index] / (1 - Math.pow(beta2, step));
                params[index] -= learningRate * correctedFirst / (Math.sqrt(correctedSecond) + stepEpsilon);
            }
            params = clampFsrsParameters(params, clampOptions);
        }

        const iterationMetrics = evaluateFsrsParameters(params, items, clampOptions);
        if (iterationMetrics.logLoss < bestLoss) {
            bestLoss = iterationMetrics.logLoss;
            bestParams = [...params];
        }

        if (options.onProgress) {
            const keepGoing = options.onProgress((iteration + 1) / iterations);
            if (keepGoing === false) stopped = true;
        }
    }

    const after = evaluateFsrsParameters(bestParams, items, clampOptions);
    // Never hand back parameters that predict this collection worse than the ones in use.
    const improved = after.logLoss < before.logLoss;

    return {
        parameters: improved ? bestParams : start,
        before,
        after: improved ? after : before,
        improved,
        iterationsRun: step,
    };
}
