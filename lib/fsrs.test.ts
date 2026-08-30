import { describe, expect, it } from 'vitest';
import {
    DEFAULT_FSRS_PARAMETERS,
    FSRS5_DEFAULT_DECAY,
    FSRS_DIFFICULTY_MAX,
    FSRS_DIFFICULTY_MIN,
    areFsrsParametersValid,
    clampFsrsParameters,
    decayFromParameters,
    fsrsCurrentRetrievability,
    fsrsMemoryStateFromReviews,
    fsrsMemoryStateFromSm2,
    fsrsNextInterval,
    fsrsNextStates,
    formatFsrsCutoffDate,
    formatFsrsParameterText,
    fsrsRetrievability,
    normalizeFsrsParameters,
    parseFsrsCutoffDate,
    parseFsrsParameterText,
    type FsrsReview,
} from './fsrs';

// Reference values come from upstream's own tests and documentation:
// https://github.com/open-spaced-repetition/fsrs-rs/blob/main/src/inference.rs
// Upstream computes in f32 and we compute in f64, so vectors are compared with a tolerance.
const UPSTREAM_TEST_PARAMETERS = [
    0.6845422, 1.6790825, 4.7349424, 10.042885, 7.4410233, 0.64219797, 1.071918,
    0.0025195254, 1.432437, 0.1544, 0.8692766, 2.0696752, 0.0953, 0.2975,
    2.4691248, 0.19542035, 3.201072, 0.18046261, 0.121442534,
];

describe('FSRS parameters', () => {
    it('ships upstream’s 21 FSRS-6 defaults', () => {
        expect(DEFAULT_FSRS_PARAMETERS).toHaveLength(21);
        expect(DEFAULT_FSRS_PARAMETERS[0]).toBeCloseTo(0.212, 6);
        expect(DEFAULT_FSRS_PARAMETERS[20]).toBeCloseTo(0.1542, 6);
        expect(areFsrsParametersValid([...DEFAULT_FSRS_PARAMETERS])).toBe(true);
    });

    it('converts an FSRS-4.5 parameter set the way upstream converts it', () => {
        const legacy = Array.from({ length: 17 }, (_, index) => index === 5 ? 0.5 : index / 10 + 0.1);
        const converted = normalizeFsrsParameters(legacy);

        expect(converted).toHaveLength(21);
        expect(converted[4]).toBeCloseTo(legacy[4] + 0.5 * 2, 6);
        expect(converted[5]).toBeCloseTo(Math.log(0.5 * 3 + 1) / 3, 6);
        expect(converted[6]).toBeCloseTo(legacy[6] + 0.5, 6);
        expect(converted.slice(17)).toEqual([0, 0, 0, FSRS5_DEFAULT_DECAY]);
    });

    it('pads an FSRS-5 set and keeps its fixed decay', () => {
        const converted = normalizeFsrsParameters(UPSTREAM_TEST_PARAMETERS);
        expect(converted).toHaveLength(21);
        expect(converted[19]).toBe(0);
        expect(decayFromParameters(converted)).toBe(FSRS5_DEFAULT_DECAY);
    });

    it('falls back to the defaults for an unusable list and clamps out-of-range values', () => {
        expect(normalizeFsrsParameters([1, 2, 3])).toEqual([...DEFAULT_FSRS_PARAMETERS]);
        expect(normalizeFsrsParameters([Number.NaN, ...DEFAULT_FSRS_PARAMETERS.slice(1)]))
            .toEqual([...DEFAULT_FSRS_PARAMETERS]);

        const clamped = clampFsrsParameters(new Array(21).fill(-5));
        expect(clamped[0]).toBe(0.001);
        expect(clamped[4]).toBe(FSRS_DIFFICULTY_MIN);
        expect(clamped[20]).toBe(0.1);
        expect(areFsrsParametersValid(new Array(21).fill(-5))).toBe(false);
    });
});

describe('FSRS forgetting curve', () => {
    it('is exactly 90% one stability-worth of days after a review', () => {
        const decay = decayFromParameters(DEFAULT_FSRS_PARAMETERS);
        expect(fsrsRetrievability(10, 10, decay)).toBeCloseTo(0.9, 6);
        expect(fsrsRetrievability(10, 0, decay)).toBeCloseTo(1, 6);
        expect(fsrsRetrievability(10, 100, decay)).toBeLessThan(0.9);
    });

    it('turns a stability into the interval that lands on the desired retention', () => {
        const decay = decayFromParameters(DEFAULT_FSRS_PARAMETERS);
        // The curve is normalized on 0.9, so at 90% retention the interval is the stability.
        expect(fsrsNextInterval(37, 0.9, decay)).toBeCloseTo(37, 4);
        // Wanting to remember more means reviewing sooner.
        expect(fsrsNextInterval(37, 0.97, decay)).toBeLessThan(fsrsNextInterval(37, 0.9, decay));
        expect(fsrsNextInterval(37, 0.8, decay)).toBeGreaterThan(fsrsNextInterval(37, 0.9, decay));
    });

    it('reports the retrievability of a stored state, or nothing for a card without one', () => {
        expect(fsrsCurrentRetrievability({ stability: 10, difficulty: 5 }, 10, DEFAULT_FSRS_PARAMETERS))
            .toBeCloseTo(0.9, 6);
        expect(fsrsCurrentRetrievability(null, 3, DEFAULT_FSRS_PARAMETERS)).toBeNull();
        expect(fsrsCurrentRetrievability({ stability: 0, difficulty: 5 }, 3, DEFAULT_FSRS_PARAMETERS)).toBeNull();
    });
});

describe('FSRS memory states', () => {
    it('matches upstream’s first-review states for a brand new card', () => {
        const states = fsrsNextStates(DEFAULT_FSRS_PARAMETERS, null, 0.9, 0);

        expect(states.again.memory.stability).toBeCloseTo(0.212, 5);
        expect(states.again.memory.difficulty).toBeCloseTo(6.4133, 4);
        expect(states.hard.memory.stability).toBeCloseTo(1.2931, 5);
        expect(states.hard.memory.difficulty).toBeCloseTo(5.1121707, 4);
        expect(states.good.memory.stability).toBeCloseTo(2.3065, 5);
        expect(states.good.memory.difficulty).toBeCloseTo(2.118104, 4);
        expect(states.easy.memory.stability).toBeCloseTo(8.2956, 5);
        // An easy first answer would drive difficulty below the floor, so it clamps.
        expect(states.easy.memory.difficulty).toBe(FSRS_DIFFICULTY_MIN);

        // At 90% desired retention the first interval equals the initial stability.
        expect(states.good.interval).toBeCloseTo(2.3065, 4);
    });

    it('replays a review history into upstream’s expected state', () => {
        const reviews: FsrsReview[] = [
            { rating: 1, deltaDays: 0 },
            { rating: 3, deltaDays: 1 },
            { rating: 3, deltaDays: 3 },
            { rating: 3, deltaDays: 8 },
            { rating: 3, deltaDays: 21 },
        ];

        const state = fsrsMemoryStateFromReviews(UPSTREAM_TEST_PARAMETERS, reviews);

        expect(state!.stability).toBeCloseTo(31.722992, 2);
        expect(state!.difficulty).toBeCloseTo(7.382128, 3);
    });

    it('matches upstream’s next state for an existing memory', () => {
        const states = fsrsNextStates(
            UPSTREAM_TEST_PARAMETERS,
            { stability: 20.925528, difficulty: 7.005062 },
            0.9,
            21,
        );

        expect(states.good.memory.stability).toBeCloseTo(40.87456, 2);
        expect(states.good.memory.difficulty).toBeCloseTo(6.9913807, 3);
    });

    it('orders the four buttons and keeps difficulty inside its range', () => {
        const states = fsrsNextStates(
            DEFAULT_FSRS_PARAMETERS,
            { stability: 15, difficulty: 5 },
            0.9,
            15,
        );

        expect(states.again.memory.stability).toBeLessThan(states.hard.memory.stability);
        expect(states.hard.memory.stability).toBeLessThan(states.good.memory.stability);
        expect(states.good.memory.stability).toBeLessThan(states.easy.memory.stability);
        // Failing makes a card harder; an easy answer makes it easier.
        expect(states.again.memory.difficulty).toBeGreaterThan(5);
        expect(states.easy.memory.difficulty).toBeLessThan(5);
        for (const state of [states.again, states.hard, states.good, states.easy]) {
            expect(state.memory.difficulty).toBeGreaterThanOrEqual(FSRS_DIFFICULTY_MIN);
            expect(state.memory.difficulty).toBeLessThanOrEqual(FSRS_DIFFICULTY_MAX);
        }
    });

    it('treats a same-day repeat with the short-term formula', () => {
        const memory = { stability: 10, difficulty: 5 };
        const sameDay = fsrsNextStates(DEFAULT_FSRS_PARAMETERS, memory, 0.9, 0);
        const spaced = fsrsNextStates(DEFAULT_FSRS_PARAMETERS, memory, 0.9, 10);

        // A same-day "Good" barely moves stability; a review at the due date moves it a lot.
        expect(sameDay.good.memory.stability).toBeLessThan(spaced.good.memory.stability);
        expect(sameDay.good.memory.stability).toBeGreaterThanOrEqual(memory.stability);
    });

    it('starts from a supplied state when the history was truncated', () => {
        const starting = { stability: 12, difficulty: 6 };
        const state = fsrsMemoryStateFromReviews(
            DEFAULT_FSRS_PARAMETERS,
            [{ rating: 3, deltaDays: 12 }],
            starting,
        );

        expect(state!.stability).toBeGreaterThan(starting.stability);
        expect(fsrsMemoryStateFromReviews(DEFAULT_FSRS_PARAMETERS, [], starting)).toEqual(starting);
        expect(fsrsMemoryStateFromReviews(DEFAULT_FSRS_PARAMETERS, [])).toBeNull();
    });
});

describe('SM-2 conversion', () => {
    it('keeps the old interval as the stability at the default historical retention', () => {
        const state = fsrsMemoryStateFromSm2(DEFAULT_FSRS_PARAMETERS, 2.5, 30, 0.9);
        expect(state.stability).toBeCloseTo(30, 4);
        expect(state.difficulty).toBeGreaterThanOrEqual(FSRS_DIFFICULTY_MIN);
        expect(state.difficulty).toBeLessThanOrEqual(FSRS_DIFFICULTY_MAX);
    });

    it('reads a lower ease factor as a harder card', () => {
        const easy = fsrsMemoryStateFromSm2(DEFAULT_FSRS_PARAMETERS, 2.8, 30, 0.9);
        const hard = fsrsMemoryStateFromSm2(DEFAULT_FSRS_PARAMETERS, 1.4, 30, 0.9);
        expect(hard.difficulty).toBeGreaterThan(easy.difficulty);
    });

    it('reads a lower historical retention as weaker memories behind the same interval', () => {
        // Remembering only 80% at a 30-day interval means the card was scheduled beyond its
        // strength, so the implied stability is below the interval — and above it when the
        // learner was recalling more than 90%.
        expect(fsrsMemoryStateFromSm2(DEFAULT_FSRS_PARAMETERS, 2.5, 30, 0.8).stability).toBeLessThan(30);
        expect(fsrsMemoryStateFromSm2(DEFAULT_FSRS_PARAMETERS, 2.5, 30, 0.95).stability).toBeGreaterThan(30);
    });
});

describe('parameter text field', () => {
    it('round-trips the default parameters', () => {
        const text = formatFsrsParameterText(DEFAULT_FSRS_PARAMETERS);
        expect(text.split(',')).toHaveLength(21);
        expect(parseFsrsParameterText(text)).toEqual(clampFsrsParameters(DEFAULT_FSRS_PARAMETERS));
    });

    it('accepts a pasted list in any of Anki’s shapes', () => {
        const seventeen = new Array(17).fill(0.5);
        expect(parseFsrsParameterText(seventeen.join(', '))).toHaveLength(21);
        expect(parseFsrsParameterText(`[${seventeen.join(' ')}]`)).toHaveLength(21);
        expect(parseFsrsParameterText('')).toEqual([...DEFAULT_FSRS_PARAMETERS]);
    });

    it('refuses a list that is not a parameter set', () => {
        expect(parseFsrsParameterText('1, 2, 3')).toBeNull();
        expect(parseFsrsParameterText('a, b')).toBeNull();
        expect(parseFsrsParameterText(new Array(21).fill('x').join(','))).toBeNull();
    });
});

describe('ignore-before cutoff date', () => {
    it('round-trips a calendar date in the learner’s own timezone', () => {
        const ms = parseFsrsCutoffDate('2025-06-01');
        expect(ms).toBe(Date.parse('2025-06-01T00:00:00'));
        expect(formatFsrsCutoffDate(ms)).toBe('2025-06-01');
        // A UTC-based formatter would report the previous day east of Greenwich.
        expect(formatFsrsCutoffDate(Date.parse('2025-01-01T00:30:00'))).toBe('2025-01-01');
    });

    it('treats anything that is not a date as no cutoff', () => {
        expect(parseFsrsCutoffDate('')).toBeUndefined();
        expect(parseFsrsCutoffDate('01/06/2025')).toBeUndefined();
        expect(parseFsrsCutoffDate(undefined)).toBeUndefined();
        expect(formatFsrsCutoffDate(undefined)).toBe('');
        expect(formatFsrsCutoffDate(0)).toBe('');
    });
});
