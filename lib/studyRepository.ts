import { getDB } from './db';
import { getAllSubjects, getSubjectIdSet, resolveSubjectDeckId } from './subjects';
import type { CardState, AppSettings, Grade, StudyCard } from './types';
import type { AnkiCard, Deck, Note, DeckConfig, NoteType } from './models';
import {
    ankiCardIdFromLegacyCardId,
    ankiCardToCardState,
    cardStateToAnkiCard,
    legacyCardIdFromAnkiCardId,
    makeDefaultCardState,
    localDayNumber,
    nextRolloverMs,
    restoreQueueFromType,
} from './ankiState';
import { getDeckAncestors } from './models';
import { addDaysLocalYMD, getScheduler, todayLocalYMD } from './scheduler';
import {
    buryCard,
    getAnkiCard,
    getCardsForNote,
    getNote,
    getNoteType,
    handleLeech,
    isLeech,
    MARKED_TAG,
    nextNewCardPosition,
    saveAnkiCard,
} from './noteManager';
import { getDeck, getDeckByName, getDeckConfigForDeck } from './deckManager';
import {
    applyHierarchicalLimit,
    deckLimitKeys,
    buryBuildTimeSiblings,
    interleaveNewWithReviews,
    sortReviewsDueThenRandom,
    splitIntradayLearning,
} from './queueBuild';
import { deleteReviewById, logManualReschedule, logReview } from './reviewLogger';
import { resolveSettingsFromConfig } from './settingsResolver';
import {
    cardScheduledAsNew,
    cardWithDueDate,
    sampleDaysFromToday,
    type DueDateSpecifier,
    type ForgetOptions,
} from './setDueDate';

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
}

export interface StudyQueueParams {
    settings: AppSettings;
    selectedSubject?: string | null;
    selectedTopic?: string | null;
    selectedDeckName?: string | null;
    newCardsStudiedToday?: number;
    /**
     * Learning cards to serve even though their step timer has not expired. Powers the
     * one-shot "study ahead" button: the UI captures the waiting ids once at press time
     * and removes each id after it is answered, so a short next step (1 dk / 10 dk) can
     * never pull the card back in without a new button press.
     */
    extraLearningCardIds?: number[];
}

export interface ReviewResult {
    updatedCard: StudyCard;
    previousAnkiCard: AnkiCard;
    wasNewCard: boolean;
    reviewLogId: number;
}

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

/**
 * Extract field name references from an Anki template string.
 *
 * Anki's template syntax (mustache-like):
 *   {{FieldName}}                — simple replacement
 *   {{#FieldName}} ... {{/FieldName}}  — conditional block
 *   {{^FieldName}} ... {{/FieldName}}  — negated conditional
 *   {{filter:FieldName}}         — filtered replacement (hint:, text:, cloze:, type:, tts:, etc.)
 *   {{filter1:filter2:FieldName}} — chained filters
 *
 * Anki source (template.rs classify_handle + ParsedNode::Replacement):
 *   1. Strip optional block marker (#, ^, /)
 *   2. Split on ':' — the LAST segment is the field name, preceding segments are filters
 *   3. Trim whitespace (Anki allows "{{ Front }}")
 *   4. Field names may contain any character except { and }
 *
 * Special pseudo-fields (FrontSide, Tags, Type, Deck, Card) are excluded
 * because they are not real note fields — Anki fills them dynamically.
 */
function extractTemplateFieldRefs(template: string): string[] {
    const seen = new Set<string>();
    const refs: string[] = [];
    // Match everything between {{ and }}, including unicode, spaces, and filter chains.
    const regex = /\{\{([^{}]+?)\}\}/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(template)) !== null) {
        let content = match[1].trim();
        if (!content) continue;

        // Strip optional block marker: # (conditional), ^ (negated), / (close)
        if (content[0] === '#' || content[0] === '^' || content[0] === '/') {
            content = content.slice(1).trim();
        }

        // Anki splits on ':' and takes the LAST segment as the field name.
        // Preceding segments are filters (cloze, type, hint, text, furigana, tts, etc.)
        const colonIdx = content.lastIndexOf(':');
        const fieldName = colonIdx >= 0 ? content.slice(colonIdx + 1).trim() : content;

        if (!fieldName) continue;
        if (SPECIAL_TEMPLATE_FIELDS.has(fieldName)) continue;
        if (seen.has(fieldName)) continue;
        seen.add(fieldName);
        refs.push(fieldName);
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
    const knownSubjects = getSubjectIdSet();
    const subjectFromTag = note.tags.find((tag) => knownSubjects.has(tag));
    // Bundled BKA notes keep their source tags byte-for-byte. Curated navigation lives in
    // separate catalog metadata, so prefer it instead of guessing a course/topic from tags.
    const subject = note.catalogSubject || subjectFromTag || 'custom';

    if (!noteType) {
        const question = note.fields[0] ?? note.sfld ?? '';
        const answer = note.fields[1] ?? '';
        const topicFromTag = note.tags.find((tag) => tag !== subject && !tag.includes('::'));
        const topic = note.catalogTopic || note.fields[2] || topicFromTag || 'General';
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

    // Topic: first remaining non-empty field (after question & answer), else a tag, else 'General'.
    const topicFieldName = firstNonEmptyFieldName(
        orderedFieldNames.filter((name) => name !== questionFieldName && name !== answerFieldName),
        fieldMap,
    );
    const topicFromField = topicFieldName != null ? (fieldMap.get(topicFieldName) ?? '') : '';
    const topicFromTag = note.tags.find((tag) => tag !== subject && !tag.includes('::'));
    const topic = note.catalogTopic || topicFromField || topicFromTag || 'General';

    return { subject, topic, question, answer };
}

/** Escape SQL LIKE wildcard characters so they match literally.
 *  Anki's to_sql() escapes % and keeps _ as literal via ESCAPE clause;
 *  we do the same for user-supplied search terms. */
function escapeLikePattern(s: string): string {
    return s.replace(/[%_\\]/g, '\\$&');
}

/**
 * Parse a simplified Anki-style search query into individual SQL clauses.
 * Returns { clauses, params } where clauses is an array of SQL fragments
 * WITHOUT any leading AND — the caller decides how to join them.
 *
 * Supported prefixes (matching Anki's search syntax):
 *   tag:<name>   — substring match on n.tags
 *   deck:<name>  — exact match OR child deck match (deck::child)
 *   <term>       — substring match on sfld, note data, and tags
 */
function buildFilteredSearchClause(searchQuery: string): { clauses: string[]; params: Array<string | number> } {
    // Tokenize honoring double quotes (Anki syntax): deck:"A B" stays one term.
    const terms = searchQuery.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
    const unquote = (value: string) =>
        value.startsWith('"') && value.endsWith('"') && value.length >= 2
            ? value.slice(1, -1)
            : value;
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    for (const term of terms) {
        if (term.startsWith('tag:')) {
            const tag = unquote(term.slice(4));
            if (tag) {
                // Whole-tag match (same rationale as buildScopeClause): "tag:veri" must not
                // match a note tagged "Veri-Tipleri".
                clauses.push("(' ' || TRIM(n.tags) || ' ') LIKE ? ESCAPE '\\'");
                params.push(`% ${escapeLikePattern(tag)} %`);
            }
            continue;
        }

        if (term.startsWith('deck:')) {
            const deckName = unquote(term.slice(5));
            if (deckName) {
                clauses.push("(d.name = ? OR d.name LIKE ? ESCAPE '\\')");
                params.push(deckName, `${escapeLikePattern(deckName)}::%`);
            }
            continue;
        }

        // Anki's flag search: flag:1..7 matches that flag, flag:0 matches unflagged cards.
        if (term.startsWith('flag:')) {
            const value = Number(unquote(term.slice(5)));
            if (Number.isInteger(value) && value >= 0 && value <= 7) {
                clauses.push('c.flags = ?');
                params.push(value);
            }
            continue;
        }

        // Anki's card-state search (is:new / is:learn / is:review / is:due / is:suspended / is:buried).
        if (term.startsWith('is:')) {
            const state = unquote(term.slice(3)).toLowerCase();
            const today = localDayNumber(Date.now(), 4);
            if (state === 'new') clauses.push('c.queue = 0');
            else if (state === 'learn') clauses.push('c.queue IN (1, 3)');
            else if (state === 'review') clauses.push('c.queue = 2');
            else if (state === 'suspended') clauses.push('c.queue = -1');
            else if (state === 'buried') clauses.push('c.queue IN (-2, -3)');
            else if (state === 'due') {
                clauses.push('((c.queue = 2 AND c.due <= ?) OR (c.queue = 3 AND c.due <= ?) OR (c.queue = 1 AND c.due <= ?))');
                params.push(today, today, Date.now());
            }
            continue;
        }

        // Anki's rated search: rated:N (answered in the last N days), rated:N:E (with ease E —
        // rated:7:1 = forgotten in the last week). Uses a rolling 24h·N window.
        if (term.startsWith('rated:')) {
            const parts = unquote(term.slice(6)).split(':');
            const days = Number(parts[0]);
            const ease = parts.length > 1 ? Number(parts[1]) : null;
            if (Number.isFinite(days) && days > 0) {
                const cutoff = Date.now() - Math.min(365, Math.floor(days)) * 86400000;
                if (ease !== null && Number.isInteger(ease) && ease >= 1 && ease <= 4) {
                    clauses.push('c.id IN (SELECT cardId FROM revlog WHERE id >= ? AND ease = ?)');
                    params.push(cutoff, ease);
                } else {
                    clauses.push('c.id IN (SELECT cardId FROM revlog WHERE id >= ? AND ease > 0)');
                    params.push(cutoff);
                }
            }
            continue;
        }

        // Anki's prop:due comparison — days relative to today ("prop:due<=3" = due within 3 days).
        // Only day-scheduled queues (review / interday learning) carry a day-number due.
        if (term.startsWith('prop:due')) {
            const match = unquote(term.slice(8)).match(/^(<=|>=|=|<|>)(-?\d+)$/);
            if (match) {
                const op = match[1] === '=' ? '=' : match[1];
                const days = Number(match[2]);
                const today = localDayNumber(Date.now(), 4);
                clauses.push(`(c.queue IN (2, 3) AND (c.due - ?) ${op} ?)`);
                params.push(today, days);
            }
            continue;
        }

        const escaped = escapeLikePattern(unquote(term));
        clauses.push("(n.sfld LIKE ? ESCAPE '\\' OR n.data LIKE ? ESCAPE '\\' OR n.tags LIKE ? ESCAPE '\\')");
        params.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
    }

    return { clauses, params };
}

/**
 * Build a SQL WHERE fragment for subject/topic/deck scope filtering.
 * Returns { sql, params } where sql is either empty string or " AND (...)" —
 * always safe to append directly after another WHERE predicate.
 */
function buildScopeClause(
    selectedSubject?: string | null,
    selectedTopic?: string | null,
    selectedDeckName?: string | null,
): { sql: string; params: Array<string | number> } {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (selectedSubject) {
        const homeDeckId = resolveSubjectDeckId(selectedSubject);
        const homeDeck = homeDeckId === 1 ? null : getDeck(homeDeckId);
        if (homeDeck) {
            // Courses own a physical deck. Scope by that deck tree so imported Anki tags stay
            // unchanged instead of injecting an app-only subject tag into every note.
            clauses.push("(c.deckId = ? OR d.name LIKE ? ESCAPE '\\')");
            params.push(homeDeckId, `${escapeLikePattern(homeDeck.name)}::%`);
        } else {
            // Legacy/unknown subjects fall back to a whole-tag match.
            clauses.push("(' ' || TRIM(n.tags) || ' ') LIKE ? ESCAPE '\\'");
            params.push(`% ${escapeLikePattern(selectedSubject)} %`);
        }
    }

    if (selectedTopic) {
        // A topic is stored two ways: as a whole tag with spaces dashed ("Hata-Ayıklama")
        // and verbatim as a note field, which appears JSON-quoted inside n.data. Substring
        // matching the raw topic against n.data would also hit question/answer TEXT (topic
        // "random" matching every card that merely mentions random), so require either the
        // whole tag or the exact quoted field value.
        const topicTag = selectedTopic.replace(/\s+/g, '-');
        clauses.push("((' ' || TRIM(n.tags) || ' ') LIKE ? ESCAPE '\\' OR n.data LIKE ? ESCAPE '\\')");
        params.push(
            `% ${escapeLikePattern(topicTag)} %`,
            `%${escapeLikePattern(JSON.stringify(selectedTopic))}%`,
        );
    }

    if (selectedDeckName) {
        const selectedDeck = getDeckByName(selectedDeckName);
        if (selectedDeck?.isFiltered && selectedDeck.searchQuery) {
            const filtered = buildFilteredSearchClause(selectedDeck.searchQuery);
            clauses.push(...filtered.clauses);
            params.push(...filtered.params);
        } else {
            clauses.push("(d.name = ? OR d.name LIKE ? ESCAPE '\\')");
            params.push(selectedDeckName, `${escapeLikePattern(selectedDeckName)}::%`);
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
            c."left" AS "left",
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

/**
 * Count cards matching a queue predicate + scope filters.
 * JOINs the same 4 tables as loadRowsByQueue so that a card missing
 * its note_type row is excluded from both the count and the load —
 * preventing "N cards available" when only N-1 can actually render.
 */
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
         JOIN note_types nt ON nt.id = n.noteTypeId
         JOIN decks d ON d.id = c.deckId
         WHERE ${queueSql}${scope.sql}`,
        ...queueParams,
        ...scope.params,
    );

    return row?.cnt ?? 0;
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
        noteMarked: note.tags.includes(MARKED_TAG),
        // TODO(boundary): remove CardState materialization from queue path once scheduler works directly on AnkiCard.
        state: stateOverride ?? ankiCardToCardState(card, settings, nowMs),
        rawCard: includeRawCard ? card : undefined,
        rawNote: includeRawCard ? note : undefined,
    };
}

function toStudyCards(
    rows: QueueCardRow[],
    baseSettings: AppSettings,
    nowMs: number,
    options: { includeRawCard?: boolean; settingsCache?: Map<number, AppSettings> } = {},
): StudyCard[] {
    const settingsCache = options.settingsCache ?? new Map<number, AppSettings>();

    return rows.reduce<StudyCard[]>((acc, row) => {
        try {
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
            acc.push(makeStudyCard(
                card,
                note,
                noteType,
                cardSettings,
                nowMs,
                Boolean(options.includeRawCard),
            ));
        } catch (e) {
            console.warn('[StudyRepo] Skipping corrupt row:', row.cardId, e);
        }
        return acc;
    }, []);
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

/**
 * Group new cards course-by-course and topic-by-topic, in the order the course defines its
 * topics — the way Anki's v3 scheduler gathers new cards subdeck by subdeck. A stable sort
 * preserves the position (or shuffled) order inside each topic, so finishing "Tanımlama"
 * moves the queue to "Parametreler", skipping topics with nothing left to introduce.
 */
function sortNewCardsByCourseOrder(cards: StudyCard[]): StudyCard[] {
    if (cards.length <= 1) return cards;

    const subjects = getAllSubjects();
    const subjectRank = new Map(subjects.map((subject, index) => [subject.id, index]));
    const topicRank = new Map<string, number>();
    for (const subject of subjects) {
        subject.topics.forEach((topic, index) => topicRank.set(`${subject.id}::${topic}`, index));
    }

    const UNKNOWN = Number.MAX_SAFE_INTEGER;
    return cards
        .map((card, index) => ({ card, index }))
        .sort((a, b) => {
            const subjectDelta = (subjectRank.get(a.card.subject) ?? UNKNOWN)
                - (subjectRank.get(b.card.subject) ?? UNKNOWN);
            if (subjectDelta !== 0) return subjectDelta;

            const topicDelta = (topicRank.get(`${a.card.subject}::${a.card.topic}`) ?? UNKNOWN)
                - (topicRank.get(`${b.card.subject}::${b.card.topic}`) ?? UNKNOWN);
            if (topicDelta !== 0) return topicDelta;

            return a.index - b.index;
        })
        .map((entry) => entry.card);
}

/** Anki v3 "new card gather order": topic/course order (default), raw position, or random. */
function applyNewCardOrder(cards: StudyCard[], settings: AppSettings, daySeed: string, newCount: number): StudyCard[] {
    if (settings.newCardGatherOrder === 'random') {
        return deterministicShuffle(cards, `${daySeed}-${newCount}`);
    }
    if (settings.newCardGatherOrder === 'position') {
        return cards; // already loaded in due/position order
    }
    const base = settings.newCardOrder === 'random'
        ? deterministicShuffle(cards, `${daySeed}-${newCount}`)
        : cards;
    return sortNewCardsByCourseOrder(base);
}

/** Anki v3 "review sort order": due-then-random (default) or by interval length. */
function applyReviewOrder(cards: StudyCard[], settings: AppSettings, daySeed: string, today: number): StudyCard[] {
    if (settings.reviewSortOrder === 'intervalsAsc' || settings.reviewSortOrder === 'intervalsDesc') {
        const direction = settings.reviewSortOrder === 'intervalsAsc' ? 1 : -1;
        return [...cards].sort((a, b) =>
            direction * (a.state.interval - b.state.interval) || a.cardId - b.cardId);
    }
    return sortReviewsDueThenRandom(cards, daySeed, today);
}

/**
 * Anki's "easy days": shift a review interval so the due date avoids reduced/blocked
 * weekdays. Factor 0 always moves off the day; factor 0.5 moves half the cards off it
 * (deterministic by card id). Searches outward (+1, -1, +2, …) for the nearest allowed
 * day, never dropping below a 1-day interval.
 */
export function adjustIntervalForEasyDays(
    intervalDays: number,
    cardId: number,
    easyDays: number[] | undefined,
    nowMs: number,
    rolloverHour: number,
): number {
    if (!Array.isArray(easyDays) || easyDays.length !== 7) return intervalDays;
    if (easyDays.every((factor) => factor >= 1)) return intervalDays;
    if (intervalDays < 1) return intervalDays;

    const today = localDayNumber(nowMs, rolloverHour);
    const mondayIndexOf = (dayNumber: number) => (new Date(dayNumber * 86400000).getUTCDay() + 6) % 7;

    const factorFor = (interval: number) => easyDays[mondayIndexOf(today + interval)] ?? 1;

    const factor = factorFor(intervalDays);
    if (factor >= 1) return intervalDays;
    if (factor > 0 && cardId % 2 === 0) return intervalDays; // "reduced": let half stay

    for (let offset = 1; offset <= 6; offset++) {
        for (const candidate of [intervalDays + offset, intervalDays - offset]) {
            if (candidate < 1) continue;
            if (factorFor(candidate) >= 1) return candidate;
        }
    }
    return intervalDays; // every weekday reduced — nothing sensible to prefer
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

/** SQL ORDER BY for a filtered deck's gather order (see FILTERED_ORDERS in models). */
function filteredOrderSql(order: number | undefined): string {
    switch (order) {
        case 1: return 'RANDOM()';
        case 2: return 'c.ivl ASC, c.id ASC';
        case 3: return 'c.ivl DESC, c.id ASC';
        case 4: return 'c.id ASC';
        case 5: return 'c.id DESC';
        case 6: return 'c.lapses DESC, c.id ASC';
        case 7: return 'COALESCE((SELECT MAX(r.id) FROM revlog r WHERE r.cardId = c.id), 0) ASC, c.id ASC';
        // The local scheduler does not persist FSRS stability per card. Relative overdue time
        // is the closest deterministic retrievability proxy and matches Anki's SM-2 intent:
        // cards further beyond their interval are less retrievable.
        case 8: return '(CAST(c.due AS REAL) - MAX(c.ivl, 1)) ASC, c.id ASC';
        case 9: return '(CAST(c.due AS REAL) - MAX(c.ivl, 1)) DESC, c.id ASC';
        default: return 'c.due ASC, c.id ASC';
    }
}

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

function buildFilteredDeckQueue(deck: FilteredDeckQueueDefinition, settings: AppSettings, nowMs: number): StudyQueueResult {
    if (deck.filteredDeckEmpty) {
        return {
            cards: [],
            stats: { newCount: 0, learningCount: 0, reviewCount: 0 },
            nextLearningDue: null,
            dailyNewLimitReached: false,
            heldBackNewCount: 0,
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
            filteredOrderSql(order),
            true,
            Math.max(1, Math.min(9999, Math.floor(limit ?? 100))),
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
        heldBackNewCount: 0,
    };
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

export function getStudyQueue(params: StudyQueueParams): StudyQueueResult {
    const nowMs = Date.now();
    const today = localDayNumber(nowMs, params.settings.dayRolloverHour);
    const settingsCache = new Map<number, AppSettings>();

    // Filtered decks bypass the daily queue entirely: their saved search IS the session.
    if (params.selectedDeckName) {
        const selectedDeck = getDeckByName(params.selectedDeckName);
        if (selectedDeck?.isFiltered) {
            return buildFilteredDeckQueue(selectedDeck, params.settings, nowMs);
        }
    }

    const availableNewLimit = Math.max(0, params.settings.dailyNewLimit - (params.newCardsStudiedToday ?? 0));
    const reviewLimit = Math.max(0, params.settings.dailyReviewLimit);

    // Anki's "learn ahead limit" (rslib: learn_ahead_secs): intraday learning cards due within
    // this window are gathered too, but they are served strictly AFTER everything else — never
    // ahead of their step timer while other cards remain. With the limit at 0 they are not
    // gathered at all and the UI counts down until the first one is due.
    const learnAheadCutoff = nowMs + Math.max(0, params.settings.learnAheadMinutes || 0) * 60000;

    // The displayed learning count follows Anki's deck list: every intraday learning card due
    // before the day rolls over counts, including ones whose step timer is still running. Only
    // the serving cutoff (learnAheadCutoff) decides what is actually dealt right now.
    const endOfDayMs = nextRolloverMs(nowMs, params.settings.dayRolloverHour);

    // Count with SQL first (scales better than loading full queue).
    const intradayLearningCount = countRowsByQueue(
        'c.queue = 1 AND c.due < ?',
        [Math.max(endOfDayMs, learnAheadCutoff)],
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
            'c.due ASC, c.id ASC',
            false,
            newFetchLimit,
        )
        : [];

    const intradayLearningCards = toStudyCards(intradayLearningRows, params.settings, nowMs, { settingsCache });
    const interdayLearningCards = toStudyCards(interdayLearningRows, params.settings, nowMs, { settingsCache });
    let learningCards = [...intradayLearningCards, ...interdayLearningCards];

    let reviewCards = toStudyCards(reviewRows, params.settings, nowMs, { settingsCache });
    let newCards = toStudyCards(newRows, params.settings, nowMs, { settingsCache });

    const daySeed = todayLocalYMD(undefined, params.settings.dayRolloverHour);

    reviewCards = applyReviewOrder(reviewCards, params.settings, daySeed, today);
    newCards = applyNewCardOrder(newCards, params.settings, daySeed, newCount);

    // Build-time sibling burying happens before limits so a buried sibling never wastes a slot.
    const deckConfigCache = new Map<number, DeckConfig>();
    const configForDeck = (deckId: number): DeckConfig => {
        let config = deckConfigCache.get(deckId);
        if (!config) {
            config = getDeckConfigForDeck(deckId);
            deckConfigCache.set(deckId, config);
        }
        return config;
    };
    ({ learning: learningCards, reviews: reviewCards, news: newCards } =
        buryBuildTimeSiblings(learningCards, reviewCards, newCards, configForDeck, (cardId) => buryCard(cardId, true)));

    // Hierarchical daily limits: a card counts against its deck and every ancestor deck up to the
    // one being studied. Anki stops there by default -- "the daily limits of a higher-level deck do
    // not apply if you select one of its subdecks" -- so a parent's limit only caps a subdeck
    // session when the parent itself was selected.
    const deckNameCache = new Map<number, string | null>();
    const deckKeysForCard = (card: StudyCard): string[] => {
        let name = deckNameCache.get(card.deckId);
        if (name === undefined) {
            name = getDeck(card.deckId)?.name ?? null;
            deckNameCache.set(card.deckId, name);
        }
        return name ? deckLimitKeys(name, params.selectedDeckName) : [`#${card.deckId}`];
    };
    const settingsForDeckKey = (key: string): AppSettings => {
        if (key.startsWith('#')) {
            return resolveSettingsForDeck(Number(key.slice(1)), params.settings, settingsCache);
        }
        const deck = getDeckByName(key);
        return deck ? resolveSettingsForDeck(deck.id, params.settings, settingsCache) : params.settings;
    };
    const newLimitByKey = new Map<string, number>();
    const newLimitForDeckKey = (key: string): number => {
        let limit = newLimitByKey.get(key);
        if (limit === undefined) {
            limit = settingsForDeckKey(key).dailyNewLimit;
            newLimitByKey.set(key, limit);
        }
        return limit;
    };
    const reviewLimitByKey = new Map<string, number>();
    const reviewLimitForDeckKey = (key: string): number => {
        let limit = reviewLimitByKey.get(key);
        if (limit === undefined) {
            limit = settingsForDeckKey(key).dailyReviewLimit;
            reviewLimitByKey.set(key, limit);
        }
        return limit;
    };

    let reviewCardsForQueue = applyHierarchicalLimit(reviewCards, reviewLimit, deckKeysForCard, reviewLimitForDeckKey);
    let newCardsForQueue = applyHierarchicalLimit(newCards, availableNewLimit, deckKeysForCard, newLimitForDeckKey);

    // Fallback for strict per-deck limits: if the limited fetch under-fills, do one full fetch.
    // Siblings buried above are persisted, so a full re-fetch stays free of sibling pairs.
    if (reviewCardsForQueue.length < Math.min(reviewLimit, reviewCount) && reviewRows.length < reviewCount) {
        reviewCards = applyReviewOrder(
            toStudyCards(
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
            ),
            params.settings,
            daySeed,
            today,
        );
        reviewCardsForQueue = applyHierarchicalLimit(reviewCards, reviewLimit, deckKeysForCard, reviewLimitForDeckKey);
    }

    if (newCardsForQueue.length < Math.min(availableNewLimit, newCount) && newRows.length < newCount) {
        newCards = applyNewCardOrder(
            toStudyCards(
                loadRowsByQueue(
                    'c.queue = 0',
                    [],
                    params.selectedSubject,
                    params.selectedTopic,
                    params.selectedDeckName,
                    'c.due ASC, c.id ASC',
                    false,
                ),
                params.settings,
                nowMs,
                { settingsCache },
            ),
            params.settings,
            daySeed,
            newCount,
        );

        newCardsForQueue = applyHierarchicalLimit(newCards, availableNewLimit, deckKeysForCard, newLimitForDeckKey);
    }

    // Anki serving order (rslib scheduler/queue/mod.rs `iter`): learning cards whose timer has
    // expired lead, then the main queue (new/review per queueOrder), and learning cards still
    // inside the learn-ahead window trail at the very end — they only surface once everything
    // else is exhausted, instead of storming back in front on every queue rebuild.
    const { dueNow: learningDueNow, learnAhead: learningAhead } = splitIntradayLearning(learningCards, nowMs);

    let cards: StudyCard[];
    if (params.settings.queueOrder === 'before') {
        cards = [...learningDueNow, ...newCardsForQueue, ...reviewCardsForQueue, ...learningAhead];
    } else if (params.settings.queueOrder === 'after') {
        cards = [...learningDueNow, ...reviewCardsForQueue, ...newCardsForQueue, ...learningAhead];
    } else {
        cards = [...learningDueNow, ...interleaveNewWithReviews(reviewCardsForQueue, newCardsForQueue), ...learningAhead];
    }

    // Cards inside the learn-ahead window are already queued; report the first one due beyond it.
    const nextLearningDue = loadNextLearningDue(
        learnAheadCutoff,
        params.selectedSubject,
        params.selectedTopic,
        params.selectedDeckName,
    );

    // Report the new count the way Anki's deck list does: what today's limits still allow,
    // not the raw backlog. The uncapped remainder feeds the "held back" message instead of
    // silently inflating the badge past what the queue will ever serve.
    const servableNewCount = newCardsForQueue.length;

    return {
        cards,
        stats: {
            newCount: servableNewCount,
            learningCount: intradayLearningCount + interdayLearningCount,
            reviewCount,
        },
        nextLearningDue,
        // Reached when new cards exist in scope but none survived the global/per-deck limits.
        dailyNewLimitReached: newCount > 0 && servableNewCount === 0,
        heldBackNewCount: Math.max(0, newCount - servableNewCount),
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
    options: { preview?: boolean } = {},
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
    const deckConfig = getDeckConfigForDeck(currentAnkiCard.deckId);

    // Preview mode (filtered deck with "reschedule" off): show the card, change nothing —
    // no card mutation, no revlog row, nothing to undo. Mirrors Anki's preview behavior.
    if (options.preview) {
        return {
            updatedCard: makeStudyCard(currentAnkiCard, note, noteType, cardSettings, nowMs, true),
            previousAnkiCard: { ...currentAnkiCard },
            wasNewCard: false,
            reviewLogId: 0,
        };
    }

    const scheduler = getScheduler(cardSettings.algorithm);
    const scheduleResult = scheduler.schedule(currentState, grade, cardSettings, nowMs);

    // Anki's "review ahead": a review answered before its due date grows from the time
    // actually elapsed, not the full scheduled interval — reviewing early gives a
    // proportionally smaller next interval. Only filtered decks can serve early reviews.
    const todayNumber = localDayNumber(nowMs, cardSettings.dayRolloverHour);
    if (!scheduleResult.isLearning && grade > 1
        && currentAnkiCard.queue === 2 && currentAnkiCard.due > todayNumber
        && currentAnkiCard.ivl > 0) {
        const daysEarly = currentAnkiCard.due - todayNumber;
        const elapsed = Math.max(0, currentAnkiCard.ivl - daysEarly);
        const earlyRatio = Math.min(1, elapsed / currentAnkiCard.ivl);
        scheduleResult.interval = Math.max(1, Math.round(scheduleResult.interval * earlyRatio));
    }

    // Easy days: nudge the review interval so the due date lands on an allowed weekday.
    const scheduledInterval = scheduleResult.isLearning
        ? scheduleResult.interval
        : adjustIntervalForEasyDays(
            scheduleResult.interval,
            currentAnkiCard.id,
            cardSettings.easyDays,
            nowMs,
            cardSettings.dayRolloverHour,
        );

    const baseDue = scheduleResult.isLearning
        ? {
            status: 'learning' as const,
            dueDate: todayLocalYMD(new Date(nowMs), cardSettings.dayRolloverHour),
            dueTime: scheduleResult.minutesUntilDue
                ? nowMs + scheduleResult.minutesUntilDue * 60000
                : nowMs + 60000,
        }
        : {
            status: 'review' as const,
            dueDate: addDaysLocalYMD(scheduledInterval, new Date(nowMs), cardSettings.dayRolloverHour),
            dueTime: 0,
        };

    const nextState: CardState = {
        ...currentState,
        ...scheduleResult.stateUpdates,
        ...(scheduleResult.isLearning ? null : { interval: scheduledInterval }),
        cardId: currentAnkiCard.id,
        ...baseDue,
    };

    const updatedAnkiCard = cardStateToAnkiCard(currentAnkiCard, nextState, cardSettings, nowMs);

    // Anki takes the revlog kind from the state the card was in: a review answered before it was
    // due is logged as Filtered, not Review (rslib states/review.rs `revlog_kind`).
    const reviewType: 0 | 1 | 2 | 3 = currentAnkiCard.type === 2
        ? (currentAnkiCard.due > todayNumber ? 3 : 1)
        : currentAnkiCard.type === 3 ? 2 : 0;
    // Revlog interval (Anki: positive = days, negative = seconds). The three queues encode `due`
    // differently, so each needs its own conversion.
    let revlogInterval: number;
    if (updatedAnkiCard.queue === 2) {
        revlogInterval = updatedAnkiCard.ivl;                    // review: interval already in days
    } else if (updatedAnkiCard.queue === 3) {
        // interday learning: `due` is a day number, not a timestamp -> log the delay in seconds.
        const daysUntilDue = Math.max(1, updatedAnkiCard.due - localDayNumber(nowMs, cardSettings.dayRolloverHour));
        revlogInterval = -daysUntilDue * 86400;
    } else {
        // intraday learning: `due` is a ms timestamp.
        revlogInterval = -Math.max(1, Math.round((updatedAnkiCard.due - nowMs) / 1000));
    }

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
            answerTimeMs,
            reviewType,
            deckConfig.maxAnswerSecs,
        );
        reviewLogId = reviewLog.id;

        applySiblingBuryPolicy(currentAnkiCard, deckConfig);

        // Anki evaluates leech only when the answer itself caused a lapse (rslib review.rs
        // `answer_again` sets `leeched`); checking on every answer would keep re-suspending an
        // unsuspended leech that still sits on a threshold multiple.
        if (updatedAnkiCard.lapses > currentAnkiCard.lapses && isLeech(updatedAnkiCard, deckConfig.leechThreshold)) {
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

    saveAnkiCard({
        ...card,
        queue: suspended ? -1 : restoreQueueFromType(card, rolloverHour),
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
    });
}

export function setCardBuried(cardId: number, buried: boolean, rolloverHour: number = 4): void {
    const card = getAnkiCard(cardId);
    if (!card) return;

    saveAnkiCard({
        ...card,
        // Manual bury from the UI = user-buried (-3) in Anki.
        queue: buried ? -3 : restoreQueueFromType(card, rolloverHour),
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
    });
}

/** Existing cards for the given ids, de-duplicated and in the order Anki would load them. */
function existingCards(cardIds: number[]): AnkiCard[] {
    return [...new Set(cardIds)]
        .map((cardId) => getAnkiCard(cardId))
        .filter((card): card is AnkiCard => card !== null);
}

/**
 * Anki's "Set Due Date" (`Collection::set_due_date`): pins each card into the review queue with a
 * delay drawn from `spec`. Review and relearning cards keep their interval unless the spec carries
 * the trailing "!". Returns how many cards were updated.
 */
export function setCardsDueDate(
    cardIds: number[],
    spec: DueDateSpecifier,
    settings: AppSettings,
    random: () => number = Math.random,
): number {
    const cards = existingCards(cardIds);
    if (cards.length === 0) return 0;

    const today = localDayNumber(Date.now(), settings.dayRolloverHour);
    const modSeconds = Math.floor(Date.now() / 1000);
    // Anki seeds a missing ease from the card's home deck preset, looked up once per deck.
    const initialEase = new Map<number, number>();

    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const card of cards) {
            const homeDeckId = card.odid || card.deckId;
            let ease = initialEase.get(homeDeckId);
            if (ease === undefined) {
                ease = getDeckConfigForDeck(homeDeckId).startingEase;
                initialEase.set(homeDeckId, ease);
            }
            const updated = cardWithDueDate(
                card,
                today,
                sampleDaysFromToday(spec, random),
                ease,
                spec.forceReset,
            );
            saveAnkiCard({ ...updated, mod: modSeconds, usn: -1 });
            logManualReschedule(updated, card.ivl);
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return cards.length;
}

/**
 * Anki's "Forget" (`Collection::reschedule_cards_as_new`): sends cards back to the new queue.
 * Upstream defaults both options to off, so the review counters and the queue position survive
 * unless the user ticks them.
 */
export function forgetCards(cardIds: number[], options: ForgetOptions): number {
    const cards = existingCards(cardIds);
    if (cards.length === 0) return 0;

    const modSeconds = Math.floor(Date.now() / 1000);
    let position = nextNewCardPosition();

    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const card of cards) {
            const { card: updated, positionUsed } = cardScheduledAsNew(card, position, options);
            if (positionUsed) position += 1;
            saveAnkiCard({ ...updated, mod: modSeconds, usn: -1 });
            logManualReschedule(updated, card.ivl);
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return cards.length;
}

export function getCardState(cardId: number, settings: AppSettings): CardState {
    const card = getAnkiCard(cardId);
    if (!card) {
        return makeDefaultCardState(cardId, settings);
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
    const limitSql = hasLimit ? ' LIMIT ?' : '';
    const offsetSql = hasOffset ? ' OFFSET ?' : '';
    const paginationParams: number[] = [
        ...(hasLimit ? [Math.floor(limit as number)] : []),
        ...(hasOffset ? [Math.floor(offset as number)] : []),
    ];

    // Full card blobs are needed here: the browser shows last-review timestamps, which only
    // live in the stored card JSON (the shallow row projection zeroes lastReview).
    const rows = db.getAllSync<QueueCardRow>(
        `SELECT
            c.id AS cardId, c.noteId AS noteId, c.deckId AS deckId,
            c.ord AS ord, c.type AS type, c.queue AS queue,
            c.due AS due, c.ivl AS ivl, c.factor AS factor,
            c.reps AS reps, c.lapses AS lapses, c."left" AS "left",
            c.flags AS flags, c.data AS cardData,
            n.data AS noteData, nt.data AS noteTypeData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN note_types nt ON nt.id = n.noteTypeId
         ORDER BY c.id ASC${limitSql}${offsetSql}`,
        ...paginationParams,
    );
    return toStudyCards(rows, settings, Date.now(), { includeRawCard: true });
}

export function getBrowserCardCount(): number {
    const db = getDB();
    const row = db.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM anki_cards');
    return row?.cnt || 0;
}
