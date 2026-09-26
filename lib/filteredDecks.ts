import {
    CUSTOM_STUDY_DECK_NAME,
    CUSTOM_STUDY_MAX_VALUE,
    EMPTY_CUSTOM_STUDY_DEFAULTS,
    type CustomStudyDefaults,
    type CustomStudySessionConfig,
} from './customStudy';
import { uniqueId, type Deck } from './models';
import { DEFAULT_SECOND_SEARCH_LIMIT, FILTERED_SEARCH_ORDER } from './filteredDeckOptions';
import { getDB } from './db';
import { getDeck, getDeckByName, nextSiblingSortOrderForAppend, saveDeck } from './deckStore';

/**
 * Filtered decks and the Custom Study sessions built on them: creating, rebuilding and emptying
 * them, and a card's trip into one and back home.
 */

export function createFilteredDeck(name: string, searchQuery: string, limit?: number): Deck {
    const now = uniqueId();
    const deck: Deck = {
        id: now,
        name,
        configId: 1,
        mod: Math.floor(now / 1000),
        usn: -1,
        description: 'Filtered deck',
        collapsed: false,
        isFiltered: true,
        searchQuery,
        searchLimit: limit || 100,
        // Anki's brand-new filtered deck gathers its first filter randomly (rslib
        // Deck::new_filtered), so a deck created here starts where Anki's would.
        searchOrder: FILTERED_SEARCH_ORDER.random,
        filteredAllowEmpty: false,
        filteredDeckEmpty: false,
        filteredDoneCardIds: [],
        filteredBuildAt: now,
        sortOrder: nextSiblingSortOrderForAppend(null),
    };
    saveDeck(deck);
    return deck;
}

export interface FilteredDeckOptions {
    searchQuery: string;
    searchLimit: number;
    searchOrder: number;
    searchQuery2?: string;
    searchLimit2?: number;
    searchOrder2?: number;
    reschedule: boolean;
    previewDelays?: number[];
    allowEmpty?: boolean;
}

/** Update a filtered deck's search settings (Anki's filtered-deck options dialog). */
export function updateFilteredDeck(deckId: number, options: FilteredDeckOptions): void {
    const deck = getDeck(deckId);
    if (!deck?.isFiltered) return;

    deck.searchQuery = options.searchQuery;
    deck.searchLimit = Math.max(1, Math.min(CUSTOM_STUDY_MAX_VALUE, Math.floor(options.searchLimit) || 100));
    deck.searchOrder = options.searchOrder;
    deck.searchQuery2 = options.searchQuery2?.trim() ? options.searchQuery2 : undefined;
    deck.searchLimit2 = options.searchQuery2?.trim()
        ? Math.max(1, Math.min(CUSTOM_STUDY_MAX_VALUE, Math.floor(options.searchLimit2 ?? DEFAULT_SECOND_SEARCH_LIMIT) || DEFAULT_SECOND_SEARCH_LIMIT))
        : undefined;
    deck.searchOrder2 = options.searchQuery2?.trim()
        ? (options.searchOrder2 ?? FILTERED_SEARCH_ORDER.due)
        : undefined;
    deck.reschedule = options.reschedule;
    if (options.previewDelays) {
        deck.previewDelays = options.previewDelays;
    }
    deck.filteredAllowEmpty = options.allowEmpty ?? false;
    // Saving filtered-deck options is Anki's Build/Rebuild action.
    deck.filteredDeckEmpty = false;
    deck.filteredDoneCardIds = [];
    deck.filteredBuildAt = Date.now();
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
}

/** Empty a filtered deck without deleting its saved search or the cards in their home decks. */
export function emptyFilteredDeck(deckId: number): boolean {
    const deck = getDeck(deckId);
    if (!deck?.isFiltered) return false;
    deck.filteredDeckEmpty = true;
    deck.filteredDoneCardIds = [];
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
    return true;
}

/** Rebuild a previously emptied filtered deck from its saved search. */
export function rebuildFilteredDeck(deckId: number): boolean {
    const deck = getDeck(deckId);
    if (!deck?.isFiltered) return false;
    deck.filteredDeckEmpty = false;
    deck.filteredDoneCardIds = [];
    deck.filteredBuildAt = Date.now();
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
    return true;
}

/** Retire one card from the current filtered-deck build after it has completed its steps. */
export function completeFilteredCard(deckId: number, cardId: number): boolean {
    const deck = getDeck(deckId);
    if (!deck?.isFiltered) return false;
    const completed = new Set(deck.filteredDoneCardIds ?? []);
    if (completed.has(cardId)) return false;
    completed.add(cardId);
    deck.filteredDoneCardIds = [...completed];
    deck.usn = -1;
    saveDeck(deck);
    return true;
}

/** Put a completed card back into the active filtered build when its answer is undone. */
export function restoreFilteredCard(deckId: number, cardId: number): boolean {
    const deck = getDeck(deckId);
    if (!deck?.isFiltered || !deck.filteredDoneCardIds?.includes(cardId)) return false;
    deck.filteredDoneCardIds = deck.filteredDoneCardIds.filter((id) => id !== cardId);
    deck.usn = -1;
    saveDeck(deck);
    return true;
}

/** Anki reuses one conventional deck name for every custom study session. */
export const CUSTOM_STUDY_PREFIX = CUSTOM_STUDY_DECK_NAME;

function customStudyDefaultsKey(deckId: number): string {
    return `deck_custom_study:${deckId}`;
}

/**
 * The per-deck values Anki reopens the custom study dialog with: the last limit deltas, and the
 * include/exclude tags of the last "study by card state or tag" run.
 */
export function getCustomStudyDefaults(deckId: number): CustomStudyDefaults {
    const row = getDB().getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        customStudyDefaultsKey(deckId),
    );
    if (!row?.value) return EMPTY_CUSTOM_STUDY_DEFAULTS;

    try {
        const parsed = JSON.parse(row.value) as Partial<CustomStudyDefaults>;
        const tagList = (value: unknown): string[] => (Array.isArray(value)
            ? value.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
            : []);
        return {
            extendNew: Math.trunc(Number(parsed.extendNew)) || 0,
            extendReview: Math.trunc(Number(parsed.extendReview)) || 0,
            includeTags: tagList(parsed.includeTags),
            excludeTags: tagList(parsed.excludeTags),
        };
    } catch {
        return EMPTY_CUSTOM_STUDY_DEFAULTS;
    }
}

function saveCustomStudyDefaults(deckId: number, defaults: CustomStudyDefaults): void {
    getDB().runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        customStudyDefaultsKey(deckId),
        JSON.stringify(defaults),
    );
}

/** Anki only remembers a positive delta, so the dialog never reopens asking to shrink a limit. */
export function rememberCustomStudyExtend(
    deckId: number,
    field: 'extendNew' | 'extendReview',
    delta: number,
): void {
    const value = Math.trunc(delta) || 0;
    if (value <= 0) return;
    saveCustomStudyDefaults(deckId, { ...getCustomStudyDefaults(deckId), [field]: value });
}

/** Tag choices are stored only after a session was successfully built, matching Anki. */
export function rememberCustomStudyTags(deckId: number, includeTags: string[], excludeTags: string[]): void {
    saveCustomStudyDefaults(deckId, { ...getCustomStudyDefaults(deckId), includeTags, excludeTags });
}

/**
 * Create — or rebuild — Anki's single conventional Custom Study Session. Renaming the session
 * preserves it; the next Custom Study action then creates a fresh deck with the conventional name.
 * Returns null when a regular deck already owns the reserved name, which is Anki's
 * "rename the existing deck first" case.
 */
export function createOrReplaceCustomStudySession(
    baseDeckId: number,
    config: CustomStudySessionConfig,
): Deck | null {
    const base = getDeck(baseDeckId);
    if (!base || base.isFiltered) return null;

    const name = CUSTOM_STUDY_PREFIX;
    const sanitizedLimit = Math.max(1, Math.min(CUSTOM_STUDY_MAX_VALUE, Math.floor(config.limit) || CUSTOM_STUDY_MAX_VALUE));

    const existing = getDeckByName(name);
    if (existing?.isFiltered) {
        // Anki does not merge a new custom study run into the session deck's current settings: it
        // swaps the deck's whole filtered config for the one this run built
        // (`apply_update_to_filtered_deck`). So every filtered field is written here, including the
        // ones this run has no opinion about — a second filter, a hand-edited preview delay or an
        // "allow empty" left over from the learner's own filtered-deck editing must not carry into
        // the session Custom Study just asked for.
        existing.searchQuery = config.search;
        existing.searchLimit = sanitizedLimit;
        existing.searchOrder = config.order;
        existing.searchQuery2 = undefined;
        existing.searchLimit2 = undefined;
        existing.searchOrder2 = undefined;
        existing.reschedule = config.reschedule;
        existing.previewDelays = [...config.previewDelays];
        existing.filteredAllowEmpty = false;
        existing.filteredDeckEmpty = false;
        existing.filteredDoneCardIds = [];
        existing.filteredBuildAt = Date.now();
        existing.mod = Math.floor(Date.now() / 1000);
        existing.usn = -1;
        saveDeck(existing);
        return existing;
    }

    // A regular deck using Anki's reserved conventional name must not be overwritten.
    if (existing) return null;

    const session = createFilteredDeck(name, config.search, sanitizedLimit);
    session.searchOrder = config.order;
    session.reschedule = config.reschedule;
    session.previewDelays = [...config.previewDelays];
    session.filteredAllowEmpty = false;
    session.filteredDeckEmpty = false;
    session.filteredDoneCardIds = [];
    session.filteredBuildAt = Date.now();
    saveDeck(session);
    return session;
}
