import { describe, expect, it } from 'vitest';
import {
    DEFAULT_FSRS_PARAMETERS,
    clampFsrsParameters,
    decayFromParameters,
    fsrsRetrievability,
    fsrsStep,
    type FsrsRating,
    type FsrsReview,
} from './fsrs';
import {
    buildFsrsTrainingItems,
    evaluateFsrsParameters,
    optimizeFsrsParameters,
    type FsrsTrainingItem,
} from './fsrsOptimizer';

/**
 * Synthesize a learner whose memory really does follow FSRS with `truth`, so the optimizer can be
 * checked against a known answer rather than against itself.
 */
function simulateHistories(truth: readonly number[], cardCount: number, seed = 12345) {
    let state = seed >>> 0;
    const random = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 0x1_0000_0000;
    };
    const decay = decayFromParameters(truth);

    const histories: Array<{ reviews: FsrsReview[]; complete: boolean }> = [];
    for (let card = 0; card < cardCount; card++) {
        const reviews: FsrsReview[] = [];
        let memory = { stability: 0, difficulty: 0 };
        let first = true;

        for (let index = 0; index < 10; index++) {
            const deltaDays = first ? 0 : Math.max(1, Math.round(memory.stability * (0.5 + random())));
            const recalled = first
                ? random() > 0.15
                : random() < fsrsRetrievability(memory.stability, deltaDays, decay);
            const rating: FsrsRating = recalled ? (random() < 0.2 ? 4 : 3) : 1;

            reviews.push({ deltaDays, rating });
            memory = fsrsStep(truth, memory, deltaDays, rating, first);
            first = false;
        }
        histories.push({ reviews, complete: true });
    }
    return histories;
}

const TRUTH = clampFsrsParameters([
    0.5, 1.8, 4.0, 12.0, 5.5, 1.1, 1.4, 0.05, 1.6, 0.2, 1.1, 2.0, 0.1, 0.3,
    1.2, 0.4, 2.2, 0.4, 0.2, 0.1, 0.3,
]);

describe('training items', () => {
    it('turns each spaced review into a prediction target with its history as context', () => {
        const items = buildFsrsTrainingItems([{
            complete: true,
            reviews: [
                { rating: 3, deltaDays: 0 },
                { rating: 3, deltaDays: 0 },
                { rating: 3, deltaDays: 2 },
                { rating: 1, deltaDays: 9 },
            ],
        }]);

        // Same-day repeats carry no forgetting signal, so only the two spaced reviews are targets.
        expect(items).toHaveLength(2);
        expect(items[0].reviews).toHaveLength(3);
        expect(items[1].reviews).toHaveLength(4);
    });

    it('skips histories that do not reach back to a learning step', () => {
        expect(buildFsrsTrainingItems([{
            complete: false,
            reviews: [{ rating: 3, deltaDays: 0 }, { rating: 3, deltaDays: 5 }],
        }])).toEqual([]);
    });

    it('respects the item cap', () => {
        const histories = simulateHistories(TRUTH, 50);
        expect(buildFsrsTrainingItems(histories, 25)).toHaveLength(25);
    });
});

describe('evaluation', () => {
    it('scores a perfect predictor better than a hopeless one', () => {
        const items = buildFsrsTrainingItems(simulateHistories(TRUTH, 60));
        const truthMetrics = evaluateFsrsParameters(TRUTH, items);
        // A parameter set that forgets almost immediately mispredicts nearly every recall.
        const hopeless = clampFsrsParameters(DEFAULT_FSRS_PARAMETERS.map((value, index) => (
            index <= 3 ? 0.001 : value
        )));
        const hopelessMetrics = evaluateFsrsParameters(hopeless, items);

        expect(truthMetrics.reviewCount).toBeGreaterThan(100);
        expect(truthMetrics.logLoss).toBeLessThan(hopelessMetrics.logLoss);
        expect(truthMetrics.rmse).toBeLessThan(hopelessMetrics.rmse);
    });

    it('reports nothing measurable for an empty dataset', () => {
        expect(evaluateFsrsParameters(DEFAULT_FSRS_PARAMETERS, [])).toEqual({
            logLoss: 0,
            rmse: 0,
            reviewCount: 0,
        });
    });
});

describe('optimization', () => {
    it('improves on the starting parameters for a collection with history', () => {
        const items = buildFsrsTrainingItems(simulateHistories(TRUTH, 120));
        const result = optimizeFsrsParameters(items, {
            initialParameters: DEFAULT_FSRS_PARAMETERS,
            iterations: 12,
            randomSeed: 7,
        });

        expect(result.improved).toBe(true);
        expect(result.after.logLoss).toBeLessThan(result.before.logLoss);
        // The fitted parameters should land close to the loss the true parameters achieve.
        const truthLoss = evaluateFsrsParameters(TRUTH, items).logLoss;
        expect(result.after.logLoss).toBeLessThan(truthLoss + 0.01);
        expect(result.parameters).toHaveLength(21);
        // Every parameter must stay inside the range the model is defined on.
        expect(result.parameters).toEqual(clampFsrsParameters(result.parameters));
    });

    it('keeps the current parameters when there is too little history', () => {
        const items: FsrsTrainingItem[] = buildFsrsTrainingItems(simulateHistories(TRUTH, 1)).slice(0, 3);
        const result = optimizeFsrsParameters(items, { initialParameters: DEFAULT_FSRS_PARAMETERS });

        expect(result.improved).toBe(false);
        expect(result.iterationsRun).toBe(0);
        expect(result.parameters).toEqual(clampFsrsParameters(DEFAULT_FSRS_PARAMETERS));
    });

    it('can be stopped from the progress callback', () => {
        const items = buildFsrsTrainingItems(simulateHistories(TRUTH, 40));
        const seen: number[] = [];
        const result = optimizeFsrsParameters(items, {
            iterations: 50,
            randomSeed: 3,
            onProgress: (progress) => {
                seen.push(progress);
                return seen.length < 2;
            },
        });

        expect(seen).toHaveLength(2);
        expect(result.iterationsRun).toBeGreaterThan(0);
    });

    it('never returns parameters worse than the ones it started from', () => {
        const items = buildFsrsTrainingItems(simulateHistories(TRUTH, 40));
        // A learning rate this large makes the search diverge; the caller must still be safe.
        const result = optimizeFsrsParameters(items, {
            initialParameters: DEFAULT_FSRS_PARAMETERS,
            iterations: 5,
            learningRate: 5,
            randomSeed: 11,
        });

        expect(result.after.logLoss).toBeLessThanOrEqual(result.before.logLoss);
        if (!result.improved) {
            expect(result.parameters).toEqual(clampFsrsParameters(DEFAULT_FSRS_PARAMETERS));
        }
    });

    it('is deterministic for a given seed', () => {
        const items = buildFsrsTrainingItems(simulateHistories(TRUTH, 30));
        const first = optimizeFsrsParameters(items, { iterations: 4, randomSeed: 42 });
        const second = optimizeFsrsParameters(items, { iterations: 4, randomSeed: 42 });
        expect(first.parameters).toEqual(second.parameters);
    });
});
