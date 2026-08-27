import { getAnkiStatsSnapshot, type AnkiStatsSnapshot, type StatsDateRange } from './ankiStats';
import {
    getAllDecks,
    getBuriedCountForDeck,
    getDeckByName,
    getDirectDecksForScope,
} from './deckManager';
import { getDeckDisplayName, type Deck, type NoteType } from './models';
import { getAllNoteTypes } from './noteManager';
import {
    getStudiedDaysBetween,
    getStudyStreak,
    getTodayAnswerStats,
    type StudyStreak,
    type TodayAnswerStats,
} from './reviewLogger';
import {
    getBrowserCardCount,
    getBrowserCards,
    getBrowserRowIdsMatchingText,
    getFilteredDeckCardIds,
    getStudyQueue,
    type BrowserCardQuery,
} from './studyRepository';
import { perDeckBucketsSql } from './statsHelpers';
import { getAllSubjects } from './subjects';
import type { AppSettings, StudyCard, Subject } from './types';
import { localDayNumber } from './ankiState';

export const EMPTY_TODAY_STATS: TodayAnswerStats = {
    reviewed: 0,
    passed: 0,
    failed: 0,
    newCardsIntroduced: 0,
    studyTimeMs: 0,
};

export const EMPTY_STUDY_STREAK: StudyStreak = { current: 0, studiedToday: false, best: 0 };

export const EMPTY_ANKI_STATS: AnkiStatsSnapshot = {
    futureDue: [],
    futureDueTotal: 0,
    futureDueTodayIndex: 0,
    backlogTotal: 0,
    dueTomorrow: 0,
    dailyLoad: 0,
    reviews: [],
    reviewMinutes: [],
    reviewTotal: 0,
    reviewTimeMs: 0,
    daysStudied: 0,
    answerButtons: [1, 2, 3, 4].map((ease) => ({
        ease: ease as 1 | 2 | 3 | 4,
        learning: 0,
        young: 0,
        mature: 0,
    })),
    intervals: [],
    averageInterval: 0,
    longestInterval: 0,
    cardCounts: { mature: 0, youngLearn: 0, unseen: 0, suspendedBuried: 0, totalCards: 0, totalNotes: 0 },
    added: [],
    addedTotal: 0,
    addedSpanDays: 0,
};

export interface StatsDeckProgress {
    name: string;
    displayName: string;
    total: number;
    newCount: number;
    learningCount: number;
    reviewCount: number;
    youngCount: number;
    matureCount: number;
    studied: number;
    pct: number;
}

export interface StatsScreenSnapshot {
    ankiStats: AnkiStatsSnapshot;
    todayStats: TodayAnswerStats;
    streak: StudyStreak;
    deckStats: StatsDeckProgress[];
    decks: Deck[];
    filteredScopeCardIds?: number[];
    currentWeekStudiedDays: Set<string>;
}

export interface StatsScreenSnapshotParams {
    deckName: string | null;
    range: StatsDateRange;
    settings: AppSettings;
    localeTag: string;
    includeBacklog: boolean;
}

/** One read model for every database-backed section on Statistics. */
export function getStatsScreenSnapshot(params: StatsScreenSnapshotParams): StatsScreenSnapshot {
    let decks: Deck[] = [];
    try {
        decks = getAllDecks();
    } catch (error) {
        console.warn('[Stats] deck list failed:', error);
    }

    let filteredScopeCardIds: number[] | undefined;
    const scopeDeck = params.deckName
        ? decks.find((deck) => deck.name === params.deckName) ?? null
        : null;
    if (scopeDeck?.isFiltered) {
        try {
            filteredScopeCardIds = getFilteredDeckCardIds(scopeDeck.name, params.settings);
        } catch (error) {
            console.warn('[Stats] filtered deck membership failed:', error);
            filteredScopeCardIds = [];
        }
    }

    let ankiStats = EMPTY_ANKI_STATS;
    try {
        ankiStats = getAnkiStatsSnapshot(
            params.deckName,
            params.range,
            params.settings.dayRolloverHour,
            params.localeTag,
            filteredScopeCardIds,
            { includeBacklog: params.includeBacklog },
        );
    } catch (error) {
        console.warn('[Stats] Anki graphs failed:', error);
    }

    let todayStats = EMPTY_TODAY_STATS;
    try {
        todayStats = getTodayAnswerStats(
            params.settings.dayRolloverHour,
            params.deckName ?? undefined,
            filteredScopeCardIds,
        );
    } catch (error) {
        console.warn('[Stats] getTodayAnswerStats failed:', error);
    }

    let streak = EMPTY_STUDY_STREAK;
    try {
        streak = getStudyStreak(params.settings.dayRolloverHour);
    } catch (error) {
        console.warn('[Stats] getStudyStreak failed:', error);
    }

    const todayDay = localDayNumber(Date.now(), params.settings.dayRolloverHour);
    const monday = todayDay - ((new Date(todayDay * 86_400_000).getUTCDay() + 6) % 7);
    let currentWeekStudiedDays = new Set<string>();
    try {
        currentWeekStudiedDays = getStudiedDaysBetween(
            monday,
            monday + 6,
            params.settings.dayRolloverHour,
        );
    } catch (error) {
        console.warn('[Stats] current week failed:', error);
    }

    let deckStats: StatsDeckProgress[] = [];
    try {
        const regularDecks = decks.filter((deck) => !deck.isFiltered);
        const perDeck = perDeckBucketsSql();
        deckStats = getDirectDecksForScope(regularDecks, params.deckName)
            .map((root) => {
                const totals = {
                    total: 0,
                    newCount: 0,
                    learningCount: 0,
                    reviewCount: 0,
                    youngCount: 0,
                    matureCount: 0,
                };
                for (const deck of regularDecks) {
                    if (deck.name !== root.name && !deck.name.startsWith(`${root.name}::`)) continue;
                    const bucket = perDeck.get(deck.id);
                    if (!bucket) continue;
                    totals.total += bucket.total;
                    totals.newCount += bucket.newCount;
                    totals.learningCount += bucket.learningCount;
                    totals.reviewCount += bucket.reviewCount;
                    totals.youngCount += bucket.youngCount;
                    totals.matureCount += bucket.matureCount;
                }
                const studied = totals.total - totals.newCount;
                return {
                    name: root.name,
                    displayName: getDeckDisplayName(root.name),
                    ...totals,
                    studied,
                    pct: totals.total > 0 ? Math.round((studied / totals.total) * 100) : 0,
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name, params.localeTag));
    } catch (error) {
        console.warn('[Stats] deck stats failed:', error);
    }

    return {
        ankiStats,
        todayStats,
        streak,
        deckStats,
        decks,
        filteredScopeCardIds,
        currentWeekStudiedDays,
    };
}

export interface BrowserScopeSnapshot {
    allDecks: Deck[];
    scopeDeck: Deck | null;
    scopedDeckIds: number[] | null;
    filteredScopeCardIds: number[] | null;
    subjects: Subject[];
    noteTypes: NoteType[];
}

export function getBrowserScopeSnapshot(
    deckName: string | null,
    settings: AppSettings,
): BrowserScopeSnapshot {
    const allDecks = getAllDecks();
    const scopeDeck = deckName ? allDecks.find((deck) => deck.name === deckName) ?? null : null;
    const scopedDeckIds = !deckName || scopeDeck?.isFiltered
        ? null
        : allDecks
            .filter((deck) => deck.name === deckName || deck.name.startsWith(`${deckName}::`))
            .map((deck) => deck.id);
    const filteredScopeCardIds = scopeDeck?.isFiltered
        ? getFilteredDeckCardIds(scopeDeck.name, settings)
        : null;
    return {
        allDecks,
        scopeDeck,
        scopedDeckIds,
        filteredScopeCardIds,
        subjects: getAllSubjects(),
        noteTypes: getAllNoteTypes(),
    };
}

export interface BrowserScreenSnapshot {
    scope: BrowserScopeSnapshot;
    query: BrowserCardQuery;
    cards: StudyCard[];
    scopeCardCount: number;
    totalCardCount: number;
    scopeHasCards: boolean;
    searchRowIds: number[] | null;
}

export interface BrowserScreenSnapshotParams {
    scope: BrowserScopeSnapshot;
    settings: AppSettings;
    query: Omit<BrowserCardQuery, 'deckIds' | 'cardIds' | 'limit' | 'offset'>;
    searchQuery: string;
    pageSize: number;
    hasActiveFilters: boolean;
}

/** First Browser page, count and ordered text-search ids from one coherent scope revision. */
export function getBrowserScreenSnapshot(params: BrowserScreenSnapshotParams): BrowserScreenSnapshot {
    const query: BrowserCardQuery = {
        ...params.query,
        deckIds: params.scope.scopedDeckIds ?? undefined,
        cardIds: params.scope.filteredScopeCardIds ?? undefined,
    };
    const scopeCardCount = getBrowserCardCount(query);
    const trimmedSearch = params.searchQuery.trim();
    const searchRowIds = trimmedSearch
        ? getBrowserRowIdsMatchingText(query, trimmedSearch)
        : null;
    const totalCardCount = searchRowIds?.length ?? scopeCardCount;
    const pageRowIds = searchRowIds?.slice(0, params.pageSize);
    const cards = getBrowserCards(params.settings, {
        ...query,
        ...(pageRowIds
            ? query.tableMode === 'notes'
                ? { noteIds: pageRowIds }
                : { cardIds: pageRowIds }
            : {}),
        limit: params.pageSize,
        offset: 0,
    });

    const baseScopeCount = params.hasActiveFilters
        ? getBrowserCardCount({
            tableMode: query.tableMode,
            deckIds: query.deckIds,
            cardIds: query.cardIds,
        })
        : scopeCardCount;

    return {
        scope: params.scope,
        query,
        cards,
        scopeCardCount,
        totalCardCount,
        scopeHasCards: baseScopeCount > 0,
        searchRowIds,
    };
}

export interface DeckOverviewSnapshot {
    deck: Deck | null;
    queue: ReturnType<typeof getStudyQueue> | null;
    buriedCount: number;
}

/** Preserve the existing queue-then-buried read order while moving both off initial render. */
export function getDeckOverviewSnapshot(
    deckName: string,
    settings: AppSettings,
): DeckOverviewSnapshot {
    const deck = deckName ? getDeckByName(deckName) : null;
    if (!deck) return { deck: null, queue: null, buriedCount: 0 };
    let queue: ReturnType<typeof getStudyQueue> | null = null;
    try {
        queue = getStudyQueue({ settings, selectedDeckName: deck.name });
    } catch (error) {
        console.warn('[DeckOverview] queue peek failed:', error);
    }
    const buriedCount = getBuriedCountForDeck(deck.id);
    return { deck, queue, buriedCount };
}
