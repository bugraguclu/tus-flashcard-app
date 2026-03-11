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
} from './ankiState';
import { addDaysLocalYMD, getScheduler, todayLocalYMD } from './scheduler';
import {
    buryCard,
    getAnkiCard,
    getCardsForNote,
    handleLeech,
    isLeech,
    saveAnkiCard,
} from './noteManager';
import { getDeckConfigForDeck } from './deckManager';
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
    newCardsStudiedToday?: number;
}

export interface ReviewResult {
    updatedCard: StudyCard;
    previousAnkiCard: AnkiCard;
    wasNewCard: boolean;
    reviewLogId: number;
}

const KNOWN_SUBJECTS = new Set(TUS_SUBJECTS.map((subject) => subject.id));

interface CardNoteRow {
    cardData: string;
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

function buildScopeClause(selectedSubject?: string | null, selectedTopic?: string | null): { sql: string; params: Array<string | number> } {
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
    orderBy: string = 'c.id ASC',
): Array<{ card: AnkiCard; note: Note }> {
    const db = getDB();
    const scope = buildScopeClause(selectedSubject, selectedTopic);

    const rows = db.getAllSync<CardNoteRow>(
        `SELECT c.data AS cardData, n.data AS noteData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         WHERE ${queueSql}${scope.sql}
         ORDER BY ${orderBy}`,
        ...queueParams,
        ...scope.params,
    );

    return rows.map((row) => ({
        card: JSON.parse(row.cardData) as AnkiCard,
        note: JSON.parse(row.noteData) as Note,
    }));
}

function loadNextLearningDue(
    nowMs: number,
    selectedSubject?: string | null,
    selectedTopic?: string | null,
): number | null {
    const db = getDB();
    const scope = buildScopeClause(selectedSubject, selectedTopic);

    const row = db.getFirstSync<{ nextDue: number | null }>(
        `SELECT MIN(c.due) AS nextDue
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         WHERE c.queue IN (1, 3) AND c.due > ?${scope.sql}`,
        nowMs,
        ...scope.params,
    );

    return row?.nextDue ?? null;
}

function resolveSettingsForDeck(deckId: number, base: AppSettings, cache: Map<number, AppSettings>): AppSettings {
    if (cache.has(deckId)) {
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
        desiredRetention: config.desiredRetention > 0 ? config.desiredRetention : base.desiredRetention,
    };

    cache.set(deckId, resolved);
    return resolved;
}

function makeStudyCard(
    card: AnkiCard,
    note: Note,
    settings: AppSettings,
    nowMs: number,
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
    };
}

function toStudyCards(items: Array<{ card: AnkiCard; note: Note }>, baseSettings: AppSettings, nowMs: number): StudyCard[] {
    const settingsCache = new Map<number, AppSettings>();
    return items.map((item) => {
        const cardSettings = resolveSettingsForDeck(item.card.deckId, baseSettings, settingsCache);
        return makeStudyCard(item.card, item.note, cardSettings, nowMs);
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
    const today = localDayNumber(nowMs);
    const settingsCache = new Map<number, AppSettings>();

    const learningRows = loadRowsByQueue(
        'c.queue IN (1, 3) AND c.due <= ?',
        [nowMs],
        params.selectedSubject,
        params.selectedTopic,
        'c.due ASC',
    );

    const reviewRows = loadRowsByQueue(
        'c.queue = 2 AND c.due <= ?',
        [today],
        params.selectedSubject,
        params.selectedTopic,
        'c.due ASC',
    );

    const newRows = loadRowsByQueue(
        'c.queue = 0',
        [],
        params.selectedSubject,
        params.selectedTopic,
        'c.id ASC',
    );

    let learningCards = toStudyCards(learningRows, params.settings, nowMs);
    let reviewCards = toStudyCards(reviewRows, params.settings, nowMs);
    let newCards = toStudyCards(newRows, params.settings, nowMs);

    if (params.settings.newCardOrder === 'random') {
        newCards = deterministicShuffle(newCards, `${todayLocalYMD()}-${newCards.length}`);
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

    const nextLearningDue = loadNextLearningDue(nowMs, params.selectedSubject, params.selectedTopic);

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
    const row = db.getFirstSync<CardNoteRow>(
        `SELECT c.data AS cardData, n.data AS noteData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         WHERE c.id = ?`,
        cardId,
    );

    if (!row) return null;

    const card = JSON.parse(row.cardData) as AnkiCard;
    const note = JSON.parse(row.noteData) as Note;
    const cardSettings = resolveSettingsForDeck(card.deckId, settings, new Map<number, AppSettings>());

    return makeStudyCard(card, note, cardSettings, Date.now());
}

export function getAnkiCardSnapshot(cardId: number): AnkiCard | null {
    return getAnkiCard(cardId);
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
    const current = getStudyCardById(cardId, settings);

    if (!current) {
        throw new Error(`Card not found: ${cardId}`);
    }

    const currentAnkiCard = getAnkiCard(cardId);
    if (!currentAnkiCard) {
        throw new Error(`Anki card missing: ${cardId}`);
    }

    const cardSettings = resolveSettingsForDeck(currentAnkiCard.deckId, settings, new Map<number, AppSettings>());
    const deckConfig = getDeckConfig(currentAnkiCard.deckId);

    const scheduler = getScheduler(cardSettings.algorithm);
    const scheduleResult = scheduler.schedule(current.state, grade, cardSettings);

    const nextState: CardState = {
        ...current.state,
        ...scheduleResult.stateUpdates,
    };

    if (scheduleResult.isLearning) {
        nextState.status = 'learning';
        nextState.dueDate = todayLocalYMD(new Date(nowMs));
        nextState.dueTime = scheduleResult.minutesUntilDue
            ? nowMs + scheduleResult.minutesUntilDue * 60000
            : nowMs + 60000;
    } else {
        nextState.status = 'review';
        nextState.dueDate = addDaysLocalYMD(scheduleResult.interval, new Date(nowMs));
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

    const updatedStudyCard = getStudyCardById(cardId, settings);
    if (!updatedStudyCard) {
        throw new Error(`Updated card not found: ${cardId}`);
    }

    return {
        updatedCard: updatedStudyCard,
        previousAnkiCard: currentAnkiCard,
        wasNewCard: current.state.status === 'new',
        reviewLogId,
    };
}

function restoreQueueFromType(card: AnkiCard): AnkiCard['queue'] {
    if (card.type === 0) return 0;
    if (card.type === 1) return 1;
    if (card.type === 2) return 2;
    return 1;
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

    const cardSettings = resolveSettingsForDeck(card.deckId, settings, new Map<number, AppSettings>());
    return ankiCardToCardState(card, cardSettings, Date.now());
}

export function getStudyCardByLegacyCardId(legacyCardId: number, settings: AppSettings): StudyCard | null {
    return getStudyCardById(ankiCardIdFromLegacyCardId(legacyCardId), settings);
}

export function getBrowserCards(settings: AppSettings): StudyCard[] {
    const rows = loadRowsByQueue('1 = 1', [], undefined, undefined, 'c.id ASC');
    return toStudyCards(rows, settings, Date.now());
}
