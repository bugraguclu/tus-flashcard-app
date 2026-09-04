import { describe, expect, it } from 'vitest';
import {
    DEFAULT_FSRS_PARAMETERS,
    decayFromParameters,
    fsrsNextInterval,
    fsrsNextStates,
} from './fsrs';
import { FsrsEngine, fsrsAllowsShortTerm } from './fsrsScheduler';
import { formatDays, schedulerForSettings } from './scheduler';
import {
    constrainInterval,
    constrainedFuzzBounds,
    minimumReviewFuzzInterval,
} from './schedulingIntervals';
import type { AppSettings, CardState, Grade } from './types';

const NOW = Date.UTC(2026, 2, 11, 12, 0, 0);
const DAY_MS = 86_400_000;

const fsrsSettings: AppSettings = {
    language: 'system',
    themeMode: 'system',
    keyBindings: { showAnswer: ' ', again: '1', hard: '2', good: '3', easy: '4', replayAudio: 'r', buryCard: '-', suspendCard: '@', markNote: '*' },
    autoAdvance: false,
    interruptAudioOnAnswer: true,
    showRemainingCount: true,
    showNextReviewTimes: true,
    dailyNewLimit: 20,
    dailyReviewLimit: 200,
    learningSteps: [1, 10],
    lapseSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseIntervalMultiplier: 0,
    minLapseInterval: 1,
    queueOrder: 'after',
    newCardOrder: 'sequential',
    newCardGatherOrder: 'deck',
    reviewSortOrder: 'dueRandom',
    autoPlayAudio: true,
    easyDays: [1, 1, 1, 1, 1, 1, 1],
    hardIntervalMultiplier: 1.2,
    easyBonus: 1.3,
    intervalModifier: 1.0,
    maxInterval: 36500,
    dayRolloverHour: 4,
    learnAheadMinutes: 0,
    algorithm: 'ANKI_V3',
    fsrsEnabled: true,
    fsrsParameters: [...DEFAULT_FSRS_PARAMETERS],
    desiredRetention: 0.9,
    historicalRetention: 0.9,
};

function newCard(overrides: Partial<CardState> = {}): CardState {
    return {
        cardId: 101,
        interval: 0,
        repetition: 0,
        dueDate: '2026-03-11',
        dueTime: 0,
        status: 'new',
        suspended: false,
        buried: false,
        easeFactor: 2.5,
        learningStep: 0,
        relearningStep: -1,
        lastReviewedAtMs: 0,
        elapsedDays: 0,
        lapses: 0,
        ...overrides,
    };
}

function reviewCard(overrides: Partial<CardState> = {}): CardState {
    return {
        ...newCard(),
        cardId: 202,
        interval: 10,
        repetition: 4,
        status: 'review',
        learningStep: -1,
        relearningStep: -1,
        lastReviewedAtMs: NOW - 10 * DAY_MS,
        memoryState: { stability: 10, difficulty: 5 },
        ...overrides,
    };
}

const schedule = (card: CardState, grade: Grade, settings: AppSettings = fsrsSettings) =>
    FsrsEngine.schedule(card, grade, settings, NOW);

describe('FSRS engine selection', () => {
    it('follows the collection switch rather than the stored algorithm name', () => {
        expect(schedulerForSettings(fsrsSettings).name).toBe('FSRS');
        expect(schedulerForSettings({ ...fsrsSettings, fsrsEnabled: false }).name).toBe('ANKI_V3');
    });
});

describe('FSRS learning cards', () => {
    it('keeps Anki’s learning steps and records the memory state each answer produces', () => {
        const again = schedule(newCard(), 1);
        expect(again.isLearning).toBe(true);
        expect(again.minutesUntilDue).toBe(1);
        expect(again.stateUpdates.memoryState?.stability).toBeCloseTo(DEFAULT_FSRS_PARAMETERS[0], 5);
        expect(again.stateUpdates.learningStep).toBe(0);

        const good = schedule(newCard(), 3);
        expect(good.isLearning).toBe(true);
        expect(good.minutesUntilDue).toBe(10);
        expect(good.stateUpdates.learningStep).toBe(1);
        expect(good.stateUpdates.memoryState?.stability).toBeCloseTo(DEFAULT_FSRS_PARAMETERS[2], 5);
    });

    it('graduates Easy on the FSRS interval instead of the fixed easy interval', () => {
        const easy = schedule(newCard(), 4);
        const states = fsrsNextStates(DEFAULT_FSRS_PARAMETERS, null, 0.9, 0);

        expect(easy.isLearning).toBe(false);
        expect(easy.stateUpdates.status).toBe('review');
        // 8.3 days for the default parameters, well beyond the 4-day SM-2 easy interval, and
        // fuzz may only move it by a day or so.
        expect(easy.interval).toBeGreaterThan(6);
        expect(Math.abs(easy.interval - states.easy.interval)).toBeLessThan(2);
        expect(easy.stateUpdates.memoryState?.difficulty).toBe(1);
    });

    it('graduates on the last step and stores the desired retention and decay it used', () => {
        const good = schedule(newCard({ learningStep: 1 }), 3);
        expect(good.isLearning).toBe(false);
        expect(good.stateUpdates.status).toBe('review');
        expect(good.stateUpdates.desiredRetention).toBe(0.9);
        expect(good.stateUpdates.decay).toBeCloseTo(decayFromParameters(DEFAULT_FSRS_PARAMETERS), 6);
    });
});

describe('FSRS review cards', () => {
    it('schedules hard < good < easy from the memory state', () => {
        const hard = schedule(reviewCard(), 2);
        const good = schedule(reviewCard(), 3);
        const easy = schedule(reviewCard(), 4);

        expect(hard.interval).toBeLessThan(good.interval);
        expect(good.interval).toBeLessThan(easy.interval);
        expect(good.stateUpdates.status).toBe('review');
        expect(good.stateUpdates.repetition).toBe(5);
    });

    it('lands within a fuzz window of the raw FSRS interval', () => {
        const states = fsrsNextStates(DEFAULT_FSRS_PARAMETERS, { stability: 10, difficulty: 5 }, 0.9, 10);
        const good = schedule(reviewCard(), 3);

        // Fuzz is at most ~15% plus a day in this range.
        const raw = states.good.interval;
        expect(good.interval).toBeGreaterThan(raw * 0.8 - 1);
        expect(good.interval).toBeLessThan(raw * 1.2 + 2);
    });

    it('sends a lapse through the relearning steps and counts it', () => {
        const again = schedule(reviewCard(), 1);

        expect(again.isLearning).toBe(true);
        expect(again.minutesUntilDue).toBe(10);
        expect(again.stateUpdates.relearningStep).toBe(0);
        expect(again.stateUpdates.lapses).toBe(1);
        // The interval the card returns to comes from FSRS, not from the lapse multiplier.
        expect(again.stateUpdates.interval).toBeGreaterThanOrEqual(1);
        expect(again.stateUpdates.memoryState!.stability).toBeLessThan(10);
        expect(again.stateUpdates.memoryState!.difficulty).toBeGreaterThan(5);
    });

    it('returns a lapse straight to review when no relearning steps are configured', () => {
        const again = schedule(reviewCard(), 1, { ...fsrsSettings, lapseSteps: [] });
        expect(again.isLearning).toBe(false);
        expect(again.stateUpdates.status).toBe('review');
        expect(again.stateUpdates.lapses).toBe(1);
    });

    it('honours desired retention: wanting to remember more means reviewing sooner', () => {
        const relaxed = schedule(reviewCard(), 3, { ...fsrsSettings, desiredRetention: 0.8 });
        const strict = schedule(reviewCard(), 3, { ...fsrsSettings, desiredRetention: 0.97 });
        expect(strict.interval).toBeLessThan(relaxed.interval);
    });

    it('never exceeds the preset’s maximum interval', () => {
        const capped = schedule(
            reviewCard({ memoryState: { stability: 5000, difficulty: 2 } }),
            4,
            { ...fsrsSettings, maxInterval: 30 },
        );
        expect(capped.interval).toBe(30);
    });

    it('does not count a lapse for a card that was already relearning', () => {
        const relearning = reviewCard({ status: 'learning', relearningStep: 0, lapses: 3 });
        expect(schedule(relearning, 1).stateUpdates.lapses).toBe(3);
    });
});

describe('FSRS button labels', () => {
    it('describes exactly what pressing the button will do', () => {
        const card = reviewCard();
        const preview = FsrsEngine.previewIntervals(card, fsrsSettings, NOW);

        expect(preview.again).toBe('10dk');
        expect(preview.hard).toBe(formatDays(schedule(card, 2).interval));
        expect(preview.good).toBe(formatDays(schedule(card, 3).interval));
        expect(preview.easy).toBe(formatDays(schedule(card, 4).interval));
    });

    it('labels a new card’s buttons with its learning steps', () => {
        const preview = FsrsEngine.previewIntervals(newCard(), fsrsSettings, NOW);
        expect(preview.again).toBe('1dk');
        expect(preview.hard).toBe('6dk');
        expect(preview.good).toBe('10dk');
        expect(preview.againMinutes).toBe(1);
    });
});

describe('FSRS short-term scheduling', () => {
    it('is allowed by the default parameters and blocked by a set trained without it', () => {
        expect(fsrsAllowsShortTerm(DEFAULT_FSRS_PARAMETERS)).toBe(true);
        const withoutShortTerm = [...DEFAULT_FSRS_PARAMETERS];
        withoutShortTerm[17] = 0;
        withoutShortTerm[18] = 0;
        expect(fsrsAllowsShortTerm(withoutShortTerm)).toBe(false);
    });

    it('keeps a sub-day interval inside learning when no steps are configured', () => {
        const stepless: AppSettings = { ...fsrsSettings, learningSteps: [], lapseSteps: [] };
        const again = schedule(newCard(), 1, stepless);

        // The default first-Again stability is 0.212 days, well under half a day.
        expect(fsrsNextInterval(DEFAULT_FSRS_PARAMETERS[0], 0.9, decayFromParameters(DEFAULT_FSRS_PARAMETERS)))
            .toBeLessThan(0.5);
        expect(again.isLearning).toBe(true);
        expect(again.minutesUntilDue).toBeGreaterThan(0);
        expect(again.minutesUntilDue).toBeLessThan(720);
    });

    it('graduates instead when short-term scheduling is unavailable', () => {
        const stepless: AppSettings = {
            ...fsrsSettings,
            learningSteps: [],
            lapseSteps: [],
            fsrsParameters: DEFAULT_FSRS_PARAMETERS.map((value, index) => (index === 17 || index === 18 ? 0 : value)),
        };
        const again = schedule(newCard(), 1, stepless);
        expect(again.isLearning).toBe(false);
        expect(again.interval).toBe(1);
    });
});

describe('FSRS and the SM-2 ease factor', () => {
    it('keeps moving the ease factor, so turning FSRS off later resumes sensibly', () => {
        const card = reviewCard({ easeFactor: 2.5 });
        expect(schedule(card, 1).stateUpdates.easeFactor).toBeCloseTo(2.3, 6);
        expect(schedule(card, 2).stateUpdates.easeFactor).toBeCloseTo(2.35, 6);
        expect(schedule(card, 3).stateUpdates.easeFactor).toBeCloseTo(2.5, 6);
        expect(schedule(card, 4).stateUpdates.easeFactor).toBeCloseTo(2.65, 6);
    });

    it('never drops the ease factor below Anki’s floor', () => {
        const fragile = reviewCard({ easeFactor: 1.35 });
        expect(schedule(fragile, 1).stateUpdates.easeFactor).toBe(1.3);
    });

    it('graduates a learning card on the preset’s starting ease', () => {
        const graduated = schedule(newCard({ learningStep: 1 }), 3);
        expect(graduated.stateUpdates.easeFactor).toBe(fsrsSettings.startingEase);
    });
});

describe('review interval fuzz', () => {
    /**
     * Anki's own fuzz table, transcribed from the assertions in
     * https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/states/fuzz.rs
     * (`with_review_fuzz`). Upstream picks a point in the window with a random factor in [0, 1);
     * here the window itself is pinned, and the picked value is checked to stay inside it.
     */
    const CASES: Array<[interval: number, minimum: number, maximum: number, lower: number, upper: number]> = [
        // No fuzz at all below 2.5 days.
        [1.0, 1, 1000, 1, 1],
        [2.49, 1, 1000, 2, 2],
        // 1 day of fuzz from 2.5, plus 0.15/day over 2.5-7, 0.1/day over 7-20, 0.05/day above.
        [2.5, 1, 1000, 2, 4],
        [7.0, 1, 1000, 5, 9],
        [17.0, 1, 1000, 14, 20],
        [37.0, 1, 1000, 33, 41],
        // The window transitions smoothly across the range boundaries.
        [6.9, 3, 1000, 5, 9],
        [7.1, 3, 1000, 5, 9],
        [19.9, 3, 1000, 17, 23],
        [20.1, 3, 1000, 17, 23],
        // A minimum or maximum clips the window rather than shifting it.
        [2.0, 3, 1000, 3, 4],
        [2.0, 3, 3, 3, 3],
        [100.0, 101, 1000, 101, 108],
        [100.0, 1, 99, 92, 99],
        [100.0, 97, 103, 97, 103],
    ];

    it('matches Anki’s fuzz windows exactly', () => {
        for (const [interval, minimum, maximum, lower, upper] of CASES) {
            expect({ interval, ...constrainedFuzzBounds(interval, minimum, maximum) })
                .toEqual({ interval, lower, upper });
        }
    });

    it('picks a value inside the window, deterministically per card and study day', () => {
        const seed = { cardId: 4242, nowMs: NOW, rolloverHour: 4 };
        for (const [interval, minimum, maximum, lower, upper] of CASES) {
            const picked = constrainInterval(interval, minimum, maximum, seed);
            expect(picked).toBeGreaterThanOrEqual(lower);
            expect(picked).toBeLessThanOrEqual(upper);
            expect(constrainInterval(interval, minimum, maximum, seed)).toBe(picked);
        }
        // A different card, or the next study day, gets its own draw.
        const other = constrainInterval(37, 1, 1000, { ...seed, cardId: 9 });
        expect(other).toBeGreaterThanOrEqual(33);
        expect(other).toBeLessThanOrEqual(41);
    });

    // Anki's `minimum_review_fuzz_interval`; the assertions are upstream's own.
    it('keeps fuzz from clawing back a grown interval, but not a genuinely shrunken one', () => {
        expect(minimumReviewFuzzInterval(2.7269483, 4, 36500)).toBe(4);
        expect(minimumReviewFuzzInterval(2.7269483, 5, 36500)).toBe(0);
        expect(minimumReviewFuzzInterval(4.591988, 4, 36500)).toBe(5);
    });
});
