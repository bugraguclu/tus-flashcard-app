import type { AppSettings } from './types';
import {
    FSRS_DEFAULT_DESIRED_RETENTION,
    FSRS_DEFAULT_HISTORICAL_RETENTION,
    FSRS_DESIRED_RETENTION_MAX,
    FSRS_DESIRED_RETENTION_MIN,
    formatFsrsCutoffDate,
    normalizeFsrsParameters,
    parseFsrsCutoffDate,
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
        // An empty list is a real setting in Anki (graduate at once / FSRS short-term), not a gap.
        learningSteps: Array.isArray(config.learningSteps) ? [...config.learningSteps] : base.learningSteps,
        lapseSteps: Array.isArray(config.relearningSteps) ? [...config.relearningSteps] : base.lapseSteps,
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
        // Canonical midnight UTC of the stored date, which is how Anki reads the cutoff.
        ignoreRevlogsBeforeMs: Number.isFinite(config.ignoreRevlogsBeforeMs)
            ? parseFsrsCutoffDate(formatFsrsCutoffDate(config.ignoreRevlogsBeforeMs))
            : base.ignoreRevlogsBeforeMs,
    };
}

/**
 * Anki validates both retention targets whenever it reads a preset
 * (`ensure_deck_config_values_valid` in rslib/src/deckconfig/mod.rs): a value outside its band is
 * not pulled to the nearest edge but replaced by the default, 90%.
 */
function validRetention(value: unknown, min: number, max: number, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const single = Math.fround(parsed);
    if (single < Math.fround(min) || single > Math.fround(max)) return fallback;
    return parsed;
}

/** Desired retention: 70%–99%, otherwise Anki's default. */
export function clampDesiredRetention(value: unknown): number {
    return validRetention(value, FSRS_DESIRED_RETENTION_MIN, FSRS_DESIRED_RETENTION_MAX, FSRS_DEFAULT_DESIRED_RETENTION);
}

/** Historical retention: 70%–97%, otherwise Anki's default. */
export function clampHistoricalRetention(value: unknown): number {
    return validRetention(value, 0.7, 0.97, FSRS_DEFAULT_HISTORICAL_RETENTION);
}
