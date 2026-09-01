import { tokenizeSearch, unquoteSearchValue } from './searchQuery';

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

export const FILTERED_DECK_ORDER_UI = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Preview delays in seconds for a filtered deck whose rescheduling is turned off.
 *
 * Anki stores exactly three of them — `preview_again_secs`, `preview_hard_secs` and
 * `preview_good_secs` on `Deck.Filtered` — and defaults them to 60, 600 and 0. Easy has no stored
 * delay: `preview_filter.rs` answers it with a hard-coded zero, and a zero delay means the card
 * leaves the preview session instead of coming back. The manual states the same rule: Again, Hard
 * and Good have configurable delays, while Easy removes the card from the filtered deck.
 */
export const DEFAULT_PREVIEW_DELAYS: readonly [number, number, number] = [60, 600, 0] as const;

/** Ordinals into a preview delays array, matching Anki's answer buttons. */
export const PREVIEW_DELAY_ORDINAL = { again: 0, hard: 1, good: 2 } as const;

/**
 * Parses stored data or user input into the three preview delays in seconds.
 *
 * Accepts a whitespace/comma separated string or a number array. A fourth value is tolerated and
 * dropped so that decks written before Easy was made non-configurable still load.
 */
export function parsePreviewDelays(input: string | number[] | undefined | null): [number, number, number] {
    const clamp = (value: unknown, fallback: number): number => {
        const parsed = Math.floor(Number(value));
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    };
    if (Array.isArray(input)) {
        return [
            clamp(input[0], DEFAULT_PREVIEW_DELAYS[0]),
            clamp(input[1], DEFAULT_PREVIEW_DELAYS[1]),
            clamp(input[2], DEFAULT_PREVIEW_DELAYS[2]),
        ];
    }
    if (typeof input === 'string') {
        const tokens = input.trim().split(/[\s,]+/).filter(Boolean);
        if (tokens.length === 0) return [...DEFAULT_PREVIEW_DELAYS];
        return [
            clamp(tokens[0], DEFAULT_PREVIEW_DELAYS[0]),
            clamp(tokens[1], DEFAULT_PREVIEW_DELAYS[1]),
            clamp(tokens[2], DEFAULT_PREVIEW_DELAYS[2]),
        ];
    }
    return [...DEFAULT_PREVIEW_DELAYS];
}

/** Formats preview delays as the space-separated seconds string the options form edits. */
export function formatPreviewDelays(delays: number[] | undefined | null): string {
    return parsePreviewDelays(delays).join(' ');
}

/**
 * Seconds to wait before a previewed card returns, for one of the reviewer's 1-4 grades.
 *
 * Easy is always zero because Anki retires the card on Easy no matter how the deck is configured.
 * A zero from any button carries the same meaning: the card leaves the preview session.
 */
export function previewDelaySecondsForGrade(delays: number[] | undefined | null, grade: number): number {
    if (grade === 4) return 0;
    const parsed = parsePreviewDelays(delays);
    return parsed[grade - 1] ?? 0;
}

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

/**
 * Extracts the deck name from an Anki search query term `deck:"..."` or `deck:...`.
 * Returns the unquoted deck name, or null if no positive deck term is found.
 */
export function extractDeckNameFromSearch(searchQuery: string): string | null {
    const tokens = tokenizeSearch(searchQuery);
    for (const token of tokens) {
        if (token.toLowerCase().startsWith('deck:')) {
            const rawValue = token.slice(5);
            return unquoteSearchValue(rawValue);
        }
    }
    return null;
}

/**
 * Replaces or sets the deck filter in an Anki search query.
 * If newDeckName is a non-empty string, replaces any existing positive `deck:...` term or prepends it.
 * If newDeckName is null or empty, removes the positive `deck:...` term.
 */
export function replaceDeckNameInSearch(searchQuery: string, newDeckName: string | null): string {
    const trimmed = searchQuery.trim();
    const formattedDeckTerm = newDeckName?.trim()
        ? (newDeckName.includes(' ') || newDeckName.includes('"') || newDeckName.includes(':')
            ? `deck:"${newDeckName.replace(/"/g, '')}"`
            : `deck:${newDeckName}`)
        : null;

    // Pattern for matching positive deck term: deck:"..." or deck:...
    const deckRegex = /(?:^|\s)deck:(?:"[^"]*"|[^\s()]+)/i;

    if (formattedDeckTerm) {
        if (deckRegex.test(trimmed)) {
            return trimmed.replace(deckRegex, (match) => {
                const leadingSpace = match.startsWith(' ') ? ' ' : '';
                return `${leadingSpace}${formattedDeckTerm}`;
            }).trim();
        }
        return trimmed ? `${formattedDeckTerm} ${trimmed}` : formattedDeckTerm;
    }

    // Clearing deck filter (newDeckName === null)
    if (deckRegex.test(trimmed)) {
        return trimmed.replace(deckRegex, '').replace(/\s+/g, ' ').trim();
    }
    return trimmed;
}
