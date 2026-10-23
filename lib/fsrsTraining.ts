/** @license
 * BSD 3-Clause License
 *
 * Copyright (c) 2023, Open Spaced Repetition
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import { AnkiStdRng, ankiShuffledIndices } from './ankiRandom';
import { DEFAULT_FSRS_PARAMETERS, FSRS_PARAMETER_COUNT, clampFsrsParameters, fsrsNextStates, normalizeFsrsParameters } from './fsrs';
import type { FsrsTrainingItem } from './fsrsMemory';
import { averageRecall, initializeStability, prepareTrainingData, smoothAndFill } from './fsrsPretrain';
import { FsrsTrainingModel, type WeightedTrainingItem } from './fsrsTrainingModel';

/**
 * Anki 26.09.3's production FSRS optimizer: fsrs-rs 6.6.2 compute_parameters,
 * with card windows, eight epochs and the final epoch's parameters. Ported from
 * fsrs-rs (src/training.rs and src/analytic.rs), Copyright (c) 2023 Open Spaced
 * Repetition, under the BSD 3-Clause License. Source:
 * https://github.com/open-spaced-repetition/fsrs-rs/tree/v6.6.2/src
 * Anki's AGPL code is a behaviour reference only; fixtures record its own outputs.
 *
 * Pre-training and recency weights precede the 256-review filter. Whole cards
 * are grouped into at most 512 predictions, shuffled by rand 0.10's StdRng
 * (ChaCha12/PCG32 and IncreasingUniform, unchanged from the existing rand 0.9
 * implementation). The forward pass is f32, analytic derivatives and Adam f64;
 * each update is converted to f32 before subtracting it from the parameter.
 */
const f32 = Math.fround;
const BATCH_SIZE = 512;
const EPOCHS = 8;
const SEED = 2023n;
const LEARNING_RATE = 0.04;
const MAX_SEQUENCE_LENGTH = 256;
const PARAMS_STDDEV = [
    6.43, 9.66, 17.58, 27.85, 0.57, 0.28, 0.6, 0.12, 0.39, 0.18, 0.33, 0.3, 0.09, 0.16, 0.57, 0.25,
    1.03, 0.31, 0.32, 0.14, 0.27,
].map(f32);
const DEFAULT_PARAMETERS_F32 = DEFAULT_FSRS_PARAMETERS.map(f32);
export type FsrsOptimizerItem = FsrsTrainingItem & { cardId?: number };

export function recencyWeights(count: number): number[] {
    const length = Math.max(f32(f32(count) - 1), 1);
    return Array.from({ length: count }, (_, index) => {
        const t = f32(f32(index) / length);
        return f32(0.25 + f32(0.75 * f32(t * f32(t * t))));
    });
}

function powi(base: number, exponent: number): number {
    let result = 1;
    let factor = base;
    for (let remaining = exponent; ; remaining >>>= 1) {
        if (remaining & 1) result *= factor;
        if (remaining >>> 1 === 0) return result;
        factor *= factor;
    }
}

/** fsrs-rs HostAdam: double-precision moments, bias corrections and update. */
class Adam {
    private readonly m = new Float64Array(FSRS_PARAMETER_COUNT);
    private readonly v = new Float64Array(FSRS_PARAMETER_COUNT);
    private time = 0;
    step(w: Float64Array, gradients: Float64Array, rate: number) {
        this.time += 1;
        const bias1 = 1 - powi(0.9, this.time);
        const bias2 = 1 - powi(0.999, this.time);
        for (let index = 0; index < FSRS_PARAMETER_COUNT; index++) {
            const g = gradients[index];
            this.m[index] = 0.9 * this.m[index] + (1 - 0.9) * g;
            this.v[index] = 0.999 * this.v[index] + (1 - 0.999) * g * g;
            const m = this.m[index] / bias1;
            const v = this.v[index] / bias2;
            w[index] = f32(w[index] - f32(rate * m / (Math.sqrt(v) + 1e-8)));
        }
    }
}

function cosineAnnealing(maxSteps: number, initial: number): () => number {
    let stepCount = -1;
    let current = initial;
    return () => {
        stepCount += 1;
        if (stepCount === 0) current = initial;
        else if ((stepCount - 1 - maxSteps) % (2 * maxSteps) === 0) current = initial * (1 - Math.cos(Math.PI / maxSteps)) / 2;
        else current = ((1 + Math.cos(Math.PI * stepCount / maxSteps)) / (1 + Math.cos(Math.PI * (stepCount - 1) / maxSteps))) * current;
        return current;
    };
}

interface Batch { cards: WeightedTrainingItem[][]; predictions: number }
function batchesFor(items: readonly WeightedTrainingItem[]): Batch[] {
    const hasIds = items.some(({ item }) => item.cardId !== undefined);
    if (hasIds && items.some(({ item }) => !Number.isSafeInteger(item.cardId))) throw new Error('InvalidInput');
    let cards: WeightedTrainingItem[][];
    if (hasIds) {
        const groups = new Map<number, WeightedTrainingItem[]>();
        for (const entry of items) {
            const id = entry.item.cardId!;
            const group = groups.get(id) ?? [];
            group.push(entry);
            groups.set(id, group);
        }
        cards = [...groups.entries()].sort(([a], [b]) => a - b).map(([, card]) => card.sort((a, b) => a.item.length - b.item.length));
    } else {
        // fsrs-rs's optional card-id-free path: each prefix is one independent column.
        cards = items.map((entry) => [entry]);
    }
    cards.sort((a, b) => a[a.length - 1].item.length - b[b.length - 1].item.length);
    const batches: Batch[] = [];
    let current: Batch = { cards: [], predictions: 0 };
    for (const card of cards) {
        if (current.predictions && current.predictions + card.length > BATCH_SIZE) {
            batches.push(current);
            current = { cards: [], predictions: 0 };
        }
        current.cards.push(card);
        current.predictions += card.length;
    }
    if (current.predictions) batches.push(current);
    return batches;
}

function addPenalty(w: Float64Array, start: readonly number[], batchSize: number, totalSize: number, g: Float64Array) {
    const scale = batchSize / totalSize;
    for (let index = 0; index < FSRS_PARAMETER_COUNT; index++) {
        const delta = f32(w[index] - start[index]);
        const variance = f32(PARAMS_STDDEV[index] * PARAMS_STDDEV[index]);
        g[index] += 2 * delta / variance * scale;
    }
}

export interface TrainingProgress {
    /** Batches trained so far and in all, across all eight epochs. False cancels. */
    (done: number, total: number): boolean | void;
}
const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function train(items: readonly WeightedTrainingItem[], start: readonly number[], steps: number, onProgress?: TrainingProgress): Promise<number[] | null> {
    const batches = batchesFor(items);
    const learningRate = cosineAnnealing((Math.floor(items.length / BATCH_SIZE) + 1) * EPOCHS, LEARNING_RATE);
    const rng = new AnkiStdRng(SEED);
    const adam = new Adam();
    const w = Float64Array.from(start, f32);
    let done = 0;
    const total = batches.length * EPOCHS;
    for (let epoch = 0; epoch < EPOCHS; epoch++) {
        for (const index of ankiShuffledIndices(batches.length, rng)) {
            const batch = batches[index];
            const rate = learningRate();
            const g = new Float64Array(FSRS_PARAMETER_COUNT);
            const model = new FsrsTrainingModel(w);
            for (const card of batch.cards) model.cardGradient(card, g);
            addPenalty(w, start, batch.predictions, items.length, g);
            adam.step(w, g, rate);
            w.set(clampFsrsParameters([...w], { numRelearningSteps: steps, enableShortTerm: true }).map(f32));
            done += 1;
            if (onProgress?.(done, total) === false) return null;
            if (done % 4 === 0) await nextTick();
        }
        await nextTick();
    }
    return [...w];
}

export async function computeFsrsParameters(items: readonly FsrsOptimizerItem[], numRelearningSteps: number, onProgress?: TrainingProgress): Promise<number[] | null> {
    if (items.some((item) => !Number.isInteger(item.length) || item.length < 2 || item.length > item.reviews.length
        || item.reviews.slice(0, item.length).some((review) => ![1, 2, 3, 4].includes(review.rating)
            || !Number.isInteger(review.deltaDays) || review.deltaDays < 0))) throw new Error('InvalidInput');
    const { initialization, training } = prepareTrainingData(items);
    const recall = averageRecall(training);
    if (training.length < 8) return [...DEFAULT_PARAMETERS_F32];
    const { stability, ratingCounts } = initializeStability(initialization, recall);
    const initialized = [...stability, ...DEFAULT_PARAMETERS_F32.slice(4)];
    if (training.length === initialization.length || training.length < 64) return initialized;
    const weights = recencyWeights(training.length);
    const weighted = training.map((item, index) => ({ item, weight: weights[index] }))
        .filter(({ item }) => item.length <= MAX_SEQUENCE_LENGTH);
    const trained = await train(weighted, initialized, numRelearningSteps, onProgress);
    if (trained === null) return null;
    if (trained.some((value) => !Number.isFinite(value))) throw new Error('InvalidInput');
    const smoothed = smoothAndFill(new Map(trained.slice(0, 4).map((value, index) => [index + 1, value])), ratingCounts);
    return [...smoothed, ...trained.slice(4)];
}

/** FSRS 6.6.2 evaluate: sequential f32 BCE/weight sums, without the trainer's probability clamp. */
export function fsrsLogLoss(params: readonly number[], items: readonly FsrsTrainingItem[]): number {
    if (!items.length) throw new Error('NotEnoughData');
    const model = new FsrsTrainingModel(clampFsrsParameters(normalizeFsrsParameters(params)).map(f32));
    const weights = recencyWeights(items.length);
    let loss = 0;
    let weightSum = 0;
    for (let index = 0; index < items.length; index++) {
        const r = model.predict(items[index]);
        const label = items[index].reviews[items[index].length - 1].rating > 1 ? 1 : 0;
        const term = f32(f32(f32(label * f32(Math.log(r))) + f32((1 - label) * f32(Math.log(f32(1 - r))))) * weights[index]);
        loss = f32(loss + term);
        weightSum = f32(weightSum + weights[index]);
    }
    const result = f32(-loss / weightSum);
    if (!Number.isFinite(result)) throw new Error('InvalidInput');
    return result;
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
    items: readonly FsrsOptimizerItem[],
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
