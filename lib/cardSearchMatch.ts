// Anki search terms evaluated against a card the app has already loaded.
//
// Every collection search uses this term evaluator. The SQL adapter materializes its ID set,
// so browser and filtered searches agree without SQLite ICU or platform-specific functions.

import { fsrsRetrievabilityAfterSeconds, fsrsSecondsSinceLastReview, type FsrsMemoryState } from './fsrs';
import { normalizeSearchText } from './searchText';
import { foldSearchNode, isQuotedTerm, parseSearchQuery, SearchSyntaxError, unquoteSearchValue } from './searchQuery';

/** Everything a search term may ask about one card. */
export interface CardSearchContext {
    cardId: number;
    noteId: number;
    deckName: string;
    /** Plain field text fallback for a partial card context. */
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
    /** FSRS memory state, for `prop:s`, `prop:d` and `prop:r`. */
    memoryState?: FsrsMemoryState | null;
    /** The forgetting-curve decay the card was scheduled with. */
    decay?: number;
    /** Epoch ms of the card's last review. */
    lastReviewedAtMs?: number;
    /** Anki's recorded last review time (`lrt`), in epoch seconds, which `prop:r` reads first. */
    lastReviewTimeSecs?: number;
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

/**
 * What a compiled query reads beyond a card's own scheduling columns, deck name and note type, so
 * a collection-wide scan can leave the rest unloaded (lib/collectionCardSearch.ts). Each term
 * below marks what its predicate reads; a context built without a part it did not mark must give
 * the same answer as one built with everything.
 */
export interface CardSearchNeeds {
    /** Note field contents (`fields`, `text`): plain text, `nc:`, `re:`, `w:` and `Field:` terms. */
    fields: boolean;
    /** The note's tags, for `tag:`. */
    tags: boolean;
    /** The note's edit time, for `edited:`. */
    noteEdited: boolean;
    /** The card's FSRS blob (memory state, decay, recorded review time), for `prop:s/d/r`. */
    cardData: boolean;
}

/**
 * What one term says about one card. `undefined` means the context cannot tell — a `rated:`
 * without a review-log lookup, an `added:` on a card loaded without its creation stamp — and
 * also stands for a term that narrows nothing, such as an empty or half-typed one.
 */
type Verdict = boolean | undefined;
type TermTest = (card: CardSearchContext) => Verdict;
type Predicate = (card: CardSearchContext) => boolean;

const UNKNOWN: TermTest = () => undefined;
function invalidTerm(term: string): never { throw new SearchSyntaxError(term); }

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
    return value.normalize('NFC').toLocaleLowerCase('tr');
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
/** Field contents only; metadata, deck names and tags have their own search terms. */
function fieldText(value: string, noCombining = false): string {
    let text = value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'");
    if (noCombining) text = text.normalize('NFD').replace(/\p{M}/gu, '');
    return text.replace(/[A-Z]/g, ch => ch.toLowerCase());
}
function textPredicate(term: string, noCombining = false): TermTest {
    const value = unquoteSearchValue(term);
    if (!value) throw new SearchSyntaxError('empty text term');
    const pattern = fieldText(value, noCombining);
    const regex = new RegExp(pattern.split('*').map(part => part.split('_').map(escapeRegExp).join('.')).join('.*'), 's');
    return card => (card.fields ? Object.values(card.fields) : [card.text]).some(field => regex.test(fieldText(field, noCombining)));
}

function statePredicate(state: string, options: CardMatcherOptions): TermTest | null {
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

function propPredicate(body: string, options: CardMatcherOptions, needs: CardSearchNeeds): TermTest | null {
    const match = body.match(/^(ivl|reps|lapses|ease|pos|due|s|d|r)(>=|<=|!=|=|>|<)(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;

    const [, key, op, rawValue] = match;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return null;
    if (key === 's' || key === 'd' || key === 'r') needs.cardData = true;

    switch (key) {
        // FSRS properties. Difficulty is written as a 0-1 fraction in searches but stored on the
        // 1-10 scale, and a new card has no retrievability at all. A card without a memory state
        // (null) fails them; a context loaded without memory states (undefined) cannot tell.
        case 's': {
            const compare = numericComparison(op, value);
            return (card) => (card.memoryState === undefined
                ? undefined
                : card.memoryState !== null && compare(card.memoryState.stability));
        }
        case 'd': {
            const compare = numericComparison(op, value * 9 + 1);
            return (card) => (card.memoryState === undefined
                ? undefined
                : card.memoryState !== null && compare(card.memoryState.difficulty));
        }
        case 'r': {
            // `extract_fsrs_retrievability`: seconds since the recorded review time, else back from
            // the due day by the interval, read on the card's own decay (0.5 when it has none).
            const compare = numericComparison(op, value);
            return (card) => {
                if (card.type === 0 || card.memoryState === null) return false;
                if (card.memoryState === undefined) return undefined;
                const intraday = card.queue === 1 || card.queue === 4;
                const seconds = fsrsSecondsSinceLastReview({
                    lastReviewTimeSecs: card.lastReviewTimeSecs,
                    dueDay: intraday ? null : card.due,
                    dueTimeMs: intraday ? card.due : undefined,
                    ivl: card.ivl,
                }, options.nowMs, options.today);
                return compare(fsrsRetrievabilityAfterSeconds(card.memoryState, seconds, card.decay));
            };
        }
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

/**
 * Cards added/edited in the last N days, counted from the day rollover as Anki does.
 *
 * The count is not capped — upstream's parser only lifts a zero to one — so this agrees with the
 * SQL in lib/studyRepository.ts about how far back a window reaches.
 */
function dayWindowPredicate(
    rawDays: string,
    options: CardMatcherOptions,
    read: (card: CardSearchContext) => number | undefined,
): TermTest | null {
    const days = Number(rawDays);
    if (!Number.isInteger(days) || days < 0) return null;
    const cutoff = options.dayCutoffMs - (Math.max(1, days) - 1) * DAY_MS;
    return (card) => {
        const stamp = read(card);
        return stamp === undefined ? undefined : stamp >= cutoff;
    };
}

function predicateForTerm(term: string, options: CardMatcherOptions, needs: CardSearchNeeds): TermTest {
    if (isQuotedTerm(term) && term.includes(':')) term = unquoteSearchValue(term);
    const separator = term.indexOf(':');
    if (separator <= 0) {
        needs.fields = true;
        return textPredicate(term);
    }

    const prefix = term.slice(0, separator).toLowerCase();
    const body = unquoteSearchValue(term.slice(separator + 1));

    switch (prefix) {
        case 'deck': {
            if (!body) throw new SearchSyntaxError('empty search value');
            const matches = hierarchicalMatcher(body);
            return (card) => matches(card.deckName);
        }
        case 'tag': {
            if (!body) throw new SearchSyntaxError('empty search value');
            needs.tags = true;
            if (body === 'none') return (card) => card.tags.length === 0;
            const matches = hierarchicalMatcher(body);
            return (card) => card.tags.some(matches);
        }
        case 'is':
            return statePredicate(body.toLowerCase(), options) ?? invalidTerm(term);
        case 'flag': {
            const value = Number(body);
            if (!/^\d$/.test(body) || value < 0 || value > 7) return invalidTerm(term);
            return (card) => (card.flags & 7) === value;
        }
        case 'prop':
            return propPredicate(body, options, needs) ?? invalidTerm(term);
        case 'rated': {
            const [rawDays, rawEase] = body.split(':');
            const days = Number(rawDays);
            if (!Number.isInteger(days) || days <= 0 || body.split(':').length > 2) return invalidTerm(term);
            const ease = rawEase === undefined ? null : Number(rawEase);
            if (ease !== null && (!Number.isInteger(ease) || ease < 1 || ease > 4)) return invalidTerm(term);
            const lookup = options.ratedWithin;
            if (!lookup) return UNKNOWN;
            return (card) => lookup(card.cardId, Math.floor(days), ease);
        }
        case 'introduced': {
            const days = Number(body);
            const lookup = options.introducedWithin;
            if (!Number.isInteger(days) || days <= 0) return invalidTerm(term);
            if (!lookup) return UNKNOWN;
            return (card) => lookup(card.cardId, Math.floor(days));
        }
        case 'added':
            return dayWindowPredicate(body, options, (card) => card.createdAtMs) ?? invalidTerm(term);
        case 'edited':
            needs.noteEdited = true;
            return dayWindowPredicate(body, options, (card) => card.noteEditedAtMs) ?? invalidTerm(term);
        case 'note': {
            if (!body) throw new SearchSyntaxError('empty search value');
            const matches = wildcardMatcher(body);
            return (card) => (card.noteTypeName === undefined ? undefined : matches(card.noteTypeName));
        }
        case 'card': {
            if (!body) throw new SearchSyntaxError('empty search value');
            // Anki accepts a template name or its 1-based number.
            const ordinal = Number(body);
            if (Number.isInteger(ordinal) && ordinal > 0) return (card) => card.templateOrd === ordinal - 1;
            const matches = wildcardMatcher(body);
            return (card) => (card.templateName === undefined ? undefined : matches(card.templateName));
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
            needs.fields = true;
            let regex: RegExp;
            try {
                regex = new RegExp(body, 'i');
            } catch {
                return invalidTerm(term);
            }
            return (card) => regex.test(noteText(card));
        }
        case 'w': {
            // Whole word rather than the prefix match a bare word gets.
            needs.fields = true;
            const word = normalizeSearchText(body);
            if (!word) return UNKNOWN;
            return (card) => normalizeSearchText(noteText(card))
                .split(/[^\p{L}\p{N}]+/u)
                .some((candidate) => candidate === word);
        }
        case 'nc':
            // "No combining characters": this app folds diacritics in every search already.
            needs.fields = true;
            return textPredicate(body, true);
        default: {
            // `Front:dog` searches one field by name; anything else is ordinary text, because a
            // search box should not swallow a colon the learner meant literally.
            needs.fields = true;
            const fieldKey = foldKey(term.slice(0, separator));
            const test = textPredicate(term.slice(separator + 1));
            return (card) => {
                if (!card.fields) return undefined;
                const entry = Object.entries(card.fields)
                    .find(([name]) => foldKey(name) === fieldKey);
                if (!entry) return false;
                return test({ ...card, fields: { field: entry[1] } });
            };
        }
    }
}

/**
 * Compile a search query into a predicate over loaded cards. Returns null for an empty query,
 * which callers read as "everything matches".
 *
 * A term the supplied context cannot answer — `rated:` without a review-log lookup, `note:` on a
 * context with no note type — is left undecided, and stays undecided under `-`, `and` and `or`
 * unless the rest of the query settles the card either way. Only a definite "no" removes a card.
 * The browser filters the full result set through a context that has everything; the per-page
 * pass then only has to avoid contradicting it, which a negated term would otherwise do by
 * turning "cannot tell" into "no".
 */
export function compileCardMatcher(query: string, options: CardMatcherOptions): Predicate | null {
    return compileCardSearch(query, options).matcher;
}

/** `compileCardMatcher` plus what the compiled query reads, for scans that load only that. */
export function compileCardSearch(
    query: string,
    options: CardMatcherOptions,
): { matcher: Predicate | null; needs: CardSearchNeeds } {
    const needs: CardSearchNeeds = { fields: false, tags: false, noteEdited: false, cardData: false };
    const parsed = parseSearchQuery(query);
    if (!parsed) return { matcher: null, needs };

    const test = foldSearchNode<TermTest>(parsed, {
        term: (text) => predicateForTerm(text, options, needs),
        not: (child) => (card) => {
            const verdict = child(card);
            return verdict === undefined ? undefined : !verdict;
        },
        and: (parts) => (card) => {
            let verdict: Verdict = true;
            for (const part of parts) {
                const next = part(card);
                if (next === false) return false;
                if (next === undefined) verdict = undefined;
            }
            return verdict;
        },
        or: (parts) => (card) => {
            let verdict: Verdict = false;
            for (const part of parts) {
                const next = part(card);
                if (next === true) return true;
                if (next === undefined) verdict = undefined;
            }
            return verdict;
        },
    });
    if (!test) return { matcher: null, needs };
    return { matcher: (card) => test(card) !== false, needs };
}
