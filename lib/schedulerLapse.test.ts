// ZAM-3 and the classic scheduler's P3 items, independently derived from the manual
// (https://docs.ankiweb.net/deck-options.html#lapses: "New interval", "Minimum interval") and
// Anki's observable SM-2 results; no Anki implementation code is copied.
import { describe, expect, it } from 'vitest';
import { getScheduler } from './scheduler';
import { settings } from '../test/studyQueueFixtures';
import type { AppSettings, CardState } from './types';
import { constrainInterval, reviewFuzzFor, formatLearningDelay, localizeIntervalLabel, formatDays, formatMinutes } from './schedulingIntervals';
import { nextRolloverMs } from './ankiState';
import { formatPreviewDelay, localizeButtonTimes } from './reviewerIntervalLabels';

const engine = getScheduler('ANKI_V3');
const halfLapse: AppSettings = { ...settings, lapseIntervalMultiplier: 0.5, minLapseInterval: 1, lapseSteps: [10] };

function reviewCard(cardId: number, overrides: Partial<CardState> = {}): CardState {
    return {
        cardId,
        interval: 100,
        repetition: 6,
        dueDate: '2026-10-23',
        dueTime: 0,
        status: 'review',
        suspended: false,
        buried: false,
        easeFactor: 2.5,
        learningStep: -1,
        relearningStep: -1,
        lastReviewedAtMs: 0,
        elapsedDays: 100,
        lapses: 1,
        ...overrides,
    };
}

/** A card id whose fuzz moves a 50-day lapse interval, so the test can tell fuzz from none. */
function fuzzedCardId(interval: number): number {
    for (let id = 1; id < 200; id++) {
        if (constrainInterval(interval, 1, 36500, reviewFuzzFor(id, 6)) !== Math.round(interval)) return id;
    }
    throw new Error('no fuzzed id found');
}

describe('ZAM-3: lapse intervals with "New interval" above 0%', () => {
    it('fuzzes the lapse interval like any review interval', () => {
        const id = fuzzedCardId(50);
        const result = engine.schedule(reviewCard(id), 1, halfLapse, Date.now());
        const expected = constrainInterval(50, 1, 36500, reviewFuzzFor(id, 6));
        expect(result.stateUpdates.interval).toBe(expected);
        expect(Math.abs(expected - 50)).toBeLessThanOrEqual(5);
        expect(result.stateUpdates.lapses).toBe(2);
    });

    it('reduces the pending interval again when a relearning step fails', () => {
        const relearning = reviewCard(7, { status: 'learning', relearningStep: 0, interval: 50, repetition: 7 });
        const result = engine.schedule(relearning, 1, halfLapse, Date.now());
        expect(result.stateUpdates.interval).toBe(constrainInterval(25, 1, 36500, reviewFuzzFor(7, 7)));
        // A failed relearning step is not another lapse and leaves the ease alone.
        expect(result.stateUpdates.lapses).toBeUndefined();
        expect(result.stateUpdates.easeFactor).toBeUndefined();
    });

    it('leaves the default 0% multiplier on the minimum lapse interval', () => {
        const result = engine.schedule(reviewCard(fuzzedCardId(50)), 1, { ...settings, lapseIntervalMultiplier: 0 }, Date.now());
        expect(result.stateUpdates.interval).toBe(1);
    });
});

describe('relearning graduation', () => {
    it('does not apply the minimum lapse interval a second time', () => {
        const relearning = reviewCard(9, { status: 'learning', relearningStep: 0, interval: 2 });
        const result = engine.schedule(relearning, 3, { ...halfLapse, minLapseInterval: 5 }, Date.now());
        expect(result.interval).toBe(2);
    });

    it('adds a day on Easy without clipping at the maximum interval', () => {
        const relearning = reviewCard(9, { status: 'learning', relearningStep: 0, interval: 100 });
        expect(engine.schedule(relearning, 4, { ...halfLapse, maxInterval: 100 }, Date.now()).interval).toBe(101);
    });
});

describe('answer-button labels', () => {
    it('labels a learning step that reaches past the rollover in days, as it is stored', () => {
        const now = nextRolloverMs(Date.now(), settings.dayRolloverHour) - 3_600_000;
        expect(formatLearningDelay(10, now, settings.dayRolloverHour)).toBe('10dk');
        expect(formatLearningDelay(600, now, settings.dayRolloverHour)).toBe('1 gün');
        const learning: CardState = { ...reviewCard(3), status: 'learning', learningStep: 0, interval: 0, repetition: 1 };
        const preview = engine.previewIntervals(learning, { ...settings, learningSteps: [1, 600] }, now);
        expect(preview.good).toBe('1 gün');
    });

    it('follows Anki\'s span units and the interface language', () => {
        expect(formatMinutes(90)).toBe('1.5sa');
        expect(formatDays(30)).toBe('30 gün');
        expect(formatDays(45)).toBe('1.5 ay');
        expect(localizeIntervalLabel('1.5sa', 'en')).toBe('1.5h');
        expect(localizeIntervalLabel('1.5 ay', 'en')).toBe('1.5mo');
        expect(localizeIntervalLabel('30 gün', 'en')).toBe('30d');
        expect(localizeIntervalLabel('2.1 yıl', 'en')).toBe('2.1y');
        expect(localizeIntervalLabel('< 1dk', 'en')).toBe('<1m');
        expect(localizeIntervalLabel('10dk', 'tr')).toBe('10dk');
        expect(localizeButtonTimes({ again: '10dk', hard: '1 gün', good: '3 gün', easy: '1.5 ay' }, 'en'))
            .toEqual({ again: '10m', hard: '1d', good: '3d', easy: '1.5mo' });
    });

    it('labels a preview deck\'s finishing button "(end)"', () => {
        expect(formatPreviewDelay(0, 'en')).toBe('(end)');
        expect(formatPreviewDelay(0, 'tr')).toBe('(bitiş)');
        expect(formatPreviewDelay(30, 'en')).toBe('30s');
        expect(formatPreviewDelay(600, 'tr')).toBe('10dk');
        expect(formatPreviewDelay(5400, 'en')).toBe('1.5h');
    });
});
