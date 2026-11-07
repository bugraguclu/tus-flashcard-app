import type { Deck } from './models';
import type { DeckTreeNode } from './deckTree';
import { isCatalogDeck } from './catalogProtection';
import { getDbSetting, setDbSetting } from './dbSettings';

/** The deck every collection starts with: Anki's Default deck, named Varsayılan here. */
export const DEFAULT_DECK_ID = 1;

/** Set once the learner closes the deck list's welcome card; it then stays closed on this device. */
export const FIRST_RUN_DISMISSED_KEY = 'help_first_run_dismissed_v1';

/**
 * The deck list leaves out the Default deck once it holds no cards and other decks exist, as
 * Anki's does: "Anki will hide the default deck if it contains no cards and you have added other
 * decks" (https://docs.ankiweb.net/getting-started.html#decks). Subdecks live under it, so a
 * Default deck that has any stays. Only the deck list hides it; deck pickers still offer it.
 */
export function withoutEmptyDefaultDeck(tree: DeckTreeNode[]): DeckTreeNode[] {
    if (tree.length < 2) return tree;
    const index = tree.findIndex((node) => node.deck.id === DEFAULT_DECK_ID);
    if (index < 0) return tree;
    const node = tree[index];
    if (node.totalCards > 0 || node.children.length > 0) return tree;
    return [...tree.slice(0, index), ...tree.slice(index + 1)];
}

/** Cards the learner brought in or wrote: every card outside the TUS pack's decks. */
export function countOwnCards(
    decks: readonly Deck[],
    counts: ReadonlyMap<number, { total: number }>,
): number {
    let total = 0;
    for (const deck of decks) {
        if (isCatalogDeck(deck)) continue;
        total += counts.get(deck.id)?.total ?? 0;
    }
    return total;
}

/**
 * The welcome card shows until the learner has a card of their own or closes it. The TUS pack
 * alone does not end it: the card then still offers writing a card and importing a deck.
 */
export function shouldShowFirstRunCard(ownCardCount: number, dismissed: boolean): boolean {
    return ownCardCount === 0 && !dismissed;
}

export function isFirstRunCardDismissed(): boolean {
    return getDbSetting(FIRST_RUN_DISMISSED_KEY) === 'true';
}

export function dismissFirstRunCard(): void {
    setDbSetting(FIRST_RUN_DISMISSED_KEY, 'true');
}
