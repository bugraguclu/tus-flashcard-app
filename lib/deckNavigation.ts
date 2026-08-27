/** Top-level deck that owns a selected Anki deck path. */
export function getRootDeckName(deckName: string | null | undefined): string | null {
    if (!deckName) return null;
    return deckName.split('::')[0] || null;
}

/** Every visible ancestor from the root through the selected deck. */
export function getDeckPathNames(deckName: string | null | undefined): string[] {
    if (!deckName) return [];

    const parts = deckName.split('::').filter(Boolean);
    return parts.map((_, index) => parts.slice(0, index + 1).join('::'));
}

/** Keep the internal Anki hierarchy delimiter out of user-entered deck labels. */
export function normalizeDeckLeafInput(value: string): string {
    return value
        .split(/:{2,}/)
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join(' - ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Browser inherits the exact deck/subdeck the learner is currently studying. */
export function getScopedBrowserPath(deckName: string | null | undefined): string {
    return deckName ? `/browser?deck=${encodeURIComponent(deckName)}` : '/browser';
}
