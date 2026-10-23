import { getDB } from './db';
import { getAllSubjects } from './subjects';
import type { AppSettings, StudyCard } from './types';
import { getDeckAncestors, type DeckConfig } from './models';
import { ankiCardIdFromLegacyCardId, localDayNumber, nextRolloverMs } from './ankiState';
import { todayLocalYMD } from './scheduler';
import { decksInDisplayOrder, getAllDecks, getDeck, getDeckByName, getDeckConfigForDeck } from './deckManager';
import {
    buryBuildTimeSiblings,
    interleaveNewWithReviews,
    mixInterdayLearning,
    normalizeNewCardGatherOrder,
    shuffleNewCardsByNote,
    sortNewCards,
    sortReviewCards,
    splitIntradayLearning,
} from './queueBuild';
import {
    getReviewsAnsweredToday,
    getReviewsAnsweredTodayInDeck,
    getTodayLimitUsageByDeck,
    type DailyLimitUsage,
} from './reviewLogger';
import { resolveSettingsFromConfig } from './settingsResolver';
import { buildFilteredDeckQueue } from './filteredDeckQueue';
import { filteredDeckMemberIds } from './filteredDeckMembership';
import { rebuildLoadBalancer } from './loadBalancerSession';
import {
    buildScopeClause,
    countRowsByDeck,
    countRowsByQueue,
    loadNextLearningDue,
    loadRowsByQueue,
    loadReviewCandidates,
    resolveSettingsForDeck,
    toStudyCards,
    type QueueCardRow,
} from './studyCardRows';

/**
 * Today's study queue for a deck scope: limits, gather and sort orders, burying and learn-ahead,
 * as Anki's V3 scheduler builds it.
 */

export interface QueueStats {
    newCount: number;
    learningCount: number;
    reviewCount: number;
}

export interface StudyQueueResult {
    cards: StudyCard[];
    /** Full filtered-build membership, including learning cards still waiting on a step timer. */
    allSessionCards?: StudyCard[];
    stats: QueueStats;
    nextLearningDue: number | null;
    dailyNewLimitReached: boolean;
    /** New cards in scope that daily limits kept out of today's queue. */
    heldBackNewCount: number;
    /** Due reviews in scope that the daily review limit kept out of today's queue. */
    heldBackReviewCount: number;
    /** How many cards will become available when the waiting timer or next rollover expires. */
    upcomingCardsCount: number;
}

export interface StudyQueueParams {
    settings: AppSettings;
    selectedSubject?: string | null;
    selectedTopic?: string | null;
    selectedDeckName?: string | null;
    newCardsStudiedToday?: number;
    /**
     * Reviews already answered today in this scope. Anki subtracts them from "Maximum
     * reviews/day", so the limit holds for the rest of the day instead of refilling on the next
     * queue rebuild. Read from the review log when the caller does not supply it.
     */
    reviewsStudiedToday?: number;
    /**
     * Learning cards to serve even though their step timer has not expired. Powers the
     * one-shot "study ahead" button: the UI captures the waiting ids once at press time
     * and removes each id after it is answered, so a short next step (1 dk / 10 dk) can
     * never pull the card back in without a new button press.
     */
    extraLearningCardIds?: number[];
}

function deterministicShuffle<T>(items: T[], seedKey: string): T[] {
    const result = [...items];
    let seed = 0;
    for (let i = 0; i < seedKey.length; i++) {
        seed = ((seed << 5) - seed + seedKey.charCodeAt(i)) | 0;
    }

    for (let i = result.length - 1; i > 0; i--) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const j = seed % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
}

const UNRANKED = Number.MAX_SAFE_INTEGER;

/**
 * Where each deck stands in the deck list — siblings by the learner's own order (alphabetical in a
 * collection nobody reordered), a parent before its subdecks. Anki's "Deck" gather walks the deck
 * tree the same way, so the paid catalog's curriculum (its topics are ordered subdecks) arrives in
 * course order. One map serves the SQL window and the in-memory sort, so they cannot disagree.
 */
function buildDeckGatherRank(): Map<number, number> {
    const ranks = new Map<number, number>();
    decksInDisplayOrder(getAllDecks()).forEach((deck, index) => ranks.set(deck.id, index));
    return ranks;
}

/**
 * Deck by deck in deck-list order; inside one deck, course by course and topic by topic in the
 * order a course lists its topics, so finishing "Tanımlama" moves on to "Parametreler". The stable
 * tiebreak keeps the position (or shuffled) order the cards arrived in.
 */
function sortNewCardsByDeckOrder(cards: StudyCard[], deckRank: ReadonlyMap<number, number>): StudyCard[] {
    if (cards.length <= 1) return cards;

    const subjects = getAllSubjects();
    const subjectRank = new Map(subjects.map((subject, index) => [subject.id, index]));
    const topicRank = new Map<string, number>();
    for (const subject of subjects) {
        subject.topics.forEach((topic, index) => topicRank.set(`${subject.id}::${topic}`, index));
    }
    return cards
        .map((card, index) => ({
            card,
            keys: [
                deckRank.get(card.deckId) ?? UNRANKED,
                subjectRank.get(card.subject) ?? UNRANKED,
                topicRank.get(`${card.subject}::${card.topic}`) ?? UNRANKED,
                index,
            ],
        }))
        .sort((a, b) => {
            for (let key = 0; key < a.keys.length; key++) {
                if (a.keys[key] !== b.keys[key]) return a.keys[key] - b.keys[key];
            }
            return 0;
        })
        .map((entry) => entry.card);
}

/**
 * Anki v3 "new card gather order" (proto NewCardGatherPriority): which cards are collected and in
 * what order they arrive. The two position orders are already satisfied by the SQL the rows were
 * loaded with (`newRowOrderSql`), so they only have to leave the list alone.
 */
function gatherNewCards(
    cards: StudyCard[],
    settings: AppSettings,
    daySeed: string,
    newCount: number,
    deckRank: ReadonlyMap<number, number>,
): StudyCard[] {
    const seed = `${daySeed}-${newCount}`;

    switch (normalizeNewCardGatherOrder(settings.newCardGatherOrder)) {
        case 'ascendingPosition':
        case 'descendingPosition':
            return cards;
        case 'randomCards':
            return deterministicShuffle(cards, seed);
        case 'randomNotes':
            return shuffleNewCardsByNote(cards, seed);
        case 'deckThenRandomNotes':
            // Deck by deck as usual, but the notes inside a deck arrive in a shuffled order.
            return sortNewCardsByDeckOrder(shuffleNewCardsByNote(cards, seed), deckRank);
        case 'deck':
        default: {
            const base = settings.newCardOrder === 'random'
                ? deterministicShuffle(cards, seed)
                : cards;
            return sortNewCardsByDeckOrder(base, deckRank);
        }
    }
}

/**
 * How the new-card rows are read from SQLite. "Descending position" has to take the *highest*
 * positions, so reversing an ascending page after the fact would hand back the wrong cards
 * whenever the fetch is capped.
 */
function newRowOrderSql(settings: AppSettings): string {
    const order = normalizeNewCardGatherOrder(settings.newCardGatherOrder);
    if (order === 'descendingPosition') return 'c.due DESC, c.id DESC';
    if (order === 'randomCards' || order === 'randomNotes') return 'RANDOM()';
    return 'c.due ASC, c.id ASC';
}

/**
 * The new-card window for the deck gather orders, filled the way Anki gathers them: deck by deck
 * in deck-list order, each deck from its lowest position, until the window is full. One query
 * reads the decks that fit whole and a second the deck where the window runs out, so the window
 * is chosen by the same deck rank the in-memory sort applies afterwards. Ordering the SQL by deck
 * name instead would put Ç, İ, Ö, Ş and Ü after Z and fill the window from the wrong decks.
 */
function loadNewRowsDeckByDeck(
    params: StudyQueueParams,
    deckRank: ReadonlyMap<number, number>,
    windowSize: number,
): QueueCardRow[] {
    const { selectedSubject, selectedTopic, selectedDeckName } = params;
    const counts = countRowsByDeck('c.queue = 0', [], selectedSubject, selectedTopic, selectedDeckName);
    const decks = [...counts.keys()]
        .sort((a, b) => (deckRank.get(a) ?? UNRANKED) - (deckRank.get(b) ?? UNRANKED) || a - b);
    const whole: number[] = [];
    let room = windowSize;
    let partial: number | null = null;
    for (const deckId of decks) {
        if (room <= 0) break;
        const count = counts.get(deckId) ?? 0;
        if (count > room) {
            partial = deckId;
            break;
        }
        whole.push(deckId);
        room -= count;
    }
    const load = (queueSql: string, queueParams: Array<string | number>, limit: number) => loadRowsByQueue(
        queueSql, queueParams, selectedSubject, selectedTopic, selectedDeckName, 'c.due ASC, c.id ASC', false, limit,
    );
    const rows = whole.length > 0
        ? load('c.queue = 0 AND c.deckId IN (SELECT value FROM json_each(?))', [JSON.stringify(whole)], windowSize)
        : [];
    if (partial !== null) rows.push(...load('c.queue = 0 AND c.deckId = ?', [partial], room));
    return rows;
}

/**
 * Anki runs two separate steps over new cards: a gather step that decides *which* cards and in
 * what order they arrive, then a sort step that reorders the gathered set. Keeping them apart is
 * what makes "order gathered" a meaningful option rather than a no-op.
 */
function applyNewCardOrder(
    cards: StudyCard[],
    settings: AppSettings,
    daySeed: string,
    newCount: number,
    deckRank: ReadonlyMap<number, number>,
): StudyCard[] {
    const gathered = gatherNewCards(cards, settings, daySeed, newCount, deckRank);
    return sortNewCards(gathered, settings.newCardSortOrder ?? 'template', daySeed);
}

/**
 * Anki v3 "review sort order". The deck rank comes from the deck list so the two deck-aware
 * orders follow the tree the learner sees, which is what Anki's `active_decks` rowid amounts to.
 */
function applyReviewOrder(cards: StudyCard[], settings: AppSettings, daySeed: string, today: number): StudyCard[] {
    const order = settings.reviewSortOrder ?? 'dueRandom';
    const needsDeckRank = order === 'dueThenDeck' || order === 'deckThenDue';
    const deckRank = needsDeckRank ? buildDeckRank() : undefined;
    return sortReviewCards(cards, order, {
        daySeed,
        fallbackDay: today,
        today,
        deckRank,
        // Anki passes the collection's scheduler into `review_order_sql`: the ease and relative
        // overdueness orders read FSRS columns while it is on.
        fsrs: settings.fsrsEnabled === true,
    });
}

/** Display position of each deck, by the same name ordering the deck list uses. */
function buildDeckRank(): (deckId: number) => number {
    const ranks = new Map<number, number>();
    getAllDecks()
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name))
        .forEach((deck, index) => ranks.set(deck.id, index));
    return (deckId) => ranks.get(deckId) ?? Number.MAX_SAFE_INTEGER;
}

export function getStudyQueue(params: StudyQueueParams): StudyQueueResult {
    const nowMs = Date.now();
    const today = localDayNumber(nowMs, params.settings.dayRolloverHour);
    const settingsCache = new Map<number, AppSettings>();
    // Anki builds its load balancer together with the study queue, from the counts of that moment.
    rebuildLoadBalancer(params.settings.dayRolloverHour, nowMs);

    for (const deck of getAllDecks()) {
        if (deck.isFiltered) filteredDeckMemberIds(deck, params.settings, nowMs);
    }

    // Filtered decks bypass the daily queue entirely: their saved search IS the session.
    if (params.selectedDeckName) {
        const selectedDeck = getDeckByName(params.selectedDeckName);
        if (selectedDeck?.isFiltered) {
            return buildFilteredDeckQueue(selectedDeck, params.settings, nowMs);
        }
    }

    const newFetchLimit = 200; // A replenished working window, never a daily new-card cap.

    // Anki: "When this limit is reached, Anki will not show any more review cards for the day,
    // even if there are more waiting." Answered reviews leave the due queue on their own, so
    // without subtracting them the cap would silently refill on every rebuild.
    const reviewsStudiedToday = params.reviewsStudiedToday ?? (params.selectedDeckName
        ? getReviewsAnsweredTodayInDeck(params.selectedDeckName, params.settings.dayRolloverHour)
        : getReviewsAnsweredToday(params.settings.dayRolloverHour));
    const reviewLimit = Math.max(0, params.settings.dailyReviewLimit - reviewsStudiedToday);

    // Anki's "learn ahead limit" (rslib: learn_ahead_secs): intraday learning cards due within
    // this window are gathered too, but they are served strictly AFTER everything else — never
    // ahead of their step timer while other cards remain. With the limit at 0 they are not
    // gathered at all and the UI counts down until the first one is due.
    const learnAheadCutoff = nowMs + Math.max(0, params.settings.learnAheadMinutes || 0) * 60000;

    // Count only intraday cards inside the learn-ahead window.

    // Count with SQL first (scales better than loading full queue).
    const intradayLearningCount = countRowsByQueue(
        'c.queue = 1 AND c.due < ?',
        [learnAheadCutoff + 1],
        params.selectedSubject,
        params.selectedTopic,
        params.selectedDeckName,
    );
    const interdayLearningCount = countRowsByQueue(
        'c.queue = 3 AND c.due <= ?',
        [today],
        params.selectedSubject,
        params.selectedTopic,
        params.selectedDeckName,
    );
    const reviewCount = countRowsByQueue(
        'c.queue = 2 AND c.due <= ?',
        [today],
        params.selectedSubject,
        params.selectedTopic,
        params.selectedDeckName,
    );
    const newCount = countRowsByQueue(
        'c.queue = 0',
        [],
        params.selectedSubject,
        params.selectedTopic,
        params.selectedDeckName,
    );

    // Anki priority: intraday learning (queue=1) before interday learning (queue=3).
    // Cards on the one-shot study-ahead list are gathered regardless of their timer.
    const extraLearningIds = (params.extraLearningCardIds ?? [])
        .filter((id) => Number.isFinite(id))
        .map((id) => Math.floor(id));
    const intradayQueueSql = extraLearningIds.length > 0
        ? `c.queue = 1 AND (c.due <= ? OR c.id IN (${extraLearningIds.map(() => '?').join(', ')}))`
        : 'c.queue = 1 AND c.due <= ?';
    const intradayLearningRows = loadRowsByQueue(
        intradayQueueSql,
        [learnAheadCutoff, ...extraLearningIds],
        params.selectedSubject,
        params.selectedTopic,
        params.selectedDeckName,
        'c.due ASC',
    );

    const interdayLearningRows = loadRowsByQueue(
        'c.queue = 3 AND c.due <= ?',
        [today],
        params.selectedSubject,
        params.selectedTopic,
        params.selectedDeckName,
        'c.due ASC',
    );

    const deckGatherRank = buildDeckGatherRank();
    const gatherOrder = normalizeNewCardGatherOrder(params.settings.newCardGatherOrder);
    const newRows = newFetchLimit <= 0
        ? []
        : gatherOrder === 'deck' || gatherOrder === 'deckThenRandomNotes'
            ? loadNewRowsDeckByDeck(params, deckGatherRank, newFetchLimit)
            : loadRowsByQueue(
                'c.queue = 0',
                [],
                params.selectedSubject,
                params.selectedTopic,
                params.selectedDeckName,
                newRowOrderSql(params.settings),
                false,
                newFetchLimit,
            );

    const intradayLearningCards = toStudyCards(intradayLearningRows, params.settings, nowMs, { settingsCache });
    const interdayLearningCards = toStudyCards(interdayLearningRows, params.settings, nowMs, { settingsCache });
    let learningCards = [...intradayLearningCards, ...interdayLearningCards];

    let reviewCards = reviewLimit > 0 ? loadReviewCandidates(
        params.settings, nowMs, today, params.selectedSubject, params.selectedTopic, params.selectedDeckName, settingsCache,
    ) : [];
    let newCards = toStudyCards(newRows, params.settings, nowMs, { settingsCache });

    const daySeed = todayLocalYMD(undefined, params.settings.dayRolloverHour);

    reviewCards = applyReviewOrder(reviewCards, params.settings, daySeed, today);
    newCards = applyNewCardOrder(newCards, params.settings, daySeed, newCount, deckGatherRank);

    // Resolve the earlier sibling's config for in-memory suppression after limits.
    const deckConfigCache = new Map<number, DeckConfig>();
    const configForDeck = (deckId: number): DeckConfig => {
        let config = deckConfigCache.get(deckId);
        if (!config) {
            config = getDeckConfigForDeck(deckId);
            deckConfigCache.set(deckId, config);
        }
        return config;
    };


    // Hierarchical daily limits: a card counts against its deck and every ancestor deck.
    // Anki's collection-wide "limits start from top" decides how far up that chain goes — with it
    // off, studying a subdeck answers only to that subdeck and its own children, so a parent's
    // stricter cap no longer bleeds down into a deck the learner opened directly.
    const limitRoot = params.settings.limitsStartFromTop === true ? null : params.selectedDeckName;
    const withinLimitRoot = (key: string): boolean =>
        !limitRoot || key === limitRoot || key.startsWith(`${limitRoot}::`);
    const deckNameCache = new Map<number, string | null>();
    const deckKeysForCard = (card: StudyCard): string[] => {
        let name = deckNameCache.get(card.deckId);
        if (name === undefined) {
            name = getDeck(card.deckId)?.name ?? null;
            deckNameCache.set(card.deckId, name);
        }
        const keys = name ? getDeckAncestors(name) : [`#${card.deckId}`];
        return limitRoot ? keys.filter(withinLimitRoot) : keys;
    };
    const settingsForDeckKey = (key: string): AppSettings => {
        if (key.startsWith('#')) {
            return resolveSettingsForDeck(Number(key.slice(1)), params.settings, settingsCache);
        }
        const deck = getDeckByName(key);
        return deck ? resolveSettingsForDeck(deck.id, params.settings, settingsCache) : params.settings;
    };

    // Every deck's own limits shrink by what that subtree already spent today, the way Anki's
    // per-deck newToday/revToday counters do. Without this a parent deck would hand out its full
    // allowance again as soon as the queue was rebuilt.
    const usageByDeckKey = new Map<string, DailyLimitUsage>();
    for (const [usedDeckId, used] of getTodayLimitUsageByDeck(params.settings.dayRolloverHour)) {
        let name = deckNameCache.get(usedDeckId);
        if (name === undefined) {
            name = getDeck(usedDeckId)?.name ?? null;
            deckNameCache.set(usedDeckId, name);
        }
        for (const key of name ? getDeckAncestors(name) : [`#${usedDeckId}`]) {
            const entry = usageByDeckKey.get(key) ?? { newIntroduced: 0, reviewsAnswered: 0 };
            entry.newIntroduced += used.newIntroduced;
            entry.reviewsAnswered += used.reviewsAnswered;
            usageByDeckKey.set(key, entry);
        }
    }
    const usedForDeckKey = (key: string): DailyLimitUsage =>
        usageByDeckKey.get(key) ?? { newIntroduced: 0, reviewsAnswered: 0 };

    const reviewLimitByKey = new Map<string, number>();
    const reviewLimitForDeckKey = (key: string): number => {
        let limit = reviewLimitByKey.get(key);
        if (limit === undefined) {
            limit = Math.max(0, settingsForDeckKey(key).dailyReviewLimit - usedForDeckKey(key).reviewsAnswered);
            reviewLimitByKey.set(key, limit);
        }
        return limit;
    };

    // A skipped sibling or a deck that has spent its cap consumes no global slot.
    let reviewsTaken = 0;
    const reviewsTakenByKey = new Map<string, number>();
    const acceptWithinLimits = (card: StudyCard): boolean => {
        if (card.state.status === 'new' || (card.state.status === 'learning' && card.state.dueTime > 0)) return true;
        const keys = deckKeysForCard(card);
        if (reviewsTaken >= reviewLimit || keys.some((key) => (reviewsTakenByKey.get(key) ?? 0) >= reviewLimitForDeckKey(key))) return false;
        reviewsTaken++;
        for (const key of keys) reviewsTakenByKey.set(key, (reviewsTakenByKey.get(key) ?? 0) + 1);
        return true;
    };
    const selected = buryBuildTimeSiblings(learningCards, reviewCards, newCards, configForDeck, () => {}, acceptWithinLimits);
    learningCards = selected.learning;
    const newCardsForQueue = selected.news;
    const selectedReviewIds = selected.reviews.map((card) => card.cardId);
    const hydrated = new Map<number, StudyCard>();
    for (let offset = 0; offset < selectedReviewIds.length; offset += 400) {
        const ids = selectedReviewIds.slice(offset, offset + 400);
        const rows = loadRowsByQueue(`c.id IN (${ids.map(() => '?').join(',')})`, ids);
        for (const card of toStudyCards(rows, params.settings, nowMs, { settingsCache })) hydrated.set(card.cardId, card);
    }
    const reviewCardsForQueue = selectedReviewIds.flatMap((id) => hydrated.get(id) ?? []);

    // Anki serving order (rslib scheduler/queue/mod.rs `iter`): intraday learning cards whose
    // timer has expired lead, then the main queue, and intraday learning cards still inside the
    // learn-ahead window trail at the very end — they only surface once everything else is
    // exhausted, instead of storming back in front on every queue rebuild.
    //
    // Interday learning cards (dueTime 0) carry no step timer, so the preset's "interday
    // learning/review order" decides where they sit against the reviews instead.
    const intradayForQueue = learningCards.filter((card) => card.state.dueTime !== 0);
    const interdayForQueue = learningCards.filter((card) => card.state.dueTime === 0);
    const { dueNow: learningDueNow, learnAhead: learningAhead } = splitIntradayLearning(intradayForQueue, nowMs);
    const reviewQueue = mixInterdayLearning(
        reviewCardsForQueue,
        interdayForQueue,
        params.settings.interdayLearningMix ?? 'mix',
    );

    let cards: StudyCard[];
    if (params.settings.queueOrder === 'before') {
        cards = [...learningDueNow, ...newCardsForQueue, ...reviewQueue, ...learningAhead];
    } else if (params.settings.queueOrder === 'after') {
        cards = [...learningDueNow, ...reviewQueue, ...newCardsForQueue, ...learningAhead];
    } else {
        cards = [...learningDueNow, ...interleaveNewWithReviews(reviewQueue, newCardsForQueue), ...learningAhead];
    }

    // Cards inside the learn-ahead window are already queued; report the first one due beyond it.
    const nextLearningDue = loadNextLearningDue(
        learnAheadCutoff,
        params.selectedSubject,
        params.selectedTopic,
        params.selectedDeckName,
    );

    // Report both counts the way Anki's deck list does: what today's limits still allow, not the
    // raw backlog. The uncapped remainder feeds the "held back" message instead of silently
    // inflating the badge past what the queue will ever serve. Learning cards have no daily
    // limit in Anki, so that count stays raw.
    const servableNewCount = Math.max(0, newCount - (newCards.length - newCardsForQueue.length));
    const servableReviewCount = reviewCardsForQueue.length;
    const heldBackNewCount = 0;
    const heldBackReviewCount = Math.max(0, reviewCount - servableReviewCount);

    let upcomingCardsCount = 0;
    if (nextLearningDue !== null) {
        upcomingCardsCount = Math.max(1, intradayLearningCount + interdayLearningCount);
    } else {
        const reviewsDueTomorrow = countRowsByQueue(
            'c.queue IN (2, 3) AND c.due = ?',
            [today + 1],
            params.selectedSubject,
            params.selectedTopic,
            params.selectedDeckName,
        );

        let tomorrowNewLimit = params.settings.dailyNewLimit ?? 20;
        let tomorrowReviewLimit = params.settings.dailyReviewLimit ?? 200;
        if (params.selectedDeckName) {
            const deck = getDeckByName(params.selectedDeckName);
            if (deck) {
                const config = getDeckConfigForDeck(deck.id, params.settings.dayRolloverHour);
                const resolved = resolveSettingsFromConfig(config, params.settings);
                tomorrowNewLimit = resolved.dailyNewLimit;
                tomorrowReviewLimit = resolved.dailyReviewLimit;
            }
        }

        const tomorrowServableNew = tomorrowNewLimit > 0 ? Math.min(heldBackNewCount, tomorrowNewLimit) : heldBackNewCount;
        const tomorrowTotalReviews = heldBackReviewCount + reviewsDueTomorrow;
        const tomorrowServableReviews = tomorrowReviewLimit > 0 ? Math.min(tomorrowTotalReviews, tomorrowReviewLimit) : tomorrowTotalReviews;
        upcomingCardsCount = tomorrowServableNew + tomorrowServableReviews;
    }

    return {
        cards,
        stats: {
            newCount: servableNewCount,
            learningCount: learningCards.length,
            reviewCount: servableReviewCount,
        },
        nextLearningDue,
        // Reached when new cards exist in scope but none survived the global/per-deck limits.
        dailyNewLimitReached: false,
        heldBackNewCount,
        heldBackReviewCount,
        upcomingCardsCount,
    };
}

/**
 * Ids of learning cards in scope still waiting on their step timer, soonest first.
 * `cutoffMs` bounds how far ahead to look (omit for "the next card, however far"),
 * `limit` caps the count. The study-ahead button captures this snapshot once and
 * replays it through `extraLearningCardIds`.
 */
export function getWaitingLearningCardIds(params: {
    selectedSubject?: string | null;
    selectedTopic?: string | null;
    selectedDeckName?: string | null;
    cutoffMs?: number | null;
    limit?: number;
}): number[] {
    const db = getDB();
    const scope = buildScopeClause(params.selectedSubject, params.selectedTopic, params.selectedDeckName);
    const hasCutoff = Number.isFinite(params.cutoffMs ?? undefined);
    const hasLimit = Number.isFinite(params.limit) && (params.limit as number) > 0;

    const rows = db.getAllSync<{ cardId: number }>(
        `SELECT c.id AS cardId
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN decks d ON d.id = c.deckId
         WHERE c.queue = 1 AND c.due > ?${hasCutoff ? ' AND c.due <= ?' : ''}${scope.sql}
         ORDER BY c.due ASC${hasLimit ? ' LIMIT ?' : ''}`,
        Date.now(),
        ...(hasCutoff ? [params.cutoffMs as number] : []),
        ...scope.params,
        ...(hasLimit ? [Math.floor(params.limit as number)] : []),
    );

    return rows.map((row) => row.cardId);
}

export function getStudyCardById(cardId: number, settings: AppSettings): StudyCard | null {
    const db = getDB();
    const row = db.getFirstSync<QueueCardRow>(
        `SELECT
            c.id AS cardId,
            c.noteId AS noteId,
            c.deckId AS deckId,
            c.ord AS ord,
            c.type AS type,
            c.queue AS queue,
            c.due AS due,
            c.ivl AS ivl,
            c.factor AS factor,
            c.reps AS reps,
            c.lapses AS lapses,
            c."left" AS "left",
            c.flags AS flags,
            c.data AS cardData,
            n.data AS noteData,
            nt.data AS noteTypeData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN note_types nt ON nt.id = n.noteTypeId
         WHERE c.id = ?`,
        cardId,
    );

    if (!row) return null;

    return toStudyCards([row], settings, Date.now(), { includeRawCard: true })[0] ?? null;
}

export function getStudyCardByLegacyCardId(legacyCardId: number, settings: AppSettings): StudyCard | null {
    return getStudyCardById(ankiCardIdFromLegacyCardId(legacyCardId), settings);
}
