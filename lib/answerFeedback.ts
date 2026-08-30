// Resolves the visual half of answer confirmation: which colour washes across the card and how
// long each edge of the wash lasts. Kept out of the screen so all four grades are covered by a
// test instead of by an inline ternary chain that only ever exercised "Tekrar" in practice.

import { MotionDuration } from './motion';
import type { Grade } from './types';

/** The four grade colours from the active theme, in Anki's button order. */
export interface AnswerFeedbackPalette {
    again: string;
    hard: string;
    good: string;
    easy: string;
}

export interface AnswerFeedback {
    color: string;
    riseMs: number;
    fallMs: number;
}

export interface AnswerFeedbackOptions {
    /** Ayarlar > "Yanıt geri bildirimini göster". */
    enabled: boolean;
    reduceMotion: boolean;
}

/**
 * Grade colour, clamped at both ends: a grade below 1 reads as "Tekrar" and above 4 as "Kolay",
 * so a future scheduler grade can never fall through to an undefined colour.
 */
export function answerFeedbackColor(grade: number, palette: AnswerFeedbackPalette): string {
    if (grade <= 1) return palette.again;
    if (grade === 2) return palette.hard;
    if (grade === 3) return palette.good;
    return palette.easy;
}

/**
 * Returns null when there is nothing to draw. Under "Hareketi Azalt" the wash is dropped rather
 * than shortened to zero — a colour that appears and vanishes within one frame is a flicker, not
 * a confirmation; the haptic tap still acknowledges the answer.
 */
export function resolveAnswerFeedback(
    grade: Grade,
    palette: AnswerFeedbackPalette,
    options: AnswerFeedbackOptions,
): AnswerFeedback | null {
    if (!options.enabled || options.reduceMotion) return null;
    return {
        color: answerFeedbackColor(grade, palette),
        riseMs: MotionDuration.flashIn,
        fallMs: MotionDuration.flashOut,
    };
}
