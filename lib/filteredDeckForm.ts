import type { Deck } from './models';
import type { FilteredDeckOptions } from './filteredDecks';
import {
    DEFAULT_SEARCH_LIMIT,
    DEFAULT_SECOND_SEARCH_LIMIT,
    FILTERED_SEARCH_ORDER,
    filteredDeckOrderForDialog,
    formatPreviewDelays,
    parsePreviewDelays,
    replaceDeckNameInSearch,
} from './filteredDeckOptions';

/**
 * The filtered deck form's fields as the learner edits them, shared by Create Filtered Deck and
 * Filtered Deck Options so a new deck and an edited one are read and saved by the same rules.
 */
export interface FilteredDeckFormValues {
    name: string;
    search: string;
    limit: string;
    order: number;
    secondEnabled: boolean;
    search2: string;
    limit2: string;
    order2: number;
    reschedule: boolean;
    previewDelays: string;
    allowEmpty: boolean;
}

/**
 * A new filtered deck's form, with the two search terms `Deck::new_filtered` seeds: the first
 * gathers 100 cards in Random order, the second (off until enabled) 20 in Due order.
 */
export function newFilteredDeckForm(name: string, search: string): FilteredDeckFormValues {
    return {
        name,
        search: search.trim(),
        limit: String(DEFAULT_SEARCH_LIMIT),
        order: FILTERED_SEARCH_ORDER.random,
        secondEnabled: false,
        search2: '',
        limit2: String(DEFAULT_SECOND_SEARCH_LIMIT),
        order2: FILTERED_SEARCH_ORDER.due,
        reschedule: true,
        previewDelays: formatPreviewDelays(undefined),
        allowEmpty: false,
    };
}

/** The form for an existing filtered deck, with each order as the dialog can offer it. */
export function filteredDeckFormFromDeck(deck: Deck, fsrsEnabled: boolean): FilteredDeckFormValues {
    return {
        name: deck.name,
        search: deck.searchQuery ?? '',
        limit: String(deck.searchLimit ?? DEFAULT_SEARCH_LIMIT),
        order: filteredDeckOrderForDialog(deck.searchOrder ?? FILTERED_SEARCH_ORDER.due, fsrsEnabled),
        secondEnabled: Boolean(deck.searchQuery2?.trim()),
        search2: deck.searchQuery2 ?? '',
        limit2: String(deck.searchLimit2 ?? DEFAULT_SECOND_SEARCH_LIMIT),
        order2: filteredDeckOrderForDialog(deck.searchOrder2 ?? FILTERED_SEARCH_ORDER.due, fsrsEnabled),
        reschedule: deck.reschedule ?? true,
        previewDelays: formatPreviewDelays(deck.previewDelays),
        allowEmpty: deck.filteredAllowEmpty ?? false,
    };
}

function parseLimit(value: string, fallback: number): number {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Whether both card limits are the 1–5 digit numbers the form accepts. */
export function filteredDeckFormLimitsValid(form: FilteredDeckFormValues): boolean {
    return /^\d{1,5}$/.test(form.limit) && (!form.secondEnabled || /^\d{1,5}$/.test(form.limit2));
}

/** The options Build and Rebuild save. A disabled second filter saves no second search. */
export function filteredDeckOptionsFromForm(form: FilteredDeckFormValues): FilteredDeckOptions {
    return {
        searchQuery: form.search.trim(),
        searchLimit: parseLimit(form.limit, DEFAULT_SEARCH_LIMIT),
        searchOrder: form.order,
        searchQuery2: form.secondEnabled ? (form.search2.trim() || undefined) : undefined,
        searchLimit2: parseLimit(form.limit2, DEFAULT_SECOND_SEARCH_LIMIT),
        searchOrder2: form.order2,
        reschedule: form.reschedule,
        previewDelays: parsePreviewDelays(form.previewDelays),
        allowEmpty: form.allowEmpty,
    };
}

/**
 * The name a new filtered deck's form opens with: "<base> HH:MM", numbered from 2 while another
 * deck already has it. Build still makes the typed name unique (`getAvailableDeckName`).
 */
export function newFilteredDeckName(baseName: string, now: Date, isTaken: (name: string) => boolean): string {
    const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const stamped = `${baseName} ${timestamp}`;
    let name = stamped;
    for (let suffix = 2; isTaken(name); suffix += 1) name = `${stamped} ${suffix}`;
    return name;
}

/**
 * The search a filtered deck created from the deck list starts with: the due cards of the given
 * deck, as Anki scopes a new filtered deck to the current deck, or of the whole collection.
 */
export function newFilteredDeckSearch(sourceDeckName: string | null): string {
    return replaceDeckNameInSearch('is:due', sourceDeckName);
}
