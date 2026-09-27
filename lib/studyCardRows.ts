import { getDB } from './db';
import { getSubjectIdSet, resolveSubjectDeckId } from './subjects';
import type { CardState, AppSettings, StudyCard } from './types';
import type { AnkiCard, Note, NoteType } from './models';
import { ankiCardToCardState, legacyCardIdFromAnkiCardId } from './ankiState';
import { withFsrsInputs } from './fsrsCardInputs';
import { getAnkiCard, MARKED_TAG } from './noteManager';
import { getDeck, getDeckByName, getDeckConfigForDeck } from './deckManager';
import { resolveSettingsFromConfig } from './settingsResolver';
import { isCatalogNote, isPaidCatalogUnlocked } from './catalogProtection';
import { buildFilteredSearchClause, escapeLikePattern } from './studySearchSql';

/**
 * Loading study cards: the queue rows read from the collection, the note payload each row
 * carries, and the StudyCard objects the reviewer and the browser work with.
 */

export interface QueueCardRow {
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

export function parseNotePayload(note: Note, noteType: NoteType | null): { subject: string; topic: string; question: string; answer: string } {
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

/**
 * Build a SQL WHERE fragment for subject/topic/deck scope filtering.
 * Returns { sql, params } where sql is either empty string or " AND (...)" —
 * always safe to append directly after another WHERE predicate.
 */
export function buildScopeClause(
    selectedSubject?: string | null,
    selectedTopic?: string | null,
    selectedDeckName?: string | null,
): { sql: string; params: Array<string | number> } {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

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
    } else {
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
    }

    return {
        sql: clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : '',
        params,
    };
}

export function loadRowsByQueue(
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
export function countRowsByQueue(
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

export function loadNextLearningDue(
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

export function resolveSettingsForDeck(deckId: number, base: AppSettings, cache?: Map<number, AppSettings>): AppSettings {
    if (cache?.has(deckId)) {
        return cache.get(deckId)!;
    }

    const config = getDeckConfigForDeck(deckId);
    const resolved = resolveSettingsFromConfig(config, base);
    // Anki's `effective_desired_retention`: the deck's own target wins over its preset's.
    const deckRetention = getDeck(deckId)?.desiredRetention;
    const effective = typeof deckRetention === 'number' && Number.isFinite(deckRetention)
        ? { ...resolved, desiredRetention: deckRetention }
        : resolved;

    cache?.set(deckId, effective);
    return effective;
}

export function makeStudyCard(
    card: AnkiCard,
    note: Note,
    noteType: NoteType | null,
    settings: AppSettings,
    nowMs: number,
    includeRawCard: boolean,
    stateOverride?: CardState,
    includeRawNote: boolean = false,
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
        templateOrd: card.ord,
        // TODO(boundary): remove CardState materialization from queue path once scheduler works directly on AnkiCard.
        state: stateOverride ?? withFsrsInputs(ankiCardToCardState(card, settings, nowMs), card, settings, nowMs),
        rawCard: includeRawCard ? card : undefined,
        rawNote: includeRawNote ? note : undefined,
    };
}

export function toStudyCards(
    rows: QueueCardRow[],
    baseSettings: AppSettings,
    nowMs: number,
    options: { includeRawCard?: boolean; includeRawNote?: boolean; settingsCache?: Map<number, AppSettings> } = {},
): StudyCard[] {
    const settingsCache = options.settingsCache ?? new Map<number, AppSettings>();
    const catalogUnlocked = isPaidCatalogUnlocked();
    const noteCache = new Map<number, Note>();
    const noteTypeCache = new Map<number, NoteType | null>();

    return rows.reduce<StudyCard[]>((acc, row) => {
        try {
            let note = noteCache.get(row.noteId);
            if (!note) {
                note = JSON.parse(row.noteData) as Note;
                noteCache.set(row.noteId, note);
            }
            // Fail closed for stale/deep-linked rows while entitlement reconciliation removes
            // the physical catalog. No reviewer/browser path may materialize the paid fields.
            if (!catalogUnlocked && isCatalogNote(note)) return acc;
            let noteType = noteTypeCache.get(note.noteTypeId);
            if (noteType === undefined) {
                noteType = row.noteTypeData ? (JSON.parse(row.noteTypeData) as NoteType) : null;
                noteTypeCache.set(note.noteTypeId, noteType);
            }

            const cardSettings = resolveSettingsForDeck(row.deckId, baseSettings, settingsCache);
            // Parse the full card blob for learning queues (left/decode needed), under FSRS (the
            // memory state and last review time live in it, and the answer buttons read them), or
            // when the caller explicitly needs a full raw card object.
            const needsFullCard = options.includeRawCard
                || cardSettings.fsrsEnabled === true
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

            acc.push(makeStudyCard(
                card,
                note,
                noteType,
                cardSettings,
                nowMs,
                Boolean(options.includeRawCard),
                undefined,
                Boolean(options.includeRawNote),
            ));
        } catch (e) {
            console.warn('[StudyRepo] Skipping corrupt row:', row.cardId, e);
        }
        return acc;
    }, []);
}
