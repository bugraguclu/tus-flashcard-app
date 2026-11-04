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
