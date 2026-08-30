import { getDeckDisplayName, getParentDeckName, type Deck } from './models';

export type DeckOptionsScope = {
    deck: Deck;
    depth: number;
    displayName: string;
    pathLabel: string;
};

function compareSiblings(a: Deck, b: Deck): number {
    const aOrder = Number.isFinite(a.sortOrder) ? a.sortOrder! : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.sortOrder) ? b.sortOrder! : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
}

/**
 * Build the local deck scope picker used by Deck Options.
 *
 * Presets may be shared by many decks, so they are deliberately not used as picker rows. Each
 * normal deck remains selectable, including a subdeck that currently shares its parent's preset.
 */
export function getDeckOptionsScopes(decks: Deck[]): DeckOptionsScope[] {
    const normalDecks = decks.filter((deck) => !deck.isFiltered);
    const byParent = new Map<string | null, Deck[]>();
    const names = new Set(normalDecks.map((deck) => deck.name));

    for (const deck of normalDecks) {
        const storedParent = getParentDeckName(deck.name);
        const parent = storedParent && names.has(storedParent) ? storedParent : null;
        const siblings = byParent.get(parent) ?? [];
        siblings.push(deck);
        byParent.set(parent, siblings);
    }
    for (const siblings of byParent.values()) siblings.sort(compareSiblings);

    const scopes: DeckOptionsScope[] = [];
    const append = (parent: string | null, depth: number) => {
        for (const deck of byParent.get(parent) ?? []) {
            scopes.push({
                deck,
                depth,
                displayName: getDeckDisplayName(deck.name),
                pathLabel: deck.name.replaceAll('::', ' › '),
            });
            append(deck.name, depth + 1);
        }
    };
    append(null, 0);
    return scopes;
}
