// Anki search terms evaluated against a card the app has already loaded.
//
// The card browser searches over rendered text with Turkish/ASCII folding (lib/searchText), which
// SQL LIKE cannot reproduce, so the browser evaluates the whole query in JS instead of translating
// it. The grammar is shared with the filtered-deck builder (lib/searchQuery.ts); only the term
// evaluation lives here.

import { matchesSearch, normalizeSearchText } from './searchText';
import { foldSearchNode, isQuotedTerm, parseSearchQuery, unquoteSearchValue } from './searchQuery';

/** Everything a search term may ask about one card. */
export interface CardSearchContext {
    cardId: number;
    noteId: number;
    deckName: string;
    /** Rendered question/answer plus topic — what a bare search word matches. */
    text: string;
    tags: string[];
    templateOrd: number;
    queue: number;
    type: number;
    due: number;
    ivl: number;
    factor: number;
    reps: number;
    lapses: number;
    flags: number;
    /** Note fields by name, for `Front:dog` and `re:` searches. */
    fields?: Record<string, string>;
    noteTypeName?: string;
    templateName?: string;
    /** Epoch ms the card was added, for `added:N`. */
    createdAtMs?: number;
    /** Epoch ms the note was last edited, for `edited:N`. */
    noteEditedAtMs?: number;
}

export interface CardMatcherOptions {
    /** Today's study day number, for `is:due` and `prop:due`. */
    today: number;
    nowMs: number;
    /** Anki's learn-ahead limit, which decides whether a waiting learning card counts as due. */
    learnAheadMinutes: number;
    /** Start of today's study day in epoch ms, for the day-window terms. */
    dayCutoffMs: number;
    /** Answered within N days (optionally with a given ease) — needs the review log. */
    ratedWithin?: (cardId: number, days: number, ease: number | null) => boolean;
    /** First answered within N days — needs the review log. */
    introducedWithin?: (cardId: number, days: number) => boolean;
}

type Predicate = (card: CardSearchContext) => boolean;

/** A term the current context cannot answer never removes a card: the authority is elsewhere. */
const ALWAYS: Predicate = () => true;

const DAY_MS = 86_400_000;

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Comparison key for names and field values. The same folding the rest of the app searches with
 * (lib/searchText) is used on both sides, so `deck:cografya` finds "Coğrafya" and a field search
 * is not defeated by markup or by an ASCII keyboard.
 */
function foldKey(value: string): string {
    return normalizeSearchText(value);
}

/** Anki's `*` wildcard, compiled once per term. Without a `*` the comparison is a plain equality. */
function wildcardMatcher(pattern: string): (value: string) => boolean {
    const folded = foldKey(pattern);
    if (!folded.includes('*')) return (value) => foldKey(value) === folded;
    const regex = new RegExp(`^${folded.split('*').map(escapeRegExp).join('.*')}$`);
    return (value) => regex.test(foldKey(value));
}

/** `deck:X` and `tag:X` both match the name itself and everything nested under it. */
function hierarchicalMatcher(pattern: string): (value: string) => boolean {
    const matches = wildcardMatcher(pattern);
    const prefix = `${foldKey(pattern)}::`;
    return (value) => matches(value) || foldKey(value).startsWith(prefix);
}

function numericComparison(op: string, value: number): (candidate: number) => boolean {
    switch (op) {
        case '>=': return (candidate) => candidate >= value;
        case '<=': return (candidate) => candidate <= value;
        case '!=': return (candidate) => candidate !== value;
        case '>': return (candidate) => candidate > value;
        case '<': return (candidate) => candidate < value;
        default: return (candidate) => candidate === value;
    }
}

function idList(value: string): Set<number> {
    return new Set(value.split(',').map((entry) => Number(entry.trim())).filter(Number.isFinite));
}

function noteText(card: CardSearchContext): string {
    return card.fields ? Object.values(card.fields).join(' ') : card.text;
}

/**
 * Everything a bare word searches: the rendered card, its tags and its deck. Anki's browser also
 * searches collection metadata, and the app's existing search box has always included these.
 */
function searchableText(card: CardSearchContext): string {
    return `${card.text} ${card.tags.join(' ')} ${card.deckName}`;
}

function textPredicate(term: string): Predicate {
    const value = unquoteSearchValue(term);
    if (!value) return ALWAYS;

    // A quoted phrase is matched as a phrase; bare words keep the app's per-word prefix search,
    // which behaves like Anki's implicit `word*`.
    if (isQuotedTerm(term) && /\s/.test(value)) {
        const phrase = normalizeSearchText(value);
        return (card) => normalizeSearchText(searchableText(card)).includes(phrase);
    }
    return (card) => matchesSearch(searchableText(card), value);
}

function statePredicate(state: string, options: CardMatcherOptions): Predicate | null {
    switch (state) {
        // new/learn/review/relearn read the card's type, so a suspended or buried card still
        // reports the state it is in; only the queue-based states read the queue.
        case 'new': return (card) => card.type === 0;
        case 'learn': return (card) => card.type === 1 || card.type === 3;
        case 'review': return (card) => card.type === 2 || card.type === 3;
        case 'relearn': return (card) => card.type === 3;
        case 'suspended': return (card) => card.queue === -1;
        case 'buried': return (card) => card.queue === -2 || card.queue === -3;
        case 'buried-sibling': return (card) => card.queue === -2;
        case 'buried-manually': return (card) => card.queue === -3;
        case 'due': {
            const learnAheadCutoff = options.nowMs + options.learnAheadMinutes * 60_000;
            return (card) => (
                ((card.queue === 2 || card.queue === 3) && card.due <= options.today)
                || (card.queue === 1 && card.due <= learnAheadCutoff)
            );
        }
        default: return null;
    }
}

function propPredicate(body: string, options: CardMatcherOptions): Predicate | null {
    const match = body.match(/^(ivl|reps|lapses|ease|pos|due)(>=|<=|!=|=|>|<)(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;

    const [, key, op, rawValue] = match;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return null;

    switch (key) {
        case 'due': {
            const compare = numericComparison(op, Math.trunc(value));
            return (card) => (card.queue === 2 || card.queue === 3) && compare(card.due - options.today);
        }
        case 'ease': {
            // "prop:ease=2.5" is stored as factor 2500 — Anki multiplies by 1000.
            const compare = numericComparison(op, Math.round(value * 1000));
            return (card) => compare(card.factor);
        }
        case 'pos': {
            // Only new cards carry a position; for them `due` *is* the queue position.
            const compare = numericComparison(op, Math.trunc(value));
            return (card) => card.type === 0 && compare(card.due);
        }
        default: {
            const compare = numericComparison(op, Math.trunc(value));
            const read = { ivl: 'ivl', reps: 'reps', lapses: 'lapses' }[key] as 'ivl' | 'reps' | 'lapses';
            return (card) => compare(card[read]);
        }
    }
}

/** Cards added/edited in the last N days, counted from the day rollover as Anki does. */
function dayWindowPredicate(
    rawDays: string,
    options: CardMatcherOptions,
    read: (card: CardSearchContext) => number | undefined,
): Predicate | null {
    const days = Number(rawDays);
    if (!Number.isFinite(days) || days <= 0) return null;
    const cutoff = options.dayCutoffMs - (Math.min(365, Math.floor(days)) - 1) * DAY_MS;
    return (card) => {
        const stamp = read(card);
        return stamp === undefined ? true : stamp >= cutoff;
    };
}

function predicateForTerm(term: string, options: CardMatcherOptions): Predicate {
    const separator = term.indexOf(':');
    if (separator <= 0 || isQuotedTerm(term)) return textPredicate(term);

    const prefix = term.slice(0, separator).toLowerCase();
    const body = unquoteSearchValue(term.slice(separator + 1));

    switch (prefix) {
        case 'deck': {
            if (!body) return ALWAYS;
            const matches = hierarchicalMatcher(body);
            return (card) => matches(card.deckName);
        }
        case 'tag': {
            if (!body) return ALWAYS;
            if (body === 'none') return (card) => card.tags.length === 0;
            const matches = hierarchicalMatcher(body);
            return (card) => card.tags.some(matches);
        }
        case 'is':
            return statePredicate(body.toLowerCase(), options) ?? ALWAYS;
        case 'flag': {
            const value = Number(body);
            if (!Number.isInteger(value) || value < 0 || value > 7) return ALWAYS;
            return (card) => (card.flags & 7) === value;
        }
        case 'prop':
            return propPredicate(body, options) ?? ALWAYS;
        case 'rated': {
            const [rawDays, rawEase] = body.split(':');
            const days = Number(rawDays);
            if (!Number.isFinite(days) || days <= 0) return ALWAYS;
            const ease = rawEase === undefined ? null : Number(rawEase);
            const lookup = options.ratedWithin;
            if (!lookup) return ALWAYS;
            return (card) => lookup(card.cardId, Math.min(365, Math.floor(days)), ease);
        }
        case 'introduced': {
            const days = Number(body);
            const lookup = options.introducedWithin;
            if (!lookup || !Number.isFinite(days) || days <= 0) return ALWAYS;
            return (card) => lookup(card.cardId, Math.min(365, Math.floor(days)));
        }
        case 'added':
            return dayWindowPredicate(body, options, (card) => card.createdAtMs) ?? ALWAYS;
        case 'edited':
            return dayWindowPredicate(body, options, (card) => card.noteEditedAtMs) ?? ALWAYS;
        case 'note': {
            if (!body) return ALWAYS;
            const matches = wildcardMatcher(body);
            return (card) => (card.noteTypeName === undefined ? true : matches(card.noteTypeName));
        }
        case 'card': {
            if (!body) return ALWAYS;
            // Anki accepts a template name or its 1-based number.
            const ordinal = Number(body);
            if (Number.isInteger(ordinal) && ordinal > 0) return (card) => card.templateOrd === ordinal - 1;
            const matches = wildcardMatcher(body);
            return (card) => (card.templateName === undefined ? true : matches(card.templateName));
        }
        case 'nid': {
            const ids = idList(body);
            return (card) => ids.has(card.noteId);
        }
        case 'cid': {
            const ids = idList(body);
            return (card) => ids.has(card.cardId);
        }
        case 're': {
            let regex: RegExp;
            try {
                regex = new RegExp(body, 'i');
            } catch {
                return ALWAYS; // A half-typed pattern narrows nothing instead of throwing.
            }
            return (card) => regex.test(noteText(card));
        }
        case 'w': {
            // Whole word rather than the prefix match a bare word gets.
            const word = normalizeSearchText(body);
            if (!word) return ALWAYS;
            return (card) => normalizeSearchText(searchableText(card))
                .split(/[^\p{L}\p{N}]+/u)
                .some((candidate) => candidate === word);
        }
        case 'nc':
            // "No combining characters": this app folds diacritics in every search already.
            return textPredicate(body);
        default: {
            // `Front:dog` searches one field by name; anything else is ordinary text, because a
            // search box should not swallow a colon the learner meant literally.
            const fieldKey = foldKey(term.slice(0, separator));
            const matches = wildcardMatcher(body);
            return (card) => {
                if (!card.fields) return true;
                const entry = Object.entries(card.fields)
                    .find(([name]) => foldKey(name) === fieldKey);
                if (!entry) return matchesSearch(searchableText(card), unquoteSearchValue(term));
                return matches(entry[1]);
            };
        }
    }
}

/**
 * Compile a search query into a predicate over loaded cards. Returns null for an empty query,
 * which callers read as "everything matches".
 *
 * A term the supplied context cannot answer — `rated:` without a review-log lookup, `note:` on a
 * context with no note type — is treated as satisfied rather than failed. The browser filters the
 * full result set through a context that has everything; the per-page pass then only has to avoid
 * contradicting it.
 */
export function compileCardMatcher(query: string, options: CardMatcherOptions): Predicate | null {
    const parsed = parseSearchQuery(query);
    if (!parsed) return null;

    return foldSearchNode<Predicate>(parsed, {
        term: (text) => predicateForTerm(text, options),
        not: (child) => (card) => !child(card),
        and: (parts) => (card) => parts.every((part) => part(card)),
        or: (parts) => (card) => parts.some((part) => part(card)),
    });
}
