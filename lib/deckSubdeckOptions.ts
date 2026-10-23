/**
 * Anki's "Save to All Subdecks": every normal subdeck adopts the deck's preset and the limits set
 * on its "This deck" and "Today only" tabs (`update_deck_limits` runs for each selected deck).
 * https://docs.ankiweb.net/deck-options.html
 */
import { applyConfigToSubdecks } from './deckPresets';
import { setDeckLimitOverrides, setDeckTodayLimits } from './deckLimits';
import { getAllDecks, getDeck } from './deckStore';

export interface SubdeckLimits {
    deckNewLimit?: number;
    deckReviewLimit?: number;
    todayNewLimit?: number;
    todayReviewLimit?: number;
}

/** Returns how many subdecks changed preset; the caller owns the enclosing transaction. */
export function applyDeckOptionsToSubdecks(deckId: number, limits: SubdeckLimits, rolloverHour: number): number {
    const deck = getDeck(deckId);
    if (!deck) return 0;
    const changed = applyConfigToSubdecks(deckId);
    const prefix = `${deck.name}::`;
    for (const subdeck of getAllDecks()) {
        if (subdeck.isFiltered || !subdeck.name.startsWith(prefix)) continue;
        setDeckLimitOverrides(subdeck.id, limits.deckNewLimit, limits.deckReviewLimit);
        setDeckTodayLimits(subdeck.id, limits.todayNewLimit, limits.todayReviewLimit, rolloverHour);
    }
    return changed;
}
