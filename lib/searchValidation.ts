import { compileCardMatcher } from './cardSearchMatch';
import { SearchSyntaxError } from './searchQuery';

/**
 * The strict search check the save dialogs run before a search is stored.
 *
 * Collection reads never throw for a bad search: `buildFilteredSearchClause` reads it as matching
 * nothing, because a deck saved before the parser became strict must not take the deck list or the
 * reviewer down with it. The places where a learner types a search therefore have to say so
 * themselves, the way the browser does, before an invalid search is saved and silently gathers
 * no cards. Anki likewise refuses to build a filtered deck from a search it cannot parse.
 */

// Only `rated:`/`introduced:` need these lookups, and their arguments are checked before the
// lookup is asked anything, so a check without a collection behaves like the real compile.
const VALIDATION_OPTIONS = {
    today: 0,
    nowMs: 0,
    learnAheadMinutes: 0,
    dayCutoffMs: 0,
    ratedWithin: () => false,
    introducedWithin: () => false,
};

/** True when the parser and every term accept the query; an empty query is "no filter". */
export function isValidSearchQuery(query: string): boolean {
    try {
        compileCardMatcher(query, VALIDATION_OPTIONS);
        return true;
    } catch (error) {
        if (error instanceof SearchSyntaxError) return false;
        throw error;
    }
}

/** The first search the strict parser rejects among a dialog's filters, or null when all pass. */
export function findInvalidFilteredSearch(searches: ReadonlyArray<string | null | undefined>): string | null {
    for (const search of searches) {
        if (search && !isValidSearchQuery(search)) return search;
    }
    return null;
}
