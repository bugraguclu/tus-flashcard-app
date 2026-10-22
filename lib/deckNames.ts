/** Deck paths are normalized component by component. Never merge existing case-colliding trees
 * implicitly: callers address an existing tree by id and use its exact stored path for scope.
 * https://docs.ankiweb.net/getting-started.html#decks
 */
export function normalizeDeckName(name: string): string {
    return name.normalize('NFC').split('::').map(part => part.trim() || 'blank').join('::');
}
export function deckNameKey(name: string): string { return normalizeDeckName(name).toLowerCase(); }
