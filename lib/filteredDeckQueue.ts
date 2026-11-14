import { getDB } from './db';
import type { CardState, AppSettings } from './types';
import type { Deck, DeckConfig, Note } from './models';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { getDeckByName } from './deckStore';
import { getDeckConfigForDeck } from './deckLimits';
import { answeredSinceBuild, serveFilteredDeckCards } from './filteredDeckServing';
import { parseAnkiCardData } from './fsrsCardData';
import { filteredDeckMemberIds, gatherFilteredDeckMemberIds, storedFilteredDeckMemberIds } from './filteredDeckMembership';
export { gatherFilteredTermCardIds } from './filteredDeckGather';
import { isCatalogNote, isCatalogStudyAvailable } from './catalogProtection';
import type { StudyQueueResult } from './studyQueue';
import { loadRowsByQueue, toStudyCards, type QueueCardRow } from './studyCardRows';
import { buildFilteredSearchClause, cardJsonSql } from './studySearchSql';

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
 * ordered and capped per filter group. Suspended/buried cards stay out. The home decks'
 * daily limits do not apply; the deck is dealt in Anki's order with its fixed 9,999 limits
 * (lib/filteredDeckServing.ts).
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

/** `studyAheadIds`: the reviewer's "Beklemeden çalış" pass (`extraLearningCardIds`). */
export function buildFilteredDeckQueue(
    deck: FilteredDeckQueueDefinition,
    settings: AppSettings,
    nowMs: number,
    studyAheadIds?: readonly number[],
): StudyQueueResult {
    return queueForMembers(deck, filteredDeckMemberIds(deck, settings, nowMs), settings, nowMs, studyAheadIds);
}

/**
 * The cards of the deck's build still waiting on a learning step or a preview delay, soonest first:
 * what "Beklemeden çalış" deals now. The regular study scope cannot find them, since it leaves out
 * every card a filtered deck has reserved, this deck's own included. A learning card the build
 * gathered and nobody has answered yet is dealt at once anyway; listing it changes nothing.
 */
export function filteredDeckWaitingCards(deck: FilteredDeckQueueDefinition, nowMs: number): Array<{ cardId: number; due: number }> {
    if (deck.filteredDeckEmpty) return [];
    const completed = new Set(deck.filteredDoneCardIds ?? []);
    const memberIds = (storedFilteredDeckMemberIds(deck) ?? []).filter((id) => !completed.has(id));
    if (memberIds.length === 0) return [];
    const rows = getDB().getAllSync<{ id: number; queue: number; due: number }>(
        'SELECT id, queue, due FROM anki_cards WHERE id IN (SELECT value FROM json_each(?))',
        JSON.stringify(memberIds),
    );
    const preview = deck.reschedule === false;
    return rows.flatMap((row) => {
        const cardId = Number(row.id);
        if (row.queue < 0) return [];
        // As the serving reads them: a preview delay first, then a learning step's due time.
        const previewDue = deck.filteredPreviewDue?.[String(cardId)];
        if (previewDue !== undefined) return previewDue > nowMs ? [{ cardId, due: previewDue }] : [];
        return !preview && row.queue === 1 && row.due > nowMs ? [{ cardId, due: Number(row.due) }] : [];
    }).sort((a, b) => a.due - b.due || a.cardId - b.cardId);
}

function queueForMembers(
    deck: FilteredDeckQueueDefinition,
    memberIds: readonly number[],
    settings: AppSettings,
    nowMs: number,
    studyAheadIds?: readonly number[],
): StudyQueueResult {
    if (deck.filteredDeckEmpty) {
        return {
            cards: [],
            mainQueue: { start: 0, end: 0 },
            learningComesDueAt: null,
            stats: { newCount: 0, learningCount: 0, reviewCount: 0 },
            nextLearningDue: null,
            dailyNewLimitReached: false,
            heldBackNewCount: 0,
            heldBackReviewCount: 0,
            upcomingCardsCount: 0,
        };
    }

    const completedIds = new Set(deck.filteredDoneCardIds ?? []);
    const rows = queueRowsInOrder(memberIds)
        .filter((row) => row.queue >= 0 && !completedIds.has(row.cardId));

    const gatheredCards = toStudyCards(rows, settings, nowMs, { settingsCache: new Map(), includeRawCard: true });
    const buryOptions = new Map<number, DeckConfig>();
    // Anki deals the deck in its own order, with the collection's learn ahead limit (FLT-7: a
    // learning card the build gathered is dealt at once; once answered it waits for its step).
    const serving = serveFilteredDeckCards(gatheredCards, {
        preview: deck.reschedule === false,
        buildAtMs: deck.filteredBuildAt ?? 0,
        previewDueOf: (card) => deck.filteredPreviewDue?.[String(card.cardId)],
        nowMs,
        learnAheadMs: Math.max(0, settings.learnAheadMinutes || 0) * 60_000,
        today: localDayNumber(nowMs, settings.dayRolloverHour),
        nextDayAtMs: nextRolloverMs(nowMs, settings.dayRolloverHour),
        buryOptionsOf: (card) => {
            let config = buryOptions.get(card.deckId);
            if (!config) {
                config = getDeckConfigForDeck(card.deckId, settings.dayRolloverHour);
                buryOptions.set(card.deckId, config);
            }
            return config;
        },
        modOf: (card) => Number(card.rawCard?.mod) || 0,
        studyAheadIds: studyAheadIds && studyAheadIds.length > 0 ? new Set(studyAheadIds) : undefined,
    });

    return {
        cards: serving.cards,
        mainQueue: serving.mainQueue,
        learningComesDueAt: serving.learningComesDueAt,
        allSessionCards: gatheredCards,
        stats: serving.stats,
        nextLearningDue: serving.nextLearningDue,
        dailyNewLimitReached: false,
        // Anki's fixed limits for a deck without a preset are applied by the serving order above.
        heldBackNewCount: 0,
        heldBackReviewCount: 0,
        upcomingCardsCount: serving.waitingCount,
    };
}

export interface FilteredDeckCountCard {
    cardId: number;
    homeDeckId: number;
    /** How the filtered deck counts the card. */
    status: CardState['status'];
    /**
     * Whether the deck list counts it now: a learning card answered in this build only once it is
     * due within the learn ahead limit (day learning: today), a waiting preview only inside it.
     */
    counted: boolean;
    /** Counted as day learning, which spends the deck's review limit. */
    interday: boolean;
    /** How the home deck counted the card before the filtered deck took it. */
    homeStatus: CardState['status'];
    homeCounted: boolean;
    /** The home deck counted it as interday learning (queue 3), which spends its review limit. */
    homeInterday?: boolean;
}

type FilteredDeckCountDefinition = Pick<Deck,
    | 'id'
    | 'reschedule'
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
    return countCardsForMembers(decks, (deck) => filteredDeckMemberIds(deck, settings, nowMs), settings, nowMs);
}

function countCardsForMembers(
    decks: ReadonlyArray<FilteredDeckCountDefinition>,
    memberIdsOf: (deck: FilteredDeckCountDefinition) => readonly number[],
    settings: Pick<AppSettings, 'dayRolloverHour' | 'learnAheadMinutes' | 'fsrsEnabled'>,
    nowMs: number,
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
        lastReview: number | null;
        ankiData: string | null;
        noteData: string;
        noteTypeData: string;
    };

    // Each term's cards in gather order, deck by deck and term by term, as Anki builds them.
    const gathered: Array<{ filteredDeckId: number; cardId: number }> = [];
    for (const deck of activeDecks) {
        for (const cardId of memberIdsOf(deck)) gathered.push({ filteredDeckId: deck.id, cardId });
    }
    const details = new Map<number, Omit<BatchRow, 'filteredDeckId'>>();
    const uniqueIds = [...new Set(gathered.map((entry) => entry.cardId))];
    for (let index = 0; index < uniqueIds.length; index += 400) {
        const chunk = uniqueIds.slice(index, index + 400);
        for (const row of getDB().getAllSync<Omit<BatchRow, 'filteredDeckId'>>(
            `SELECT c.id AS cardId, c.deckId AS homeDeckId, c.type AS type, c.queue AS queue, c.due AS due,
                ${cardJsonSql('$.lastReview')} AS lastReview, ${cardJsonSql('$.ankiData')} AS ankiData,
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
    const today = localDayNumber(nowMs, settings.dayRolloverHour);
    const learnCutoff = nowMs + Math.max(0, settings.learnAheadMinutes || 0) * 60_000;

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
        // A preview deck (rescheduling off) counts its other cards as review, like its queue.
        const previewDue = deck.filteredPreviewDue?.[String(row.cardId)];
        const status = previewDue !== undefined
            ? 'learning'
            : deck.reschedule === false ? 'review' : homeStatus;
        const homeCounted = row.queue === 0 || (row.queue === 1
            ? row.due <= learnCutoff
            : (row.queue === 2 || row.queue === 3) && row.due <= today);
        // Anki's deck list counts a learning card only once it is due within the learn ahead limit
        // (day learning: due today). One the build gathered is due at once, on its gather position;
        // one answered since then waits for its step like any other.
        let counted = true;
        if (previewDue !== undefined) {
            counted = previewDue <= learnCutoff;
        } else if (deck.reschedule !== false && (row.queue === 1 || row.queue === 3)) {
            const lrt = row.ankiData ? parseAnkiCardData(row.ankiData).lastReviewTimeSecs : undefined;
            const lastReviewedAtMs = lrt !== undefined && lrt > 0 ? lrt * 1000 : Number(row.lastReview) || 0;
            if (answeredSinceBuild(lastReviewedAtMs, deck.filteredBuildAt ?? 0)) {
                counted = row.queue === 1 ? row.due < learnCutoff : row.due <= today;
            }
        }
        result.get(deck.id)!.push({
            cardId: row.cardId,
            homeDeckId: row.homeDeckId,
            status,
            counted,
            interday: status === 'learning' && previewDue === undefined && row.queue === 3,
            homeStatus,
            homeCounted,
            homeInterday: row.queue === 3,
        });
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

/**
 * Count the cards a filtered-deck configuration would gather without mutating the collection.
 * `rebuiltDeckId` names the filtered deck this configuration would rebuild: its current cards
 * return home first, so they count; every other filtered deck keeps its reservation.
 */
export function getFilteredDeckMatchCount(
    settings: AppSettings,
    options: Pick<Deck, 'searchQuery' | 'searchLimit' | 'searchOrder' | 'searchQuery2' | 'searchLimit2' | 'searchOrder2'>,
    rebuiltDeckId?: number,
): number {
    const nowMs = Date.now();
    const definition = {
        ...options,
        filteredDeckEmpty: false,
        filteredDoneCardIds: [],
        filteredBuildAt: nowMs,
    };
    const preview = queueForMembers(definition, gatherFilteredDeckMemberIds(definition, settings, nowMs, rebuiltDeckId), settings, nowMs);
    return preview.allSessionCards?.length ?? preview.cards.length;
}

/**
 * How many cards a prospective filtered-deck term would gather. Anki refuses to build a custom
 * study session whose search returns nothing, so the dialog asks this before creating the deck.
 * Counting through the deck-list path keeps the answer identical to what the session will hold —
 * suspended, buried and locked catalog cards are excluded — without materializing study cards.
 * `rebuiltDeckId` is the existing session the new one would replace; its cards count, and the
 * probe never stores a membership of its own.
 */
export function getFilteredDeckGatherCount(
    settings: Pick<AppSettings, 'dayRolloverHour' | 'learnAheadMinutes' | 'fsrsEnabled'>,
    term: { search: string; limit: number; order: number },
    rebuiltDeckId?: number,
): number {
    const nowMs = Date.now();
    const probeDeckId = -1;
    const probe = {
        id: probeDeckId,
        searchQuery: term.search,
        searchLimit: term.limit,
        searchOrder: term.order,
        filteredDeckEmpty: false,
        filteredDoneCardIds: [],
        filteredBuildAt: nowMs,
    };
    const counts = countCardsForMembers(
        [probe],
        () => gatherFilteredDeckMemberIds(probe, settings, nowMs, rebuiltDeckId),
        settings,
        nowMs,
    );
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
