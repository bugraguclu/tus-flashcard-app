import {
    getAddedDays,
    getAnkiStatsSnapshot,
    getDeckTypeCounts,
    getHourBreakdown,
    getReviewDays,
    type AddedDay,
    type AnkiStatsSnapshot,
    type HourBucket,
    type ReviewDay,
    type StatsDateRange,
} from './ankiStats';
import { deckProgressPercent } from './statsPresentation';
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
    studyScopeSettings,
    type BrowserCardQuery,
} from './studyRepository';
import { getAllSubjects } from './subjects';
import type { AppSettings, StudyCard, Subject } from './types';
import { localDayNumber } from './ankiState';
import type { StatsSnapshotSection } from './readErrorState';
import {
    EMPTY_TODAY_PLAN_PROGRESS,
    getTodayPlanProgress,
    type TodayPlanProgress,
} from './todayPlanProgress';

export type { StatsSnapshotSection } from './readErrorState';

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
    futureDueWithBacklog: [],
    futureDueWithBacklogTotal: 0,
    futureDueWithBacklogTodayIndex: 0,
    futureDueBacklogTotal: 0,
    backlogTotal: 0,
    dueTomorrow: 0,
    dailyLoad: 0,
    answerButtons: [1, 2, 3, 4].map((ease) => ({
        ease: ease as 1 | 2 | 3 | 4,
        learning: 0,
        young: 0,
        mature: 0,
    })),
    intervals: [],
    intervalsBeyondRange: 0,
    averageInterval: 0,
    longestInterval: 0,
    cardCounts: { mature: 0, youngLearn: 0, unseen: 0, suspendedBuried: 0, totalCards: 0, totalNotes: 0 },
};

export interface StatsDeckProgress {
    name: string;
    displayName: string;
    total: number;
    newCount: number;
    learningCount: number;
    youngCount: number;
    matureCount: number;
    /** Cards studied at least once, whatever queue they sit in now. */
    studied: number;
    pct: number;
}

export interface StatsScreenSnapshot {
    ankiStats: AnkiStatsSnapshot;
    todayStats: TodayAnswerStats;
    todayPlan: TodayPlanProgress;
    streak: StudyStreak;
    /** Every study day with answers; the Reviews graph buckets them by the chosen range. */
    reviewDays: ReviewDay[];
    /** Every study day cards were added on, for the Added graph. */
    addedDays: AddedDay[];
    hours: HourBucket[];
    deckStats: StatsDeckProgress[];
    decks: Deck[];
    filteredScopeCardIds?: number[];
    currentWeekStudiedDays: Set<string>;
    /** Deck scope and date range this snapshot was actually built for. */
    scopeDeckName: string | null;
    scopeRange: StatsDateRange;
    /** Sections whose read failed during a partial snapshot; empty when complete. */
    failedSections: StatsSnapshotSection[];
}

export interface StatsScreenSnapshotParams {
    deckName: string | null;
    range: StatsDateRange;
    settings: AppSettings;
    localeTag: string;
    includeBacklog?: boolean;
}

/** One read model for every database-backed section on Statistics. */
export function getStatsScreenSnapshot(params: StatsScreenSnapshotParams): StatsScreenSnapshot {
    const failedSections: StatsSnapshotSection[] = [];
    let firstError: unknown = null;
    const recordFailure = (section: StatsSnapshotSection, error: unknown) => {
        if (!failedSections.includes(section)) failedSections.push(section);
        if (firstError === null) firstError = error;
    };

    let decks: Deck[] = [];
    let decksFailed = false;
    try {
        decks = getAllDecks();
    } catch (error) {
        decksFailed = true;
        recordFailure('decks', error);
        console.warn('[Stats] deck list failed:', error);
    }

    let filteredScopeCardIds: number[] | undefined;
    if (decksFailed && params.deckName) {
        // Without the deck list we cannot tell whether the scoped deck is filtered (which needs
        // explicit card-id membership); throw rather than querying by deck name and returning zeros.
        throw firstError instanceof Error ? firstError : new Error('Deck list read failed');
    }
    const scopeDeck = params.deckName
        ? decks.find((deck) => deck.name === params.deckName) ?? null
        : null;
    if (scopeDeck?.isFiltered) {
        try {
            filteredScopeCardIds = getFilteredDeckCardIds(scopeDeck.name, params.settings);
        } catch (error) {
            recordFailure('filteredScope', error);
            console.warn('[Stats] filtered deck membership failed:', error);
            // A filtered deck whose membership failed cannot validly compute any section without
            // producing misleading zeros; propagate so the screen shows an error instead.
            throw error;
        }
    }
    const rolloverHour = params.settings.dayRolloverHour;
    let succeededSections = 0;

    let ankiStats = EMPTY_ANKI_STATS;
    try {
        ankiStats = getAnkiStatsSnapshot(
            params.deckName,
            params.range,
            rolloverHour,
            params.localeTag,
            filteredScopeCardIds,
            params.includeBacklog !== undefined ? { includeBacklog: params.includeBacklog } : undefined,
        );
        succeededSections += 1;
    } catch (error) {
        recordFailure('ankiStats', error);
        console.warn('[Stats] Anki graphs failed:', error);
    }

    let todayStats = EMPTY_TODAY_STATS;
    try {
        todayStats = getTodayAnswerStats(rolloverHour, params.deckName ?? undefined, filteredScopeCardIds);
        succeededSections += 1;
    } catch (error) {
        recordFailure('todayStats', error);
        console.warn('[Stats] getTodayAnswerStats failed:', error);
    }

    let todayPlan = EMPTY_TODAY_PLAN_PROGRESS;
    try {
        todayPlan = getTodayPlanProgress(rolloverHour);
        succeededSections += 1;
    } catch (error) {
        recordFailure('todayPlan', error);
        console.warn('[Stats] getTodayPlanProgress failed:', error);
    }

    let streak = EMPTY_STUDY_STREAK;
    try {
        streak = getStudyStreak(rolloverHour);
        succeededSections += 1;
    } catch (error) {
        recordFailure('streak', error);
        console.warn('[Stats] getStudyStreak failed:', error);
    }

    const todayDay = localDayNumber(Date.now(), rolloverHour);
    const monday = todayDay - ((new Date(todayDay * 86_400_000).getUTCDay() + 6) % 7);
    let currentWeekStudiedDays = new Set<string>();
    try {
        currentWeekStudiedDays = getStudiedDaysBetween(monday, monday + 6, rolloverHour);
        succeededSections += 1;
    } catch (error) {
        recordFailure('currentWeek', error);
        console.warn('[Stats] current week failed:', error);
    }

    let reviewDays: ReviewDay[] = [];
    try {
        reviewDays = getReviewDays(params.deckName, rolloverHour, filteredScopeCardIds);
        succeededSections += 1;
    } catch (error) {
        recordFailure('reviewDays', error);
        console.warn('[Stats] review history failed:', error);
    }

    let addedDays: AddedDay[] = [];
    try {
        addedDays = getAddedDays(params.deckName, rolloverHour, filteredScopeCardIds);
        succeededSections += 1;
    } catch (error) {
        recordFailure('addedDays', error);
        console.warn('[Stats] added history failed:', error);
    }

    let hours: HourBucket[] = [];
    try {
        hours = getHourBreakdown(params.deckName, params.range, filteredScopeCardIds);
        succeededSections += 1;
    } catch (error) {
        recordFailure('hours', error);
        console.warn('[Stats] hourly breakdown failed:', error);
    }

    let deckStats: StatsDeckProgress[] = [];
    if (decksFailed) {
        recordFailure('deckStats', firstError);
    } else {
        try {
            const regularDecks = decks.filter((deck) => !deck.isFiltered);
            const perDeck = getDeckTypeCounts();
            deckStats = getDirectDecksForScope(regularDecks, params.deckName)
                .map((root) => {
                    const totals = { total: 0, newCount: 0, learningCount: 0, youngCount: 0, matureCount: 0 };
                    for (const deck of regularDecks) {
                        if (deck.name !== root.name && !deck.name.startsWith(`${root.name}::`)) continue;
                        const counts = perDeck.get(deck.id);
                        if (!counts) continue;
                        totals.total += counts.total;
                        totals.newCount += counts.newCards;
                        totals.learningCount += counts.learn;
                        totals.youngCount += counts.young;
                        totals.matureCount += counts.mature;
                    }
                    const studied = totals.total - totals.newCount;
                    return {
                        name: root.name,
                        displayName: getDeckDisplayName(root.name),
                        ...totals,
                        studied,
                        pct: deckProgressPercent(studied, totals.total),
                    };
                })
                .sort((a, b) => a.name.localeCompare(b.name, params.localeTag));
            succeededSections += 1;
        } catch (error) {
            recordFailure('deckStats', error);
            console.warn('[Stats] deck stats failed:', error);
        }
    }

    if (succeededSections === 0 && failedSections.length > 0) {
        throw firstError instanceof Error ? firstError : new Error('Statistics read failed');
    }

    return {
        ankiStats,
        todayStats,
        todayPlan,
        streak,
        reviewDays,
        addedDays,
        hours,
        deckStats,
        decks,
        filteredScopeCardIds,
        currentWeekStudiedDays,
        scopeDeckName: params.deckName,
        scopeRange: params.range,
        failedSections,
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
        // The overview previews the reviewer's queue, so it runs with the reviewer's settings:
        // the deck's own preset and limits, not the collection's Default.
        queue = getStudyQueue({ settings: studyScopeSettings(settings, deck.name), selectedDeckName: deck.name });
    } catch (error) {
        console.warn('[DeckOverview] queue peek failed:', error);
    }
    const buriedCount = getBuriedCountForDeck(deck.id);
    return { deck, queue, buriedCount };
}
