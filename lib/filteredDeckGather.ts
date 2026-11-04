import { getDB } from './db';
import { rememberedCollection } from './ankiCollectionConfig';
import { ankiCardRelativeRetrievability, ankiCardRetrievability, ankiFnvHash, compareSqlAscending } from './ankiSortKeys';
import { CUSTOM_STUDY_MAX_VALUE } from './customStudy';
import { FILTERED_SEARCH_ORDER } from './filteredDeckOptions';
import type { AppSettings } from './types';
import { localDayNumber } from './ankiState';
import { buildFilteredSearchClause } from './studySearchSql';

interface GatherRow {
    cardId: number;
    noteId: number;
    ord: number;
    type: number;
    due: number;
    ivl: number;
    lapses: number;
    mod: number | null;
    odue: number | null;
    ankiData: string | null;
    lastReviewId: number | null;
}

type GatherKey = { value: number | bigint | null; descending?: boolean };

/** This app keeps an intraday due in epoch milliseconds; Anki keeps it in seconds. */
const DUE_IN_MILLISECONDS_ABOVE = 100_000_000_000;

/**
 * The sort keys of one gather order, keyed by Anki's `SearchTerm.Order` ordinal, as
 * `order_and_limit_for_search` (rslib/src/storage/card/filtered.rs) defines them. A saved
 * retrievability order gathers randomly while FSRS is off: Anki 26.09.3 failed to build such a
 * deck (its order was an empty SQL term), and upstream now falls back to `random()`, the order
 * its dialog shows for it.
 */
function gatherOrderKeys(order: number | undefined, fsrs: boolean, nowMs: number, today: number): (row: GatherRow) => GatherKey[] {
    switch (order) {
        // A card never reviewed has no review-log row, and SQLite puts that NULL first.
        case FILTERED_SEARCH_ORDER.oldestReviewedFirst: return (row) => [{ value: row.lastReviewId }];
        case FILTERED_SEARCH_ORDER.random: return () => [{ value: Math.random() }];
        case FILTERED_SEARCH_ORDER.intervalsAscending: return (row) => [{ value: row.ivl }];
        case FILTERED_SEARCH_ORDER.intervalsDescending: return (row) => [{ value: row.ivl, descending: true }];
        case FILTERED_SEARCH_ORDER.lapses: return (row) => [{ value: row.lapses, descending: true }];
        case FILTERED_SEARCH_ORDER.added: return (row) => [{ value: row.noteId }, { value: row.ord }];
        case FILTERED_SEARCH_ORDER.reverseAdded: return (row) => [{ value: row.noteId, descending: true }, { value: row.ord }];
        case FILTERED_SEARCH_ORDER.retrievabilityAscending:
            return fsrs ? (row) => [{ value: ankiCardRetrievability(row, nowMs, today) }] : () => [{ value: Math.random() }];
        case FILTERED_SEARCH_ORDER.retrievabilityDescending:
            return fsrs
                ? (row) => [{ value: ankiCardRetrievability(row, nowMs, today), descending: true }]
                : () => [{ value: Math.random() }];
        case FILTERED_SEARCH_ORDER.relativeOverdueness:
            return (row) => [{ value: ankiCardRelativeRetrievability(row, nowMs, today) }];
        // Due order puts a review card's day number on the clock an intraday card is timed on.
        default: {
            const nowSecs = Math.floor(nowMs / 1000);
            return (row) => {
                const due = row.due > DUE_IN_MILLISECONDS_ABOVE ? Math.floor(row.due / 1000) : row.due;
                return [{ value: due > 1_000_000_000 ? due : (due - today) * 86_400 + nowSecs }, { value: row.ord }];
            };
        }
    }
}

/**
 * Today as Anki numbers it: days since the collection was created. A collection that replaced
 * this one from an Anki `.colpkg` brought its creation day, and its review days were converted
 * against it (`ankiDueDayToLocal`); one made here has none, so its days keep counting from 1970.
 */
function ankiCollectionToday(nowMs: number, appToday: number): number {
    const crt = rememberedCollection()?.crt;
    return crt ? Math.max(0, Math.floor((nowMs / 1000 - crt) / 86_400)) : appToday;
}

/**
 * The row with its review and day-learning days counted from the collection's creation. The due
 * and relative-overdueness orders read a new card's queue position as such a day, so only with
 * the days Anki has do new cards fall between the reviews where Anki puts them.
 */
function inAnkiDays(row: GatherRow, dayOffset: number): GatherRow {
    if (dayOffset === 0 || row.type === 0) return row;
    const shift = (value: number | null) => (value && Math.abs(value) < 1_000_000_000 ? value - dayOffset : value);
    return { ...row, due: shift(row.due) ?? row.due, odue: shift(row.odue) };
}

/**
 * The cards one filtered-deck term gathers, in the order Anki moves them into the deck: the
 * term's order, then `fnvhash(c.id, c.mod)`, cut at the term's limit. Suspended and buried cards
 * are never gathered. Anki's retrievability orders and its tiebreak are Rust functions SQLite
 * does not have, so every matching card is keyed and ordered here.
 */
export function gatherFilteredTermCardIds(
    term: { search: string; order: number | undefined; limit: number | undefined },
    settings: Pick<AppSettings, 'dayRolloverHour' | 'fsrsEnabled'>,
    nowMs: number,
    excludedIds: readonly number[] = [],
): number[] {
    const filtered = buildFilteredSearchClause(term.search);
    // One JSON parameter, not one `?` per card: reservations can outgrow SQLite's variable limit.
    const exclusion = excludedIds.length ? ' AND c.id NOT IN (SELECT value FROM json_each(?))' : '';
    const where = filtered.clauses.length > 0 ? filtered.clauses.join(' AND ') : '1=1';
    const lastReview = term.order === FILTERED_SEARCH_ORDER.oldestReviewedFirst
        ? '(SELECT MAX(r.id) FROM revlog r WHERE r.cardId = c.id)'
        : 'NULL';
    const rows = getDB().getAllSync<GatherRow>(
        `SELECT c.id AS cardId, c.noteId AS noteId, c.ord AS ord, c.type AS type, c.due AS due, c.ivl AS ivl,
            c.lapses AS lapses, json_extract(c.data, '$.mod') AS mod, json_extract(c.data, '$.odue') AS odue,
            json_extract(c.data, '$.ankiData') AS ankiData, ${lastReview} AS lastReviewId
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN note_types nt ON nt.id = n.noteTypeId
         JOIN decks d ON d.id = c.deckId
         WHERE c.queue >= 0 AND COALESCE(json_extract(d.data, '$.isFiltered'), 0) = 0 AND ${where}${exclusion}`,
        ...filtered.params, ...(excludedIds.length ? [JSON.stringify(excludedIds)] : []),
    );
    const appToday = localDayNumber(nowMs, settings.dayRolloverHour);
    const dayOffset = appToday - ankiCollectionToday(nowMs, appToday);
    const keysOf = gatherOrderKeys(term.order, Boolean(settings.fsrsEnabled), nowMs, appToday - dayOffset);
    const keyed = rows.map((row) => ({
        id: row.cardId,
        keys: [...keysOf(inAnkiDays(row, dayOffset)), { value: ankiFnvHash([row.cardId, Number(row.mod) || 0]) }],
    }));
    keyed.sort((a, b) => {
        for (let index = 0; index < a.keys.length; index++) {
            const order = compareSqlAscending(a.keys[index].value, b.keys[index].value);
            if (order !== 0) return a.keys[index].descending ? -order : order;
        }
        return 0;
    });
    const limit = Math.max(1, Math.min(CUSTOM_STUDY_MAX_VALUE, Math.floor(term.limit ?? 100)));
    return keyed.slice(0, limit).map((entry) => entry.id);
}
