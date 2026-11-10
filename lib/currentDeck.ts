import { getDbSetting, setDbSetting } from './dbSettings';

/**
 * Anki keeps the "current deck" (the deck the learner last chose to study) in the collection, so
 * Settings › General › "Add new cards to: current deck" still means that deck after the app is
 * reopened. The in-memory study scope starts empty on every launch; this row is what the editor
 * falls back to until a deck is chosen again.
 * https://docs.ankiweb.net/editing.html#adding-cards
 */
const CURRENT_DECK_KEY = 'tus_current_deck_v1';

/** Store the deck the learner chose to study. `null` (all decks) leaves the last deck in place. */
export function rememberCurrentDeck(name: string | null): void {
    const trimmed = name?.trim();
    if (!trimmed || getDbSetting(CURRENT_DECK_KEY) === trimmed) return;
    setDbSetting(CURRENT_DECK_KEY, trimmed);
}

/** The deck last chosen for study in any session, or null when none was ever chosen. */
export function rememberedCurrentDeck(): string | null {
    const name = getDbSetting(CURRENT_DECK_KEY)?.trim();
    return name ? name : null;
}

/** `name` once the deck `oldPath` (with its subtree) is called `newPath`; other names are unchanged. */
export function deckNameAfterRename(name: string, oldPath: string, newPath: string): string {
    if (name === oldPath) return newPath;
    return name.startsWith(`${oldPath}::`) ? `${newPath}${name.slice(oldPath.length)}` : name;
}

/**
 * Keep the stored current deck on the same deck when it, or a deck above it, is renamed or moved.
 * Anki stores the current deck by id, so it follows a rename by itself; this row holds the name,
 * and a name that no longer exists sent the next added card to the Default deck.
 */
export function followCurrentDeckRename(oldPath: string, newPath: string): void {
    const current = rememberedCurrentDeck();
    if (!current) return;
    const next = deckNameAfterRename(current, oldPath, newPath);
    if (next !== current) setDbSetting(CURRENT_DECK_KEY, next);
}
