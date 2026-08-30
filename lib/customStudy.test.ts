import { describe, expect, it } from 'vitest';
import {
    CUSTOM_STUDY_FORGOT_MAX_DAYS,
    CUSTOM_STUDY_MAX_VALUE,
    customStudySessionConfig,
    customStudyValueBounds,
    deckSearchTerm,
    tagSearchTerms,
    type CustomStudyRequest,
} from './customStudy';
import { FILTERED_SEARCH_ORDER } from './filteredDeckOptions';
import { parseSearchQuery, tokenizeSearch } from './searchQuery';

// Behaviour pinned against Anki's own implementation:
// https://github.com/ankitects/anki/blob/main/rslib/src/scheduler/filtered/custom_study.rs
// https://github.com/ankitects/anki/blob/main/qt/aqt/customstudy.py

const config = (request: CustomStudyRequest, deckName = 'Tıp') => customStudySessionConfig(request, deckName);

describe('custom study session configs', () => {
    it('leaves the two limit options without a filtered deck', () => {
        expect(config({ option: 'newLimit', delta: 10 })).toBeNull();
        expect(config({ option: 'reviewLimit', delta: -5 })).toBeNull();
    });

    it('gathers forgotten cards randomly and never reschedules them', () => {
        expect(config({ option: 'forgot', days: 7 })).toEqual({
            search: 'rated:7:1 deck:"Tıp"',
            limit: CUSTOM_STUDY_MAX_VALUE,
            order: FILTERED_SEARCH_ORDER.random,
            reschedule: false,
        });
    });

    it('caps the forgotten window at a month, as Anki’s spinner does', () => {
        expect(config({ option: 'forgot', days: 400 })?.search).toBe(
            `rated:${CUSTOM_STUDY_FORGOT_MAX_DAYS}:1 deck:"Tıp"`,
        );
    });

    it('studies ahead in due order and keeps rescheduling on', () => {
        expect(config({ option: 'ahead', days: 3 })).toEqual({
            search: 'prop:due<=3 deck:"Tıp"',
            limit: CUSTOM_STUDY_MAX_VALUE,
            order: FILTERED_SEARCH_ORDER.due,
            reschedule: true,
        });
    });

    it('previews only recently added new cards, in creation order, without rescheduling', () => {
        expect(config({ option: 'preview', days: 1 })).toEqual({
            search: 'is:new added:1 deck:"Tıp"',
            limit: CUSTOM_STUDY_MAX_VALUE,
            order: FILTERED_SEARCH_ORDER.added,
            reschedule: false,
        });
    });

    it('maps every cram kind to Anki’s state, order and reschedule flag', () => {
        const cram = (kind: 'new' | 'due' | 'review' | 'all') => config({
            option: 'cram',
            kind,
            cardLimit: 100,
            includeTags: [],
            excludeTags: [],
        });

        expect(cram('new')).toEqual({
            search: 'is:new deck:"Tıp"',
            limit: 100,
            order: FILTERED_SEARCH_ORDER.added,
            reschedule: true,
        });
        expect(cram('due')).toEqual({
            search: 'is:due deck:"Tıp"',
            limit: 100,
            order: FILTERED_SEARCH_ORDER.due,
            reschedule: true,
        });
        expect(cram('review')).toEqual({
            search: '-is:new deck:"Tıp"',
            limit: 100,
            order: FILTERED_SEARCH_ORDER.random,
            reschedule: true,
        });
        expect(cram('all')).toEqual({
            search: 'deck:"Tıp"',
            limit: 100,
            order: FILTERED_SEARCH_ORDER.random,
            reschedule: false,
        });
    });

    it('clamps the cram card limit to Anki’s spinner range', () => {
        const base = { option: 'cram' as const, kind: 'all' as const, includeTags: [], excludeTags: [] };
        expect(config({ ...base, cardLimit: 0 })?.limit).toBe(1);
        expect(config({ ...base, cardLimit: 10_000_000 })?.limit).toBe(CUSTOM_STUDY_MAX_VALUE);
    });
});

describe('custom study search terms', () => {
    it('requires one of the included tags and excludes every other listed tag', () => {
        expect(tagSearchTerms(['Anatomi'], [])).toBe('tag:"Anatomi"');
        expect(tagSearchTerms(['Anatomi', 'Fizyoloji'], [])).toBe('(tag:"Anatomi" or tag:"Fizyoloji")');
        expect(tagSearchTerms([], ['Zor'])).toBe('-tag:"Zor"');
        expect(tagSearchTerms(['A', 'A', ' '], ['B'])).toBe('tag:"A" -tag:"B"');
        expect(tagSearchTerms([], [])).toBe('');
    });

    it('keeps a quote out of a deck name rather than truncating the term', () => {
        // The tokenizer has no escape sequence inside a quoted phrase, so a stray quote would
        // otherwise end the term early and silently widen the search.
        expect(deckSearchTerm('Tıp "2025"')).toBe('deck:"Tıp 2025"');
        expect(tokenizeSearch(deckSearchTerm('Tıp "2025"'))).toEqual(['deck:"Tıp 2025"']);
    });

    it('produces searches our own parser reads as the intended terms', () => {
        const cram = config({
            option: 'cram',
            kind: 'review',
            cardLimit: 50,
            includeTags: ['Anatomi', 'Fizyoloji'],
            excludeTags: ['Zor'],
        });
        expect(cram?.search).toBe('-is:new deck:"Tıp" (tag:"Anatomi" or tag:"Fizyoloji") -tag:"Zor"');
        expect(parseSearchQuery(cram!.search)).toEqual({
            kind: 'and',
            children: [
                { kind: 'not', child: { kind: 'term', text: 'is:new' } },
                { kind: 'term', text: 'deck:"Tıp"' },
                {
                    kind: 'or',
                    children: [
                        { kind: 'term', text: 'tag:"Anatomi"' },
                        { kind: 'term', text: 'tag:"Fizyoloji"' },
                    ],
                },
                { kind: 'not', child: { kind: 'term', text: 'tag:"Zor"' } },
            ],
        });
    });
});

describe('custom study spinner bounds', () => {
    it('opens the limit options on the delta last used for that deck and allows shrinking', () => {
        const defaults = { extendNew: 12, extendReview: 30, includeTags: [], excludeTags: [] };
        expect(customStudyValueBounds('newLimit', defaults)).toEqual({
            min: -CUSTOM_STUDY_MAX_VALUE,
            max: CUSTOM_STUDY_MAX_VALUE,
            initial: 12,
        });
        expect(customStudyValueBounds('reviewLimit', defaults).initial).toBe(30);
    });

    it('starts the day-based options at one day and the cram option at a hundred cards', () => {
        expect(customStudyValueBounds('forgot')).toEqual({ min: 1, max: CUSTOM_STUDY_FORGOT_MAX_DAYS, initial: 1 });
        expect(customStudyValueBounds('ahead')).toEqual({ min: 1, max: CUSTOM_STUDY_MAX_VALUE, initial: 1 });
        expect(customStudyValueBounds('preview')).toEqual({ min: 1, max: CUSTOM_STUDY_MAX_VALUE, initial: 1 });
        expect(customStudyValueBounds('cram')).toEqual({ min: 1, max: CUSTOM_STUDY_MAX_VALUE, initial: 100 });
    });
});
