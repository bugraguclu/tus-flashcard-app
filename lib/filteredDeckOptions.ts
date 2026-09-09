import { escapeSearchValue, tokenizeSearch, unquoteSearchValue } from './searchQuery';

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
 * Card limits a new filtered deck starts with.
 *
 * `Deck::new_filtered` seeds two search terms: the first gathers 100 cards in Random order, the
 * second only 20 in Due order. The asymmetry is deliberate upstream — the second filter is meant
 * as a small top-up — so both numbers are matched rather than rounded to one value.
 * https://github.com/ankitects/anki/blob/main/rslib/src/decks/filtered.rs
 */
export const DEFAULT_SEARCH_LIMIT = 100;
export const DEFAULT_SECOND_SEARCH_LIMIT = 20;

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
 * The deck filter of a filtered deck's search, read and written through one tokenizer.
 *
 * Both functions below work on the same token, found the same way, so they can never disagree
 * about which deck a saved search is scoped to. The search key is Anki's own `deck:` term; its
 * value is escaped and unescaped by lib/searchQuery.ts, which carries the source for the rules.
 */
const DECK_TERM_PREFIX = 'deck:';

/** Where a token sits in the query, so an edit can put every untouched character back as it was. */
interface SearchTermSpan {
    text: string;
    start: number;
    end: number;
}

/**
 * The query's tokens with their offsets. The tokenizer is the one the rest of the app searches
 * with, so a `deck:` that is only text inside a quoted phrase, or one that belongs to a negated
 * `-deck:`, is never mistaken for the filter's scope. Each token is located from the end of the
 * previous one, which is where the tokenizer matched it.
 */
function searchTermSpans(searchQuery: string): SearchTermSpan[] {
    const spans: SearchTermSpan[] = [];
    let cursor = 0;
    for (const text of tokenizeSearch(searchQuery)) {
        const start = searchQuery.indexOf(text, cursor);
        if (start < 0) continue;
        spans.push({ text, start, end: start + text.length });
        cursor = start + text.length;
    }
    return spans;
}

/** A positive `deck:` term. `-deck:X` excludes a deck rather than scoping the search to one. */
function isPositiveDeckTerm(text: string): boolean {
    return text.toLowerCase().startsWith(DECK_TERM_PREFIX);
}

function deckNameFromTerm(text: string): string {
    return unquoteSearchValue(text.slice(DECK_TERM_PREFIX.length));
}

/**
 * The single term both functions act on: the first positive `deck:` term that names a deck.
 *
 * A `deck:` with no value filters nothing — our own SQL and Anki alike ignore it — so it is not
 * read as a scope, and the UI is right to call such a query "all decks". It is still the term an
 * edit lands on, so setting a deck repairs the malformed term instead of leaving a second one
 * behind, and clearing removes it.
 */
function findDeckTerm(spans: SearchTermSpan[]): SearchTermSpan | null {
    let valueless: SearchTermSpan | null = null;
    for (const span of spans) {
        if (!isPositiveDeckTerm(span.text)) continue;
        if (deckNameFromTerm(span.text)) return span;
        if (!valueless) valueless = span;
    }
    return valueless;
}

/** The keywords that join terms. A quoted `"or"` is text, exactly as the parser reads it. */
function isBooleanKeyword(text: string): boolean {
    const keyword = text.toLowerCase();
    return keyword === 'and' || keyword === 'or';
}

/**
 * The slice to cut when the deck term is dropped: the term, one adjacent separator, a boolean
 * keyword the term would otherwise strand, and the parentheses of a group the term was alone in.
 * What survives is still a query Anki can parse, and its spacing is the author's own.
 */
function removalRange(searchQuery: string, spans: SearchTermSpan[], index: number): [number, number] {
    const term = spans[index];
    const previous = spans[index - 1];
    const next = spans[index + 1];
    let start = term.start;
    let end = term.end;

    if (previous && (previous.text === '(' || previous.text === '-(') && next?.text === ')') {
        start = previous.start;
        end = next.end;
    } else if (next && isBooleanKeyword(next.text)) {
        end = next.end;
    } else if (previous && isBooleanKeyword(previous.text)) {
        start = previous.start;
    }

    // One separator leaves with the term, so the terms that remain stay separated exactly once.
    const before = /\s+$/.exec(searchQuery.slice(0, start));
    if (before) return [start - before[0].length, end];
    const after = /^\s+/.exec(searchQuery.slice(end));
    return [start, after ? end + after[0].length : end];
}

/**
 * Extracts the deck name from an Anki search query term `deck:"..."` or `deck:...`.
 * Returns the deck name with its quoting and escaping undone, or null when the query scopes no
 * single deck — no positive `deck:` term, or one with no value.
 */
export function extractDeckNameFromSearch(searchQuery: string): string | null {
    const term = findDeckTerm(searchTermSpans(searchQuery));
    return term ? deckNameFromTerm(term.text) || null : null;
}

/**
 * Sets, replaces or removes the deck filter in an Anki search query.
 *
 * A non-empty name replaces the deck term in place, or is prepended when the query has none; null
 * (or an empty name) removes it. The edit is a splice around one token, so the rest of the query —
 * the author's spacing, tabs and newlines included — comes back character for character, and
 * setting a name then reading it back returns exactly that name.
 */
export function replaceDeckNameInSearch(searchQuery: string, newDeckName: string | null): string {
    const deckTerm = newDeckName && newDeckName.trim()
        ? `${DECK_TERM_PREFIX}${escapeSearchValue(newDeckName)}`
        : null;
    const spans = searchTermSpans(searchQuery);
    const existing = findDeckTerm(spans);

    if (existing) {
        if (deckTerm) {
            return `${searchQuery.slice(0, existing.start)}${deckTerm}${searchQuery.slice(existing.end)}`;
        }
        const [start, end] = removalRange(searchQuery, spans, spans.indexOf(existing));
        return `${searchQuery.slice(0, start)}${searchQuery.slice(end)}`;
    }

    if (!deckTerm) return searchQuery;
    const first = spans[0];
    return first ? `${deckTerm} ${searchQuery.slice(first.start)}` : deckTerm;
}
