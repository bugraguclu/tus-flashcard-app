import { parseBoundedDecimalDraft } from '../../lib/deckOptionsForm';

/**
 * Anki's ranges for the classic multipliers (its deck-options spin boxes), and the wider ranges
 * this app accepted before (DST-10). https://docs.ankiweb.net/deck-options.html#advanced
 */
export const MULTIPLIER_BOUNDS = {
    startingEase: { min: 1.31, max: 5, legacyMin: 1.3, legacyMax: 5 },
    hardIvl: { min: 0.5, max: 1.3, legacyMin: 0.5, legacyMax: 2 },
    ivlModifier: { min: 0.5, max: 2, legacyMin: 0.1, legacyMax: 3 },
} as const;

/**
 * A stored value outside Anki's range that the learner has not touched is kept as it is, so a
 * save never silently changes it; any edited value must fall inside Anki's range.
 */
export function untouchedLegacyMultiplier(field: keyof typeof MULTIPLIER_BOUNDS, draft: string, stored: number): number | undefined {
    const bounds = MULTIPLIER_BOUNDS[field];
    if (stored >= bounds.min && stored <= bounds.max) return undefined;
    const value = parseBoundedDecimalDraft(draft, bounds.legacyMin, bounds.legacyMax).value;
    return value !== undefined && Math.abs(value - stored) < 1e-9 ? stored : undefined;
}
