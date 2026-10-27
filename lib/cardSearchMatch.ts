// Anki search terms evaluated against a card the app has already loaded.
//
// Every collection search uses this term evaluator. The SQL adapter materializes its ID set,
// so browser and filtered searches agree without SQLite ICU or platform-specific functions.
// Behaviour reference: https://docs.ankiweb.net/searching.html; pinned by lib/searchSyntax.test.ts.

import { fsrsRetrievabilityAfterSeconds, fsrsSecondsSinceLastReview, type FsrsMemoryState } from './fsrs';
import { foldSearchNode, parseSearchQuery, SearchSyntaxError } from './searchQuery';
import {
    firstUnescapedColon, globMatcher, hierarchicalGlobMatcher, searchRegex, stripHtmlForSearch,
    stripSearchQuotes, unescapeSearchText, withoutClozeMarkup, wordMatcher,
} from './searchGlob';

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
    /** The note's raw field values in order, which plain text, `dupe:` and the sort field read. */
    fieldList?: string[];
    /** Index of the note type's sort field in `fieldList`. */
    sortFieldIndex?: number;
    noteTypeId?: number;
    noteTypeName?: string;
    templateName?: string;
    /** The card's deck id, and for a card physically in a filtered deck its home deck. */
    deckId?: number;
    homeDeckId?: number;
    homeDeckName?: string;
    /** Filtered decks the card is a member of (virtual membership or physical placement). */
    filteredDeckNames?: string[];
    /** The options preset of the card's (home) deck, for `preset:`. */
    presetName?: string;
    /** Anki's custom scheduling data (`cd` in the card's data blob), for `has-cd:` and `prop:cd*`. */
    customData?: Record<string, unknown> | null;
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

/** Which review-log rows a lookup reads: real answers, or manual reschedules. */
export type RevlogLookupKind = 'rated' | 'resched';

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
    /**
     * The study days (0 today, -1 yesterday, …) on which the card was answered or manually
     * rescheduled, for `prop:rated`, `prop:resched` and `resched:`.
     */
    revlogDayOffsets?: (cardId: number, kind: RevlogLookupKind) => readonly number[];
    /** The deck `deck:current` means; null or absent reads as the whole collection. */
    currentDeckName?: string | null;
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
    /** The card's data blob (memory state, decay, review time, custom data), for `prop:s/d/r/cd*`. */
    cardData: boolean;
    /** Filtered-deck membership, home decks and presets, for `deck:` and `preset:`. */
    decks?: boolean;
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

function idList(term: string, value: string): Set<number> {
    const entries = value.split(',').map((entry) => entry.trim());
    if (!entries.every((entry) => /^\d+$/.test(entry))) return invalidTerm(term);
    return new Set(entries.map(Number));
}

/** The note's raw fields, in order. */
function rawFields(card: CardSearchContext): string[] {
    if (card.fieldList) return card.fieldList;
    return card.fields ? Object.values(card.fields) : [card.text];
}

/**
 * What a plain-text term reads, as Anki's `n.sfld like … or n.flds like …`: every field's raw
 * content joined by Anki's field separator, so formatting is searched as written (`&amp;`, not
 * `&`), plus the sort field with its formatting removed, so a word formatted mid-way through is
 * still found there.
 */
function plainTextViews(card: CardSearchContext): string[] {
    const fields = rawFields(card);
    const sort = card.fieldList ? card.fieldList[card.sortFieldIndex ?? 0] : undefined;
    return sort === undefined ? [fields.join('\x1f')] : [fields.join('\x1f'), stripHtmlForSearch(sort)];
}

function textPredicate(rawValue: string, view: 'plain' | 'nc' | 'sc' = 'plain'): TermTest {
    const value = stripSearchQuotes(rawValue);
    if (!value) throw new SearchSyntaxError('empty text term');
    const matches = globMatcher(value, { anchored: false, noCombining: view === 'nc' });
    if (view === 'sc') {
        return (card) => {
            const fields = rawFields(card).map(withoutClozeMarkup);
            return matches(fields.join('\x1f')) || fields.some((field) => matches(stripHtmlForSearch(field)));
        };
    }
    return (card) => plainTextViews(card).some(matches);
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

/** `prop:cdn:key>5` and `prop:cds:key=text`: Anki's custom scheduling data. */
function customDataPredicate(body: string, needs: CardSearchNeeds): TermTest | null {
    const numeric = body.match(/^cdn:([\w-]+)(>=|<=|!=|=|>|<)(-?\d+(?:\.\d+)?)$/i);
    if (numeric) {
        needs.cardData = true;
        const [, key, op, raw] = numeric;
        const compare = numericComparison(op, Number(raw));
        return (card) => {
            if (card.customData === undefined) return undefined;
            const value = card.customData?.[key];
            return typeof value === 'number' && compare(value);
        };
    }
    const text = body.match(/^cds:([\w-]+)(!=|=)(.*)$/is);
    if (text) {
        needs.cardData = true;
        const [, key, op, pattern] = text;
        const matches = globMatcher(stripSearchQuotes(pattern), { anchored: true });
        return (card) => {
            if (card.customData === undefined) return undefined;
            const value = card.customData?.[key];
            if (typeof value !== 'string') return false;
            return op === '=' ? matches(value) : !matches(value);
        };
    }
    return null;
}

/** `prop:rated` / `prop:resched`: a day relative to today, 0 being today and -1 yesterday. */
function revlogDayPredicate(kind: RevlogLookupKind, op: string, value: number, options: CardMatcherOptions): TermTest {
    const compare = numericComparison(op, Math.trunc(value));
    const lookup = options.revlogDayOffsets;
    if (!lookup) return UNKNOWN;
    return (card) => lookup(card.cardId, kind).some(compare);
}

function propPredicate(body: string, options: CardMatcherOptions, needs: CardSearchNeeds): TermTest | null {
    const custom = customDataPredicate(body, needs);
    if (custom) return custom;
    const match = body.match(/^(ivl|reps|lapses|ease|pos|due|s|d|r|rated|resched)(>=|<=|!=|=|>|<)(-?\d+(?:\.\d+)?)$/i);
    if (!match) return null;

    const [, rawKey, op, rawValue] = match;
    const key = rawKey.toLowerCase();
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
        case 'rated':
        case 'resched':
            return revlogDayPredicate(key, op, value, options);
        case 'due': {
            // Review and day-learning cards compare their due day with today. An intraday learning
            // (or preview) card's due time is read as whole days from the next rollover, truncated
            // toward zero as Anki's SQL division does, so a learning card due today is day 0 (FLT-9).
            const compare = numericComparison(op, Math.trunc(value));
            const nextDayAtSecs = Math.floor((options.dayCutoffMs + DAY_MS) / 1000);
            return (card) => {
                if (card.queue === 2 || card.queue === 3) return compare(card.due - options.today);
                if (card.queue === 1 || card.queue === 4) return compare(Math.trunc((Math.floor(card.due / 1000) - nextDayAtSecs) / 86_400));
                return false;
            };
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

/** `rated:N[:ease]` and `resched:N`: anything logged within the last N days. */
function daysArgument(term: string, raw: string): number {
    const days = Number(raw);
    if (!/^\d+$/.test(raw) || days <= 0) return invalidTerm(term);
    return days;
}

/** `deck:` — the deck itself, everything under it, and the filtered decks the card is in. */
function deckPredicate(body: string, options: CardMatcherOptions, needs: CardSearchNeeds): TermTest {
    if (!body) throw new SearchSyntaxError('empty search value');
    if (body === '*') return () => true;
    needs.decks = true;
    const keyword = body.toLowerCase();
    if (keyword === 'filtered') {
        return (card) => (card.filteredDeckNames === undefined ? undefined : card.filteredDeckNames.length > 0);
    }
    if (keyword === 'current') {
        const current = options.currentDeckName;
        if (!current) return () => true;
        const matches = hierarchicalGlobMatcher(current.replace(/[\\*_"]/g, '\\$&'));
        return (card) => matches(card.deckName) || (card.homeDeckName !== undefined && matches(card.homeDeckName));
    }
    const matches = hierarchicalGlobMatcher(body);
    return (card) => matches(card.deckName)
        || (card.homeDeckName !== undefined && matches(card.homeDeckName))
        || (card.filteredDeckNames ?? []).some(matches);
}

function tagPredicate(term: string, body: string, needs: CardSearchNeeds): TermTest {
    if (!body) throw new SearchSyntaxError('empty search value');
    needs.tags = true;
    const keyword = body.toLowerCase();
    if (keyword === 'none') return (card) => card.tags.length === 0;
    if (body === '*') return () => true;
    if (keyword.startsWith('re:')) {
        let regex: RegExp;
        try { regex = searchRegex(unescapeRegexValue(body.slice(3))); } catch { return invalidTerm(term); }
        return (card) => card.tags.some((tag) => regex.test(tag));
    }
    const matches = hierarchicalGlobMatcher(body);
    return (card) => card.tags.some(matches);
}

/**
 * `Front:dog` compares the whole field (`Front:*dog*` for "contains"), `Front:` finds an empty
 * field, `Front:_*` a non-empty one and `Front:*` any note that has the field. Field names take
 * wildcards too (`fr*:dog`). `Front:re:…` and `Front:nc:…` read the field as a regex and without
 * accents. Field contents are compared as stored, formatting included, as Anki does.
 */
function fieldPredicate(term: string, name: string, rawValue: string, needs: CardSearchNeeds): TermTest {
    needs.fields = true;
    const nameMatches = globMatcher(name, { anchored: true });
    const value = stripSearchQuotes(rawValue);
    const lower = value.toLowerCase();
    let test: (field: string) => boolean;
    if (lower.startsWith('re:')) {
        let regex: RegExp;
        try { regex = searchRegex(unescapeRegexValue(value.slice(3))); } catch { return invalidTerm(term); }
        test = (field) => regex.test(field);
    } else if (lower.startsWith('nc:')) {
        test = globMatcher(value.slice(3), { anchored: true, noCombining: true });
    } else {
        test = globMatcher(value, { anchored: true });
    }
    return (card) => {
        if (!card.fields) return undefined;
        const matching = Object.entries(card.fields).filter(([fieldName]) => nameMatches(fieldName));
        return matching.some(([, field]) => test(field));
    };
}

/** A `re:` value is raw text: only an escaped quote is unescaped, as the manual says. */
function unescapeRegexValue(value: string): string {
    return value.replace(/\\"/g, '"');
}

function predicateForTerm(rawTerm: string, options: CardMatcherOptions, needs: CardSearchNeeds): TermTest {
    let term = rawTerm;
    const wholeQuoted = term.length >= 2 && term.startsWith('"') && term.endsWith('"');
    if (wholeQuoted && firstUnescapedColon(term) > 0) term = stripSearchQuotes(term);
    const separator = firstUnescapedColon(term);
    if (separator <= 0) {
        needs.fields = true;
        return textPredicate(term);
    }

    const rawKey = term.slice(0, separator);
    const prefix = rawKey.toLowerCase();
    const rawBody = term.slice(separator + 1);
    const body = stripSearchQuotes(rawBody);

    switch (prefix) {
        case 'deck':
            return deckPredicate(body, options, needs);
        case 'tag':
            return tagPredicate(term, body, needs);
        case 'preset': {
            if (!body) throw new SearchSyntaxError('empty search value');
            needs.decks = true;
            const matches = globMatcher(body, { anchored: true });
            return (card) => (card.presetName === undefined ? undefined : matches(card.presetName));
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
            const parts = body.split(':');
            if (parts.length > 2) return invalidTerm(term);
            const days = daysArgument(term, parts[0]);
            const ease = parts[1] === undefined ? null : Number(parts[1]);
            if (ease !== null && (!/^\d$/.test(parts[1]) || ease < 1 || ease > 4)) return invalidTerm(term);
            const lookup = options.ratedWithin;
            if (!lookup) return UNKNOWN;
            return (card) => lookup(card.cardId, days, ease);
        }
        case 'resched': {
            const days = daysArgument(term, body);
            const lookup = options.revlogDayOffsets;
            if (!lookup) return UNKNOWN;
            return (card) => lookup(card.cardId, 'resched').some((offset) => offset > -days);
        }
        case 'introduced': {
            const days = daysArgument(term, body);
            const lookup = options.introducedWithin;
            if (!lookup) return UNKNOWN;
            return (card) => lookup(card.cardId, days);
        }
        case 'added':
            return dayWindowPredicate(body, options, (card) => card.createdAtMs) ?? invalidTerm(term);
        case 'edited':
            needs.noteEdited = true;
            return dayWindowPredicate(body, options, (card) => card.noteEditedAtMs) ?? invalidTerm(term);
        case 'note': {
            if (!body) throw new SearchSyntaxError('empty search value');
            const matches = globMatcher(body, { anchored: true });
            return (card) => (card.noteTypeName === undefined ? undefined : matches(card.noteTypeName));
        }
        case 'card': {
            if (!body) throw new SearchSyntaxError('empty search value');
            // Anki accepts a template name or its 1-based number.
            if (/^\d+$/.test(body) && Number(body) > 0) {
                const ordinal = Number(body);
                return (card) => card.templateOrd === ordinal - 1;
            }
            const matches = globMatcher(body, { anchored: true });
            return (card) => (card.templateName === undefined ? undefined : matches(card.templateName));
        }
        case 'nid': {
            const ids = idList(term, body);
            return (card) => ids.has(card.noteId);
        }
        case 'cid': {
            const ids = idList(term, body);
            return (card) => ids.has(card.cardId);
        }
        case 'mid': {
            const ids = idList(term, body);
            return (card) => (card.noteTypeId === undefined ? undefined : ids.has(card.noteTypeId));
        }
        case 'did': {
            // The deck itself, not its children; a card in a filtered deck also counts for its home.
            const ids = idList(term, body);
            needs.decks = true;
            return (card) => (card.deckId === undefined
                ? undefined
                : ids.has(card.deckId) || (card.homeDeckId !== undefined && ids.has(card.homeDeckId)));
        }
        case 'dupe': {
            // `dupe:<note type id>,<first field>`: notes of that type whose first field, without
            // formatting, is exactly the text. The Browser's "Find Duplicates" writes these.
            const comma = body.indexOf(',');
            if (comma <= 0 || !/^\d+$/.test(body.slice(0, comma))) return invalidTerm(term);
            needs.fields = true;
            const noteTypeId = Number(body.slice(0, comma));
            const text = stripHtmlForSearch(unescapeSearchText(body.slice(comma + 1)));
            return (card) => {
                if (card.noteTypeId === undefined || !card.fields) return undefined;
                return card.noteTypeId === noteTypeId && stripHtmlForSearch(rawFields(card)[0] ?? '') === text;
            };
        }
        case 'has-cd': {
            if (!body) throw new SearchSyntaxError('empty search value');
            needs.cardData = true;
            const key = unescapeSearchText(body);
            return (card) => (card.customData === undefined
                ? undefined
                : card.customData !== null && Object.prototype.hasOwnProperty.call(card.customData, key));
        }
        case 're': {
            needs.fields = true;
            let regex: RegExp;
            try {
                regex = searchRegex(unescapeRegexValue(body));
            } catch {
                return invalidTerm(term);
            }
            return (card) => regex.test(rawFields(card).join('\x1f'));
        }
        case 'w': {
            needs.fields = true;
            if (!body) throw new SearchSyntaxError('empty search value');
            const matches = wordMatcher(body);
            return (card) => rawFields(card).some(matches);
        }
        case 'nc':
            needs.fields = true;
            return textPredicate(rawBody, 'nc');
        case 'sc':
            needs.fields = true;
            return textPredicate(rawBody, 'sc');
        default:
            // Any other key names a field, as in Anki: `Front:dog`, `fr*:dog`, `Front:`.
            return fieldPredicate(term, rawKey, rawBody, needs);
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
    const needs: CardSearchNeeds = { fields: false, tags: false, noteEdited: false, cardData: false, decks: false };
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
