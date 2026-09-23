import type { AppSettings } from './types';
import {
    FSRS_DEFAULT_DESIRED_RETENTION,
    FSRS_DEFAULT_HISTORICAL_RETENTION,
    FSRS_DESIRED_RETENTION_MAX,
    FSRS_DESIRED_RETENTION_MIN,
    normalizeFsrsParameters,
} from './fsrs';
import type { DeckConfig } from './models';
import { normalizeNewCardGatherOrder } from './queueBuild';

/**
 * Resolves AppSettings from a DeckConfig, using `base` for fallback values.
 * Single source of truth for deck config -> app settings conversion (DRY).
 */
export function resolveSettingsFromConfig(config: DeckConfig, base: AppSettings): AppSettings {
    return {
        ...base,
        // Daily limits accept 0 (a valid "none today"); guard only against non-finite/negative.
        dailyNewLimit: Number.isFinite(config.newPerDay) && config.newPerDay >= 0
            ? config.newPerDay
            : base.dailyNewLimit,
        dailyReviewLimit: Number.isFinite(config.maxReviewsPerDay) && config.maxReviewsPerDay >= 0
            ? config.maxReviewsPerDay
            : base.dailyReviewLimit,
        learningSteps: config.learningSteps?.length > 0 ? [...config.learningSteps] : base.learningSteps,
        lapseSteps: config.relearningSteps?.length > 0 ? [...config.relearningSteps] : base.lapseSteps,
        graduatingInterval: config.graduatingIvl > 0 ? config.graduatingIvl : base.graduatingInterval,
        easyInterval: config.easyIvl > 0 ? config.easyIvl : base.easyInterval,
        // Permille -> float, floored at Anki's hard ease minimum of 1.3.
        startingEase: config.startingEase > 0 ? Math.max(1.3, config.startingEase / 1000) : base.startingEase,
        // newIvlPercent is a fraction (0.0–1.0). Clamp defensively so a stray out-of-range value
        // (e.g. an imported/hand-edited config storing 70 instead of 0.7) can never explode intervals.
        lapseIntervalMultiplier: Number.isFinite(config.newIvlPercent)
            ? Math.max(0, Math.min(1, config.newIvlPercent))
            : base.lapseIntervalMultiplier,
        minLapseInterval: config.minIvl > 0 ? config.minIvl : base.minLapseInterval,
        newCardOrder: config.insertionOrder === 'random' ? 'random' : 'sequential',
        hardIntervalMultiplier: config.hardIvl > 0 ? config.hardIvl : base.hardIntervalMultiplier,
        easyBonus: config.easyBonus > 0 ? config.easyBonus : base.easyBonus,
        intervalModifier: config.ivlModifier > 0 ? config.ivlModifier : base.intervalModifier,
        maxInterval: config.maxIvl > 0 ? Math.min(36500, config.maxIvl) : base.maxInterval,
        // Display order / audio / easy days arrived after the first configs were written;
        // absent fields fall back to the app-wide defaults.
        queueOrder: config.newReviewOrder ?? base.queueOrder,
        newCardGatherOrder: normalizeNewCardGatherOrder(config.newCardGatherOrder ?? base.newCardGatherOrder),
        interdayLearningMix: config.interdayLearningMix ?? base.interdayLearningMix,
        reviewSortOrder: config.reviewSortOrder ?? base.reviewSortOrder,
        newCardSortOrder: config.newCardSortOrder ?? base.newCardSortOrder,
        autoPlayAudio: config.autoPlayAudio ?? base.autoPlayAudio,
        audioPlaybackRate: config.audioPlaybackRate ?? base.audioPlaybackRate ?? 1.0,
        skipQuestionWhenReplayingAnswer: config.skipQuestionWhenReplayingAnswer
            ?? base.skipQuestionWhenReplayingAnswer,
        // Timers and Auto Advance live on the preset in Anki, so the reviewer has to read them
        // from the deck being studied rather than from the collection-wide preferences.
        showAnswerTimer: config.showTimer,
        maxAnswerSeconds: config.maxAnswerSecs > 0 ? config.maxAnswerSecs : base.maxAnswerSeconds,
        stopTimerOnAnswer: config.stopTimerOnAnswer ?? base.stopTimerOnAnswer,
        secondsToShowQuestion: Math.max(0, config.secondsToShowQuestion ?? 0),
        secondsToShowAnswer: Math.max(0, config.secondsToShowAnswer ?? 0),
        questionAction: config.questionAction ?? base.questionAction,
        waitForAudio: config.waitForAudio ?? base.waitForAudio,
        answerAction: config.answerAction ?? base.answerAction,
        easyDays: Array.isArray(config.easyDays) && config.easyDays.length === 7
            ? [...config.easyDays]
            : base.easyDays,
        // FSRS parameters and retention targets live on the preset; the on/off switch and the
        // reschedule preference are collection-wide and stay on `base`.
        fsrsParameters: normalizeFsrsParameters(config.fsrsParams ?? base.fsrsParameters),
        desiredRetention: clampDesiredRetention(config.desiredRetention ?? base.desiredRetention),
        historicalRetention: clampHistoricalRetention(config.historicalRetention ?? base.historicalRetention),
        ignoreRevlogsBeforeMs: Number.isFinite(config.ignoreRevlogsBeforeMs)
            ? config.ignoreRevlogsBeforeMs
            : base.ignoreRevlogsBeforeMs,
    };
}

/** Anki refuses to schedule outside this band; a stray stored value is pulled back into it. */
export function clampDesiredRetention(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return FSRS_DEFAULT_DESIRED_RETENTION;
    return Math.min(FSRS_DESIRED_RETENTION_MAX, Math.max(FSRS_DESIRED_RETENTION_MIN, parsed));
}

export function clampHistoricalRetention(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return FSRS_DEFAULT_HISTORICAL_RETENTION;
    return Math.min(0.99, Math.max(0.5, parsed));
}
