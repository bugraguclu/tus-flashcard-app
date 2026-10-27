/**
 * Deck Options form fields that belong to the deck (its own and today-only limits, its desired
 * retention, its description) or to the whole collection, not to the preset. Restoring a preset's
 * defaults or adding a preset replaces only the preset's values, so unsaved edits to these stay.
 */
export const NON_PRESET_FORM_FIELDS = [
    'deckNewLimit',
    'deckReviewLimit',
    'deckDesiredRetention',
    'todayNewLimit',
    'todayReviewLimit',
    'description',
    'newCardsIgnoreReviewLimit',
    'limitsStartFromTop',
    'fsrsEnabled',
    'fsrsShortTermWithSteps',
] as const;

type NonPresetFormField = (typeof NON_PRESET_FORM_FIELDS)[number];

/** `next` (a form built from a preset) with the deck and collection fields taken from `current`. */
export function keepNonPresetEdits<T extends Record<NonPresetFormField, unknown>>(next: T, current: T): T {
    const kept = { ...next };
    for (const field of NON_PRESET_FORM_FIELDS) kept[field] = current[field];
    return kept;
}
