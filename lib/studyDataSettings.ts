import type { AppSettings } from './types';

/**
 * Only changes to queue membership/order or the scheduling state hydrated into its cards start
 * a new data snapshot. Appearance, controls, audio, timers and notifications update independently; a
 * preview or Save of one of those must not query the collection or reshuffle a live session.
 * Preset/content changes still arrive through collectionVersion.
 */
export const STUDY_DATA_SETTING_KEYS = [
    'dayRolloverHour', 'learnAheadMinutes', 'dailyNewLimit', 'dailyReviewLimit',
    'queueOrder', 'newCardOrder', 'newCardGatherOrder', 'newCardSortOrder',
    'reviewSortOrder', 'interdayLearningMix', 'newCardsIgnoreReviewLimit', 'limitsStartFromTop',
    'learningSteps', 'lapseSteps', 'graduatingInterval', 'easyInterval', 'startingEase',
    'lapseIntervalMultiplier', 'minLapseInterval', 'easyDays', 'hardIntervalMultiplier',
    'easyBonus', 'intervalModifier', 'maxInterval', 'algorithm', 'fsrsEnabled',
    'fsrsShortTermWithSteps', 'fsrsParameters', 'desiredRetention', 'historicalRetention',
    'ignoreRevlogsBeforeMs',
] as const satisfies ReadonlyArray<keyof AppSettings>;

export function studyDataSettingsKey(settings: AppSettings): string {
    return JSON.stringify(STUDY_DATA_SETTING_KEYS.map((key) => settings[key]));
}
