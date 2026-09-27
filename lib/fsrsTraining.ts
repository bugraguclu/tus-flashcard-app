import { AnkiStdRng, ankiShuffledIndices } from './ankiRandom';
import {
    DEFAULT_FSRS_PARAMETERS,
    FSRS_PARAMETER_COUNT,
    clampFsrsParameters,
    fsrsNextStates,
    normalizeFsrsParameters,
} from './fsrs';
import type { FsrsTrainingItem } from './fsrsMemory';
import { averageRecall, initializeStability, prepareTrainingData, smoothAndFill, unrolledSum } from './fsrsPretrain';

/**
 * FSRS parameter training as Anki 26.05 runs it: fsrs-rs 5.2.0's `compute_parameters`
 * (`src/training.rs`, `src/dataset.rs`, `src/batch_shuffle.rs`, `src/cosine_annealing.rs`,
 * BSD-3-Clause) on Burn 0.17.1's Adam, wrapped in Anki's `compute_params`
 * (`rslib/src/scheduler/fsrs/params.rs`), which keeps the current parameters when they already
 * explain the history better. The recipe is upstream's, step for step:
 *
 *  - pre-train each first rating's starting stability (lib/fsrsPretrain.ts);
 *  - weight items by recency, drop those longer than 64 reviews, sort them by length and cut
 *    them into batches of 512;
 *  - five epochs over the batches, shuffled with `StdRng` seeded 2023, each batch one Adam step
 *    (eps 1e-8) on the recency-weighted log loss plus an L2 pull towards the starting parameters,
 *    with a cosine-annealed learning rate from 0.04, clipping the parameters after every step;
 *  - keep the epoch with the lowest loss, then re-smooth the four starting stabilities.
 *
 * The model runs in f32 in upstream's operation order. Gradients come from reverse-mode
 * differentiation of that same computation; Burn sums them in a different order and the platform
 * exp/pow differ in the last bit, so results agree with Anki's closely but not bit for bit.
 *
 * The training procedure is ported from fsrs-rs, Copyright (c) 2023, Open Spaced Repetition,
 * under the BSD 3-Clause License. Anki's own code (AGPL) was read for behaviour only.
 */

const f32 = Math.fround;

const BATCH_SIZE = 512;
const EPOCHS = 5;
const SEED = 2023n;
const LEARNING_RATE = 0.04;
const MAX_SEQUENCE_LENGTH = 64;
const GAMMA = 1;
const S_MIN = f32(0.001);
const S_MAX = 36_500;
const D_MIN = 1;
const D_MAX = 10;
const LN_0_9 = f32(Math.log(f32(0.9)));
const PARAMS_STDDEV = [
    6.43, 9.66, 17.58, 27.85, 0.57, 0.28, 0.6, 0.12, 0.39, 0.18, 0.33, 0.3, 0.09, 0.16, 0.57, 0.25,
    1.03, 0.31, 0.32, 0.14, 0.27,
].map(f32);
const DEFAULT_PARAMETERS_F32 = DEFAULT_FSRS_PARAMETERS.map(f32);

// Operations on the tape. PASS is a clamp that let the value through, so the gradient passes;
// BLOCK is one that replaced it, so no gradient flows.
const CONST = 0;
const PARAM = 1;
const ADD = 2;
const SUB = 3;
const MUL = 4;
const DIV = 5;
const NEG = 6;
const EXP = 7;
const LN = 8;
const POW = 9;
const PASS = 10;
const BLOCK = 11;

/** A record of one item's computation, for reverse-mode differentiation. Values are f32. */
class Tape {
    size = 0;
    value = new Float64Array(4096);
    adjoint = new Float64Array(4096);
    op = new Uint8Array(4096);
    left = new Int32Array(4096);
    right = new Int32Array(4096);

    private node(op: number, left: number, right: number, value: number): number {
        if (this.size === this.value.length) this.grow();
        const index = this.size++;
        this.op[index] = op;
        this.left[index] = left;
        this.right[index] = right;
        this.value[index] = value;
        return index;
    }

    private grow() {
        const capacity = this.value.length * 2;
        const copy = <T extends Float64Array | Uint8Array | Int32Array>(source: T, make: (size: number) => T): T => {
            const next = make(capacity);
            next.set(source);
            return next;
        };
        this.value = copy(this.value, (size) => new Float64Array(size));
        this.adjoint = copy(this.adjoint, (size) => new Float64Array(size));
        this.op = copy(this.op, (size) => new Uint8Array(size));
        this.left = copy(this.left, (size) => new Int32Array(size));
        this.right = copy(this.right, (size) => new Int32Array(size));
    }

    constant(value: number) { return this.node(CONST, -1, -1, f32(value)); }
    param(index: number, value: number) { return this.node(PARAM, index, -1, value); }
    add(a: number, b: number) { return this.node(ADD, a, b, f32(this.value[a] + this.value[b])); }
    sub(a: number, b: number) { return this.node(SUB, a, b, f32(this.value[a] - this.value[b])); }
    mul(a: number, b: number) { return this.node(MUL, a, b, f32(this.value[a] * this.value[b])); }
    div(a: number, b: number) { return this.node(DIV, a, b, f32(this.value[a] / this.value[b])); }
    neg(a: number) { return this.node(NEG, a, -1, -this.value[a]); }
    exp(a: number) { return this.node(EXP, a, -1, f32(Math.exp(this.value[a]))); }
    ln(a: number) { return this.node(LN, a, -1, f32(Math.log(this.value[a]))); }
    pow(a: number, b: number) { return this.node(POW, a, b, f32(Math.pow(this.value[a], this.value[b]))); }

    /** Burn's `clamp`: `clamp_min(clamp_max(x, max), min)`, each a `mask_fill` that stops the gradient. */
    clamp(a: number, min: number, max: number) {
        const value = this.value[a];
        if (value > max) return this.node(BLOCK, a, -1, max);
        if (value < min) return this.node(BLOCK, a, -1, min);
        return this.node(PASS, a, -1, value);
    }

    clampMin(a: number, min: number) {
        const value = this.value[a];
        return value < min ? this.node(BLOCK, a, -1, min) : this.node(PASS, a, -1, value);
    }

    /** Add d(seed · node)/d(parameter) into `gradients`, and return nothing else. */
    backward(root: number, seed: number, gradients: Float64Array) {
        const { value, adjoint, op, left, right } = this;
        adjoint.fill(0, 0, root + 1);
        adjoint[root] = seed;
        for (let index = root; index >= 0; index--) {
            const gradient = adjoint[index];
            if (gradient === 0) continue;
            const a = left[index];
            const b = right[index];
            switch (op[index]) {
                case PARAM: gradients[a] += gradient; break;
                case ADD: adjoint[a] += gradient; adjoint[b] += gradient; break;
                case SUB: adjoint[a] += gradient; adjoint[b] -= gradient; break;
                case MUL: adjoint[a] += gradient * value[b]; adjoint[b] += gradient * value[a]; break;
                case DIV: adjoint[a] += gradient / value[b]; adjoint[b] -= gradient * value[index] / value[b]; break;
                case NEG: adjoint[a] -= gradient; break;
                case EXP: adjoint[a] += gradient * value[index]; break;
                case LN: adjoint[a] += gradient / value[a]; break;
                case POW:
                    adjoint[a] += gradient * value[b] * Math.pow(value[a], value[b] - 1);
                    adjoint[b] += gradient * value[index] * Math.log(value[a]);
                    break;
                case PASS: adjoint[a] += gradient; break;
                default: break;
            }
        }
    }
}

/**
 * One item through the model (`Model::forward` then `power_forgetting_curve`), recorded on the
 * tape. Returns the node of `label · ln R + (1 − label) · ln(1 − R)`, times the item's weight.
 */
function recordItem(tape: Tape, w: ArrayLike<number>, item: FsrsTrainingItem, weight: number): number {
    tape.size = 0;
    const W = Array.from({ length: FSRS_PARAMETER_COUNT }, (_, index) => tape.param(index, w[index]));
    const one = tape.constant(1);

    const initDifficulty = (rating: number) => tape.add(tape.sub(W[4], tape.exp(tape.mul(W[5], tape.constant(rating - 1)))), one);
    const curve = (elapsed: number, stability: number) => {
        const decay = tape.neg(W[20]);
        const factor = tape.sub(tape.exp(tape.mul(tape.div(one, decay), tape.constant(LN_0_9))), one);
        return tape.pow(tape.add(tape.mul(tape.div(tape.constant(elapsed), stability), factor), one), decay);
    };

    let s = -1;
    let d = -1;
    for (let index = 0; index < item.length - 1; index++) {
        const { deltaDays, rating } = item.reviews[index];
        if (index === 0) {
            s = tape.clamp(W[rating - 1], S_MIN, S_MAX);
            d = tape.clamp(initDifficulty(rating), D_MIN, D_MAX);
            continue;
        }
        const lastS = tape.clamp(s, S_MIN, S_MAX);
        const lastD = tape.clamp(d, D_MIN, D_MAX);
        let newS: number;
        if (deltaDays === 0) {
            let increase = tape.mul(
                tape.exp(tape.mul(W[17], tape.add(tape.constant(rating - 3), W[18]))),
                tape.pow(lastS, tape.neg(W[19])),
            );
            if (rating >= 3) increase = tape.clampMin(increase, 1);
            newS = tape.mul(lastS, increase);
        } else {
            const r = curve(deltaDays, lastS);
            const forgotten = tape.add(tape.neg(r), one);
            if (rating === 1) {
                let postLapse = tape.mul(W[11], tape.pow(lastD, tape.neg(W[12])));
                postLapse = tape.mul(postLapse, tape.sub(tape.pow(tape.add(lastS, one), W[13]), one));
                postLapse = tape.mul(postLapse, tape.exp(tape.mul(forgotten, W[14])));
                const ceiling = tape.div(lastS, tape.exp(tape.mul(W[17], W[18])));
                newS = tape.value[ceiling] < tape.value[postLapse] ? ceiling : postLapse;
            } else {
                let increase = tape.exp(W[8]);
                increase = tape.mul(increase, tape.add(tape.neg(lastD), tape.constant(11)));
                increase = tape.mul(increase, tape.pow(lastS, tape.neg(W[9])));
                increase = tape.mul(increase, tape.sub(tape.exp(tape.mul(forgotten, W[10])), one));
                increase = tape.mul(increase, rating === 2 ? W[15] : one);
                increase = tape.mul(increase, rating === 4 ? W[16] : one);
                newS = tape.mul(lastS, tape.add(increase, one));
            }
        }
        const delta = tape.mul(tape.neg(W[6]), tape.constant(rating - 3));
        const damped = tape.add(lastD, tape.mul(tape.add(tape.neg(lastD), tape.constant(10)), tape.div(delta, tape.constant(9))));
        const reverted = tape.add(tape.mul(W[7], tape.sub(initDifficulty(4), damped)), damped);
        d = tape.clamp(reverted, D_MIN, D_MAX);
        s = tape.clamp(newS, S_MIN, S_MAX);
    }

    const current = item.reviews[item.length - 1];
    const r = curve(current.deltaDays, s);
    const label = current.rating > 1 ? 1 : 0;
    const term = tape.add(
        tape.mul(tape.constant(label), tape.ln(r)),
        tape.mul(tape.constant(1 - label), tape.ln(tape.add(tape.neg(r), one))),
    );
    return tape.mul(term, tape.constant(weight));
}

/** `recency_weighted_fsrs_items`: 0.25 for the oldest item rising to 1 for the newest, in f32. */
export function recencyWeights(count: number): number[] {
    const length = Math.max(f32(f32(count) - 1), 1);
    return Array.from({ length: count }, (_, index) => {
        const t = f32(f32(index) / length);
        return f32(0.25 + f32(0.75 * f32(t * f32(t * t))));
    });
}

/** `f32::powi`, as compiler-builtins computes it: square-and-multiply, rounding every product. */
function powi32(base: number, exponent: number): number {
    let result = 1;
    let factor = base;
    let remaining = exponent;
    for (;;) {
        if (remaining & 1) result = f32(result * factor);
        remaining >>= 1;
        if (remaining === 0) return result;
        factor = f32(factor * factor);
    }
}

/** Burn 0.17.1's Adam (`optim/adam.rs`) for one parameter vector, in f32. */
class Adam {
    private readonly m1 = new Float64Array(FSRS_PARAMETER_COUNT);
    private readonly m2 = new Float64Array(FSRS_PARAMETER_COUNT);
    private time = 0;

    step(w: Float64Array, gradients: Float64Array, learningRate: number) {
        const beta1 = f32(0.9);
        const beta2 = f32(0.999);
        const epsilon = f32(1e-8);
        const factor1 = f32(1 - beta1);
        const factor2 = f32(1 - beta2);
        this.time += 1;
        for (let index = 0; index < FSRS_PARAMETER_COUNT; index++) {
            const gradient = gradients[index];
            const squared = f32(gradient * gradient);
            if (this.time === 1) {
                this.m1[index] = f32(gradient * factor1);
                this.m2[index] = f32(squared * factor2);
            } else {
                this.m1[index] = f32(f32(this.m1[index] * beta1) + f32(gradient * factor1));
                this.m2[index] = f32(f32(this.m2[index] * beta2) + f32(squared * factor2));
            }
        }
        const correction1 = f32(1 - powi32(beta1, this.time));
        const correction2 = f32(1 - powi32(beta2, this.time));
        const rate = f32(learningRate);
        for (let index = 0; index < FSRS_PARAMETER_COUNT; index++) {
            const m1 = f32(this.m1[index] / correction1);
            const m2 = f32(this.m2[index] / correction2);
            const update = f32(m1 / f32(f32(Math.sqrt(m2)) + epsilon));
            w[index] = f32(w[index] - f32(update * rate));
        }
    }
}

/** fsrs-rs's `CosineAnnealingLR` with no floor, stepped before every batch. */
function cosineAnnealing(maxSteps: number, initial: number): () => number {
    let stepCount = -1;
    let current = initial;
    return () => {
        stepCount += 1;
        if (stepCount === 0) {
            current = initial;
        } else if ((stepCount - 1 - maxSteps) % (2 * maxSteps) === 0) {
            current = initial * (1 - Math.cos(Math.PI / maxSteps)) / 2;
        } else {
            current = ((1 + Math.cos(Math.PI * stepCount / maxSteps)) / (1 + Math.cos(Math.PI * (stepCount - 1) / maxSteps))) * current;
        }
        return current;
    };
}

interface WeightedItem {
    item: FsrsTrainingItem;
    weight: number;
}

/** The weighted log loss of one batch, `-Σ terms` summed as ndarray sums; optionally its gradient. */
function batchLoss(tape: Tape, w: Float64Array, batch: readonly WeightedItem[], gradients: Float64Array | null): number {
    const terms = new Float64Array(batch.length);
    for (let index = 0; index < batch.length; index++) {
        const root = recordItem(tape, w, batch[index].item, batch[index].weight);
        terms[index] = tape.value[root];
        if (gradients) tape.backward(root, -1, gradients);
    }
    return -unrolledSum(terms, f32);
}

/** `l2_regularization`: the pull back towards the starting parameters, scaled by batch share. */
function penalty(w: Float64Array, start: readonly number[], batchSize: number, totalSize: number, gradients: Float64Array | null): number {
    const scale = f32(GAMMA * batchSize / totalSize);
    const terms = new Float64Array(FSRS_PARAMETER_COUNT);
    for (let index = 0; index < FSRS_PARAMETER_COUNT; index++) {
        const difference = f32(w[index] - start[index]);
        const variance = f32(PARAMS_STDDEV[index] * PARAMS_STDDEV[index]);
        terms[index] = f32(f32(difference * difference) / variance);
        if (gradients) gradients[index] += 2 * difference / variance * scale;
    }
    return f32(unrolledSum(terms, f32) * scale);
}

function clipForTraining(w: Float64Array, numRelearningSteps: number) {
    const clipped = clampFsrsParameters([...w], { numRelearningSteps, enableShortTerm: true });
    for (let index = 0; index < FSRS_PARAMETER_COUNT; index++) w[index] = f32(clipped[index]);
}

export interface TrainingProgress {
    /** Batches trained so far and in all, across every epoch. */
    (done: number, total: number): boolean | void;
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** fsrs-rs `train`: the parameters of the epoch whose loss was lowest, or null when stopped. */
async function train(
    items: readonly WeightedItem[],
    start: readonly number[],
    numRelearningSteps: number,
    onProgress?: TrainingProgress,
): Promise<number[] | null> {
    // `FSRSDataset::from` sorts by length, stably, before the batches are cut.
    const dataset = items.map((entry, index) => ({ entry, index }))
        .sort((a, b) => a.entry.item.length - b.entry.item.length || a.index - b.index)
        .map(({ entry }) => entry);
    const batches: WeightedItem[][] = [];
    for (let offset = 0; offset < dataset.length; offset += BATCH_SIZE) batches.push(dataset.slice(offset, offset + BATCH_SIZE));

    const totalSize = items.length;
    const learningRate = cosineAnnealing((Math.floor(totalSize / BATCH_SIZE) + 1) * EPOCHS, LEARNING_RATE);
    const trainRng = new AnkiStdRng(SEED);
    const validRng = new AnkiStdRng(SEED);
    const tape = new Tape();
    const adam = new Adam();
    const w = Float64Array.from(start, f32);
    let bestLoss = Number.POSITIVE_INFINITY;
    let best = [...w];
    let done = 0;
    const total = batches.length * EPOCHS;

    for (let epoch = 0; epoch < EPOCHS; epoch++) {
        for (const batchIndex of ankiShuffledIndices(batches.length, trainRng)) {
            const batch = batches[batchIndex];
            const rate = learningRate();
            const gradients = new Float64Array(FSRS_PARAMETER_COUNT);
            penalty(w, start, batch.length, totalSize, gradients);
            batchLoss(tape, w, batch, gradients);
            adam.step(w, gradients.map(f32), rate);
            clipForTraining(w, numRelearningSteps);
            done += 1;
            if (onProgress && onProgress(done, total) === false) return null;
            if (done % 4 === 0) await nextTick();
        }

        let validLoss = 0;
        for (const batchIndex of ankiShuffledIndices(batches.length, validRng)) {
            const batch = batches[batchIndex];
            validLoss += batchLoss(tape, w, batch, null) + penalty(w, start, batch.length, totalSize, null);
        }
        validLoss /= totalSize;
        if (validLoss < bestLoss) {
            bestLoss = validLoss;
            best = [...w];
        }
        await nextTick();
    }
    return best;
}

/**
 * fsrs-rs `compute_parameters` for Anki's call (short-term on). Items must be in Anki's order,
 * by the review-log id of their last review. Returns null when progress asked to stop, and throws
 * when the history cannot be fitted at all, as upstream errors.
 */
export async function computeFsrsParameters(
    items: readonly FsrsTrainingItem[],
    numRelearningSteps: number,
    onProgress?: TrainingProgress,
): Promise<number[] | null> {
    const { initialization, training } = prepareTrainingData(items);
    const recall = averageRecall(training);
    if (training.length < 8) return [...DEFAULT_PARAMETERS_F32];

    const { stability, ratingCounts } = initializeStability(initialization, recall);
    const initialized = [...stability, ...DEFAULT_PARAMETERS_F32.slice(4)];
    if (training.length === initialization.length || training.length < 64) return initialized;

    const weights = recencyWeights(training.length);
    const weighted = training
        .map((item, index) => ({ item, weight: weights[index] }))
        .filter(({ item }) => item.length <= MAX_SEQUENCE_LENGTH);
    const trained = await train(weighted, initialized, Math.max(1, numRelearningSteps), onProgress);
    if (trained === null) return null;
    if (trained.some((value) => !Number.isFinite(value) && !Number.isNaN(value))) throw new Error('InvalidInput');

    const smoothed = smoothAndFill(new Map(trained.slice(0, 4).map((value, index) => [index + 1, value])), ratingCounts);
    return [...smoothed, ...trained.slice(4)];
}

/**
 * fsrs-rs `evaluate`'s log loss: every item recency-weighted, predicted by a scheduler built from
 * the parameters (`FSRS::new`, which clips with the scheduling bounds), `-Σ w·ll / Σ w` in f32.
 */
export function fsrsLogLoss(params: readonly number[], items: readonly FsrsTrainingItem[]): number {
    const w = Float64Array.from(clampFsrsParameters(normalizeFsrsParameters(params)), f32);
    const weights = recencyWeights(items.length);
    const tape = new Tape();
    const terms = new Float64Array(items.length);
    for (let index = 0; index < items.length; index++) {
        terms[index] = tape.value[recordItem(tape, w, items[index], weights[index])];
    }
    return -f32(unrolledSum(terms, f32) / unrolledSum(weights, f32));
}

/** A stored parameter list `FSRS::new` accepts: 0, 17, 19 or 21 finite values. */
function schedulerAccepts(params: readonly number[]): boolean {
    return [0, 17, 19, 21].includes(params.length) && params.every(Number.isFinite);
}

/**
 * Anki's `compute_params` around the training: nothing to train on keeps the current parameters,
 * and so does a result whose log loss is no better than theirs. With more than one relearning
 * step that same day, Anki keeps the current ones only when their short-term stability after a
 * lapse and those steps would fall below where it started.
 */
export async function optimizeFsrsParametersLikeAnki(
    items: readonly FsrsTrainingItem[],
    currentParams: readonly number[],
    numRelearningSteps: number,
    onProgress?: TrainingProgress,
): Promise<number[] | null> {
    if (items.length === 0) return [...currentParams];
    const optimized = await computeFsrsParameters(items, numRelearningSteps, onProgress);
    if (optimized === null) return null;
    if (!schedulerAccepts(currentParams)) return optimized;

    if (fsrsLogLoss(currentParams, items) <= fsrsLogLoss(optimized, items)) {
        if (numRelearningSteps <= 1) return [...currentParams];
        const start = { stability: 1, difficulty: 1 };
        let shortTerm = fsrsNextStates(currentParams, start, 0.9, 2).again.memory;
        for (let step = 0; step < numRelearningSteps; step++) {
            shortTerm = fsrsNextStates(currentParams, shortTerm, 0.9, 0).good.memory;
        }
        if (shortTerm.stability < start.stability) return [...currentParams];
    }
    return optimized;
}
