/**
 * Anki's Custom Study, expressed as a pure specification.
 *
 * Behaviour derived from `rslib/src/scheduler/filtered/custom_study.rs` (search, order and
 * reschedule per option) and `qt/aqt/customstudy.py` (dialog options, spinner bounds and
 * defaults). Anki is GPL-family; nothing is copied here — the observable contract is
 * re-implemented and pinned by lib/customStudy.test.ts.
 *
 * Search strings are written in the dialect lib/searchQuery.ts parses: bare terms separated by
 * spaces, `or` inside parentheses. Anki's own writer quotes whole terms (`"deck:X" AND "is:new"`),
 * which our tokenizer would read as literal text, so the terms stay unquoted here.
 */

import { FILTERED_SEARCH_ORDER } from './filteredDeckOptions';

/** Anki's DYN_MAX_SIZE: the ceiling for every custom study spinner and filtered-deck limit. */
export const CUSTOM_STUDY_MAX_VALUE = 99_999;

/** Anki caps "review forgotten cards" at a month; every other spinner runs to the maximum. */
export const CUSTOM_STUDY_FORGOT_MAX_DAYS = 30;

/** The conventional deck name Anki reuses for every custom study session. */
export const CUSTOM_STUDY_DECK_NAME = 'Özel Çalışma Oturumu';

export type CustomStudyOption =
    | 'newLimit'
    | 'reviewLimit'
    | 'forgot'
    | 'ahead'
    | 'preview'
    | 'cram';

/** The four "study by card state or tag" kinds, in Anki's dialog order. */
export type CustomStudyCramKind = 'new' | 'due' | 'review' | 'all';

export const CUSTOM_STUDY_CRAM_KINDS: readonly CustomStudyCramKind[] = ['new', 'due', 'review', 'all'];

export type CustomStudyRequest =
    | { option: 'newLimit'; delta: number }
    | { option: 'reviewLimit'; delta: number }
    | { option: 'forgot'; days: number }
    | { option: 'ahead'; days: number }
    | { option: 'preview'; days: number }
    | {
        option: 'cram';
        kind: CustomStudyCramKind;
        cardLimit: number;
        includeTags: string[];
        excludeTags: string[];
    };

/** The filtered-deck term a custom study action builds. */
export interface CustomStudySessionConfig {
    search: string;
    limit: number;
    order: number;
    reschedule: boolean;
}

export interface CustomStudyValueBounds {
    min: number;
    max: number;
    initial: number;
}

/** Per-deck values Anki remembers between custom study runs. */
export interface CustomStudyDefaults {
    extendNew: number;
    extendReview: number;
    includeTags: string[];
    excludeTags: string[];
}

export const EMPTY_CUSTOM_STUDY_DEFAULTS: CustomStudyDefaults = {
    extendNew: 0,
    extendReview: 0,
    includeTags: [],
    excludeTags: [],
};

/**
 * Spinner bounds per option. The two limit options accept negative deltas — Anki lets a learner
 * shrink today's allowance as well as extend it — and open on the delta last used for that deck.
 */
export function customStudyValueBounds(
    option: CustomStudyOption,
    defaults: CustomStudyDefaults = EMPTY_CUSTOM_STUDY_DEFAULTS,
): CustomStudyValueBounds {
    switch (option) {
        case 'newLimit':
            return {
                min: -CUSTOM_STUDY_MAX_VALUE,
                max: CUSTOM_STUDY_MAX_VALUE,
                initial: clampValue(defaults.extendNew, -CUSTOM_STUDY_MAX_VALUE, CUSTOM_STUDY_MAX_VALUE),
            };
        case 'reviewLimit':
            return {
                min: -CUSTOM_STUDY_MAX_VALUE,
                max: CUSTOM_STUDY_MAX_VALUE,
                initial: clampValue(defaults.extendReview, -CUSTOM_STUDY_MAX_VALUE, CUSTOM_STUDY_MAX_VALUE),
            };
        case 'forgot':
            return { min: 1, max: CUSTOM_STUDY_FORGOT_MAX_DAYS, initial: 1 };
        case 'cram':
            return { min: 1, max: CUSTOM_STUDY_MAX_VALUE, initial: 100 };
        default:
            return { min: 1, max: CUSTOM_STUDY_MAX_VALUE, initial: 1 };
    }
}

function clampValue(value: unknown, min: number, max: number): number {
    const parsed = Math.trunc(Number(value));
    if (!Number.isFinite(parsed)) return min > 0 ? min : 0;
    return Math.max(min, Math.min(max, parsed));
}

/**
 * Quote a deck or tag name for a search term. Our tokenizer has no escape sequence inside a
 * quoted phrase, so an embedded quote is dropped rather than silently truncating the term.
 */
export function quoteSearchValue(value: string): string {
    return `"${value.replace(/"/g, '')}"`;
}

export function deckSearchTerm(deckName: string): string {
    return `deck:${quoteSearchValue(deckName)}`;
}

/**
 * Anki's tag filter: the card must carry at least one included tag and none of the excluded ones.
 * An empty include list means "any tag", exactly as an empty `SearchBuilder::any` contributes
 * nothing to the query.
 */
export function tagSearchTerms(includeTags: string[], excludeTags: string[]): string {
    const include = dedupeTags(includeTags);
    const exclude = dedupeTags(excludeTags);
    const terms: string[] = [];

    if (include.length === 1) {
        terms.push(`tag:${quoteSearchValue(include[0])}`);
    } else if (include.length > 1) {
        terms.push(`(${include.map((tag) => `tag:${quoteSearchValue(tag)}`).join(' or ')})`);
    }
    for (const tag of exclude) terms.push(`-tag:${quoteSearchValue(tag)}`);

    return terms.join(' ');
}

function dedupeTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of tags) {
        const tag = raw.trim();
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        result.push(tag);
    }
    return result;
}

function joinSearchTerms(terms: Array<string | null>): string {
    return terms.filter((term): term is string => Boolean(term && term.length > 0)).join(' ');
}

/**
 * The filtered-deck term for one custom study action, or null for the two options that only
 * change today's limits and never build a deck.
 *
 * Per Anki: forgotten cards are gathered randomly and left unscheduled, review-ahead keeps due
 * order and reschedules, previews are gathered in creation order and never reschedule, and the
 * four cram kinds each carry their own state filter, order and reschedule flag.
 */
export function customStudySessionConfig(
    request: CustomStudyRequest,
    deckName: string,
): CustomStudySessionConfig | null {
    const deck = deckSearchTerm(deckName);

    switch (request.option) {
        case 'newLimit':
        case 'reviewLimit':
            return null;
        case 'forgot':
            return {
                search: joinSearchTerms([`rated:${boundedDays(request.days, CUSTOM_STUDY_FORGOT_MAX_DAYS)}:1`, deck]),
                limit: CUSTOM_STUDY_MAX_VALUE,
                order: FILTERED_SEARCH_ORDER.random,
                reschedule: false,
            };
        case 'ahead':
            return {
                search: joinSearchTerms([`prop:due<=${boundedDays(request.days)}`, deck]),
                limit: CUSTOM_STUDY_MAX_VALUE,
                order: FILTERED_SEARCH_ORDER.due,
                reschedule: true,
            };
        case 'preview':
            return {
                search: joinSearchTerms(['is:new', `added:${boundedDays(request.days)}`, deck]),
                limit: CUSTOM_STUDY_MAX_VALUE,
                order: FILTERED_SEARCH_ORDER.added,
                reschedule: false,
            };
        case 'cram': {
            const { state, order, reschedule } = CRAM_KIND_SPEC[request.kind];
            return {
                search: joinSearchTerms([
                    state,
                    deck,
                    tagSearchTerms(request.includeTags, request.excludeTags),
                ]),
                limit: clampValue(request.cardLimit, 1, CUSTOM_STUDY_MAX_VALUE),
                order,
                reschedule,
            };
        }
    }
}

const CRAM_KIND_SPEC: Record<
    CustomStudyCramKind,
    { state: string | null; order: number; reschedule: boolean }
> = {
    new: { state: 'is:new', order: FILTERED_SEARCH_ORDER.added, reschedule: true },
    due: { state: 'is:due', order: FILTERED_SEARCH_ORDER.due, reschedule: true },
    review: { state: '-is:new', order: FILTERED_SEARCH_ORDER.random, reschedule: true },
    all: { state: null, order: FILTERED_SEARCH_ORDER.random, reschedule: false },
};

function boundedDays(days: unknown, max: number = CUSTOM_STUDY_MAX_VALUE): number {
    return clampValue(days, 1, max);
}
