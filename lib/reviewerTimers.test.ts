import { describe, expect, it } from 'vitest';
import {
    answerTimerSeconds,
    estimateStudyMinutes,
    formatStopwatch,
    shouldRunAutoAdvance,
} from './reviewerTimers';

describe('answer timer', () => {
    it('counts whole seconds and stops at the deck maximum', () => {
        expect(answerTimerSeconds(7_400, 60)).toBe(7);
        expect(answerTimerSeconds(59_900, 60)).toBe(59);
        // Anki freezes the display once the internal timer's cap is reached.
        expect(answerTimerSeconds(120_000, 60)).toBe(60);
        expect(answerTimerSeconds(120_000, 90)).toBe(90);
    });

    it('never shows a negative reading', () => {
        expect(answerTimerSeconds(-500, 60)).toBe(0);
    });

    it('formats as a stopwatch', () => {
        expect(formatStopwatch(7)).toBe('0:07');
        expect(formatStopwatch(65)).toBe('1:05');
        expect(formatStopwatch(600)).toBe('10:00');
    });
});

describe('study time estimate', () => {
    const counts = { newCount: 5, learningCount: 2, reviewCount: 30 };

    it('counts a new card once per learning step, like Anki\'s eta', () => {
        // 5 new x 2 steps + 2 learning + 30 reviews = 42 answers at 10s = 7 minutes.
        expect(estimateStudyMinutes(counts, { averageAnswerMs: 10_000, learningStepCount: 2 })).toBe(7);
        // One step: 5 + 2 + 30 = 37 answers at 10s ≈ 6 minutes.
        expect(estimateStudyMinutes(counts, { averageAnswerMs: 10_000, learningStepCount: 1 })).toBe(6);
    });

    it('rounds up to a full minute rather than reporting zero work', () => {
        expect(estimateStudyMinutes(
            { newCount: 0, learningCount: 0, reviewCount: 1 },
            { averageAnswerMs: 4_000, learningStepCount: 2 },
        )).toBe(1);
    });

    it('reports nothing when there is no queue or no measured pace', () => {
        expect(estimateStudyMinutes(
            { newCount: 0, learningCount: 0, reviewCount: 0 },
            { averageAnswerMs: 10_000, learningStepCount: 2 },
        )).toBeNull();
        expect(estimateStudyMinutes(counts, { averageAnswerMs: 0, learningStepCount: 2 })).toBeNull();
    });
});

describe('auto advance timing', () => {
    it('waits for both the configured dwell time and audio without restarting the timer', () => {
        expect(shouldRunAutoAdvance(2_000, 3_000, true, false)).toBe(false);
        expect(shouldRunAutoAdvance(3_000, 3_000, true, true)).toBe(false);
        // Audio ended after the dwell time: advance immediately instead of waiting another 3s.
        expect(shouldRunAutoAdvance(9_000, 3_000, true, false)).toBe(true);
    });

    it('ignores audio when the option is disabled', () => {
        expect(shouldRunAutoAdvance(3_000, 3_000, false, true)).toBe(true);
    });
});
