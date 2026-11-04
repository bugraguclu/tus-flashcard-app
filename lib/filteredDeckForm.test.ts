import { describe, expect, it } from 'vitest';
import {
    filteredDeckFormFromDeck,
    filteredDeckFormLimitsValid,
    filteredDeckOptionsFromForm,
    newFilteredDeckForm,
    newFilteredDeckName,
} from './filteredDeckForm';
import { FILTERED_SEARCH_ORDER, newFilteredDeckSearches } from './filteredDeckOptions';
import type { Deck } from './models';

function filteredDeck(overrides: Partial<Deck>): Deck {
    return {
        id: 1,
        name: 'Session',
        configId: 1,
        mod: 0,
        usn: -1,
        description: '',
        collapsed: false,
        isFiltered: true,
        ...overrides,
    } as Deck;
}

describe('new filtered deck form', () => {
    it('opens with the terms Deck::new_filtered seeds: 100 random, then 20 due, second filter off', () => {
        const form = newFilteredDeckForm('Filtered Deck 09:05', '  deck:Anatomi is:due  ');
        expect(form).toEqual({
            name: 'Filtered Deck 09:05',
            search: 'deck:Anatomi is:due',
            limit: '100',
            order: FILTERED_SEARCH_ORDER.random,
            secondEnabled: false,
            search2: '',
            limit2: '20',
            order2: FILTERED_SEARCH_ORDER.due,
            reschedule: true,
            previewDelays: '60 600 0',
            allowEmpty: false,
        });
    });

    it('stamps the name with the time and numbers it while the name is taken', () => {
        const now = new Date(2026, 9, 30, 9, 5);
        expect(newFilteredDeckName('Filtered Deck', now, () => false)).toBe('Filtered Deck 09:05');
        const taken = new Set(['Filtered Deck 09:05', 'Filtered Deck 09:05 2']);
        expect(newFilteredDeckName('Filtered Deck', now, (name) => taken.has(name))).toBe('Filtered Deck 09:05 3');
    });

    it('starts from the current deck’s due cards, with its new cards in the second filter', () => {
        const searches = newFilteredDeckSearches('TUS Kartları::Anatomi');
        const form = newFilteredDeckForm('Session', searches.search, searches.search2);
        expect(form.search).toBe('deck:"TUS Kartları::Anatomi" is:due');
        expect(form.search2).toBe('deck:"TUS Kartları::Anatomi" is:new');
        expect(form.secondEnabled).toBe(false);
        // A wildcard character in a deck name stays literal, as the deck picker writes it.
        expect(newFilteredDeckSearches('TUS_2026').search).toBe('deck:TUS\\_2026 is:due');
    });
});

describe('existing filtered deck form', () => {
    it('reads every saved option back', () => {
        const form = filteredDeckFormFromDeck(filteredDeck({
            searchQuery: 'is:due',
            searchLimit: 50,
            searchOrder: FILTERED_SEARCH_ORDER.lapses,
            searchQuery2: 'is:new',
            searchLimit2: 5,
            searchOrder2: FILTERED_SEARCH_ORDER.added,
            reschedule: false,
            previewDelays: [30, 300, 0],
            filteredAllowEmpty: true,
        }), true);
        expect(form).toEqual({
            name: 'Session',
            search: 'is:due',
            limit: '50',
            order: FILTERED_SEARCH_ORDER.lapses,
            secondEnabled: true,
            search2: 'is:new',
            limit2: '5',
            order2: FILTERED_SEARCH_ORDER.added,
            reschedule: false,
            previewDelays: '30 300 0',
            allowEmpty: true,
        });
    });

    it('shows a retrievability order as Random while FSRS is off', () => {
        const deck = filteredDeck({ searchQuery: 'is:due', searchOrder: FILTERED_SEARCH_ORDER.retrievabilityAscending });
        expect(filteredDeckFormFromDeck(deck, false).order).toBe(FILTERED_SEARCH_ORDER.random);
        expect(filteredDeckFormFromDeck(deck, true).order).toBe(FILTERED_SEARCH_ORDER.retrievabilityAscending);
    });

    it('offers a deck saved with one filter a second one in Random order, as Anki does', () => {
        const form = filteredDeckFormFromDeck(filteredDeck({ searchQuery: 'is:due' }), false);
        expect(form.secondEnabled).toBe(false);
        expect(form.order2).toBe(FILTERED_SEARCH_ORDER.random);
    });
});

describe('saving the filtered deck form', () => {
    it('saves no second search while the second filter is off', () => {
        const form = { ...newFilteredDeckForm('Session', 'is:due'), search2: 'is:new' };
        expect(filteredDeckOptionsFromForm(form).searchQuery2).toBeUndefined();
        expect(filteredDeckOptionsFromForm({ ...form, secondEnabled: true }).searchQuery2).toBe('is:new');
        // An enabled but empty second search gathers from the whole collection, as Anki builds it.
        expect(filteredDeckOptionsFromForm({ ...form, secondEnabled: true, search2: '   ' }).searchQuery2).toBe('deck:*');
        expect(filteredDeckOptionsFromForm({ ...form, search: '' }).searchQuery).toBe('deck:*');
    });

    it('saves the trimmed searches, the limits, orders, preview delays and empty-build choice', () => {
        const form = {
            ...newFilteredDeckForm('Session', ''),
            search: ' tag:zor ',
            limit: '250',
            order: FILTERED_SEARCH_ORDER.due,
            secondEnabled: true,
            search2: ' is:new ',
            limit2: '0',
            reschedule: false,
            previewDelays: '10, 20',
            allowEmpty: true,
        };
        expect(filteredDeckOptionsFromForm(form)).toEqual({
            searchQuery: 'tag:zor',
            searchLimit: 250,
            searchOrder: FILTERED_SEARCH_ORDER.due,
            searchQuery2: 'is:new',
            // A zero limit falls back to the term's default rather than gathering nothing.
            searchLimit2: 20,
            searchOrder2: FILTERED_SEARCH_ORDER.due,
            reschedule: false,
            previewDelays: [10, 20, 0],
            allowEmpty: true,
        });
    });

    it('accepts 1–5 digit limits, and checks the second one only while it is on', () => {
        const form = newFilteredDeckForm('Session', 'is:due');
        expect(filteredDeckFormLimitsValid(form)).toBe(true);
        expect(filteredDeckFormLimitsValid({ ...form, limit: '' })).toBe(false);
        expect(filteredDeckFormLimitsValid({ ...form, limit: '123456' })).toBe(false);
        expect(filteredDeckFormLimitsValid({ ...form, limit2: '' })).toBe(true);
        expect(filteredDeckFormLimitsValid({ ...form, limit2: '', secondEnabled: true })).toBe(false);
    });
});
