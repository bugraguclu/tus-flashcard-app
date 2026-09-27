/**
 * Anki's "Optimize" button for one preset.
 *
 * It gathers what Anki's default search for the preset gathers (`preset:"name" -is:suspended`):
 * every unsuspended card of the preset's decks, each card's log turned into training items as
 * `fsrs_items_for_training` turns it, all of them ordered by their last review. It then trains
 * the way Anki trains (lib/fsrsTraining.ts) and applies Anki's rule for adopting the result. The
 * relearning steps that matter are the ones that fit in a day, as Anki's deck options count them.
 */

import { fsrsLogLoss, optimizeFsrsParametersLikeAnki, type TrainingProgress } from './fsrsTraining';
import { collectFsrsTrainingItems } from './fsrsMaintenance';
import type { AppSettings } from './types';

/** How many relearning steps (in minutes) complete before a day has passed. */
export function relearningStepsWithinDay(stepsMinutes: readonly number[]): number {
    let elapsed = 0;
    let count = 0;
    for (const step of stepsMinutes) {
        elapsed += step;
        if (elapsed >= 1440) break;
        count += 1;
    }
    return count;
}

export interface FsrsOptimizeResult {
    /** The parameters to use, or the current ones when training did not improve on them. */
    parameters: number[];
    /** Anki's "already optimal": the result equals the current parameters to four decimals. */
    alreadyOptimal: boolean;
    /** How many training items the review log produced; 0 means there was nothing to train on. */
    items: number;
    /** How many answers those items draw on. */
    reviews: number;
    /** fsrs-rs `evaluate` log loss of the current and the resulting parameters, when trained. */
    logLossBefore: number | null;
    logLossAfter: number | null;
}

/**
 * Optimize one preset's parameters. Resolves null when the progress callback asked to stop, and
 * rejects when the history cannot be fitted, as Anki reports an error.
 */
export async function optimizeFsrsPreset(options: {
    deckIds: number[];
    settings: AppSettings;
    currentParameters: readonly number[];
    relearningStepsMinutes: readonly number[];
    ignoreRevlogsBeforeMs: number;
    onProgress?: TrainingProgress;
    nowMs?: number;
}): Promise<FsrsOptimizeResult | null> {
    const { items, reviews } = collectFsrsTrainingItems(options.deckIds, options.settings, options.ignoreRevlogsBeforeMs, options.nowMs);
    const current = [...options.currentParameters];
    const result = await optimizeFsrsParametersLikeAnki(
        items,
        current,
        relearningStepsWithinDay(options.relearningStepsMinutes),
        options.onProgress,
    );
    if (result === null) return null;

    const alreadyOptimal = (current.length > 0 && current.every((value, index) => (
        result[index] !== undefined && value.toFixed(4) === result[index].toFixed(4)
    ))) || result.length === 0;
    return {
        parameters: result,
        alreadyOptimal,
        items: items.length,
        reviews,
        logLossBefore: items.length > 0 ? fsrsLogLoss(current, items) : null,
        logLossAfter: items.length > 0 ? fsrsLogLoss(result, items) : null,
    };
}
