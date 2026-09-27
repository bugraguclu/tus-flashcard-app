/**
 * FSRS-6 (Free Spaced Repetition Scheduler), implemented from the published algorithm.
 *
 * Behaviour follows open-spaced-repetition/fsrs-rs 5.2.0 (`src/model.rs`, `src/inference.rs`,
 * `src/parameter_clipper.rs`, BSD-3-Clause), the version Anki 26.05 schedules with, and Anki's use
 * of it in `rslib/src/scheduler/`. Nothing is copied; the equations are the published FSRS-6 ones.
 *
 * fsrs-rs computes in 32-bit floats, so every step here does too (`Math.fround` after each
 * operation, in upstream's order). Rounding each step to f32 is exact for +, -, * and /, and for
 * exp, pow and ln it agrees with a correctly rounded f32 result, so memory states match Anki's to
 * the last bit in practice and whole-day intervals round the same way. lib/fsrsAnkiParity.test.ts
 * pins this against output recorded from Anki itself.
 *
 * The model keeps two numbers per card:
 *   stability  (S) — days until recall probability falls to 90%
 *   difficulty (D) — 1..10, how hard the card is for this learner
 * and one collection-level shape parameter, decay, which controls the forgetting curve.
 */

/** Anki grades map to FSRS ratings one to one: 1=Again, 2=Hard, 3=Good, 4=Easy. */
export type FsrsRating = 1 | 2 | 3 | 4;

export interface FsrsMemoryState {
    stability: number;
    difficulty: number;
}

export interface FsrsItemState {
    memory: FsrsMemoryState;
    /** Days until the card should next be shown, before fuzz and clamping. */
    interval: number;
}

export interface FsrsNextStates {
    again: FsrsItemState;
    hard: FsrsItemState;
    good: FsrsItemState;
    easy: FsrsItemState;
}

/** One answered review, as FSRS consumes it. */
export interface FsrsReview {
    /** Study days between the previous review and this one; 0 for a same-day repeat. */
    deltaDays: number;
    rating: FsrsRating;
}

export const FSRS_PARAMETER_COUNT = 21;

/** Forgetting-curve shape used by FSRS-4.5 and FSRS-5, kept for parameters imported from them. */
export const FSRS5_DEFAULT_DECAY = 0.5;
export const FSRS6_DEFAULT_DECAY = 0.1542;

/** Upstream's default parameters, fitted to the average learner. */
export const DEFAULT_FSRS_PARAMETERS: readonly number[] = [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
    1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
    1.8729, 0.5425, 0.0912, 0.0658, FSRS6_DEFAULT_DECAY,
];

export const FSRS_STABILITY_MIN = 0.001;
export const FSRS_STABILITY_MAX = 36_500;
export const FSRS_DIFFICULTY_MIN = 1;
export const FSRS_DIFFICULTY_MAX = 10;
const FSRS_INITIAL_STABILITY_MAX = 100;

/** The desired-retention range the deck options accept. The equations themselves take any value. */
export const FSRS_DESIRED_RETENTION_MIN = 0.7;
export const FSRS_DESIRED_RETENTION_MAX = 0.99;
export const FSRS_DEFAULT_DESIRED_RETENTION = 0.9;
export const FSRS_DEFAULT_HISTORICAL_RETENTION = 0.9;

const f32 = Math.fround;
const add = (a: number, b: number) => f32(a + b);
const sub = (a: number, b: number) => f32(a - b);
const mul = (a: number, b: number) => f32(a * b);
const div = (a: number, b: number) => f32(a / b);
const exp = (x: number) => f32(Math.exp(x));
const pow = (base: number, exponent: number) => f32(Math.pow(base, exponent));
const clamp32 = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const S_MIN = f32(FSRS_STABILITY_MIN);
const S_MAX = FSRS_STABILITY_MAX;
/** `0.9f32.ln()`, the constant upstream folds into the forgetting curve. */
const LN_0_9 = f32(Math.log(f32(0.9)));

/**
 * The shortest decimal that reads back as the same 32-bit float, so a value stored for Anki
 * prints as `0.212` rather than `0.21199999749660492` while still meaning exactly the same f32.
 */
export function toF32Decimal(value: number): number {
    const single = f32(value);
    if (!Number.isFinite(single) || single === 0) return single;
    for (let digits = 1; digits <= 9; digits++) {
        const candidate = Number(single.toPrecision(digits));
        if (f32(candidate) === single) return candidate;
    }
    return single;
}

/**
 * Anki's `round_to_places` for a value it writes into the card data column: scale, round half away
 * from zero and scale back, all in f32. Stability keeps 4 places, difficulty 3, desired retention
 * 2 and decay 3, and the next review starts from these rounded numbers, not the unrounded ones.
 */
export function roundFsrsValueForStorage(value: number, decimalPlaces: number): number {
    const factor = 10 ** decimalPlaces;
    const scaled = mul(value, factor);
    return toF32Decimal(div(Math.sign(scaled) * Math.round(Math.abs(scaled)), factor));
}

/**
 * Per-parameter bounds. Two of the entries are not constants upstream:
 *
 *  - w17 and w18 share a ceiling that shrinks as the preset gains relearning steps, because
 *    `postLapseStability * e^(steps * w17 * w18)` must stay at or below the pre-lapse stability;
 *  - w19 has a floor of 0.01 while short-term scheduling is on, so a same-day repeat cannot be
 *    trained into a no-op.
 *
 * Both only bind while training. Scheduling clamps with the defaults below, which is exactly the
 * table upstream applies when it builds a scheduler from stored parameters
 * (`fsrs-rs/src/parameter_clipper.rs`, `FSRS::new`).
 */
const PARAMETER_BOUNDS: ReadonlyArray<readonly [number, number]> = [
    [FSRS_STABILITY_MIN, FSRS_INITIAL_STABILITY_MAX],
    [FSRS_STABILITY_MIN, FSRS_INITIAL_STABILITY_MAX],
    [FSRS_STABILITY_MIN, FSRS_INITIAL_STABILITY_MAX],
    [FSRS_STABILITY_MIN, FSRS_INITIAL_STABILITY_MAX],
    [FSRS_DIFFICULTY_MIN, FSRS_DIFFICULTY_MAX],
    [0.001, 4.0],
    [0.001, 4.0],
    [0.001, 0.75],
    [0.0, 4.5],
    [0.0, 0.8],
    [0.001, 3.5],
    [0.001, 5.0],
    [0.001, 0.25],
    [0.001, 0.9],
    [0.0, 4.0],
    [0.0, 1.0],
    [1.0, 6.0],
    [0.0, 2.0],
    [0.0, 2.0],
    [0.0, 0.8],
    [0.1, 0.8],
];

/**
 * Accept a stored parameter list of any FSRS generation and return 21 FSRS-6 parameters.
 * An FSRS-4.5/5 list is converted the way upstream converts it (`check_and_fill_parameters`, in
 * f32), so a preset imported from an older Anki keeps scheduling the same way instead of being
 * silently reset to the defaults.
 */
export function normalizeFsrsParameters(params: readonly number[] | undefined | null): number[] {
    const values = Array.isArray(params) ? params.map(Number) : [];
    if (values.some((value) => !Number.isFinite(value))) return [...DEFAULT_FSRS_PARAMETERS];

    if (values.length === FSRS_PARAMETER_COUNT) return values;
    if (values.length === 0) return [...DEFAULT_FSRS_PARAMETERS];

    if (values.length === 17) {
        const converted = values.map(f32);
        // `w5.mul_add(2, w4)` and `w5.mul_add(3, 1)` are fused, so each is rounded once.
        converted[4] = f32(converted[5] * 2 + converted[4]);
        converted[5] = div(f32(Math.log(f32(converted[5] * 3 + 1))), 3);
        converted[6] = add(converted[6], 0.5);
        return [...converted.map(toF32Decimal), 0, 0, 0, FSRS5_DEFAULT_DECAY];
    }
    if (values.length === 19) return [...values, 0, FSRS5_DEFAULT_DECAY];

    return [...DEFAULT_FSRS_PARAMETERS];
}

export interface FsrsClampOptions {
    /** How many relearning steps the preset has. Only >1 tightens the w17/w18 ceiling. */
    numRelearningSteps?: number;
    /** True while the preset schedules same-day repeats, which puts a floor under w19. */
    enableShortTerm?: boolean;
}

const W17_W18_MAX = 2.0;

/**
 * The shared ceiling for w17/w18. Derived from upstream's own inequality: with the worst case
 * D = 1, R = 0.7, S = 1, a lapse followed by `steps` relearning repeats must not end up more
 * stable than the card was before the lapse, i.e.
 *   steps * w17 * w18 <= -[ln(w11) + ln(2^w13 - 1) + 0.3 * w14]
 * and since w17 and w18 share one bound, the bound is the square root of that budget.
 */
function w17w18Ceiling(params: readonly number[], numRelearningSteps: number): number {
    if (numRelearningSteps <= 1) return W17_W18_MAX;
    const lnW11 = f32(Math.log(params[11]));
    const lnPow = f32(Math.log(sub(pow(2, params[13]), 1)));
    const budget = div(-add(add(lnW11, lnPow), mul(params[14], f32(0.3))), numRelearningSteps);
    return Math.min(W17_W18_MAX, f32(Math.sqrt(Math.max(f32(0.01), budget))));
}

/** The 21 f32 weights the model runs on: normalized, then clipped like `FSRS::new` clips them. */
function modelWeights(params: readonly number[], options: FsrsClampOptions = {}): number[] {
    const normalized = normalizeFsrsParameters(params).map(f32);
    const ceiling = w17w18Ceiling(normalized, options.numRelearningSteps ?? 1);
    const w19Floor = options.enableShortTerm ? f32(0.01) : 0;

    return normalized.map((value, index) => {
        const [min, max] = PARAMETER_BOUNDS[index];
        if (index === 17 || index === 18) return clamp32(value, f32(min), ceiling);
        if (index === 19) return clamp32(value, w19Floor, f32(max));
        return clamp32(value, f32(min), f32(max));
    });
}

/**
 * Clamp every parameter into its legal range.
 *
 * With no options this is the clamp upstream applies when it builds a scheduler, which is what
 * every scheduling path here wants. The optimizer passes the preset's relearning-step count and
 * short-term flag so training explores the same box Anki's trainer explores. Values come back as
 * their shortest f32 decimals, so they print cleanly and still mean exactly what the model uses.
 */
export function clampFsrsParameters(
    params: readonly number[],
    options: FsrsClampOptions = {},
): number[] {
    return modelWeights(params, options).map(toF32Decimal);
}

/** True when the list can be used as-is: 21 finite values inside their bounds. */
export function areFsrsParametersValid(params: readonly number[] | undefined | null): boolean {
    if (!Array.isArray(params) || params.length !== FSRS_PARAMETER_COUNT) return false;
    return params.every((value, index) => Number.isFinite(value)
        && value >= PARAMETER_BOUNDS[index][0] - 1e-6
        && value <= PARAMETER_BOUNDS[index][1] + 1e-6);
}

/**
 * The forgetting curve's exponent as Anki records it on a card (`get_decay_from_params`): the
 * last FSRS-6 parameter as stored, the fixed FSRS-5 value for an older list, and the FSRS-6
 * default for a preset that was never optimized.
 */
export function decayFromParameters(params: readonly number[] | undefined | null): number {
    if (!params || params.length === 0) return FSRS6_DEFAULT_DECAY;
    if (params.length < FSRS_PARAMETER_COUNT) return FSRS5_DEFAULT_DECAY;
    const decay = Number(params[20]);
    return Number.isFinite(decay) ? decay : FSRS6_DEFAULT_DECAY;
}

/** The model's curve factor (`power_forgetting_curve`): e^(ln 0.9 / -w20) - 1, in f32. */
function modelCurveFactor(w20: number): number {
    return sub(exp(mul(div(1, -w20), LN_0_9)), 1);
}

/** Retrievability after `elapsed` days as the model sees it during a review. */
function modelRetrievability(w: readonly number[], elapsed: number, stability: number): number {
    return pow(add(mul(div(elapsed, stability), modelCurveFactor(w[20])), 1), -w[20]);
}

/** `Model::next_interval`: days until retrievability falls to the desired retention. */
function modelNextInterval(w: readonly number[], stability: number, desiredRetention: number): number {
    const inverseDecay = div(1, -w[20]);
    return mul(div(stability, modelCurveFactor(w[20])), sub(pow(f32(desiredRetention), inverseDecay), 1));
}

/**
 * Probability of recalling a card `daysElapsed` days after its last review, as Anki reports it in
 * card info, sorting and search (`current_retrievability`). `decay` is the stored positive value.
 */
export function fsrsRetrievability(stability: number, daysElapsed: number, decay: number): number {
    const positiveDecay = f32(decay);
    const factor = sub(pow(f32(0.9), div(1, -positiveDecay)), 1);
    return pow(add(mul(div(f32(Math.max(0, daysElapsed)), f32(stability)), factor), 1), -positiveDecay);
}

/**
 * Retrievability for display, sorting and search, exactly as Anki derives it: seconds since the
 * last review, and the decay stored on the card — falling back to the FSRS-5 value when the card
 * has none, as Anki does (`current_retrievability_seconds`).
 */
export function fsrsRetrievabilityAfterSeconds(
    memory: FsrsMemoryState,
    secondsElapsed: number,
    cardDecay: number | undefined | null,
): number {
    const seconds = Math.max(0, Math.min(0xffff_ffff, Math.trunc(secondsElapsed)));
    const decay = Number.isFinite(cardDecay) ? Number(cardDecay) : FSRS5_DEFAULT_DECAY;
    return fsrsRetrievability(memory.stability, div(f32(seconds), 86_400), decay);
}

/**
 * Seconds since a card's last review, measured the way Anki's retrievability search, sort and
 * card info measure it (`extract_fsrs_retrievability`): from the review time recorded on the card
 * (`lrt`) when there is one, otherwise back from its due day by its interval. An intraday learning
 * card has no due day; its due time is used instead.
 */
export function fsrsSecondsSinceLastReview(card: {
    lastReviewTimeSecs?: number;
    /** Due day number, or null while the card is due at an intraday time. */
    dueDay: number | null;
    dueTimeMs?: number;
    ivl: number;
}, nowMs: number, today: number): number {
    const nowSecs = Math.floor(nowMs / 1000);
    if (card.lastReviewTimeSecs !== undefined && card.lastReviewTimeSecs > 0) {
        return Math.max(0, nowSecs - Math.floor(card.lastReviewTimeSecs));
    }
    if (card.dueDay === null) {
        return Math.max(0, nowSecs - (Math.floor((card.dueTimeMs ?? nowMs) / 1000) - card.ivl));
    }
    return Math.max(0, today - (card.dueDay - card.ivl)) * 86_400;
}

/**
 * Anki's relative overdueness under FSRS (`extract_fsrs_relative_retrievability`): how far past
 * its own target a card has fallen, `-(R^(-1/decay) - 1) / (DR^(-1/decay) - 1)`, ascending. A card
 * with no memory state or no recorded target uses the SM-2 measure, the elapsed days over the
 * interval, as Anki does.
 */
export function fsrsRelativeRetrievability(
    memory: FsrsMemoryState | null | undefined,
    desiredRetention: number | undefined | null,
    cardDecay: number | undefined | null,
    secondsElapsed: number,
    interval: number,
): number {
    if (memory && desiredRetention !== undefined && desiredRetention !== null && Number.isFinite(desiredRetention)) {
        const decay = f32(Number.isFinite(cardDecay) ? Number(cardDecay) : FSRS5_DEFAULT_DECAY);
        const target = Math.max(f32(0.0001), f32(desiredRetention));
        const current = Math.max(f32(0.0001), fsrsRetrievabilityAfterSeconds(memory, secondsElapsed, decay));
        const inverse = div(-1, decay);
        return div(-sub(pow(current, inverse), 1), sub(pow(target, inverse), 1));
    }
    const days = Math.floor(Math.max(0, secondsElapsed) / 86_400);
    return div(-add(f32(days), f32(0.001)), Math.max(1, f32(interval)));
}

/** Days to wait so that recall probability lands on `desiredRetention`, from a stored decay. */
export function fsrsNextInterval(stability: number, desiredRetention: number, decay: number): number {
    const w20 = clamp32(f32(decay), f32(0.1), f32(0.8));
    const inverseDecay = div(1, -w20);
    return mul(div(f32(stability), modelCurveFactor(w20)), sub(pow(f32(desiredRetention), inverseDecay), 1));
}

function initialDifficulty(w: readonly number[], rating: number): number {
    return add(sub(w[4], exp(mul(w[5], sub(rating, 1)))), 1);
}

function stabilityAfterSuccess(
    w: readonly number[],
    stability: number,
    difficulty: number,
    retrievability: number,
    rating: FsrsRating,
): number {
    const hardPenalty = rating === 2 ? w[15] : 1;
    const easyBonus = rating === 4 ? w[16] : 1;
    let increase = exp(w[8]);
    increase = mul(increase, add(-difficulty, 11));
    increase = mul(increase, pow(stability, -w[9]));
    increase = mul(increase, sub(exp(mul(add(-retrievability, 1), w[10])), 1));
    increase = mul(increase, hardPenalty);
    increase = mul(increase, easyBonus);
    return mul(stability, add(increase, 1));
}

function stabilityAfterFailure(
    w: readonly number[],
    stability: number,
    difficulty: number,
    retrievability: number,
): number {
    let postLapse = mul(w[11], pow(difficulty, -w[12]));
    postLapse = mul(postLapse, sub(pow(add(stability, 1), w[13]), 1));
    postLapse = mul(postLapse, exp(mul(add(-retrievability, 1), w[14])));
    // A lapse may never leave the card more stable than one short-term repeat would.
    const ceiling = div(stability, exp(mul(w[17], w[18])));
    return ceiling < postLapse ? ceiling : postLapse;
}

/**
 * Same-day repeats move stability by a much smaller factor than a spaced review. Only Good and
 * Easy are held at or above the current stability; Again and Hard may lower it
 * (`stability_short_term`, `rating >= 3`).
 */
function stabilityShortTerm(w: readonly number[], stability: number, rating: FsrsRating): number {
    let increase = mul(exp(mul(w[17], add(sub(rating, 3), w[18]))), pow(stability, -w[19]));
    if (rating >= 3) increase = Math.max(increase, 1);
    return mul(stability, increase);
}

/** Difficulty moves less near the edges of its range, so it cannot be pinned at 1 or 10. */
function nextDifficulty(w: readonly number[], difficulty: number, rating: FsrsRating): number {
    const delta = mul(-w[6], sub(rating, 3));
    return add(difficulty, mul(add(-difficulty, 10), div(delta, 9)));
}

/** Every review pulls difficulty back toward the value an "Easy" first answer would have set. */
function meanReversion(w: readonly number[], newDifficulty: number): number {
    return add(mul(w[7], sub(initialDifficulty(w, 4), newDifficulty)), newDifficulty);
}

/** `Model::step` for one card, on weights that are already f32 and clipped. */
function modelStep(
    w: readonly number[],
    state: FsrsMemoryState,
    deltaDays: number,
    rating: FsrsRating,
    isFirstReview: boolean,
): FsrsMemoryState {
    const rawStability = f32(state.stability);
    if (isFirstReview && rawStability === 0) {
        const initialRating = Math.min(4, Math.max(1, rating));
        return {
            stability: clamp32(w[initialRating - 1], S_MIN, S_MAX),
            difficulty: clamp32(initialDifficulty(w, initialRating), FSRS_DIFFICULTY_MIN, FSRS_DIFFICULTY_MAX),
        };
    }

    const lastStability = clamp32(rawStability, S_MIN, S_MAX);
    const lastDifficulty = clamp32(f32(state.difficulty), FSRS_DIFFICULTY_MIN, FSRS_DIFFICULTY_MAX);
    const elapsed = f32(Math.max(0, deltaDays));

    let stability: number;
    if (elapsed === 0) {
        stability = stabilityShortTerm(w, lastStability, rating);
    } else {
        const retrievability = modelRetrievability(w, elapsed, lastStability);
        stability = rating === 1
            ? stabilityAfterFailure(w, lastStability, lastDifficulty, retrievability)
            : stabilityAfterSuccess(w, lastStability, lastDifficulty, retrievability, rating);
    }

    const difficulty = clamp32(
        meanReversion(w, nextDifficulty(w, lastDifficulty, rating)),
        FSRS_DIFFICULTY_MIN,
        FSRS_DIFFICULTY_MAX,
    );
    return { stability: clamp32(stability, S_MIN, S_MAX), difficulty };
}

/**
 * Advance one memory state by a single review.
 *
 * `isFirstReview` marks the first review of a card that has no state yet: its state then comes
 * from the initial stability/difficulty parameters rather than from an update.
 */
export function fsrsStep(
    params: readonly number[],
    state: FsrsMemoryState,
    deltaDays: number,
    rating: FsrsRating,
    isFirstReview: boolean,
): FsrsMemoryState {
    return modelStep(modelWeights(params), state, deltaDays, rating, isFirstReview);
}

/**
 * The memory state and interval each answer button would produce.
 * Pass `null` for a card that has never been answered.
 */
export function fsrsNextStates(
    params: readonly number[],
    memory: FsrsMemoryState | null,
    desiredRetention: number,
    daysElapsed: number,
): FsrsNextStates {
    const w = modelWeights(params);
    const isFirstReview = memory === null;
    const current = memory ?? { stability: 0, difficulty: 0 };
    const elapsed = Math.max(0, Math.trunc(daysElapsed));

    const stateFor = (rating: FsrsRating): FsrsItemState => {
        const next = modelStep(w, current, elapsed, rating, isFirstReview);
        return { memory: next, interval: modelNextInterval(w, next.stability, desiredRetention) };
    };

    return { again: stateFor(1), hard: stateFor(2), good: stateFor(3), easy: stateFor(4) };
}

/**
 * Approximate a memory state from SM-2 values, for a card whose review history is missing or was
 * truncated (`memory_state_from_sm2`). `historicalRetention` is the retention the learner is
 * assumed to have had. Returns null where upstream reports invalid input.
 */
export function fsrsMemoryStateFromSm2(
    params: readonly number[],
    easeFactor: number,
    intervalDays: number,
    historicalRetention: number = FSRS_DEFAULT_HISTORICAL_RETENTION,
): FsrsMemoryState | null {
    const w = modelWeights(params);
    const decay = -w[20];
    const retention = f32(historicalRetention);
    const inverseDecay = div(1, decay);
    const factor = sub(pow(f32(0.9), inverseDecay), 1);
    const stability = div(mul(Math.max(f32(intervalDays), S_MIN), factor), sub(pow(retention, inverseDecay), 1));
    const denominator = mul(
        mul(exp(w[8]), pow(stability, -w[9])),
        f32(Math.expm1(mul(sub(1, retention), w[10]))),
    );
    const difficulty = sub(11, div(sub(f32(easeFactor), 1), denominator));
    if (!Number.isFinite(stability) || !Number.isFinite(difficulty)) return null;
    return {
        stability,
        difficulty: clamp32(difficulty, FSRS_DIFFICULTY_MIN, FSRS_DIFFICULTY_MAX),
    };
}

/**
 * Replay a review history into a memory state (`FSRS::memory_state`). Returns the starting state
 * for an empty history — or null when there is none, so the caller can fall back to the SM-2
 * approximation the way Anki does.
 */
export function fsrsMemoryStateFromReviews(
    params: readonly number[],
    reviews: readonly FsrsReview[],
    startingState: FsrsMemoryState | null = null,
): FsrsMemoryState | null {
    if (reviews.length === 0) return startingState;
    const w = modelWeights(params);

    let state: FsrsMemoryState = startingState ?? { stability: 0, difficulty: 0 };
    reviews.forEach((review, index) => {
        state = modelStep(w, state, review.deltaDays, review.rating, index === 0);
    });
    if (!Number.isFinite(state.stability) || !Number.isFinite(state.difficulty)) return null;
    return state;
}

/** Render parameters for the deck-options text field, the way Anki shows them. */
export function formatFsrsParameterText(params: readonly number[] | undefined | null): string {
    const values = normalizeFsrsParameters(params);
    return values.map((value) => Number(value.toFixed(6)).toString()).join(', ');
}

/**
 * Parse a pasted parameter list. Returns null when the text is not a usable parameter set, so the
 * form can refuse to save rather than silently falling back to the defaults.
 */
export function parseFsrsParameterText(text: string): number[] | null {
    const trimmed = text.trim();
    if (trimmed === '') return [...DEFAULT_FSRS_PARAMETERS];

    const values = trimmed
        .replace(/^\[|\]$/g, '')
        .split(/[\s,]+/)
        .filter((part) => part !== '')
        .map(Number);

    if (values.some((value) => !Number.isFinite(value))) return null;
    if (![17, 19, 21].includes(values.length)) return null;
    return clampFsrsParameters(normalizeFsrsParameters(values));
}

/**
 * Anki's "ignore reviews before" cutoff is a plain calendar date, which Anki turns into midnight
 * UTC of that date (`ignore_revlogs_before_date_to_ms`), not midnight in the learner's timezone.
 * Formatting rounds to the nearest UTC midnight, so a cutoff an earlier version stored as local
 * midnight still reads back as the date the learner typed.
 */
export function formatFsrsCutoffDate(timestampMs: number | undefined | null): string {
    if (!timestampMs || !Number.isFinite(timestampMs)) return '';
    const date = new Date(Math.round(timestampMs / 86_400_000) * 86_400_000);
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${date.getUTCFullYear()}-${month}-${day}`;
}

export function parseFsrsCutoffDate(text: string | undefined | null): number | undefined {
    if (typeof text !== 'string') return undefined;
    const match = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return undefined;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const parsed = Date.UTC(year, month - 1, day);
    const check = new Date(parsed);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
        return undefined;
    }
    return parsed;
}
