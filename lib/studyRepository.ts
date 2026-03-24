import { TUS_SUBJECTS } from './data';
import { getDB } from './db';
import type { CardState, AppSettings, Grade } from './types';
import type { AnkiCard, Note, DeckConfig, NoteType } from './models';
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
    getNoteType,
    handleLeech,
    isLeech,
    saveAnkiCard,
} from './noteManager';
import { getDeckByName, getDeckConfigForDeck } from './deckManager';
import { deleteReviewById, logReview } from './reviewLogger';
import { resolveSettingsFromConfig } from './settingsResolver';

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
    noteTypeData: string | null;
}

const SPECIAL_TEMPLATE_FIELDS = new Set(['FrontSide', 'Tags', 'Type', 'Deck', 'Card']);

function buildNoteTypeFieldMap(note: Note, noteType: NoteType | null): Map<string, string> {
    const fieldMap = new Map<string, string>();
    if (!noteType) return fieldMap;

    noteType.fields.forEach((field, index) => {
        fieldMap.set(field.name, note.fields[index] ?? '');
    });

    return fieldMap;
}

function extractTemplateFieldRefs(template: string): string[] {
    const refs: string[] = [];
    const regex = /\{\{(?:#|\^|\/)?(?:cloze:|type:)?([A-Za-z0-9_]+)\}\}/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(template)) !== null) {
        const name = match[1];
        if (SPECIAL_TEMPLATE_FIELDS.has(name)) continue;
        if (!refs.includes(name)) refs.push(name);
    }

    return refs;
}

function firstNonEmptyFieldName(fieldNames: string[], fieldMap: Map<string, string>): string | null {
    for (const name of fieldNames) {
        const value = fieldMap.get(name);
        if (value && value.trim().length > 0) {
            return name;
        }
    }
    return null;
}

function parseNotePayload(note: Note, noteType: NoteType | null): { subject: string; topic: string; question: string; answer: string } {
    const subjectFromTag = note.tags.find((tag) => KNOWN_SUBJECTS.has(tag));
    const subject = subjectFromTag ?? 'custom';

    if (!noteType) {
        const question = note.fields[0] ?? note.sfld ?? '';
        const answer = note.fields[1] ?? '';
        const topicFromTag = note.tags.find((tag) => tag !== subject && !tag.includes('::'));
        const topic = note.fields[2] || topicFromTag || 'General';
        return { subject, topic, question, answer };
    }

    const fieldMap = buildNoteTypeFieldMap(note, noteType);
    const orderedFieldNames = noteType.fields.map((field) => field.name);
    const primaryTemplate = noteType.templates[0];

    const questionRefs = extractTemplateFieldRefs(primaryTemplate?.qfmt ?? '');
    const answerRefs = extractTemplateFieldRefs(primaryTemplate?.afmt ?? '');

    const questionFieldName = firstNonEmptyFieldName(
        [...questionRefs, ...orderedFieldNames],
        fieldMap,
    );
    const question = questionFieldName
        ? (fieldMap.get(questionFieldName) ?? '')
        : (note.sfld || note.fields[0] || '');

    let answerFieldName = firstNonEmptyFieldName(
        [
            ...answerRefs.filter((name) => name !== questionFieldName),
            ...orderedFieldNames.filter((name) => name !== questionFieldName),
        ],
        fieldMap,
    );

    if (!answerFieldName) {
        answerFieldName = firstNonEmptyFieldName([...answerRefs, ...orderedFieldNames], fieldMap);
    }

    const answer = answerFieldName
        ? (fieldMap.get(answerFieldName) ?? '')
        : (note.fields[1] || '');

    const topicFieldName = firstNonEmptyFieldName(
        orderedFieldNames.filter((name) => name !== questionFieldName && name !== answerFieldName),
        fieldMap,
    );
    const topicFromTag = note.tags.find((tag) => tag !== subject && !tag.includes('::'));
    const topic = (topicFieldName ? fieldMap.get(topicFieldName) : '') || topicFromTag || 'General';

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
    limit?: number,
): QueueCardRow[] {
    const db = getDB();
    const scope = buildScopeClause(selectedSubject, selectedTopic, selectedDeckName);
    const cardDataSelect = includeCardBlob ? 'c.data' : 'NULL';
    const hasLimit = Number.isFinite(limit) && (limit as number) > 0;
    const limitSql = hasLimit ? ' LIMIT ?' : '';
    const limitParams: number[] = hasLimit ? [Math.floor(limit as number)] : [];

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
            n.data AS noteData,
            nt.data AS noteTypeData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN note_types nt ON nt.id = n.noteTypeId
         JOIN decks d ON d.id = c.deckId
         WHERE ${queueSql}${scope.sql}
         ORDER BY ${orderBy}${limitSql}`,
        ...queueParams,
        ...scope.params,
        ...limitParams,
    );
}

function countRowsByQueue(
    queueSql: string,
    queueParams: Array<string | number>,
    selectedSubject?: string | null,
    selectedTopic?: string | null,
    selectedDeckName?: string | null,
): number {
    const db = getDB();
    const scope = buildScopeClause(selectedSubject, selectedTopic, selectedDeckName);

    const row = db.getFirstSync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN decks d ON d.id = c.deckId
         WHERE ${queueSql}${scope.sql}`,
        ...queueParams,
        ...scope.params,
    );

    return row?.cnt || 0;
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
    const resolved = resolveSettingsFromConfig(config, base);

    cache?.set(deckId, resolved);
    return resolved;
}

function makeStudyCard(
    card: AnkiCard,
    note: Note,
    noteType: NoteType | null,
    settings: AppSettings,
    nowMs: number,
    includeRawCard: boolean,
    stateOverride?: CardState,
): StudyCard {
    const payload = parseNotePayload(note, noteType);

    return {
        cardId: card.id,
        legacyCardId: legacyCardIdFromAnkiCardId(card.id),
        noteId: card.noteId,
        deckId: card.deckId,
        subject: payload.subject,
        topic: payload.topic,
        question: payload.question,
        answer: payload.answer,
        // TODO(boundary): remove CardState materialization from queue path once scheduler works directly on AnkiCard.
        state: stateOverride ?? ankiCardToCardState(card, settings, nowMs),
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
        const noteType = row.noteTypeData ? (JSON.parse(row.noteTypeData) as NoteType) : null;

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
        return makeStudyCard(
            card,
            note,
            noteType,
            cardSettings,
            nowMs,
            Boolean(options.includeRawCard),
        );
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

        // Anki bury-interday-learning applies to day-learning queue (3), not intraday queue (1).
        if (sibling.queue === 3 && config.buryInterdayLearningSiblings) {
            buryCard(sibling.id, true);
        }
    }
}

export function getStudyQueue(params: StudyQueueParams): StudyQueueResult {
    const nowMs = Date.now();
    const today = localDayNumber(nowMs, params.settings.dayRolloverHour);
    const settingsCache = new Map<number, AppSettings>();

    const availableNewLimit = Math.max(0, params.settings.dailyNewLimit - (params.newCardsStudiedToday ?? 0));
    const reviewLimit = Math.max(0, params.settings.dailyReviewLimit);

    // Count with SQL first (scales better than loading full queue).
    const intradayLearningCount = countRowsByQueue(
        'c.queue = 1 AND c.due <= ?',
        [nowMs],
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

    const reviewFetchLimit = reviewLimit > 0 ? Math.max(reviewLimit * 4, reviewLimit + 100) : 0;
    const newFetchLimit = availableNewLimit > 0 ? Math.max(availableNewLimit * 4, availableNewLimit + 100) : 0;

    const reviewRows = reviewFetchLimit > 0
        ? loadRowsByQueue(
            'c.queue = 2 AND c.due <= ?',
            [today],
            params.selectedSubject,
            params.selectedTopic,
            params.selectedDeckName,
            'c.due ASC',
            false,
            reviewFetchLimit,
        )
        : [];

    const newRows = newFetchLimit > 0
        ? loadRowsByQueue(
            'c.queue = 0',
            [],
            params.selectedSubject,
            params.selectedTopic,
            params.selectedDeckName,
            'c.id ASC',
            false,
            newFetchLimit,
        )
        : [];

    const intradayLearningCards = toStudyCards(intradayLearningRows, params.settings, nowMs, { settingsCache });
    const interdayLearningCards = toStudyCards(interdayLearningRows, params.settings, nowMs, { settingsCache });
    const learningCards = [...intradayLearningCards, ...interdayLearningCards];

    let reviewCards = toStudyCards(reviewRows, params.settings, nowMs, { settingsCache });
    let newCards = toStudyCards(newRows, params.settings, nowMs, { settingsCache });

    if (params.settings.newCardOrder === 'random') {
        newCards = deterministicShuffle(
            newCards,
            `${todayLocalYMD(undefined, params.settings.dayRolloverHour)}-${newCount}`,
        );
    }

    let reviewCardsForQueue = applyPerDeckLimit(reviewCards, reviewLimit, (card) => {
        const cardSettings = resolveSettingsForDeck(card.deckId, params.settings, settingsCache);
        return cardSettings.dailyReviewLimit;
    });

    let newCardsForQueue = applyPerDeckLimit(newCards, availableNewLimit, (card) => {
        const cardSettings = resolveSettingsForDeck(card.deckId, params.settings, settingsCache);
        return cardSettings.dailyNewLimit;
    });

    // Fallback for strict per-deck limits: if limited fetch under-fills, do one full fetch.
    if (reviewCardsForQueue.length < Math.min(reviewLimit, reviewCount) && reviewRows.length < reviewCount) {
        reviewCards = toStudyCards(
            loadRowsByQueue(
                'c.queue = 2 AND c.due <= ?',
                [today],
                params.selectedSubject,
                params.selectedTopic,
                params.selectedDeckName,
                'c.due ASC',
                false,
            ),
            params.settings,
            nowMs,
            { settingsCache },
        );
        reviewCardsForQueue = applyPerDeckLimit(reviewCards, reviewLimit, (card) => {
            const cardSettings = resolveSettingsForDeck(card.deckId, params.settings, settingsCache);
            return cardSettings.dailyReviewLimit;
        });
    }

    if (newCardsForQueue.length < Math.min(availableNewLimit, newCount) && newRows.length < newCount) {
        newCards = toStudyCards(
            loadRowsByQueue(
                'c.queue = 0',
                [],
                params.selectedSubject,
                params.selectedTopic,
                params.selectedDeckName,
                'c.id ASC',
                false,
            ),
            params.settings,
            nowMs,
            { settingsCache },
        );

        if (params.settings.newCardOrder === 'random') {
            newCards = deterministicShuffle(
                newCards,
                `${todayLocalYMD(undefined, params.settings.dayRolloverHour)}-${newCount}`,
            );
        }

        newCardsForQueue = applyPerDeckLimit(newCards, availableNewLimit, (card) => {
            const cardSettings = resolveSettingsForDeck(card.deckId, params.settings, settingsCache);
            return cardSettings.dailyNewLimit;
        });
    }

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
            newCount,
            learningCount: intradayLearningCount + interdayLearningCount,
            reviewCount,
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
    const noteType = getNoteType(note.noteTypeId);
    const deckConfig = getDeckConfig(currentAnkiCard.deckId);

    const scheduler = getScheduler(cardSettings.algorithm);
    const scheduleResult = scheduler.schedule(currentState, grade, cardSettings, nowMs);

    const nextState: CardState = {
        ...currentState,
        ...scheduleResult.stateUpdates,
        cardId: currentAnkiCard.id,
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

    const updatedStudyCard = makeStudyCard(
        updatedAnkiCard,
        note,
        noteType,
        cardSettings,
        nowMs,
        true,
        nextState,
    );

    return {
        updatedCard: updatedStudyCard,
        previousAnkiCard: currentAnkiCard,
        wasNewCard: currentState.status === 'new',
        reviewLogId,
    };
}


export function setCardSuspended(cardId: number, suspended: boolean, rolloverHour: number = 4): void {
    const card = getAnkiCard(cardId);
    if (!card) return;

    card.queue = suspended ? -1 : restoreQueueFromType(card, rolloverHour);
    card.mod = Math.floor(Date.now() / 1000);
    card.usn = -1;
    saveAnkiCard(card);
}

export function setCardBuried(cardId: number, buried: boolean, rolloverHour: number = 4): void {
    const card = getAnkiCard(cardId);
    if (!card) return;

    card.queue = buried ? -2 : restoreQueueFromType(card, rolloverHour);
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

export function getBrowserCards(settings: AppSettings, limit?: number, offset?: number): StudyCard[] {
    const db = getDB();
    const hasLimit = Number.isFinite(limit) && (limit as number) > 0;
    const hasOffset = Number.isFinite(offset) && (offset as number) > 0;
    const limitSql = hasLimit ? ` LIMIT ${Math.floor(limit as number)}` : '';
    const offsetSql = hasOffset ? ` OFFSET ${Math.floor(offset as number)}` : '';

    const rows = db.getAllSync<QueueCardRow>(
        `SELECT
            c.id AS cardId, c.noteId AS noteId, c.deckId AS deckId,
            c.ord AS ord, c.type AS type, c.queue AS queue,
            c.due AS due, c.ivl AS ivl, c.factor AS factor,
            c.reps AS reps, c.lapses AS lapses, c.left AS left,
            c.flags AS flags, NULL AS cardData,
            n.data AS noteData, nt.data AS noteTypeData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN note_types nt ON nt.id = n.noteTypeId
         ORDER BY c.id ASC${limitSql}${offsetSql}`,
    );
    return toStudyCards(rows, settings, Date.now());
}

export function getBrowserCardCount(): number {
    const db = getDB();
    const row = db.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM anki_cards');
    return row?.cnt || 0;
}
