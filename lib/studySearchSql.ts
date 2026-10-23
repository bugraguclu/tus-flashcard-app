import { matchingCollectionCardIds } from './collectionCardSearch';
import { SearchSyntaxError } from './searchQuery';
export { collectionSearchSettings } from './searchCollectionSettings';


/**
 * Anki's search syntax compiled to SQL: one clause per search term, the filtered-deck search,
 * and the FSRS memory-state expressions that the search and the browser's sort columns share.
 */

/** Escape SQL LIKE wildcard characters so they match literally.
 *  Anki's to_sql() escapes % and keeps _ as literal via ESCAPE clause;
 *  we do the same for user-supplied search terms. */
export function escapeLikePattern(s: string): string {
    return s.replace(/[%_\\]/g, '\\$&');
}

interface SearchFragment {
    sql: string;
    params: Array<string | number>;
}

/** A single term evaluated through the same collection matcher as complete queries. */
export function clauseForSearchTerm(term: string): SearchFragment | null {
    if (!term.trim()) return null;
    const filtered = buildFilteredSearchClause(term);
    return { sql: filtered.clauses[0], params: filtered.params };
}

/**
 * One shared JS evaluator; SQLite receives a parameterized ID set without ICU/UDFs.
 *
 * A search the strict parser rejects matches no card here rather than throwing. Filtered decks
 * keep the search they were saved with, so one written before the parser became strict (or by
 * another client) would otherwise fail the deck list, the reviewer and every dialog that counts
 * it. The clause keeps its usual shape, because an empty clause list means "no filter" to the
 * callers. The browser reports the error instead (lib/browserRepository.ts), and the save dialogs
 * check a search before storing it (lib/searchValidation.ts).
 */
export function buildFilteredSearchClause(searchQuery: string): { clauses: string[]; params: Array<string | number> } {
    if (!searchQuery.trim()) return { clauses: [], params: [] };
    let ids: number[];
    try {
        ids = matchingCollectionCardIds(searchQuery);
    } catch (error) {
        if (!(error instanceof SearchSyntaxError)) throw error;
        ids = [];
    }
    return { clauses: ['c.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))'], params: [JSON.stringify(ids)] };
}

/**
 * One FSRS memory-state key, read out of the Anki data blob the card JSON keeps under `ankiData`.
 * Imports copy that blob verbatim, so it can be empty, and SQLite throws on '' or any other text
 * that is not JSON: one such card would fail the whole query. The blob is checked first instead,
 * and a card without a readable one has no memory state and reads as NULL. That is the value
 * Anki's `extract_fsrs_variable` (rslib/src/storage/sqlite.rs) gives it, and how
 * `parseAnkiCardData` reads it here.
 */
function fsrsCardDataSql(key: 's' | 'd' | 'lrt' | 'decay'): string {
    const blob = "json_extract(c.data, '$.ankiData')";
    return `(CASE WHEN json_valid(${blob}) THEN CAST(json_extract(${blob}, '$.${key}') AS REAL) END)`;
}

function fsrsMemoryStateSql(key: 's' | 'd'): string {
    return fsrsCardDataSql(key);
}

export const FSRS_STABILITY_SQL = fsrsMemoryStateSql('s');

export const FSRS_DIFFICULTY_SQL = fsrsMemoryStateSql('d');

