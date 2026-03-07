/**
 * Anki V3 Engine Test Suite
 * ========================
 * Bu test dosyası AnkiV3Engine'in tüm zamanlama kurallarını doğrular.
 * Vitest kullanarak çalıştır: npm test
 */

import { describe, it, expect } from 'vitest';
import { getScheduler, formatMinutes, formatDays } from './scheduler';
import type { CardState, AppSettings, Grade } from './types';

// Default test settings matching Anki defaults
const defaultSettings: AppSettings = {
    newCardsPerDay: 20,
    maxReviewsPerDay: 200,
    learningSteps: [1, 10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseNewInterval: 0.7,
    algorithm: 'ANKI_V3',
    desiredRetention: 0.9,
};

function makeNewCard(): CardState {
    return {
        dueDate: '2026-03-01',
        interval: 0,
        repetition: 0,
        easeFactor: 2.5,
        status: 'new',
        learningStep: 0,
        relearningStep: -1,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        lapses: 0,
        lastReviewedAtMs: 0,
    };
}

function makeReviewCard(overrides: Partial<CardState> = {}): CardState {
    return {
        dueDate: '2026-03-01',
        interval: 10,
        repetition: 5,
        easeFactor: 2.5,
        status: 'review',
        learningStep: -1,
        relearningStep: -1,
        stability: 10,
        difficulty: 5,
        elapsedDays: 10,
        lapses: 0,
        lastReviewedAtMs: Date.now() - 10 * 86400000,
        ...overrides,
    };
}

const engine = getScheduler('ANKI_V3');

describe('AnkiV3Engine', () => {
    // ========================================
    // 1. Engine basic properties
    // ========================================
    describe('Engine properties', () => {
        it('should have correct name and description', () => {
            expect(engine.name).toBe('ANKI_V3');
            expect(engine.description).toContain('Anki');
        });
    });

    // ========================================
    // 2. initCardState
    // ========================================
    describe('initCardState', () => {
        it('should initialize with starting ease and step 0', () => {
            const state = engine.initCardState(defaultSettings);
            expect(state.easeFactor).toBe(2.5);
            expect(state.learningStep).toBe(0);
            expect(state.relearningStep).toBe(-1);
            expect(state.lapses).toBe(0);
        });
    });

    // ========================================
    // 3. Learning Phase
    // ========================================
    describe('Learning Phase', () => {
        it('Again → resets to step 0, shows first step delay', () => {
            const card = makeNewCard();
            const result = engine.schedule(card, 1 as Grade, defaultSettings);

            expect(result.isLearning).toBe(true);
            expect(result.minutesUntilDue).toBe(1); // steps[0] = 1
            expect(result.stateUpdates.learningStep).toBe(0);
            expect(result.stateUpdates.status).toBe('learning');
        });

        it('Hard → stays at same step, delay = avg(cur, next)', () => {
            const card = makeNewCard();
            const result = engine.schedule(card, 2 as Grade, defaultSettings);

            expect(result.isLearning).toBe(true);
            // step 0, cur=1, next=10: avg = (1+10)/2 = 5.5 → 6
            expect(result.minutesUntilDue).toBe(6);
            expect(result.stateUpdates.learningStep).toBe(0); // stays at step 0
        });

        it('Hard at last step → delay = cur * 1.5', () => {
            const card = { ...makeNewCard(), learningStep: 1, status: 'learning' as const };
            const result = engine.schedule(card, 2 as Grade, defaultSettings);

            expect(result.isLearning).toBe(true);
            // step 1, cur=10, no next: 10 * 1.5 = 15
            expect(result.minutesUntilDue).toBe(15);
            expect(result.stateUpdates.learningStep).toBe(1); // stays at step 1
        });

        it('Good → advances to next step (not last)', () => {
            const card = makeNewCard();
            const result = engine.schedule(card, 3 as Grade, defaultSettings);

            expect(result.isLearning).toBe(true);
            expect(result.minutesUntilDue).toBe(10); // steps[1] = 10
            expect(result.stateUpdates.learningStep).toBe(1);
        });

        it('Good at last step → graduates to review', () => {
            const card = { ...makeNewCard(), learningStep: 1, status: 'learning' as const };
            const result = engine.schedule(card, 3 as Grade, defaultSettings);

            expect(result.isLearning).toBe(false);
            expect(result.interval).toBe(1); // graduatingInterval
            expect(result.stateUpdates.status).toBe('review');
            expect(result.stateUpdates.learningStep).toBe(-1);
            expect(result.stateUpdates.interval).toBe(1);
        });

        it('Easy → directly graduates with easyInterval', () => {
            const card = makeNewCard();
            const result = engine.schedule(card, 4 as Grade, defaultSettings);

            expect(result.isLearning).toBe(false);
            expect(result.interval).toBe(4); // easyInterval
            expect(result.stateUpdates.status).toBe('review');
            expect(result.stateUpdates.learningStep).toBe(-1);
            expect(result.stateUpdates.interval).toBe(4);
            // Ease should increase by +0.15
            expect(result.stateUpdates.easeFactor).toBe(2.65);
        });
    });

    // ========================================
    // 4. Review Phase
    // ========================================
    describe('Review Phase', () => {
        it('Again → lapse with relearning step 0', () => {
            const card = makeReviewCard();
            const result = engine.schedule(card, 1 as Grade, defaultSettings);

            expect(result.isLearning).toBe(true);
            expect(result.minutesUntilDue).toBe(1); // steps[0]
            expect(result.stateUpdates.relearningStep).toBe(0);
            expect(result.stateUpdates.lapses).toBe(1);
            expect(result.stateUpdates.status).toBe('learning');
            // Ease decreases by 0.20
            expect(result.stateUpdates.easeFactor).toBe(2.3);
            // Interval: 10 * 0.7 = 7
            expect(result.stateUpdates.interval).toBe(7);
        });

        it('Hard → interval = max(cur+1, cur*1.2), ease -0.15', () => {
            const card = makeReviewCard();
            const result = engine.schedule(card, 2 as Grade, defaultSettings);

            expect(result.isLearning).toBe(false);
            expect(result.stateUpdates.status).toBe('review');
            // Hard interval: max(10+1, round(10*1.2)) = max(11, 12) = 12
            // After fuzz, still >= 1
            expect(result.interval).toBeGreaterThanOrEqual(1);
            expect(result.stateUpdates.easeFactor).toBe(2.35);
        });

        it('Good → interval = cur * ease, ease unchanged', () => {
            const card = makeReviewCard();
            const result = engine.schedule(card, 3 as Grade, defaultSettings);

            expect(result.isLearning).toBe(false);
            // Good interval: round(10 * 2.5) = 25 (before fuzz)
            // After clamp: must be > hard+1 = 13
            expect(result.interval).toBeGreaterThanOrEqual(13);
            expect(result.stateUpdates.easeFactor).toBe(2.5); // unchanged
        });

        it('Easy → interval = cur * ease * 1.3, ease +0.15', () => {
            const card = makeReviewCard();
            const result = engine.schedule(card, 4 as Grade, defaultSettings);

            expect(result.isLearning).toBe(false);
            // Easy: round(10 * 2.5 * 1.3) = 33 (before fuzz)
            // After clamp: must be > good+1
            expect(result.interval).toBeGreaterThanOrEqual(26);
            expect(result.stateUpdates.easeFactor).toBe(2.65);
        });

        it('Ease never goes below 1.3', () => {
            const card = makeReviewCard({ easeFactor: 1.3 });
            const result = engine.schedule(card, 1 as Grade, defaultSettings);

            // Lapse: ease - 0.20 = 1.1, but clamped to 1.3
            expect(result.stateUpdates.easeFactor).toBe(1.3);
        });
    });

    // ========================================
    // 5. Relearning Phase
    // ========================================
    describe('Relearning Phase', () => {
        function makeRelearningCard(): CardState {
            return {
                ...makeReviewCard(),
                status: 'learning',
                learningStep: -1,
                relearningStep: 0,
                interval: 7, // lapsed interval
            };
        }

        it('Again → resets to relearning step 0', () => {
            const card = { ...makeRelearningCard(), relearningStep: 1 };
            const result = engine.schedule(card, 1 as Grade, defaultSettings);

            expect(result.isLearning).toBe(true);
            expect(result.stateUpdates.relearningStep).toBe(0);
        });

        it('Good at last relearning step → returns to review with lapse interval', () => {
            const card = { ...makeRelearningCard(), relearningStep: 1 };
            const result = engine.schedule(card, 3 as Grade, defaultSettings);

            expect(result.isLearning).toBe(false);
            expect(result.stateUpdates.status).toBe('review');
            expect(result.stateUpdates.interval).toBe(7);
            expect(result.stateUpdates.relearningStep).toBe(-1);
        });

        it('Easy → immediately returns to review', () => {
            const card = makeRelearningCard();
            const result = engine.schedule(card, 4 as Grade, defaultSettings);

            expect(result.isLearning).toBe(false);
            expect(result.stateUpdates.status).toBe('review');
            expect(result.stateUpdates.interval).toBe(7);
        });
    });

    // ========================================
    // 6. Interval Clamp Chain
    // ========================================
    describe('Interval Clamp Chain (hard < good < easy)', () => {
        it('ensures hard < good < easy for review cards', () => {
            const card = makeReviewCard({ interval: 1, easeFactor: 1.3 });
            const result2 = engine.schedule(card, 2 as Grade, defaultSettings);
            const result3 = engine.schedule(card, 3 as Grade, defaultSettings);
            const result4 = engine.schedule(card, 4 as Grade, defaultSettings);

            // Note: fuzz may vary, but clamp guarantees ordering
            expect(result3.interval).toBeGreaterThan(result2.interval);
            expect(result4.interval).toBeGreaterThan(result3.interval);
        });
    });

    // ========================================
    // 7. Preview Intervals
    // ========================================
    describe('previewIntervals', () => {
        it('learning card shows minute labels', () => {
            const card = makeNewCard();
            const preview = engine.previewIntervals(card, defaultSettings);

            expect(preview.again).toContain('dk');
            expect(preview.hard).toContain('dk');
        });

        it('learning card at last step shows graduation intervals', () => {
            const card = { ...makeNewCard(), learningStep: 1, status: 'learning' as const };
            const preview = engine.previewIntervals(card, defaultSettings);

            expect(preview.good).toContain('gun');
            expect(preview.easy).toContain('gun');
        });

        it('review card shows time-based labels', () => {
            const card = makeReviewCard();
            const preview = engine.previewIntervals(card, defaultSettings);

            // hard=12 gün, good=25 gün, easy=33 days → may show as gün or ay
            expect(preview.hard).toMatch(/\d/);
            expect(preview.good).toMatch(/\d/);
            expect(preview.easy).toMatch(/\d/);
        });
    });

    // ========================================
    // 8. Helper Functions
    // ========================================
    describe('formatMinutes', () => {
        it('formats minutes < 60 as "Xdk"', () => {
            expect(formatMinutes(5)).toBe('5dk');
            expect(formatMinutes(1)).toBe('1dk');
        });

        it('formats 60+ minutes as hours', () => {
            expect(formatMinutes(60)).toBe('1sa');
            expect(formatMinutes(120)).toBe('2sa');
            expect(formatMinutes(90)).toBe('2sa'); // rounds 1.5 → 2
        });
    });

    describe('formatDays', () => {
        it('formats days < 30', () => {
            expect(formatDays(1)).toContain('1');
            expect(formatDays(7)).toContain('7');
        });

        it('formats 30+ days as months', () => {
            const result = formatDays(60);
            expect(result).toContain('ay');
        });
    });

    // ========================================
    // 9. Multiple Lapses
    // ========================================
    describe('Multiple Lapses', () => {
        it('tracks lapse count correctly across multiple lapses', () => {
            let card = makeReviewCard({ lapses: 3 });
            const result = engine.schedule(card, 1 as Grade, defaultSettings);
            expect(result.stateUpdates.lapses).toBe(4);
        });

        it('interval shrinks correctly with lapseNewInterval', () => {
            const card = makeReviewCard({ interval: 100 });
            const result = engine.schedule(card, 1 as Grade, defaultSettings);
            // 100 * 0.7 = 70
            expect(result.stateUpdates.interval).toBe(70);
        });
    });

    // ========================================
    // 10. Edge Cases
    // ========================================
    describe('Edge Cases', () => {
        it('card with interval=0 during review defaults to 1', () => {
            const card = makeReviewCard({ interval: 0 });
            const result = engine.schedule(card, 3 as Grade, defaultSettings);
            expect(result.interval).toBeGreaterThanOrEqual(1);
        });

        it('card with easeFactor=0 uses starting ease', () => {
            const card = makeReviewCard({ easeFactor: 0 });
            const result = engine.schedule(card, 3 as Grade, defaultSettings);
            // Should use startingEase (2.5) instead of 0
            expect(result.interval).toBeGreaterThanOrEqual(1);
        });

        it('single learning step still works', () => {
            const settings = { ...defaultSettings, learningSteps: [1] };
            const card = makeNewCard();

            // Good with single step → graduate immediately
            const result = engine.schedule(card, 3 as Grade, settings);
            expect(result.isLearning).toBe(false);
            expect(result.stateUpdates.status).toBe('review');
        });

        it('three learning steps work correctly', () => {
            const settings = { ...defaultSettings, learningSteps: [1, 10, 60] };
            const card = makeNewCard();

            // Good → step 1
            const r1 = engine.schedule(card, 3 as Grade, settings);
            expect(r1.stateUpdates.learningStep).toBe(1);
            expect(r1.minutesUntilDue).toBe(10);

            // Good from step 1 → step 2
            const card2 = { ...card, learningStep: 1, status: 'learning' as const };
            const r2 = engine.schedule(card2, 3 as Grade, settings);
            expect(r2.stateUpdates.learningStep).toBe(2);
            expect(r2.minutesUntilDue).toBe(60);

            // Good from step 2 → graduate
            const card3 = { ...card, learningStep: 2, status: 'learning' as const };
            const r3 = engine.schedule(card3, 3 as Grade, settings);
            expect(r3.isLearning).toBe(false);
            expect(r3.stateUpdates.status).toBe('review');
        });
    });
});
