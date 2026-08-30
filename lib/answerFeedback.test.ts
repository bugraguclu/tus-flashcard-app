import { describe, expect, it } from 'vitest';
import { MotionDuration } from './motion';
import { answerFeedbackColor, resolveAnswerFeedback, type AnswerFeedbackPalette } from './answerFeedback';
import type { Grade } from './types';

const palette: AnswerFeedbackPalette = {
    again: '#c0392b',
    hard: '#d68910',
    good: '#27864e',
    easy: '#2874a6',
};

const GRADES: Grade[] = [1, 2, 3, 4];

describe('answerFeedbackColor', () => {
    it('gives each grade its own colour', () => {
        expect(GRADES.map((grade) => answerFeedbackColor(grade, palette))).toEqual([
            palette.again,
            palette.hard,
            palette.good,
            palette.easy,
        ]);
    });

    it('clamps grades outside the 1..4 range instead of returning undefined', () => {
        expect(answerFeedbackColor(0, palette)).toBe(palette.again);
        expect(answerFeedbackColor(-1, palette)).toBe(palette.again);
        expect(answerFeedbackColor(5, palette)).toBe(palette.easy);
    });
});

describe('resolveAnswerFeedback', () => {
    const on = { enabled: true, reduceMotion: false };

    it('produces a confirmation for all four grades, not just "Tekrar"', () => {
        const resolved = GRADES.map((grade) => resolveAnswerFeedback(grade, palette, on));

        expect(resolved.every((feedback) => feedback !== null)).toBe(true);
        expect(resolved.map((feedback) => feedback?.color)).toEqual([
            palette.again,
            palette.hard,
            palette.good,
            palette.easy,
        ]);
    });

    it('gives every grade the same two-edge timing from the motion tokens', () => {
        for (const grade of GRADES) {
            expect(resolveAnswerFeedback(grade, palette, on)).toMatchObject({
                riseMs: MotionDuration.flashIn,
                fallMs: MotionDuration.flashOut,
            });
        }
    });

    it('draws nothing when the preference is off', () => {
        for (const grade of GRADES) {
            expect(resolveAnswerFeedback(grade, palette, { enabled: false, reduceMotion: false })).toBeNull();
        }
    });

    it('draws nothing under reduced motion', () => {
        for (const grade of GRADES) {
            expect(resolveAnswerFeedback(grade, palette, { enabled: true, reduceMotion: true })).toBeNull();
        }
    });
});
