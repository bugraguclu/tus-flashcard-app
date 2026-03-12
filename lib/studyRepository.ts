import { TUS_SUBJECTS } from './data';
import { getDB } from './db';
import type { CardState, AppSettings, Grade } from './types';
import type { AnkiCard, Note, DeckConfig } from './models';
import {
    ankiCardIdFromLegacyCardId,
    ankiCardToCardState,
    cardStateToAnkiCard,
    legacyCardIdFromAnkiCardId,
    makeDefaultCardState,
    localDayNumber,
    restoreQueueFromType,
} from './ankiState';
import { addDaysLocalYMD, getScheduler, todayLocalYMD } from './scheduler';
import {
    buryCard,
    getAnkiCard,
    getCardsForNote,
    getNote,
    handleLeech,
    isLeech,
    saveAnkiCard,
} from './noteManager';
import { getDeckByName, getDeckConfigForDeck } from './deckManager';
import { deleteReviewById, logReview } from './reviewLogger';

export interface StudyCard {
    cardId: number;
    legacyCardId: number;
    noteId: number;
    deckId: number;
    subject: string;
    topic: string;
    question: string;
    answer: string;
    state: CardState;
    rawCard?: AnkiCard;
}

export interface QueueStats {
    newCount: number;
    learningCount: number;
    reviewCount: number;
}

export interface StudyQueueResult {
    cards: StudyCard[];
    stats: QueueStats;
    nextLearningDue: number | null;
}

export interface StudyQueueParams {
    settings: AppSettings;
    selectedSubject?: string | null;
    selectedTopic?: string | null;
    selectedDeckName?: string | null;
    newCardsStudiedToday?: number;
}

export interface ReviewResult {
    updatedCard: StudyCard;
    previousAnkiCard: AnkiCard;
    wasNewCard: boolean;
    reviewLogId: number;
}

const KNOWN_SUBJECTS = new Set(TUS_SUBJECTS.map((subject) => subject.id));

interface QueueCardRow {
    cardId: number;
    noteId: number;
    deckId: number;
    ord: number;
    type: number;
    queue: number;
    due: number;
    ivl: number;
    factor: number;
    reps: number;
    lapses: number;
    left: number;
    flags: number;
    cardData: string | null;
    noteData: string;
}

function parseNotePayload(note: Note): { subject: string; topic: string; question: string; answer: string } {
    const subjectFromTag = note.tags.find((tag) => KNOWN_SUBJECTS.has(tag));
    const subject = subjectFromTag ?? 'custom';

    const question = note.fields[0] ?? note.sfld ?? '';
    const answer = note.fields[1] ?? '';
    const topicFromField = note.fields[2] ?? '';
    const topicFromTag = note.tags.find((tag) => tag !== subject && !tag.includes('::'));
    const topic = topicFromField || topicFromTag || 'General';

    return { subject, topic, question, answer };
}

function buildFilteredSearchClause(searchQuery: string): { sql: string; params: Array<string | number> } {
    const terms = searchQuery.trim().split(/\s+/).filter(Boolean);
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    for (const term of terms) {
        if (term.startsWith('tag:')) {
            const tag = term.slice(4);
            if (tag) {
                clauses.push('n.tags LIKE ?');
                params.push(`%${tag}%`);
            }
            continue;
        }

        if (term.startsWith('deck:')) {
            const deckName = term.slice(5);
            if (deckName) {
                clauses.push('(d.name = ? OR d.name LIKE ?)');
                params.push(deckName, `${deckName}::%`);
            }
            continue;
        }

        clauses.push('(n.sfld LIKE ? OR n.data LIKE ? OR n.tags LIKE ?)');
        params.push(`%${term}%`, `%${term}%`, `%${term}%`);
    }

    return {
        sql: clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : '',
        params,
    };
}

function buildScopeClause(
    selectedSubject?: string | null,
    selectedTopic?: string | null,
    selectedDeckName?: string | null,
): { sql: string; params: Array<string | number> } {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (selectedSubject) {
        clauses.push('n.tags LIKE ?');
        params.push(`%${selectedSubject}%`);
    }

    if (selectedTopic) {
        clauses.push('n.data LIKE ?');
        params.push(`%${selectedTopic}%`);
    }

    if (selectedDeckName) {
        const selectedDeck = getDeckByName(selectedDeckName);
        if (selectedDeck?.isFiltered && selectedDeck.searchQuery) {
            const filtered = buildFilteredSearchClause(selectedDeck.searchQuery);
            if (filtered.sql) {
                clauses.push(filtered.sql.replace(/^\s*AND\s+/i, ''));
                params.push(...filtered.params);
            }
        } else {
            clauses.push('(d.name = ? OR d.name LIKE ?)');
            params.push(selectedDeckName, `${selectedDeckName}::%`);
        }
    }

    return {
        sql: clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : '',
        params,
    };
}

function loadRowsByQueue(
    queueSql: string,
    queueParams: Array<string | number>,
    selectedSubject?: string | null,
    selectedTopic?: string | null,
    selectedDeckName?: string | null,
    orderBy: string = 'c.id ASC',
    includeCardBlob: boolean = true,
): QueueCardRow[] {
    const db = getDB();
    const scope = buildScopeClause(selectedSubject, selectedTopic, selectedDeckName);
    const cardDataSelect = includeCardBlob ? 'c.data' : 'NULL';

    return db.getAllSync<QueueCardRow>(
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
            c.left AS left,
            c.flags AS flags,
            ${cardDataSelect} AS cardData,
            n.data AS noteData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN decks d ON d.id = c.deckId
         WHERE ${queueSql}${scope.sql}
         ORDER BY ${orderBy}`,
        ...queueParams,
        ...scope.params,
    );
}

function makeShallowCardFromRow(row: QueueCardRow, nowMs: number): AnkiCard {
    return {
        id: row.cardId,
        noteId: row.noteId,
        deckId: row.deckId,
        ord: row.ord,
        mod: Math.floor(nowMs / 1000),
        usn: -1,
        type: row.type as AnkiCard['type'],
        queue: row.queue as AnkiCard['queue'],
        due: row.due,
        ivl: row.ivl,
        factor: row.factor,
        reps: row.reps,
        lapses: row.lapses,
        left: row.left || 0,
        odue: 0,
        odid: 0,
        flags: row.flags as AnkiCard['flags'],
        stability: 0,
        difficulty: 0,
        lastReview: 0,
    };
}

function loadNextLearningDue(
    nowMs: number,
    selectedSubject?: string | null,
    selectedTopic?: string | null,
    selectedDeckName?: string | null,
): number | null {
    const db = getDB();
    const scope = buildScopeClause(selectedSubject, selectedTopic, selectedDeckName);

    const row = db.getFirstSync<{ nextDue: number | null }>(
        `SELECT MIN(c.due) AS nextDue
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN decks d ON d.id = c.deckId
         WHERE c.queue = 1 AND c.due > ?${scope.sql}`,
        nowMs,
        ...scope.params,
    );

    return row?.nextDue ?? null;
}

function resolveSettingsForDeck(deckId: number, base: AppSettings, cache?: Map<number, AppSettings>): AppSettings {
    if (cache?.has(deckId)) {
        return cache.get(deckId)!;
    }

    const config = getDeckConfigForDeck(deckId);
    const resolved: AppSettings = {
        ...base,
        dailyNewLimit: config.newPerDay,
        dailyReviewLimit: config.maxReviewsPerDay,
        learningSteps: config.learningSteps?.length > 0 ? [...config.learningSteps] : base.learningSteps,
        lapseSteps: config.relearningSteps?.length > 0 ? [...config.relearningSteps] : base.lapseSteps,
        graduatingInterval: config.graduatingIvl,
        easyInterval: config.easyIvl,
        startingEase: config.startingEase > 0 ? config.startingEase / 1000 : base.startingEase,
        lapseNewInterval: config.newIvlPercent >= 0 ? config.newIvlPercent : base.lapseNewInterval,
        newCardOrder: config.insertionOrder === 'random' ? 'random' : 'sequential',
        hardIntervalMultiplier: config.hardIvl > 0 ? config.hardIvl : base.hardIntervalMultiplier,
        easyBonus: config.easyBonus > 0 ? config.easyBonus : base.easyBonus,
        intervalModifier: config.ivlModifier > 0 ? config.ivlModifier : base.intervalModifier,
        maxInterval: config.maxIvl > 0 ? config.maxIvl : base.maxInterval,
        desiredRetention: config.desiredRetention > 0 ? config.desiredRetention : base.desiredRetention,
    };

    cache?.set(deckId, resolved);
    return resolved;
}

function makeStudyCard(
    card: AnkiCard,
    note: Note,
    settings: AppSettings,
    nowMs: number,
    includeRawCard: boolean,
): StudyCard {
    const payload = parseNotePayload(note);

    return {
        cardId: card.id,
        legacyCardId: legacyCardIdFromAnkiCardId(card.id),
        noteId: card.noteId,
        deckId: card.deckId,
        subject: payload.subject,
        topic: payload.topic,
        question: payload.question,
        answer: payload.answer,
        state: ankiCardToCardState(card, settings, nowMs),
        rawCard: includeRawCard ? card : undefined,
    };
}

function toStudyCards(
    rows: QueueCardRow[],
    baseSettings: AppSettings,
    nowMs: number,
    options: { includeRawCard?: boolean; settingsCache?: Map<number, AppSettings> } = {},
): StudyCard[] {
    const settingsCache = options.settingsCache ?? new Map<number, AppSettings>();

    return rows.map((row) => {
        const note = JSON.parse(row.noteData) as Note;

        // Parse full card blob only for learning queues (left/decode needed)
        // or when caller explicitly needs a full raw card object.
        const needsFullCard = options.includeRawCard
            || row.queue === 1
            || row.queue === 3
            || row.type === 1
            || row.type === 3;

        let card: AnkiCard;
        if (needsFullCard) {
            if (row.cardData) {
                card = JSON.parse(row.cardData) as AnkiCard;
            } else {
                card = getAnkiCard(row.cardId) ?? makeShallowCardFromRow(row, nowMs);
            }
        } else {
            card = makeShallowCardFromRow(row, nowMs);
        }

        const cardSettings = resolveSettingsForDeck(card.deckId, baseSettings, settingsCache);
        return makeStudyCard(card, note, cardSettings, nowMs, Boolean(options.includeRawCard));
    });
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

function applyPerDeckLimit(
    cards: StudyCard[],
    globalLimit: number,
    getDeckLimit: (card: StudyCard) => number,
): StudyCard[] {
    if (globalLimit <= 0) return [];

    const result: StudyCard[] = [];
    const deckCounts = new Map<number, number>();

    for (const card of cards) {
        if (result.length >= globalLimit) break;

        const deckLimit = Math.max(0, getDeckLimit(card));
        const currentDeckCount = deckCounts.get(card.deckId) || 0;

        if (currentDeckCount >= deckLimit) {
            continue;
        }

        result.push(card);
        deckCounts.set(card.deckId, currentDeckCount + 1);
    }

    return result;
}

function getDeckConfig(deckId: number): DeckConfig {
    return getDeckConfigForDeck(deckId);
}

function applySiblingBuryPolicy(answeredCard: AnkiCard, config: DeckConfig): void {
    const siblings = getCardsForNote(answeredCard.noteId);

    for (const sibling of siblings) {
        if (sibling.id === answeredCard.id || sibling.queue < 0) {
            continue;
        }

        if (sibling.queue === 0 && config.buryNewSiblings) {
            buryCard(sibling.id, true);
            continue;
        }

        if (sibling.queue === 2 && config.buryReviewSiblings) {
            buryCard(sibling.id, true);
            continue;
        }

        if ((sibling.queue === 1 || sibling.queue === 3) && config.buryInterdayLearningSiblings) {
            buryCard(sibling.id, true);
        }
    }
}

export function getStudyQueue(params: StudyQueueParams): StudyQueueResult {
    const nowMs = Date.now();
    const today = localDayNumber(nowMs, params.settings.dayRolloverHour);
    const settingsCache = new Map<number, AppSettings>();

    // Anki priority: intraday learning (queue=1) before interday learning (queue=3).
    const intradayLearningRows = loadRowsByQueue(
        'c.queue = 1 AND c.due <= ?',
        [nowMs],
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

    const reviewRows = loadRowsByQueue(
        'c.queue = 2 AND c.due <= ?',
        [today],
        params.selectedSubject,
        params.selectedTopic,
        params.selectedDeckName,
        'c.due ASC',
        false,
    );

    const newRows = loadRowsByQueue(
        'c.queue = 0',
        [],
        params.selectedSubject,
        params.selectedTopic,
        params.selectedDeckName,
        'c.id ASC',
        false,
    );

    const intradayLearningCards = toStudyCards(intradayLearningRows, params.settings, nowMs, { settingsCache });
    const interdayLearningCards = toStudyCards(interdayLearningRows, params.settings, nowMs, { settingsCache });
    const learningCards = [...intradayLearningCards, ...interdayLearningCards];

    let reviewCards = toStudyCards(reviewRows, params.settings, nowMs, { settingsCache });
    let newCards = toStudyCards(newRows, params.settings, nowMs, { settingsCache });

    if (params.settings.newCardOrder === 'random') {
        newCards = deterministicShuffle(
            newCards,
            `${todayLocalYMD(undefined, params.settings.dayRolloverHour)}-${newCards.length}`,
        );
    }

    const availableNewLimit = Math.max(0, params.settings.dailyNewLimit - (params.newCardsStudiedToday ?? 0));
    const reviewLimit = Math.max(0, params.settings.dailyReviewLimit);

    const reviewCardsForQueue = applyPerDeckLimit(reviewCards, reviewLimit, (card) => {
        const cardSettings = resolveSettingsForDeck(card.deckId, params.settings, settingsCache);
        return cardSettings.dailyReviewLimit;
    });

    const newCardsForQueue = applyPerDeckLimit(newCards, availableNewLimit, (card) => {
        const cardSettings = resolveSettingsForDeck(card.deckId, params.settings, settingsCache);
        return cardSettings.dailyNewLimit;
    });

    let cards: StudyCard[];
    if (params.settings.queueOrder === 'learning-new-review') {
        cards = [...learningCards, ...newCardsForQueue, ...reviewCardsForQueue];
    } else {
        cards = [...learningCards, ...reviewCardsForQueue, ...newCardsForQueue];
    }

    const nextLearningDue = loadNextLearningDue(
        nowMs,
        params.selectedSubject,
        params.selectedTopic,
        params.selectedDeckName,
    );

    return {
        cards,
        stats: {
            newCount: newCards.length,
            learningCount: learningCards.length,
            reviewCount: reviewCards.length,
        },
        nextLearningDue,
    };
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
            c.left AS left,
            c.flags AS flags,
            c.data AS cardData,
            n.data AS noteData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         WHERE c.id = ?`,
        cardId,
    );

    if (!row) return null;

    return toStudyCards([row], settings, Date.now(), { includeRawCard: true })[0] ?? null;
}

export function undoAnswer(snapshot: AnkiCard, reviewLogId: number): void {
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');

    try {
        saveAnkiCard(snapshot);
        deleteReviewById(reviewLogId);
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

export function answerStudyCard(
    cardId: number,
    grade: Grade,
    settings: AppSettings,
    answerTimeMs: number,
): ReviewResult {
    const nowMs = Date.now();

    const currentAnkiCard = getAnkiCard(cardId);
    if (!currentAnkiCard) {
        throw new Error(`Card not found: ${cardId}`);
    }

    const note = getNote(currentAnkiCard.noteId);
    if (!note) {
        throw new Error(`Note not found for card: ${cardId}`);
    }

    const cardSettings = resolveSettingsForDeck(currentAnkiCard.deckId, settings);
    const currentState = ankiCardToCardState(currentAnkiCard, cardSettings, nowMs);
    const deckConfig = getDeckConfig(currentAnkiCard.deckId);

    const scheduler = getScheduler(cardSettings.algorithm);
    const scheduleResult = scheduler.schedule(currentState, grade, cardSettings);

    const nextState: CardState = {
        ...currentState,
        ...scheduleResult.stateUpdates,
    };

    if (scheduleResult.isLearning) {
        nextState.status = 'learning';
        nextState.dueDate = todayLocalYMD(new Date(nowMs), cardSettings.dayRolloverHour);
        nextState.dueTime = scheduleResult.minutesUntilDue
            ? nowMs + scheduleResult.minutesUntilDue * 60000
            : nowMs + 60000;
    } else {
        nextState.status = 'review';
        nextState.dueDate = addDaysLocalYMD(scheduleResult.interval, new Date(nowMs), cardSettings.dayRolloverHour);
        nextState.dueTime = 0;
    }

    const updatedAnkiCard = cardStateToAnkiCard(currentAnkiCard, nextState, cardSettings, nowMs);

    const reviewType: 0 | 1 | 2 = currentAnkiCard.type === 2 ? 1 : currentAnkiCard.type === 3 ? 2 : 0;
    const revlogInterval = updatedAnkiCard.queue === 2
        ? updatedAnkiCard.ivl
        : -Math.max(1, Math.round((updatedAnkiCard.due - nowMs) / 1000));

    const db = getDB();
    let reviewLogId = 0;

    db.execSync('BEGIN TRANSACTION;');
    try {
        saveAnkiCard(updatedAnkiCard);

        const reviewLog = logReview(
            updatedAnkiCard,
            grade,
            revlogInterval,
            currentAnkiCard.ivl,
            updatedAnkiCard.factor,
            Math.max(0, answerTimeMs),
            reviewType,
        );
        reviewLogId = reviewLog.id;

        applySiblingBuryPolicy(currentAnkiCard, deckConfig);

        if (isLeech(updatedAnkiCard, deckConfig.leechThreshold)) {
            handleLeech(updatedAnkiCard, deckConfig.leechAction);
        }

        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    const updatedStudyCard = makeStudyCard(updatedAnkiCard, note, cardSettings, nowMs, true);

    return {
        updatedCard: updatedStudyCard,
        previousAnkiCard: currentAnkiCard,
        wasNewCard: currentState.status === 'new',
        reviewLogId,
    };
}


export function setCardSuspended(cardId: number, suspended: boolean): void {
    const card = getAnkiCard(cardId);
    if (!card) return;

    card.queue = suspended ? -1 : restoreQueueFromType(card);
    card.mod = Math.floor(Date.now() / 1000);
    card.usn = -1;
    saveAnkiCard(card);
}

export function setCardBuried(cardId: number, buried: boolean): void {
    const card = getAnkiCard(cardId);
    if (!card) return;

    card.queue = buried ? -2 : restoreQueueFromType(card);
    card.mod = Math.floor(Date.now() / 1000);
    card.usn = -1;
    saveAnkiCard(card);
}

export function getCardState(cardId: number, settings: AppSettings): CardState {
    const card = getAnkiCard(cardId);
    if (!card) {
        return makeDefaultCardState(settings);
    }

    const cardSettings = resolveSettingsForDeck(card.deckId, settings);
    return ankiCardToCardState(card, cardSettings, Date.now());
}

export function getStudyCardByLegacyCardId(legacyCardId: number, settings: AppSettings): StudyCard | null {
    return getStudyCardById(ankiCardIdFromLegacyCardId(legacyCardId), settings);
}

export function getBrowserCards(settings: AppSettings): StudyCard[] {
    const rows = loadRowsByQueue('1 = 1', [], undefined, undefined, undefined, 'c.id ASC', false);
    return toStudyCards(rows, settings, Date.now());
}
