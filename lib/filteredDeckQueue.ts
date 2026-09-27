import { getDB } from './db';
import { ankiCardRelativeRetrievability, ankiCardRetrievability, ankiFnvHash, compareSqlAscending } from './ankiSortKeys';
import { CUSTOM_STUDY_MAX_VALUE } from './customStudy';
import { FILTERED_SEARCH_ORDER } from './filteredDeckOptions';
import type { CardState, AppSettings } from './types';
import type { Deck, Note } from './models';
import { localDayNumber } from './ankiState';
import { todayLocalYMD } from './scheduler';
import { getDeckByName } from './deckManager';
import { isCatalogNote, isPaidCatalogUnlocked } from './catalogProtection';
import type { StudyQueueResult } from './studyQueue';
import { loadRowsByQueue, toStudyCards, type QueueCardRow } from './studyCardRows';
import { buildFilteredSearchClause } from './studySearchSql';

/**
 * Filtered decks as queries: which cards a filtered deck's searches gather, in Anki's gather
 * orders, and the counts its options screen shows.
 */

interface GatherRow {
    cardId: number;
    noteId: number;
    ord: number;
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
 * `order_and_limit_for_search` (rslib/src/storage/card/filtered.rs) defines them. Anki's two
 * retrievability orders are empty while FSRS is off, which leaves only the tiebreak.
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
            return fsrs ? (row) => [{ value: ankiCardRetrievability(row, nowMs, today) }] : () => [];
        case FILTERED_SEARCH_ORDER.retrievabilityDescending:
            return fsrs ? (row) => [{ value: ankiCardRetrievability(row, nowMs, today), descending: true }] : () => [];
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
 * The cards one filtered-deck term gathers, in the order Anki moves them into the deck: the
 * term's order, then `fnvhash(c.id, c.mod)`, cut at the term's limit. Suspended and buried cards
 * are never gathered. Anki's retrievability orders and its tiebreak are Rust functions SQLite
 * does not have, so every matching card is keyed and ordered here.
 */
export function gatherFilteredTermCardIds(
    term: { search: string; order: number | undefined; limit: number | undefined },
    settings: Pick<AppSettings, 'dayRolloverHour' | 'fsrsEnabled'>,
    nowMs: number,
): number[] {
    const filtered = buildFilteredSearchClause(term.search);
    const where = filtered.clauses.length > 0 ? filtered.clauses.join(' AND ') : '1=1';
    const lastReview = term.order === FILTERED_SEARCH_ORDER.oldestReviewedFirst
        ? '(SELECT MAX(r.id) FROM revlog r WHERE r.cardId = c.id)'
        : 'NULL';
    const rows = getDB().getAllSync<GatherRow>(
        `SELECT c.id AS cardId, c.noteId AS noteId, c.ord AS ord, c.due AS due, c.ivl AS ivl,
            c.lapses AS lapses, json_extract(c.data, '$.mod') AS mod, json_extract(c.data, '$.odue') AS odue,
            json_extract(c.data, '$.ankiData') AS ankiData, ${lastReview} AS lastReviewId
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN note_types nt ON nt.id = n.noteTypeId
         JOIN decks d ON d.id = c.deckId
         WHERE c.queue >= 0 AND ${where}`,
        ...filtered.params,
    );
    const keysOf = gatherOrderKeys(term.order, Boolean(settings.fsrsEnabled), nowMs, localDayNumber(nowMs, settings.dayRolloverHour));
    const keyed = rows.map((row) => ({
        id: row.cardId,
        keys: [...keysOf(row), { value: ankiFnvHash([row.cardId, Number(row.mod) || 0]) }],
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

/** Queue rows for these cards, in the order given. */
function queueRowsInOrder(cardIds: readonly number[]): QueueCardRow[] {
    const byId = new Map<number, QueueCardRow>();
    for (let index = 0; index < cardIds.length; index += 400) {
        const chunk = cardIds.slice(index, index + 400);
        for (const row of loadRowsByQueue(`c.id IN (${chunk.map(() => '?').join(', ')})`, [...chunk], null, null, null)) {
            byId.set(Number(row.cardId), row);
        }
    }
    return cardIds.flatMap((id) => byId.get(id) ?? []);
}

/**
 * Anki-style filtered deck session: gather EVERY card matching the deck's search(es) —
 * regardless of dueness, so "review ahead" and "preview new" can pull in future cards —
 * ordered and capped per filter group. Suspended/buried cards stay out. Daily limits do
 * not apply (Anki: filtered decks are exempt).
 */
type FilteredDeckQueueDefinition = Pick<Deck,
    | 'searchQuery'
    | 'searchLimit'
    | 'searchOrder'
    | 'searchQuery2'
    | 'searchLimit2'
    | 'searchOrder2'
    | 'filteredDeckEmpty'
    | 'filteredDoneCardIds'
    | 'filteredBuildAt'
>;

export function buildFilteredDeckQueue(deck: FilteredDeckQueueDefinition, settings: AppSettings, nowMs: number): StudyQueueResult {
    if (deck.filteredDeckEmpty) {
        return {
            cards: [],
            stats: { newCount: 0, learningCount: 0, reviewCount: 0 },
            nextLearningDue: null,
            dailyNewLimitReached: false,
            heldBackNewCount: 0,
            heldBackReviewCount: 0,
            upcomingCardsCount: 0,
        };
    }

    const completedIds = new Set(deck.filteredDoneCardIds ?? []);
    const buildAt = deck.filteredBuildAt ?? nowMs;
    const gatherGroup = (search: string, order: number | undefined, limit: number | undefined): QueueCardRow[] =>
        queueRowsInOrder(gatherFilteredTermCardIds({ search, order, limit }, settings, nowMs))
            .filter((row) => !completedIds.has(row.cardId) && row.cardId <= buildAt + 999);

    const rows = gatherGroup(deck.searchQuery ?? '', deck.searchOrder, deck.searchLimit);
    if (deck.searchQuery2?.trim()) {
        const seen = new Set(rows.map((row) => row.cardId));
        for (const row of gatherGroup(deck.searchQuery2, deck.searchOrder2, deck.searchLimit2)) {
            if (!seen.has(row.cardId)) rows.push(row);
        }
    }

    const gatheredCards = toStudyCards(rows, settings, nowMs, { settingsCache: new Map() });
    const todayYmd = todayLocalYMD(new Date(nowMs), settings.dayRolloverHour);
    // New and review cards are intentionally gathered regardless of dueness (preview/review
    // ahead). Learning cards still obey their step timer, or a failed card would immediately
    // loop after every queue refresh.
    const cards = gatheredCards.filter((card) => {
        if (card.state.status !== 'learning') return true;
        if (card.state.dueTime > 0) return card.state.dueTime <= nowMs;
        return card.state.dueDate <= todayYmd;
    });
    const stats = {
        newCount: gatheredCards.filter((card) => card.state.status === 'new').length,
        learningCount: gatheredCards.filter((card) => card.state.status === 'learning').length,
        reviewCount: gatheredCards.filter((card) => card.state.status === 'review').length,
    };

    const futureLearningTimes = gatheredCards
        .filter((card) => card.state.status === 'learning' && card.state.dueTime > nowMs)
        .map((card) => card.state.dueTime);

    return {
        cards,
        allSessionCards: gatheredCards,
        stats,
        nextLearningDue: futureLearningTimes.length > 0 ? Math.min(...futureLearningTimes) : null,
        dailyNewLimitReached: false,
        // A filtered deck's saved search is the session: daily limits never apply to it.
        heldBackNewCount: 0,
        heldBackReviewCount: 0,
        upcomingCardsCount: futureLearningTimes.length,
    };
}

export interface FilteredDeckCountCard {
    cardId: number;
    homeDeckId: number;
    status: CardState['status'];
}

type FilteredDeckCountDefinition = Pick<Deck,
    | 'id'
    | 'searchQuery'
    | 'searchLimit'
    | 'searchOrder'
    | 'searchQuery2'
    | 'searchLimit2'
    | 'searchOrder2'
    | 'filteredDeckEmpty'
    | 'filteredDoneCardIds'
    | 'filteredBuildAt'
>;

/**
 * Build every filtered-deck row counter from the same gather the study session uses.
 *
 * This deliberately returns only membership + scheduler state. The deck list does not need a
 * materialized StudyCard, resolved deck config, template payload or serving order, and building
 * those objects once per filtered deck used to multiply synchronous work on screen focus.
 * Filtered decks claim overlapping cards in the supplied deck order, matching the previous UI.
 */
export function getFilteredDeckCountCards(
    decks: ReadonlyArray<FilteredDeckCountDefinition>,
    settings: Pick<AppSettings, 'dayRolloverHour' | 'learnAheadMinutes' | 'fsrsEnabled'>,
    nowMs: number = Date.now(),
): Map<number, FilteredDeckCountCard[]> {
    const result = new Map<number, FilteredDeckCountCard[]>();
    const activeDecks = decks.filter((deck) => {
        result.set(deck.id, []);
        return !deck.filteredDeckEmpty;
    });
    if (activeDecks.length === 0) return result;

    type BatchRow = {
        filteredDeckId: number;
        cardId: number;
        homeDeckId: number;
        type: number;
        queue: number;
        noteData: string;
        noteTypeData: string;
    };

    // Each term's cards in gather order, deck by deck and term by term, as Anki builds them.
    const gathered: Array<{ filteredDeckId: number; cardId: number }> = [];
    for (const deck of activeDecks) {
        const terms = [
            { search: deck.searchQuery ?? '', order: deck.searchOrder, limit: deck.searchLimit },
            ...(deck.searchQuery2?.trim()
                ? [{ search: deck.searchQuery2, order: deck.searchOrder2, limit: deck.searchLimit2 }]
                : []),
        ];
        for (const term of terms) {
            for (const cardId of gatherFilteredTermCardIds(term, settings, nowMs)) gathered.push({ filteredDeckId: deck.id, cardId });
        }
    }
    const details = new Map<number, Omit<BatchRow, 'filteredDeckId'>>();
    const uniqueIds = [...new Set(gathered.map((entry) => entry.cardId))];
    for (let index = 0; index < uniqueIds.length; index += 400) {
        const chunk = uniqueIds.slice(index, index + 400);
        for (const row of getDB().getAllSync<Omit<BatchRow, 'filteredDeckId'>>(
            `SELECT c.id AS cardId, c.deckId AS homeDeckId, c.type AS type, c.queue AS queue,
                n.data AS noteData, nt.data AS noteTypeData
             FROM anki_cards c
             JOIN notes n ON n.id = c.noteId
             JOIN note_types nt ON nt.id = n.noteTypeId
             WHERE c.id IN (${chunk.map(() => '?').join(', ')})`,
            ...chunk,
        )) details.set(Number(row.cardId), row);
    }
    const rows: BatchRow[] = gathered.flatMap(({ filteredDeckId, cardId }) => {
        const row = details.get(cardId);
        return row ? [{ ...row, filteredDeckId }] : [];
    });
    const deckById = new Map(activeDecks.map((deck) => [deck.id, deck]));
    const seenByFilteredDeck = new Map<number, Set<number>>();
    const claimedCardIds = new Set<number>();
    const catalogUnlocked = isPaidCatalogUnlocked();

    for (const row of rows) {
        const deck = deckById.get(row.filteredDeckId);
        if (!deck) continue;
        if ((deck.filteredDoneCardIds ?? []).includes(row.cardId)) continue;
        if (row.cardId > (deck.filteredBuildAt ?? nowMs) + 999) continue;

        const seen = seenByFilteredDeck.get(deck.id) ?? new Set<number>();
        seenByFilteredDeck.set(deck.id, seen);
        if (seen.has(row.cardId) || claimedCardIds.has(row.cardId)) continue;

        try {
            const note = JSON.parse(row.noteData) as Note;
            JSON.parse(row.noteTypeData);
            if (!catalogUnlocked && isCatalogNote(note)) continue;
        } catch (error) {
            console.warn('[StudyRepo] Skipping corrupt filtered count row:', row.cardId, error);
            continue;
        }

        seen.add(row.cardId);
        claimedCardIds.add(row.cardId);
        const status: CardState['status'] = row.queue === 0
            ? 'new'
            : row.queue === 1 || row.queue === 3 || row.type === 1 || row.type === 3
                ? 'learning'
                : 'review';
        result.get(deck.id)!.push({ cardId: row.cardId, homeDeckId: row.homeDeckId, status });
    }

    return result;
}

/**
 * Card ids currently owned by a filtered-deck build. Filtered decks do not become the
 * physical `deckId` of their cards, so read-only deck scopes (Browser/Stats) must use this
 * membership instead of comparing the card's home deck name.
 */
export function getFilteredDeckCardIds(deckName: string, settings: AppSettings): number[] {
    const deck = getDeckByName(deckName);
    if (!deck?.isFiltered) return [];

    const queue = buildFilteredDeckQueue(deck, settings, Date.now());
    return (queue.allSessionCards ?? queue.cards).map((card) => card.cardId);
}

/** Count the cards a filtered-deck configuration would gather without mutating the collection. */
export function getFilteredDeckMatchCount(
    settings: AppSettings,
    options: Pick<Deck, 'searchQuery' | 'searchLimit' | 'searchOrder' | 'searchQuery2' | 'searchLimit2' | 'searchOrder2'>,
): number {
    const nowMs = Date.now();
    const preview = buildFilteredDeckQueue({
        ...options,
        filteredDeckEmpty: false,
        filteredDoneCardIds: [],
        filteredBuildAt: nowMs,
    }, settings, nowMs);
    return preview.allSessionCards?.length ?? preview.cards.length;
}

/**
 * How many cards a prospective filtered-deck term would gather. Anki refuses to build a custom
 * study session whose search returns nothing, so the dialog asks this before creating the deck.
 * Counting through the deck-list path keeps the answer identical to what the session will hold —
 * suspended, buried and locked catalog cards are excluded — without materializing study cards.
 */
export function getFilteredDeckGatherCount(
    settings: Pick<AppSettings, 'dayRolloverHour' | 'learnAheadMinutes' | 'fsrsEnabled'>,
    term: { search: string; limit: number; order: number },
): number {
    const probeDeckId = -1;
    const counts = getFilteredDeckCountCards([{
        id: probeDeckId,
        searchQuery: term.search,
        searchLimit: term.limit,
        searchOrder: term.order,
        filteredDeckEmpty: false,
        filteredDoneCardIds: [],
        filteredBuildAt: Date.now(),
    }], settings);
    return counts.get(probeDeckId)?.length ?? 0;
}

/** Count suspended/buried cards that match one or more filters but cannot be gathered. */
export function getFilteredDeckExcludedCount(searchQueries: string[]): number {
    const excludedIds = new Set<number>();
    for (const searchQuery of searchQueries) {
        if (!searchQuery.trim()) continue;
        const filtered = buildFilteredSearchClause(searchQuery);
        const where = filtered.clauses.length > 0 ? filtered.clauses.join(' AND ') : '1=1';
        const rows = loadRowsByQueue(
            `c.queue < 0 AND ${where}`,
            filtered.params,
            null,
            null,
            null,
            'c.id ASC',
            false,
        );
        rows.forEach((row) => excludedIds.add(row.cardId));
    }
    return excludedIds.size;
}
