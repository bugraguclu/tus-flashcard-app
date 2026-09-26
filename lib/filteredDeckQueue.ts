import { getDB } from './db';
import { CUSTOM_STUDY_MAX_VALUE } from './customStudy';
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

/**
 * Gather order for one filtered-deck term, keyed by Anki's `SearchTerm.Order` ordinal.
 *
 * Mirrors `order_and_limit_for_search` in rslib/src/storage/card/filtered.rs, which is the only
 * place upstream defines what each ordinal means:
 * https://github.com/ankitects/anki/blob/main/rslib/src/storage/card/filtered.rs
 *
 * Two of its expressions are deliberately not copied. Anki resolves both retrievability orders
 * through an FSRS memory state and, when FSRS is off, returns an empty clause so the term falls
 * back to its id tiebreak; and it answers relative overdueness with a registered Rust function
 * over that same state. Neither can be written as portable SQLite here, so both are approximated
 * by overdue time relative to the last interval and recorded as a known difference in
 * docs/ANKI_COMPATIBILITY.md rather than presented as parity.
 *
 * `today` is the local day number `due` is expressed in for review cards, and `nowMs` the clock
 * the learning queue is timed against; the Due order needs both to put the two on one timeline.
 */
function filteredOrderSql(order: number | undefined, today: number, nowMs: number): string {
    // Anki tiebreaks with a hash of the card id; card id ascending is the stable local equivalent.
    const tiebreak = 'c.id ASC';
    switch (order) {
        // A card never reviewed has no revlog row: SQLite sorts that NULL first, which is what
        // "oldest reviewed first" means for a card with no reviews at all.
        case 0: return `(SELECT MAX(r.id) FROM revlog r WHERE r.cardId = c.id) ASC, ${tiebreak}`;
        case 1: return 'RANDOM()';
        case 2: return `c.ivl ASC, ${tiebreak}`;
        case 3: return `c.ivl DESC, ${tiebreak}`;
        case 4: return `c.lapses DESC, ${tiebreak}`;
        // Added order is the note's age, then the template position, so a note's cards stay
        // together and in template order instead of interleaving with other notes.
        case 5: return 'n.id ASC, c.ord ASC';
        case 7: return 'n.id DESC, c.ord ASC';
        case 8:
        case 10: return `${RELATIVE_OVERDUE_SQL} ASC, ${tiebreak}`;
        case 9: return `${RELATIVE_OVERDUE_SQL} DESC, ${tiebreak}`;
        // Due order has to compare a review card's day number against a learning card's clock
        // time. Anki converts the day numbers onto the clock, and so does this: a `due` past the
        // epoch threshold is already a timestamp, anything below it is a day number to project.
        default: return `(CASE WHEN c.due > ${DUE_IS_TIMESTAMP_ABOVE} THEN c.due`
            + ` ELSE (c.due - ${today}) * ${MS_PER_DAY} + ${nowMs} END) ASC, c.ord ASC`;
    }
}

/** Overdue time relative to the last interval; see the note in `filteredOrderSql`. */
const RELATIVE_OVERDUE_SQL = '(CAST(c.due AS REAL) - MAX(c.ivl, 1))';

/** `due` holds epoch milliseconds above this, and a day number or new-card position below it. */
const DUE_IS_TIMESTAMP_ABOVE = 1000000000;

const MS_PER_DAY = 86400000;

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
    const gatherGroup = (search: string, order: number | undefined, limit: number | undefined): QueueCardRow[] => {
        const filtered = buildFilteredSearchClause(search);
        const where = filtered.clauses.length > 0 ? filtered.clauses.join(' AND ') : '1=1';
        return loadRowsByQueue(
            `c.queue >= 0 AND ${where}`,
            filtered.params,
            null,
            null,
            null,
            filteredOrderSql(order, localDayNumber(nowMs, settings.dayRolloverHour), nowMs),
            true,
            Math.max(1, Math.min(CUSTOM_STUDY_MAX_VALUE, Math.floor(limit ?? 100))),
        ).filter((row) => !completedIds.has(row.cardId) && row.cardId <= buildAt + 999);
    };

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
 * Build every filtered-deck row counter with one repository query.
 *
 * This deliberately returns only membership + scheduler state. The deck list does not need a
 * materialized StudyCard, resolved deck config, template payload or serving order, and building
 * those objects once per filtered deck used to multiply synchronous work on screen focus.
 * Filtered decks claim overlapping cards in the supplied deck order, matching the previous UI.
 */
export function getFilteredDeckCountCards(
    decks: ReadonlyArray<FilteredDeckCountDefinition>,
    settings: Pick<AppSettings, 'dayRolloverHour' | 'learnAheadMinutes'>,
    nowMs: number = Date.now(),
): Map<number, FilteredDeckCountCard[]> {
    const result = new Map<number, FilteredDeckCountCard[]>();
    const activeDecks = decks.filter((deck) => {
        result.set(deck.id, []);
        return !deck.filteredDeckEmpty;
    });
    if (activeDecks.length === 0) return result;
    const today = localDayNumber(nowMs, settings.dayRolloverHour);

    type BatchRow = {
        filteredDeckId: number;
        deckOrder: number;
        groupIndex: number;
        groupPosition: number;
        cardId: number;
        homeDeckId: number;
        type: number;
        queue: number;
        noteData: string;
        noteTypeData: string;
    };

    const branches: string[] = [];
    const params: Array<string | number> = [];
    activeDecks.forEach((deck, deckOrder) => {
        const groups = [
            { search: deck.searchQuery ?? '', order: deck.searchOrder, limit: deck.searchLimit },
            ...(deck.searchQuery2?.trim()
                ? [{ search: deck.searchQuery2, order: deck.searchOrder2, limit: deck.searchLimit2 }]
                : []),
        ];
        groups.forEach((group, groupIndex) => {
            const filtered = buildFilteredSearchClause(group.search);
            const where = filtered.clauses.length > 0 ? filtered.clauses.join(' AND ') : '1=1';
            const limit = Math.max(1, Math.min(CUSTOM_STUDY_MAX_VALUE, Math.floor(group.limit ?? 100)));
            branches.push(
                `SELECT * FROM (
                    SELECT
                        ? AS filteredDeckId,
                        ? AS deckOrder,
                        ? AS groupIndex,
                        ROW_NUMBER() OVER (ORDER BY ${filteredOrderSql(group.order, today, nowMs)}) AS groupPosition,
                        c.id AS cardId,
                        c.deckId AS homeDeckId,
                        c.type AS type,
                        c.queue AS queue,
                        n.data AS noteData,
                        nt.data AS noteTypeData
                    FROM anki_cards c
                    JOIN notes n ON n.id = c.noteId
                    JOIN note_types nt ON nt.id = n.noteTypeId
                    JOIN decks d ON d.id = c.deckId
                    WHERE c.queue >= 0 AND ${where}
                ) WHERE groupPosition <= ?`,
            );
            params.push(deck.id, deckOrder, groupIndex, ...filtered.params, limit);
        });
    });

    const rows = getDB().getAllSync<BatchRow>(
        `${branches.join(' UNION ALL ')} ORDER BY deckOrder, groupIndex, groupPosition`,
        ...params,
    );
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
    settings: Pick<AppSettings, 'dayRolloverHour' | 'learnAheadMinutes'>,
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
