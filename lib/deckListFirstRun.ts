import type { Deck } from './models';
import type { DeckTreeNode } from './deckTree';
import { isCatalogDeck } from './catalogProtection';
import { getDbSetting, setDbSetting } from './dbSettings';

/** The deck every collection starts with: Anki's Default deck, named Varsayılan here. */
export const DEFAULT_DECK_ID = 1;

/** Set once the learner leaves the welcome page; it then never comes back on this device. */
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
 * The welcome page comes up once, before the deck list, on a collection with nothing in it yet:
 * no notes of the learner's own and no TUS pack. Someone who already studies here, or who has seen
 * the page (or closed the deck list's old welcome card, which used the same key), never meets it.
 */
export function shouldShowWelcomePage(collectionHasNotes: boolean, dismissed: boolean): boolean {
    return !collectionHasNotes && !dismissed;
}

export function isWelcomeDismissed(): boolean {
    return getDbSetting(FIRST_RUN_DISMISSED_KEY) === 'true';
}

export function dismissWelcome(): void {
    setDbSetting(FIRST_RUN_DISMISSED_KEY, 'true');
}

let pendingWelcomeRoute: string | null = null;

/**
 * The screen picked on the welcome page. The deck list opens it once it has mounted, so it lands
 * over the deck list (Back returns there) and never races the navigator's own first state.
 */
export function setPendingWelcomeRoute(route: string | null): void {
    pendingWelcomeRoute = route;
}

export function takePendingWelcomeRoute(): string | null {
    const route = pendingWelcomeRoute;
    pendingWelcomeRoute = null;
    return route;
}
