/**
 * The simulated learner behind the FSRS simulator: which button a learner presses on a new card,
 * on a review they remember, and on each same-day learning or relearning step, and how many
 * seconds each kind of answer takes. Anki's simulator measures these from the preset's own review
 * log and leans on population defaults while that log is thin (Anki 26.09.3
 * `get_optimal_retention_parameters`, fsrs-rs 6.6.2 `extract_simulator_config` with smoothing,
 * src/simulation.rs, BSD-3-Clause:
 * https://github.com/open-spaced-repetition/fsrs-rs/blob/v6.6.2/src/simulation.rs). This is an
 * independent implementation of that description; the defaults are fsrs-rs's published ones.
 *
 *  - Answer times: the mean time of each (learning/review/relearning, button) pair, over answers
 *    that took between 0 and 20 minutes, blended with the default by `n / (n + 50)`.
 *  - Each card's answers on one study day form a group. A group that starts in learning gives the
 *    first-answer distribution and a learning-step sequence; one that starts with a review gives
 *    the review-button distribution, and when that review was Again, a relearning sequence.
 *  - Step transitions count which button follows which within a group (plus one of each, so no
 *    move is impossible), blended with the defaults the same way.
 */

/** Ratings 1–4 for a first answer, Hard/Good/Easy for a remembered review, seconds per answer. */
export interface SimulatorLearner {
    firstRatingProb: readonly number[];
    reviewRatingProb: readonly number[];
    /** Rows: the button pressed before (Again, Hard, Good); columns: the next button, 1–4. */
    learningTransitions: readonly (readonly number[])[];
    relearningTransitions: readonly (readonly number[])[];
    /** Rows: learning, review, relearning; columns: buttons 1–4; seconds. */
    costs: readonly (readonly number[])[];
}

export const DEFAULT_SIMULATOR_LEARNER: SimulatorLearner = {
    firstRatingProb: [0.24, 0.094, 0.495, 0.171],
    reviewRatingProb: [0.224, 0.631, 0.145],
    learningTransitions: [
        [0.3686, 0.0628, 0.5108, 0.0577],
        [0.0442, 0.4553, 0.4457, 0.0549],
        [0.0519, 0.047, 0.8462, 0.055],
    ],
    relearningTransitions: [
        [0.2157, 0.0643, 0.6595, 0.0604],
        [0.05, 0.4638, 0.4475, 0.0387],
        [0.1057, 0.1434, 0.7266, 0.0244],
    ],
    costs: [
        [19.58, 18.79, 13.78, 10.71],
        [19.38, 17.59, 12.38, 8.94],
        [16.44, 15.25, 12.32, 8.03],
    ],
};

/** The review-log columns the learner is measured from. */
export interface SimulatorRevlogRow {
    id: number;
    cardId: number;
    ease: number;
    type: number;
    /** Milliseconds the answer took. */
    time: number;
}

const MAX_ANSWER_MS = 1_200_000;
const PRIOR_WEIGHT = 50;
const LEARNING = 0;
const REVIEW = 1;
const RELEARNING = 2;

/** Lean on `fallback` until `count` observations outweigh the prior. */
function blend(measured: number, fallback: number, count: number): number {
    const weight = count / (PRIOR_WEIGHT + count);
    return weight * measured + (1 - weight) * fallback;
}

function transitions(sequences: readonly number[][], fallback: readonly (readonly number[])[]): number[][] {
    const counts = Array.from({ length: 4 }, () => [1, 1, 1, 1]);
    for (const sequence of sequences) {
        for (let index = 0; index + 1 < sequence.length; index++) counts[sequence[index] - 1][sequence[index + 1] - 1] += 1;
    }
    return fallback.map((defaults, row) => {
        const total = counts[row].reduce((sum, count) => sum + count, 0);
        return defaults.map((value, column) => blend(counts[row][column] / total, value, total));
    });
}

export interface MeasuredLearner {
    learner: SimulatorLearner;
    /** Answers with a usable time; with none, every cost is the default and time is a guess. */
    timedAnswers: number;
}

/**
 * Measure the learner from review-log rows ordered by card, then by time. `nextDayAtMs` is the
 * next day rollover; the study day of an answer counts back from it.
 */
export function measureSimulatorLearner(rows: readonly SimulatorRevlogRow[], nextDayAtMs: number): MeasuredLearner {
    const defaults = DEFAULT_SIMULATOR_LEARNER;
    const timed = rows.filter((row) => row.time > 0 && row.time < MAX_ANSWER_MS && row.ease >= 1 && row.ease <= 4);

    const durationSums = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
    const durationCounts = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
    let timedAnswers = 0;
    for (const row of timed) {
        if (row.type < LEARNING || row.type > RELEARNING) continue;
        durationSums[row.type][row.ease - 1] += row.time;
        durationCounts[row.type][row.ease - 1] += 1;
        timedAnswers += 1;
    }
    const costs = defaults.costs.map((row, state) => row.map((fallback, button) => {
        const count = durationCounts[state][button];
        // Whole milliseconds, as Anki averages them, then seconds rounded to hundredths.
        const mean = count ? Math.floor(durationSums[state][button] / count) / 1000 : 0;
        return Math.round(blend(mean, fallback, count) * 100) / 100;
    }));

    // One group per card and study day, in answer order.
    const nextDaySecs = Math.floor(nextDayAtMs / 1000);
    const groups: Array<{ kind: number; ratings: number[] }> = [];
    let key = '';
    for (const row of timed) {
        const day = Math.trunc((Math.floor(row.id / 1000) - nextDaySecs) / 86_400);
        const rowKey = `${row.cardId}:${day}`;
        if (rowKey !== key) {
            groups.push({ kind: row.type, ratings: [] });
            key = rowKey;
        }
        groups[groups.length - 1].ratings.push(row.ease);
    }

    let learnButtons = [0, 0, 0, 0];
    let reviewButtons = [0, 0, 0, 0];
    const learningSequences: number[][] = [];
    const relearningSequences: number[][] = [];
    for (const group of groups) {
        const first = group.ratings[0];
        if (group.kind === LEARNING) {
            learnButtons[first - 1] += 1;
            learningSequences.push(group.ratings);
        } else if (group.kind === REVIEW) {
            reviewButtons[first - 1] += 1;
            if (first === 1) relearningSequences.push(group.ratings);
        }
    }
    if (learnButtons.every((count) => count === 0)) learnButtons = [1, 1, 1, 1];
    if (reviewButtons.slice(1).every((count) => count === 0)) reviewButtons = [reviewButtons[0], 1, 1, 1];
    const learnTotal = learnButtons.reduce((sum, count) => sum + count, 0);
    const passTotal = reviewButtons[1] + reviewButtons[2] + reviewButtons[3];

    return {
        learner: {
            firstRatingProb: defaults.firstRatingProb.map((fallback, index) => blend(learnButtons[index] / learnTotal, fallback, learnTotal)),
            reviewRatingProb: defaults.reviewRatingProb.map((fallback, index) => blend(reviewButtons[index + 1] / passTotal, fallback, passTotal)),
            learningTransitions: transitions(learningSequences, defaults.learningTransitions),
            relearningTransitions: transitions(relearningSequences, defaults.relearningTransitions),
            costs,
        },
        timedAnswers,
    };
}
