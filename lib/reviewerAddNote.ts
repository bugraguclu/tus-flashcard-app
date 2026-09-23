/**
 * Resolve the destination for a note started from the reviewer.
 *
 * A filtered deck is a temporary study view, not a valid add destination. Prefer the selected
 * study deck when it is a normal deck; otherwise fall back to the card's home deck (`odid`) so
 * adding from a filtered view never silently writes into the temporary deck.
 */
export function reviewerAddNoteDeckId(input: {
    selectedDeck: { id: number; isFiltered?: boolean } | null;
    homeDeck: { id: number; isFiltered?: boolean } | null;
}): number | null {
    if (input.selectedDeck && !input.selectedDeck.isFiltered) return input.selectedDeck.id;
    if (input.homeDeck && !input.homeDeck.isFiltered) return input.homeDeck.id;
    return null;
}

