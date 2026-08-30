/**
 * Filtered-deck gather order.
 *
 * The stored numbers are Anki's own `Deck.Filtered.SearchTerm.Order` ordinals, so a filtered deck
 * imported from an .apkg keeps the order its author chose, and one built here means the same thing
 * to Anki. Anki's picker lists the orders in ordinal sequence, which is why the UI list below is
 * simply the supported ordinals in order.
 */
export const FILTERED_SEARCH_ORDER = {
    oldestReviewedFirst: 0,
    random: 1,
    intervalsAscending: 2,
    intervalsDescending: 3,
    lapses: 4,
    added: 5,
    due: 6,
    reverseAdded: 7,
    retrievabilityAscending: 8,
    retrievabilityDescending: 9,
    relativeOverdueness: 10,
} as const;

export const FILTERED_DECK_ORDER_UI = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * Collections written before the ordinals were aligned with Anki stored a local numbering in
 * which 0 meant "order due" and 4 meant "order added". Schema migration 10 rewrites saved
 * filtered decks through this table; it must not be reused for anything else.
 */
export const LEGACY_FILTERED_ORDER_TO_ANKI: Record<number, number> = {
    0: FILTERED_SEARCH_ORDER.due,
    1: FILTERED_SEARCH_ORDER.random,
    2: FILTERED_SEARCH_ORDER.intervalsAscending,
    3: FILTERED_SEARCH_ORDER.intervalsDescending,
    4: FILTERED_SEARCH_ORDER.added,
    5: FILTERED_SEARCH_ORDER.reverseAdded,
    6: FILTERED_SEARCH_ORDER.lapses,
    7: FILTERED_SEARCH_ORDER.oldestReviewedFirst,
    8: FILTERED_SEARCH_ORDER.retrievabilityAscending,
    9: FILTERED_SEARCH_ORDER.retrievabilityDescending,
};

/** Map one stored legacy ordinal onto Anki's, leaving unknown values on Anki's default order. */
export function ankiFilteredOrderFromLegacy(order: unknown): number {
    const parsed = Number(order);
    if (!Number.isInteger(parsed)) return FILTERED_SEARCH_ORDER.due;
    return LEGACY_FILTERED_ORDER_TO_ANKI[parsed] ?? FILTERED_SEARCH_ORDER.due;
}
