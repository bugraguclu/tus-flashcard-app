import { getDB } from './db';
import type { CardState, AppSettings } from './types';
import type { Deck, Note } from './models';
import { localDayNumber } from './ankiState';
import { todayLocalYMD } from './scheduler';
import { getDeckByName } from './deckStore';
import { filteredDeckMemberIds } from './filteredDeckMembership';
import { gatherFilteredTermCardIds } from './filteredDeckGather';
export { gatherFilteredTermCardIds } from './filteredDeckGather';
import { isCatalogNote, isCatalogStudyAvailable } from './catalogProtection';
import type { StudyQueueResult } from './studyQueue';
import { loadRowsByQueue, toStudyCards, type QueueCardRow } from './studyCardRows';
import { buildFilteredSearchClause } from './studySearchSql';

/**
 * Filtered-deck build membership, serving order and counters. Searches run only for a new build.
 */

/** Queue rows for these cards, in the order given. */
function queueRowsInOrder(cardIds: readonly number[]): QueueCardRow[] {
    const byId = new Map<number, QueueCardRow>();
    for (let index = 0; index < cardIds.length; index += 400) {
        const chunk = cardIds.slice(index, index + 400);
        for (const row of loadRowsByQueue(`c.id IN (${chunk.map(() => '?').join(', ')})`, [...chunk], null, null, null, 'c.id ASC', true, undefined, false)) {
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
type FilteredDeckQueueDefinition = { id?: number } & Pick<Deck,
    | 'searchQuery'
    | 'searchLimit'
    | 'searchOrder'
    | 'searchQuery2'
    | 'searchLimit2'
    | 'searchOrder2'
    | 'filteredDeckEmpty'
    | 'filteredDoneCardIds'
    | 'filteredPreviewDue'
    | 'filteredBuildAt'
    | 'reschedule'
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
    const rows = queueRowsInOrder(filteredDeckMemberIds(deck, settings, nowMs))
        .filter((row) => row.queue >= 0 && !completedIds.has(row.cardId));

    const gatheredCards = toStudyCards(rows, settings, nowMs, { settingsCache: new Map() });
    const todayYmd = todayLocalYMD(new Date(nowMs), settings.dayRolloverHour);
    // A previewed card waiting out its delay is Anki's preview repeat: an intraday learning card
    // that is held back until its time and then shown ahead of the rest, earliest first.
    const previewDue = (card: { cardId: number }): number | undefined => deck.filteredPreviewDue?.[String(card.cardId)];
    const returningPreviews = gatheredCards
        .filter((card) => (previewDue(card) ?? Number.POSITIVE_INFINITY) <= nowMs)
        .sort((a, b) => previewDue(a)! - previewDue(b)!);
    // New and review cards are intentionally gathered regardless of dueness (preview/review
    // ahead). With rescheduling on, learning cards still obey their step timer, or a failed card
    // would immediately loop after every queue refresh. A preview deck ignores it: Anki moves
    // every card it gathers there into the review queue.
    const previewDeck = deck.reschedule === false;
    const cards = [...returningPreviews, ...gatheredCards.filter((card) => {
        if (previewDue(card) !== undefined) return false;
        if (previewDeck || card.state.status !== 'learning') return true;
        if (card.state.dueTime > 0) return card.state.dueTime <= nowMs;
        return card.state.dueDate <= todayYmd;
    })];
    const statusOf = (card: typeof gatheredCards[number]) => (previewDue(card) !== undefined ? 'learning' : card.state.status);
    const stats = {
        newCount: gatheredCards.filter((card) => statusOf(card) === 'new').length,
        learningCount: gatheredCards.filter((card) => statusOf(card) === 'learning').length,
        reviewCount: gatheredCards.filter((card) => statusOf(card) === 'review').length,
    };

    const futureLearningTimes = gatheredCards
        .map((card) => previewDue(card) ?? (!previewDeck && card.state.status === 'learning' ? card.state.dueTime : 0))
        .filter((dueTime) => dueTime > nowMs);

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
    /** How the filtered deck counts the card. */
    status: CardState['status'];
    /** How the home deck counted the card before the filtered deck took it. */
    homeStatus: CardState['status'];
    homeCounted: boolean;
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
    | 'filteredPreviewDue'
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
        due: number;
        noteData: string;
        noteTypeData: string;
    };

    // Each term's cards in gather order, deck by deck and term by term, as Anki builds them.
    const gathered: Array<{ filteredDeckId: number; cardId: number }> = [];
    for (const deck of activeDecks) {
        for (const cardId of filteredDeckMemberIds(deck, settings, nowMs)) gathered.push({ filteredDeckId: deck.id, cardId });
    }
    const details = new Map<number, Omit<BatchRow, 'filteredDeckId'>>();
    const uniqueIds = [...new Set(gathered.map((entry) => entry.cardId))];
    for (let index = 0; index < uniqueIds.length; index += 400) {
        const chunk = uniqueIds.slice(index, index + 400);
        for (const row of getDB().getAllSync<Omit<BatchRow, 'filteredDeckId'>>(
            `SELECT c.id AS cardId, c.deckId AS homeDeckId, c.type AS type, c.queue AS queue, c.due AS due,
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
    const catalogUnlocked = isCatalogStudyAvailable();

    for (const row of rows) {
        const deck = deckById.get(row.filteredDeckId);
        if (!deck || row.queue < 0) continue;
        if ((deck.filteredDoneCardIds ?? []).includes(row.cardId)) continue;

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
        const homeStatus: CardState['status'] = row.queue === 0
            ? 'new'
            : row.queue === 1 || row.queue === 3 || row.type === 1 || row.type === 3
                ? 'learning'
                : 'review';
        // A previewed card waiting out its delay counts as learning, as Anki's preview repeat does.
        // Answering in preview leaves the card itself untouched, so its home deck still counts it
        // as `homeStatus`.
        const status = deck.filteredPreviewDue?.[String(row.cardId)] !== undefined ? 'learning' : homeStatus;
        const today = localDayNumber(nowMs, settings.dayRolloverHour);
        const homeCounted = row.queue === 0 || (row.queue === 1
            ? row.due <= nowMs + Math.max(0, settings.learnAheadMinutes || 0) * 60000
            : (row.queue === 2 || row.queue === 3) && row.due <= today);
        result.get(deck.id)!.push({ cardId: row.cardId, homeDeckId: row.homeDeckId, status, homeStatus, homeCounted });
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
