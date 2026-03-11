import { TUS_SUBJECTS } from './data';
import { getDB } from './db';
import type { CardState, AppSettings, Grade } from './types';
import type { AnkiCard, Note } from './models';
import { ankiCardIdFromLegacyCardId, ankiCardToCardState, cardStateToAnkiCard, legacyCardIdFromAnkiCardId, makeDefaultCardState, localDayNumber } from './ankiState';
import { addDaysLocalYMD, getScheduler, todayLocalYMD } from './scheduler';
import { getAnkiCard, saveAnkiCard } from './noteManager';
import { logReview } from './reviewLogger';

export interface StudyCard {
    cardId: number;
    legacyCardId: number;
    noteId: number;
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
}

const KNOWN_SUBJECTS = new Set(TUS_SUBJECTS.map((subject) => subject.id));

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

function makeStudyCard(card: AnkiCard, note: Note, settings: AppSettings, nowMs: number): StudyCard {
    const payload = parseNotePayload(note);
    return {
        cardId: card.id,
        legacyCardId: legacyCardIdFromAnkiCardId(card.id),
        noteId: card.noteId,
        subject: payload.subject,
        topic: payload.topic,
        question: payload.question,
        answer: payload.answer,
        state: ankiCardToCardState(card, settings, nowMs),
    };
}

function loadCardsWithNotes(includeHidden: boolean): Array<{ card: AnkiCard; note: Note }> {
    const db = getDB();
    const rows = db.getAllSync<{ cardData: string; noteData: string }>(
        `SELECT c.data AS cardData, n.data AS noteData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         ${includeHidden ? '' : 'WHERE c.queue >= 0'}`
    );

    return rows.map((row) => ({
        card: JSON.parse(row.cardData) as AnkiCard,
        note: JSON.parse(row.noteData) as Note,
    }));
}

function inScope(subject: string, topic: string, selectedSubject?: string | null, selectedTopic?: string | null): boolean {
    if (selectedSubject && subject !== selectedSubject) return false;
    if (selectedTopic && topic !== selectedTopic) return false;
    return true;
}

export function getStudyQueue(params: StudyQueueParams): StudyQueueResult {
    const nowMs = Date.now();
    const today = localDayNumber(nowMs);

    const all = loadCardsWithNotes(false);

    const learningDue: StudyCard[] = [];
    const reviewDue: StudyCard[] = [];
    const newCards: StudyCard[] = [];
    let nextLearningDue: number | null = null;

    for (const item of all) {
        const studyCard = makeStudyCard(item.card, item.note, params.settings, nowMs);

        if (!inScope(studyCard.subject, studyCard.topic, params.selectedSubject, params.selectedTopic)) {
            continue;
        }

        if (item.card.queue === 0) {
            newCards.push(studyCard);
            continue;
        }

        if (item.card.queue === 1 || item.card.queue === 3) {
            if (item.card.due <= nowMs) {
                learningDue.push(studyCard);
            } else if (!nextLearningDue || item.card.due < nextLearningDue) {
                nextLearningDue = item.card.due;
            }
            continue;
        }

        if (item.card.queue === 2 && item.card.due <= today) {
            reviewDue.push(studyCard);
        }
    }

    learningDue.sort((a, b) => a.state.dueTime - b.state.dueTime);
    reviewDue.sort((a, b) => a.state.dueDate.localeCompare(b.state.dueDate));
    newCards.sort((a, b) => a.legacyCardId - b.legacyCardId);

    const availableNewLimit = Math.max(0, params.settings.dailyNewLimit - (params.newCardsStudiedToday ?? 0));
    const newCardsForQueue = newCards.slice(0, availableNewLimit);

    return {
        cards: [...learningDue, ...reviewDue, ...newCardsForQueue],
        stats: {
            newCount: newCards.length,
            learningCount: learningDue.length,
            reviewCount: reviewDue.length,
        },
        nextLearningDue,
    };
}

export function getStudyCardById(cardId: number, settings: AppSettings): StudyCard | null {
    const db = getDB();
    const row = db.getFirstSync<{ cardData: string; noteData: string }>(
        `SELECT c.data AS cardData, n.data AS noteData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         WHERE c.id = ?`,
        cardId
    );

    if (!row) return null;

    const card = JSON.parse(row.cardData) as AnkiCard;
    const note = JSON.parse(row.noteData) as Note;
    return makeStudyCard(card, note, settings, Date.now());
}

export function getAnkiCardSnapshot(cardId: number): AnkiCard | null {
    return getAnkiCard(cardId);
}

export function restoreAnkiCardSnapshot(snapshot: AnkiCard): void {
    saveAnkiCard(snapshot);
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

    const scheduler = getScheduler(settings.algorithm);
    const scheduleResult = scheduler.schedule(current.state, grade, settings);

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

    const updatedAnkiCard = cardStateToAnkiCard(currentAnkiCard, nextState, settings, nowMs);
    saveAnkiCard(updatedAnkiCard);

    const reviewType: 0 | 1 | 2 = currentAnkiCard.type === 2 ? 1 : currentAnkiCard.type === 3 ? 2 : 0;
    const revlogInterval = updatedAnkiCard.queue === 2
        ? updatedAnkiCard.ivl
        : -Math.max(1, Math.round((updatedAnkiCard.due - nowMs) / 1000));

    logReview(
        updatedAnkiCard,
        grade,
        revlogInterval,
        currentAnkiCard.ivl,
        updatedAnkiCard.factor,
        Math.max(0, answerTimeMs),
        reviewType,
    );

    const updatedStudyCard = getStudyCardById(cardId, settings);
    if (!updatedStudyCard) {
        throw new Error(`Updated card not found: ${cardId}`);
    }

    return {
        updatedCard: updatedStudyCard,
        previousAnkiCard: currentAnkiCard,
        wasNewCard: current.state.status === 'new',
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
    return ankiCardToCardState(card, settings, Date.now());
}

export function getStudyCardByLegacyCardId(legacyCardId: number, settings: AppSettings): StudyCard | null {
    return getStudyCardById(ankiCardIdFromLegacyCardId(legacyCardId), settings);
}

export function getBrowserCards(settings: AppSettings): StudyCard[] {
    const rows = loadCardsWithNotes(true);
    return rows.map((row) => makeStudyCard(row.card, row.note, settings, Date.now()));
}
