/** Every Anki collection's Default deck has this id; it cannot be deleted there. */
export const ANKI_DEFAULT_DECK_ID = 1;

export interface PackageDeckRef {
    id: number;
    /** Full name with "::" between levels. */
    name: string;
}

export interface PackageCardRef {
    did: number;
    /** Home deck of a card sitting in a filtered deck, or 0. */
    odid: number;
}

export interface PackageDeckSelectionOptions {
    withScheduling: boolean;
    /** Whether the collection being imported into has a deck with Anki's Default deck id. */
    hasOwnDefaultDeck: boolean;
}

/**
 * The package decks an import creates, chosen the way Anki 26.05 chooses them: the decks the
 * package's cards are in, the home decks of cards in filtered decks when progress is imported,
 * and every deck above one of those. A deck holding none of them is left behind; that is almost
 * always the Default deck, which every collection carries and so every package contains. Without
 * progress Anki also leaves the package's Default deck behind, and a card in it joins the
 * importing collection's own default deck.
 *
 * Measured by importing Anki's own exports into Anki 26.05 through scripts/anki-oracle.
 * https://github.com/ankitects/anki/blob/main/rslib/src/import_export/gather.rs
 */
export function packageDecksToImport(
    decks: readonly PackageDeckRef[],
    cards: readonly PackageCardRef[],
    { withScheduling, hasOwnDefaultDeck }: PackageDeckSelectionOptions,
): Set<number> {
    const holdingCards = new Set<number>();
    for (const card of cards) {
        holdingCards.add(card.did);
        if (withScheduling && card.odid) holdingCards.add(card.odid);
    }
    const wantedNames = new Set<string>();
    for (const deck of decks) {
        if (!holdingCards.has(deck.id)) continue;
        const levels = deck.name.split('::');
        levels.forEach((_, index) => wantedNames.add(levels.slice(0, index + 1).join('::')));
    }
    // A collection without a deck of its own under this id has nowhere else to put such a card.
    const skipsDefault = !withScheduling && hasOwnDefaultDeck;
    return new Set(decks
        .filter((deck) => wantedNames.has(deck.name) && !(skipsDefault && deck.id === ANKI_DEFAULT_DECK_ID))
        .map((deck) => deck.id));
}
