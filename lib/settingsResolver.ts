import type { AppSettings } from './types';
import type { DeckConfig } from './models';

/**
 * Resolves AppSettings from a DeckConfig, using `base` for fallback values.
 * Single source of truth for deck config -> app settings conversion (DRY).
 */
export function resolveSettingsFromConfig(config: DeckConfig, base: AppSettings): AppSettings {
    return {
        ...base,
        dailyNewLimit: config.newPerDay,
        dailyReviewLimit: config.maxReviewsPerDay,
        learningSteps: config.learningSteps?.length > 0 ? [...config.learningSteps] : base.learningSteps,
        lapseSteps: config.relearningSteps?.length > 0 ? [...config.relearningSteps] : base.lapseSteps,
        graduatingInterval: config.graduatingIvl,
        easyInterval: config.easyIvl,
        startingEase: config.startingEase > 0 ? config.startingEase / 1000 : base.startingEase,
        lapseNewInterval: config.newIvlPercent >= 0 ? config.newIvlPercent : base.lapseNewInterval,
        minLapseInterval: config.minIvl > 0 ? config.minIvl : base.minLapseInterval,
        newCardOrder: config.insertionOrder === 'random' ? 'random' : 'sequential',
        hardIntervalMultiplier: config.hardIvl > 0 ? config.hardIvl : base.hardIntervalMultiplier,
        easyBonus: config.easyBonus > 0 ? config.easyBonus : base.easyBonus,
        intervalModifier: config.ivlModifier > 0 ? config.ivlModifier : base.intervalModifier,
        maxInterval: config.maxIvl > 0 ? config.maxIvl : base.maxInterval,
    };
}
