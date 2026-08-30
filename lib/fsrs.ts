/**
 * FSRS-6 (Free Spaced Repetition Scheduler), implemented from the published algorithm.
 *
 * Behaviour derived from open-spaced-repetition/fsrs-rs (`src/model.rs`, `src/inference.rs`,
 * `src/parameter_clipper.rs`) and Anki's use of it in `rslib/src/scheduler/fsrs/`. Those projects
 * are GPL-family; nothing is copied here — the formulas are the published FSRS-6 equations and the
 * observable contract is pinned by lib/fsrs.test.ts against upstream's own documented values.
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

/** Anki's allowed desired-retention range; outside it the scheduler misbehaves badly. */
export const FSRS_DESIRED_RETENTION_MIN = 0.7;
export const FSRS_DESIRED_RETENTION_MAX = 0.99;
export const FSRS_DEFAULT_DESIRED_RETENTION = 0.9;
export const FSRS_DEFAULT_HISTORICAL_RETENTION = 0.9;

/** Per-parameter bounds; training and hand-editing both clamp through this table. */
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

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Accept a stored parameter list of any FSRS generation and return 21 FSRS-6 parameters.
 * An FSRS-4.5/5 list is converted the way upstream converts it, so a preset imported from an
 * older Anki keeps scheduling the same way instead of being silently reset to the defaults.
 */
export function normalizeFsrsParameters(params: readonly number[] | undefined | null): number[] {
    const values = Array.isArray(params) ? params.map(Number) : [];
    if (values.some((value) => !Number.isFinite(value))) return [...DEFAULT_FSRS_PARAMETERS];

    if (values.length === FSRS_PARAMETER_COUNT) return values;
    if (values.length === 0) return [...DEFAULT_FSRS_PARAMETERS];

    if (values.length === 17) {
        const converted = [...values];
        converted[4] = converted[5] * 2 + converted[4];
        converted[5] = Math.log(converted[5] * 3 + 1) / 3;
        converted[6] = converted[6] + 0.5;
        return [...converted, 0, 0, 0, FSRS5_DEFAULT_DECAY];
    }
    if (values.length === 19) return [...values, 0, FSRS5_DEFAULT_DECAY];

    return [...DEFAULT_FSRS_PARAMETERS];
}

/** Clamp every parameter into the range training is allowed to explore. */
export function clampFsrsParameters(params: readonly number[]): number[] {
    const normalized = normalizeFsrsParameters(params);
    return normalized.map((value, index) => {
        const [min, max] = PARAMETER_BOUNDS[index];
        return clamp(value, min, max);
    });
}

/** True when the list can be used as-is: 21 finite values inside their bounds. */
export function areFsrsParametersValid(params: readonly number[] | undefined | null): boolean {
    if (!Array.isArray(params) || params.length !== FSRS_PARAMETER_COUNT) return false;
    return params.every((value, index) => Number.isFinite(value)
        && value >= PARAMETER_BOUNDS[index][0] - 1e-6
        && value <= PARAMETER_BOUNDS[index][1] + 1e-6);
}

/**
 * The forgetting curve's exponent. FSRS-6 stores it as the last parameter; older parameter sets
 * have no such entry and use the fixed FSRS-5 value.
 */
export function decayFromParameters(params: readonly number[] | undefined | null): number {
    if (!params || params.length === 0) return FSRS6_DEFAULT_DECAY;
    if (params.length < FSRS_PARAMETER_COUNT) return FSRS5_DEFAULT_DECAY;
    const decay = Number(params[20]);
    return Number.isFinite(decay) && decay > 0 ? decay : FSRS6_DEFAULT_DECAY;
}

/** `factor` normalizes the curve so that retrievability is exactly 0.9 after `stability` days. */
function curveFactor(decay: number): number {
    return Math.pow(0.9, 1 / -decay) - 1;
}

/**
 * Probability of recalling a card `daysElapsed` days after its last review.
 * `decay` is the stored positive value, not the negated exponent.
 */
export function fsrsRetrievability(stability: number, daysElapsed: number, decay: number): number {
    const safeStability = Math.max(FSRS_STABILITY_MIN, stability);
    const elapsed = Math.max(0, daysElapsed);
    return Math.pow((elapsed / safeStability) * curveFactor(decay) + 1, -decay);
}

/** Days to wait so that recall probability lands on `desiredRetention`. */
export function fsrsNextInterval(stability: number, desiredRetention: number, decay: number): number {
    const retention = clamp(desiredRetention, FSRS_DESIRED_RETENTION_MIN, FSRS_DESIRED_RETENTION_MAX);
    const safeStability = Math.max(FSRS_STABILITY_MIN, stability);
    const exponent = -decay;
    return (safeStability / curveFactor(decay)) * (Math.pow(retention, 1 / exponent) - 1);
}

function initialStability(w: readonly number[], rating: FsrsRating): number {
    return w[Math.min(3, Math.max(0, rating - 1))];
}

function initialDifficulty(w: readonly number[], rating: number): number {
    return w[4] - Math.exp(w[5] * (rating - 1)) + 1;
}

/** Difficulty moves less near the edges of its range, so it cannot be pinned at 1 or 10. */
function linearDamping(deltaDifficulty: number, oldDifficulty: number): number {
    return ((10 - oldDifficulty) * deltaDifficulty) / 9;
}

function nextDifficulty(w: readonly number[], difficulty: number, rating: FsrsRating): number {
    const delta = -w[6] * (rating - 3);
    return difficulty + linearDamping(delta, difficulty);
}

/** Every review pulls difficulty back toward the value an "Easy" first answer would have set. */
function meanReversion(w: readonly number[], newDifficulty: number): number {
    return w[7] * (initialDifficulty(w, 4) - newDifficulty) + newDifficulty;
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
    return stability * (
        Math.exp(w[8])
        * (11 - difficulty)
        * Math.pow(stability, -w[9])
        * (Math.exp((1 - retrievability) * w[10]) - 1)
        * hardPenalty
        * easyBonus
        + 1
    );
}

function stabilityAfterFailure(
    w: readonly number[],
    stability: number,
    difficulty: number,
    retrievability: number,
): number {
    const postLapse = w[11]
        * Math.pow(difficulty, -w[12])
        * (Math.pow(stability + 1, w[13]) - 1)
        * Math.exp((1 - retrievability) * w[14]);
    // A lapse may never leave the card more stable than one short-term repeat would.
    return Math.min(postLapse, stability / Math.exp(w[17] * w[18]));
}

/** Same-day repeats move stability by a much smaller factor than a spaced review. */
function stabilityShortTerm(w: readonly number[], stability: number, rating: FsrsRating): number {
    const increase = Math.exp(w[17] * (rating - 3 + w[18])) * Math.pow(stability, -w[19]);
    return stability * (rating >= 2 ? Math.max(increase, 1) : increase);
}

/**
 * Advance one memory state by a single review.
 *
 * `isFirstReview` marks a card that has never been answered: its state comes from the initial
 * stability/difficulty parameters rather than from an update.
 */
export function fsrsStep(
    params: readonly number[],
    state: FsrsMemoryState,
    deltaDays: number,
    rating: FsrsRating,
    isFirstReview: boolean,
): FsrsMemoryState {
    const w = clampFsrsParameters(params);
    const lastStability = clamp(state.stability, FSRS_STABILITY_MIN, FSRS_STABILITY_MAX);
    const lastDifficulty = clamp(state.difficulty, FSRS_DIFFICULTY_MIN, FSRS_DIFFICULTY_MAX);
    const elapsed = Math.max(0, deltaDays);

    if (isFirstReview) {
        return {
            stability: clamp(initialStability(w, rating), FSRS_STABILITY_MIN, FSRS_STABILITY_MAX),
            difficulty: clamp(initialDifficulty(w, rating), FSRS_DIFFICULTY_MIN, FSRS_DIFFICULTY_MAX),
        };
    }

    const retrievability = fsrsRetrievability(lastStability, elapsed, decayFromParameters(w));
    let stability = rating === 1
        ? stabilityAfterFailure(w, lastStability, lastDifficulty, retrievability)
        : stabilityAfterSuccess(w, lastStability, lastDifficulty, retrievability, rating);
    if (elapsed === 0) stability = stabilityShortTerm(w, lastStability, rating);

    const difficulty = clamp(
        meanReversion(w, nextDifficulty(w, lastDifficulty, rating)),
        FSRS_DIFFICULTY_MIN,
        FSRS_DIFFICULTY_MAX,
    );

    return {
        stability: clamp(stability, FSRS_STABILITY_MIN, FSRS_STABILITY_MAX),
        difficulty,
    };
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
    const w = clampFsrsParameters(params);
    const decay = decayFromParameters(w);
    const isFirstReview = memory === null;
    const current = memory ?? { stability: 0, difficulty: 0 };

    const stateFor = (rating: FsrsRating): FsrsItemState => {
        const next = fsrsStep(w, current, daysElapsed, rating, isFirstReview);
        return { memory: next, interval: fsrsNextInterval(next.stability, desiredRetention, decay) };
    };

    return { again: stateFor(1), hard: stateFor(2), good: stateFor(3), easy: stateFor(4) };
}

/**
 * Approximate a memory state from SM-2 values, for a card whose review history is missing or was
 * truncated. `historicalRetention` is the retention the learner is assumed to have had.
 */
export function fsrsMemoryStateFromSm2(
    params: readonly number[],
    easeFactor: number,
    intervalDays: number,
    historicalRetention: number = FSRS_DEFAULT_HISTORICAL_RETENTION,
): FsrsMemoryState {
    const w = clampFsrsParameters(params);
    const decay = decayFromParameters(w);
    const exponent = -decay;
    const factor = Math.pow(0.9, 1 / exponent) - 1;
    const retention = clamp(historicalRetention, 0.5, 0.99);
    const interval = Math.max(FSRS_STABILITY_MIN, intervalDays);

    const stability = (interval * factor) / (Math.pow(retention, 1 / exponent) - 1);
    const difficulty = 11 - (easeFactor - 1)
        / (Math.exp(w[8]) * Math.pow(stability, -w[9]) * (Math.exp((1 - retention) * w[10]) - 1));

    return {
        stability: clamp(
            Number.isFinite(stability) ? stability : FSRS_STABILITY_MIN,
            FSRS_STABILITY_MIN,
            FSRS_STABILITY_MAX,
        ),
        difficulty: clamp(
            Number.isFinite(difficulty) ? difficulty : FSRS_DIFFICULTY_MAX,
            FSRS_DIFFICULTY_MIN,
            FSRS_DIFFICULTY_MAX,
        ),
    };
}

/**
 * Replay a review history into a memory state. Returns null for an empty history, so the caller
 * can fall back to the SM-2 approximation the way Anki does.
 */
export function fsrsMemoryStateFromReviews(
    params: readonly number[],
    reviews: readonly FsrsReview[],
    startingState: FsrsMemoryState | null = null,
): FsrsMemoryState | null {
    if (reviews.length === 0) return startingState;
    const w = clampFsrsParameters(params);

    let state: FsrsMemoryState = startingState ?? { stability: 0, difficulty: 0 };
    reviews.forEach((review, index) => {
        const isFirstReview = startingState === null && index === 0;
        state = fsrsStep(w, state, review.deltaDays, review.rating, isFirstReview);
    });
    return state;
}

/** Retrievability of a stored state today, or null when the card has no FSRS state yet. */
export function fsrsCurrentRetrievability(
    memory: FsrsMemoryState | null | undefined,
    daysElapsed: number,
    params: readonly number[],
): number | null {
    if (!memory || !Number.isFinite(memory.stability) || memory.stability <= 0) return null;
    return fsrsRetrievability(memory.stability, daysElapsed, decayFromParameters(params));
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
 * Anki's "ignore reviews before" cutoff is a plain calendar date in the learner's own timezone.
 * Formatting it through UTC would shift it by a day for anyone east or west of Greenwich, so both
 * directions work in local time.
 */
export function formatFsrsCutoffDate(timestampMs: number | undefined | null): string {
    if (!timestampMs || !Number.isFinite(timestampMs)) return '';
    const date = new Date(timestampMs);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

export function parseFsrsCutoffDate(text: string | undefined | null): number | undefined {
    if (typeof text !== 'string') return undefined;
    const trimmed = text.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
    const parsed = Date.parse(`${trimmed}T00:00:00`);
    return Number.isFinite(parsed) ? parsed : undefined;
}
