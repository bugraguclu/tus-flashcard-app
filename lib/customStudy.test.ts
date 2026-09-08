import { describe, expect, it } from 'vitest';
import {
    CUSTOM_STUDY_FORGOT_MAX_DAYS,
    CUSTOM_STUDY_MAX_VALUE,
    CUSTOM_STUDY_PREVIEW_DELAYS,
    customStudySessionConfig,
    customStudyTagSelection,
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
            previewDelays: [60, 600, 0],
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
            previewDelays: [60, 600, 0],
        });
    });

    it('previews only recently added new cards, in creation order, without rescheduling', () => {
        expect(config({ option: 'preview', days: 1 })).toEqual({
            search: 'is:new added:1 deck:"Tıp"',
            limit: CUSTOM_STUDY_MAX_VALUE,
            order: FILTERED_SEARCH_ORDER.added,
            reschedule: false,
            previewDelays: [60, 600, 0],
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
            previewDelays: [60, 600, 0],
        });
        expect(cram('due')).toEqual({
            search: 'is:due deck:"Tıp"',
            limit: 100,
            order: FILTERED_SEARCH_ORDER.due,
            reschedule: true,
            previewDelays: [60, 600, 0],
        });
        expect(cram('review')).toEqual({
            search: '-is:new deck:"Tıp"',
            limit: 100,
            order: FILTERED_SEARCH_ORDER.random,
            reschedule: true,
            previewDelays: [60, 600, 0],
        });
        expect(cram('all')).toEqual({
            search: 'deck:"Tıp"',
            limit: 100,
            order: FILTERED_SEARCH_ORDER.random,
            reschedule: false,
            previewDelays: [60, 600, 0],
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

    it('writes each tag list as its own group, the way Anki\u2019s search writer does', () => {
        // Anki emits `(tag:1 OR tag:2) (-tag:3 -tag:4)`. The exclusions have to stay grouped:
        // loose next to an `or` list they would be read as alternatives to it rather than as
        // conditions every card must satisfy.
        const search = tagSearchTerms(['Anatomi', 'Fizyoloji'], ['Zor', 'Eski']);
        expect(search).toBe('(tag:"Anatomi" or tag:"Fizyoloji") (-tag:"Zor" -tag:"Eski")');
        expect(parseSearchQuery(search)).toEqual({
            kind: 'and',
            children: [
                {
                    kind: 'or',
                    children: [
                        { kind: 'term', text: 'tag:"Anatomi"' },
                        { kind: 'term', text: 'tag:"Fizyoloji"' },
                    ],
                },
                {
                    kind: 'and',
                    children: [
                        { kind: 'not', child: { kind: 'term', text: 'tag:"Zor"' } },
                        { kind: 'not', child: { kind: 'term', text: 'tag:"Eski"' } },
                    ],
                },
            ],
        });
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

describe('custom study preview delays', () => {
    it('writes Anki\u2019s own three delays on every session it builds', () => {
        // `custom_study_config` sets preview_again_secs/hard/good on each deck it produces, so the
        // rescheduling options carry them too even though only a preview session reads them back.
        const requests: CustomStudyRequest[] = [
            { option: 'forgot', days: 7 },
            { option: 'ahead', days: 3 },
            { option: 'preview', days: 1 },
            { option: 'cram', kind: 'all', cardLimit: 100, includeTags: [], excludeTags: [] },
            { option: 'cram', kind: 'due', cardLimit: 20, includeTags: [], excludeTags: [] },
        ];
        for (const request of requests) {
            expect(config(request)?.previewDelays).toEqual([60, 600, 0]);
        }
        expect(CUSTOM_STUDY_PREVIEW_DELAYS).toEqual([60, 600, 0]);
    });
});

describe('custom study tag selection', () => {
    const deckTags = ['anatomi', 'Fizyoloji', 'zor'];

    it('preselects the remembered tags that the deck still carries', () => {
        expect(customStudyTagSelection(deckTags, {
            extendNew: 0,
            extendReview: 0,
            includeTags: ['Fizyoloji'],
            excludeTags: ['zor'],
        })).toEqual({ includeTags: ['Fizyoloji'], excludeTags: ['zor'], requireTags: true });
    });

    it('drops a remembered tag the deck no longer has, and the require box with it', () => {
        // Anki rebuilds the flags from the deck's current tags, so a tag that was renamed away
        // cannot come back into the search — a session filtered on it would gather nothing.
        expect(customStudyTagSelection(deckTags, {
            extendNew: 0,
            extendReview: 0,
            includeTags: ['patoloji'],
            excludeTags: ['patoloji', 'zor'],
        })).toEqual({ includeTags: [], excludeTags: ['zor'], requireTags: false });
    });

    it('lists the selection in the deck\u2019s own tag order, not the order it was stored in', () => {
        expect(customStudyTagSelection(deckTags, {
            extendNew: 0,
            extendReview: 0,
            includeTags: ['zor', 'anatomi'],
            excludeTags: [],
        }).includeTags).toEqual(['anatomi', 'zor']);
    });

    it('opens on nothing when the deck has no tags at all', () => {
        expect(customStudyTagSelection([], {
            extendNew: 0,
            extendReview: 0,
            includeTags: ['anatomi'],
            excludeTags: ['zor'],
        })).toEqual({ includeTags: [], excludeTags: [], requireTags: false });
    });
});
