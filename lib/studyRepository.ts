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
import { foldSearchNode, parseSearchQuery, unquoteSearchValue } from './searchQuery';
import { compileCardMatcher, type CardSearchContext } from './cardSearchMatch';
import {
    buryCard,
    getAnkiCard,
    getCardsForNote,
    getNote,
    getNoteType,
    handleLeech,
    isLeech,
    MARKED_TAG,
    saveAnkiCard,
} from './noteManager';
import { getAllDecks, getDeck, getDeckByName, getDeckConfigForDeck } from './deckManager';
import {
    applyHierarchicalLimit,
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
    deleteReviewById,
    getReviewsAnsweredToday,
    getReviewsAnsweredTodayInDeck,
    getTodayLimitUsageByDeck,
    logReview,
    type DailyLimitUsage,
} from './reviewLogger';
import { resolveSettingsFromConfig } from './settingsResolver';
import { isCatalogNote, isPaidCatalogUnlocked } from './catalogProtection';

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
 * The collection's day rollover hour. Anki keeps this in the collection config and every
 * day-relative search term (`is:due`, `prop:due`, `rated:`) reads it from there, so a learner who
 * moved their day boundary gets the same answer from search as from the deck list. Only the terms
 * that need it pay for the lookup, and a collection that has never saved settings uses Anki's
 * own 4 AM default.
 */
const APP_SETTINGS_META_KEY = 'tus_app_settings_meta_v1';

interface CollectionSearchSettings {
    rolloverHour: number;
    learnAheadMinutes: number;
}

function collectionSearchSettings(): CollectionSearchSettings {
    try {
        const row = getDB().getFirstSync<{ value: string }>(
            'SELECT value FROM settings WHERE key = ?',
            APP_SETTINGS_META_KEY,
        );
        const meta = row?.value ? JSON.parse(row.value) : null;
        const hour = Number(meta?.dayRolloverHour);
        const learnAhead = Number(meta?.learnAheadMinutes);
        return {
            rolloverHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 4,
            learnAheadMinutes: Number.isFinite(learnAhead) && learnAhead > 0 ? learnAhead : 0,
        };
    } catch {
        return { rolloverHour: 4, learnAheadMinutes: 0 };
    }
}

interface SearchFragment {
    sql: string;
    params: Array<string | number>;
}

/**
 * SQL for a single Anki search term, or null when the term carries no usable filter (an empty
 * `tag:`, an unparsable `prop:`), in which case the term is ignored the way Anki ignores it.
 *
 * Supported prefixes (matching Anki's search syntax):
 *   tag:<name>   — that tag or anything nested under it; tag:none for untagged notes
 *   deck:<name>  — exact match OR child deck match (deck::child)
 *   flag:0-7     — the card's flag (low three bits of c.flags)
 *   is:<state>   — new / learn / review / relearn / due / suspended / buried[-sibling|-manually]
 *   rated:N[:E]  — answered in the last N study days, optionally with ease E
 *   prop:<key><op>N — ivl / reps / lapses / ease / pos / due
 *   <term>       — substring match on sfld, note data, and tags
 */
function clauseForSearchTerm(term: string): SearchFragment | null {
    const unquote = unquoteSearchValue;

    if (term.startsWith('tag:')) {
        const tag = unquote(term.slice(4));
        if (tag === 'none') return { sql: "TRIM(n.tags) = ''", params: [] };
        if (!tag) return null;
        // Anki matches a tag and everything nested under it: "tag:animal" also finds
        // "animal::mammal". The match still has to start at a tag boundary, so
        // "tag:veri" must not match a note tagged "Veri-Tipleri". `*` is Anki's
        // wildcard and survives escaping as a LIKE `%`.
        const pattern = escapeLikePattern(tag).replace(/\*/g, '%');
        return {
            sql: "((' ' || TRIM(n.tags) || ' ') LIKE ? ESCAPE '\\'"
                + " OR (' ' || TRIM(n.tags) || ' ') LIKE ? ESCAPE '\\')",
            params: [`% ${pattern} %`, `% ${pattern}::%`],
        };
    }

    if (term.startsWith('deck:')) {
        const deckName = unquote(term.slice(5));
        if (!deckName) return null;
        return {
            sql: "(d.name = ? OR d.name LIKE ? ESCAPE '\\')",
            params: [deckName, `${escapeLikePattern(deckName)}::%`],
        };
    }

    // Anki's flag search: flag:1..7 matches that flag, flag:0 matches unflagged cards. The
    // flag lives in the low three bits of the field; the rest is reserved, so it is masked
    // off rather than compared whole (rslib sqlwriter.rs: `(c.flags & 7) == n`).
    if (term.startsWith('flag:')) {
        const value = Number(unquote(term.slice(5)));
        if (!Number.isInteger(value) || value < 0 || value > 7) return null;
        return { sql: '(c.flags & 7) = ?', params: [value] };
    }

    // Anki's card-state search. new/learn/review/relearn read the card's *type*, not its
    // queue, so a suspended or buried card still reports the state it is in — and a
    // relearning card counts as both learning and review (rslib sqlwriter.rs write_state).
    // Only due/suspended/buried are queue-based, because those *are* queue states.
    if (term.startsWith('is:')) {
        const state = unquote(term.slice(3)).toLowerCase();
        const { rolloverHour, learnAheadMinutes } = collectionSearchSettings();
        const today = localDayNumber(Date.now(), rolloverHour);
        if (state === 'new') return { sql: 'c.type = 0', params: [] };
        if (state === 'learn') return { sql: 'c.type IN (1, 3)', params: [] };
        if (state === 'review') return { sql: 'c.type IN (2, 3)', params: [] };
        if (state === 'relearn') return { sql: 'c.type = 3', params: [] };
        if (state === 'suspended') return { sql: 'c.queue = -1', params: [] };
        if (state === 'buried') return { sql: 'c.queue IN (-2, -3)', params: [] };
        if (state === 'buried-sibling') return { sql: 'c.queue = -2', params: [] };
        if (state === 'buried-manually') return { sql: 'c.queue = -3', params: [] };
        if (state === 'due') {
            // Anki's cutoff for intraday learning is now + the learn-ahead limit, so a card
            // the reviewer would already hand you counts as due here too.
            return {
                sql: '((c.queue IN (2, 3) AND c.due <= ?) OR (c.queue = 1 AND c.due <= ?))',
                params: [today, Date.now() + learnAheadMinutes * 60_000],
            };
        }
        return null;
    }

    // Anki's rated search: rated:N (answered in the last N days), rated:N:E (with ease E —
    // rated:7:1 = forgotten in the last week). The window is aligned to the day rollover,
    // not to a rolling 24 hours, so "rated:1" means "answered today" the way the rest of the
    // app counts a day. Manual reschedules are logged with ease 0 and are never "answers",
    // so they are excluded exactly as Anki does (`and ease > 0`).
    if (term.startsWith('rated:')) {
        const parts = unquote(term.slice(6)).split(':');
        const days = Number(parts[0]);
        const ease = parts.length > 1 ? Number(parts[1]) : null;
        if (!Number.isFinite(days) || days <= 0) return null;

        const now = Date.now();
        const cutoff = nextRolloverMs(now, collectionSearchSettings().rolloverHour)
            - Math.min(365, Math.floor(days)) * 86400000;
        if (ease !== null && Number.isInteger(ease) && ease >= 1 && ease <= 4) {
            return {
                sql: 'c.id IN (SELECT cardId FROM revlog WHERE id >= ? AND ease = ?)',
                params: [cutoff, ease],
            };
        }
        return {
            sql: 'c.id IN (SELECT cardId FROM revlog WHERE id >= ? AND ease > 0)',
            params: [cutoff],
        };
    }

    // Anki's numeric property comparisons (rslib sqlwriter.rs `write_prop`):
    //   prop:ivl>=21     interval in days
    //   prop:reps<10     times answered
    //   prop:lapses>3    times forgotten after graduating
    //   prop:ease<2.0    ease factor, written as a multiplier but stored per mille
    //   prop:pos<=50     a new card's queue position
    //   prop:due=1       days until due, relative to today
    //
    // Anki reads the due/position through `case when c.odue != 0 then c.odue else c.due end`,
    // because a card it has *moved* into a filtered deck parks its real due in odue. Filtered
    // decks here are a view over the collection and never move a card, so odid/odue stay 0
    // and the plain column is the same value.
    if (term.startsWith('prop:')) {
        const match = unquote(term.slice(5))
            .match(/^(ivl|reps|lapses|ease|pos|due)(>=|<=|!=|=|>|<)(-?\d+(?:\.\d+)?)$/);
        if (!match) return null;

        const [, key, op, rawValue] = match;
        const value = Number(rawValue);
        if (!Number.isFinite(value)) return null;

        if (key === 'due') {
            const today = localDayNumber(Date.now(), collectionSearchSettings().rolloverHour);
            return {
                sql: `(c.queue IN (2, 3) AND (c.due - ?) ${op} ?)`,
                params: [today, Math.trunc(value)],
            };
        }

        if (key === 'ease') {
            // "prop:ease=2.5" is stored as factor 2500 — Anki multiplies by 1000.
            return { sql: `c.factor ${op} ?`, params: [Math.round(value * 1000)] };
        }

        if (key === 'pos') {
            // Only new cards carry a position; for them `due` *is* the queue position.
            return { sql: `(c.type = 0 AND c.due ${op} ?)`, params: [Math.trunc(value)] };
        }

        const column = { ivl: 'c.ivl', reps: 'c.reps', lapses: 'c.lapses' }[key]!;
        return { sql: `${column} ${op} ?`, params: [Math.trunc(value)] };
    }

    const escaped = escapeLikePattern(unquote(term));
    return {
        sql: "(n.sfld LIKE ? ESCAPE '\\' OR n.data LIKE ? ESCAPE '\\' OR n.tags LIKE ? ESCAPE '\\')",
        params: [`%${escaped}%`, `%${escaped}%`, `%${escaped}%`],
    };
}

/**
 * Parse an Anki-style search query into SQL clauses the caller joins with AND. The grammar lives
 * in lib/searchQuery.ts, so a filtered deck's saved search and the browser's search box accept
 * exactly the same query; only the evaluation differs.
 */
function buildFilteredSearchClause(searchQuery: string): { clauses: string[]; params: Array<string | number> } {
    const parsed = parseSearchQuery(searchQuery);
    const fragment = parsed && foldSearchNode<SearchFragment>(parsed, {
        term: (text) => clauseForSearchTerm(text),
        not: (child) => ({ sql: `NOT (${child.sql})`, params: child.params }),
        and: (parts) => ({
            sql: `(${parts.map((part) => part.sql).join(' AND ')})`,
            params: parts.flatMap((part) => part.params),
        }),
        or: (parts) => ({
            sql: `(${parts.map((part) => part.sql).join(' OR ')})`,
            params: parts.flatMap((part) => part.params),
        }),
    });

    return fragment ? { clauses: [fragment.sql], params: fragment.params } : { clauses: [], params: [] };
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
        state: stateOverride ?? ankiCardToCardState(card, settings, nowMs),
        rawCard: includeRawCard ? card : undefined,
        rawNote: includeRawNote ? note : undefined,
    };
}

function toStudyCards(
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
                undefined,
                Boolean(options.includeRawNote),
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

/**
 * Anki v3 "new card gather order" (proto NewCardGatherPriority): which cards are collected and in
 * what order they arrive. The two position orders are already satisfied by the SQL the rows were
 * loaded with (`newRowOrderSql`), so they only have to leave the list alone.
 */
function gatherNewCards(cards: StudyCard[], settings: AppSettings, daySeed: string, newCount: number): StudyCard[] {
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
            return sortNewCardsByCourseOrder(shuffleNewCardsByNote(cards, seed));
        case 'deck':
        default: {
            const base = settings.newCardOrder === 'random'
                ? deterministicShuffle(cards, seed)
                : cards;
            return sortNewCardsByCourseOrder(base);
        }
    }
}

/**
 * How the new-card rows are read from SQLite. "Descending position" has to take the *highest*
 * positions, so reversing an ascending page after the fact would hand back the wrong cards
 * whenever the fetch is capped.
 */
function newRowOrderSql(settings: AppSettings): string {
    return normalizeNewCardGatherOrder(settings.newCardGatherOrder) === 'descendingPosition'
        ? 'c.due DESC, c.id DESC'
        : 'c.due ASC, c.id ASC';
}

/**
 * Anki runs two separate steps over new cards: a gather step that decides *which* cards and in
 * what order they arrive, then a sort step that reorders the gathered set. Keeping them apart is
 * what makes "order gathered" a meaningful option rather than a no-op.
 */
function applyNewCardOrder(cards: StudyCard[], settings: AppSettings, daySeed: string, newCount: number): StudyCard[] {
    const gathered = gatherNewCards(cards, settings, daySeed, newCount);
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
    return sortReviewCards(cards, order, { daySeed, fallbackDay: today, today, deckRank });
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
            heldBackReviewCount: 0,
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
        // A filtered deck's saved search is the session: daily limits never apply to it.
        heldBackNewCount: 0,
        heldBackReviewCount: 0,
    };
}

export interface FilteredDeckCountCard {
    cardId: number;
    homeDeckId: number;
    status: CardState['status'];
}

type FilteredDeckCountDefinition = Pick<Deck,
    | 'id'
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

/**
 * Build every filtered-deck row counter with one repository query.
 *
 * This deliberately returns only membership + scheduler state. The deck list does not need a
 * materialized StudyCard, resolved deck config, template payload or serving order, and building
 * those objects once per filtered deck used to multiply synchronous work on screen focus.
 * Filtered decks claim overlapping cards in the supplied deck order, matching the previous UI.
 */
export function getFilteredDeckCountCards(
    decks: ReadonlyArray<FilteredDeckCountDefinition>,
    _settings: Pick<AppSettings, 'dayRolloverHour' | 'learnAheadMinutes'>,
    nowMs: number = Date.now(),
): Map<number, FilteredDeckCountCard[]> {
    const result = new Map<number, FilteredDeckCountCard[]>();
    const activeDecks = decks.filter((deck) => {
        result.set(deck.id, []);
        return !deck.filteredDeckEmpty;
    });
    if (activeDecks.length === 0) return result;

    type BatchRow = {
        filteredDeckId: number;
        deckOrder: number;
        groupIndex: number;
        groupPosition: number;
        cardId: number;
        homeDeckId: number;
        type: number;
        queue: number;
        noteData: string;
        noteTypeData: string;
    };

    const branches: string[] = [];
    const params: Array<string | number> = [];
    activeDecks.forEach((deck, deckOrder) => {
        const groups = [
            { search: deck.searchQuery ?? '', order: deck.searchOrder, limit: deck.searchLimit },
            ...(deck.searchQuery2?.trim()
                ? [{ search: deck.searchQuery2, order: deck.searchOrder2, limit: deck.searchLimit2 }]
                : []),
        ];
        groups.forEach((group, groupIndex) => {
            const filtered = buildFilteredSearchClause(group.search);
            const where = filtered.clauses.length > 0 ? filtered.clauses.join(' AND ') : '1=1';
            const limit = Math.max(1, Math.min(9999, Math.floor(group.limit ?? 100)));
            branches.push(
                `SELECT * FROM (
                    SELECT
                        ? AS filteredDeckId,
                        ? AS deckOrder,
                        ? AS groupIndex,
                        ROW_NUMBER() OVER (ORDER BY ${filteredOrderSql(group.order)}) AS groupPosition,
                        c.id AS cardId,
                        c.deckId AS homeDeckId,
                        c.type AS type,
                        c.queue AS queue,
                        n.data AS noteData,
                        nt.data AS noteTypeData
                    FROM anki_cards c
                    JOIN notes n ON n.id = c.noteId
                    JOIN note_types nt ON nt.id = n.noteTypeId
                    JOIN decks d ON d.id = c.deckId
                    WHERE c.queue >= 0 AND ${where}
                ) WHERE groupPosition <= ?`,
            );
            params.push(deck.id, deckOrder, groupIndex, ...filtered.params, limit);
        });
    });

    const rows = getDB().getAllSync<BatchRow>(
        `${branches.join(' UNION ALL ')} ORDER BY deckOrder, groupIndex, groupPosition`,
        ...params,
    );
    const deckById = new Map(activeDecks.map((deck) => [deck.id, deck]));
    const seenByFilteredDeck = new Map<number, Set<number>>();
    const claimedCardIds = new Set<number>();
    const catalogUnlocked = isPaidCatalogUnlocked();

    for (const row of rows) {
        const deck = deckById.get(row.filteredDeckId);
        if (!deck) continue;
        if ((deck.filteredDoneCardIds ?? []).includes(row.cardId)) continue;
        if (row.cardId > (deck.filteredBuildAt ?? nowMs) + 999) continue;

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
        const status: CardState['status'] = row.queue === 0
            ? 'new'
            : row.queue === 1 || row.queue === 3 || row.type === 1 || row.type === 3
                ? 'learning'
                : 'review';
        result.get(deck.id)!.push({ cardId: row.cardId, homeDeckId: row.homeDeckId, status });
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
            newRowOrderSql(params.settings),
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

    // Hierarchical daily limits: a card counts against its deck and every ancestor deck.
    // Anki's collection-wide "limits start from top" decides how far up that chain goes — with it
    // off, studying a subdeck answers only to that subdeck and its own children, so a parent's
    // stricter cap no longer bleeds down into a deck the learner opened directly.
    const limitRoot = params.settings.limitsStartFromTop === false ? params.selectedDeckName : null;
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

    const newLimitByKey = new Map<string, number>();
    const newLimitForDeckKey = (key: string): number => {
        let limit = newLimitByKey.get(key);
        if (limit === undefined) {
            limit = Math.max(0, settingsForDeckKey(key).dailyNewLimit - usedForDeckKey(key).newIntroduced);
            newLimitByKey.set(key, limit);
        }
        return limit;
    };
    const reviewLimitByKey = new Map<string, number>();
    const reviewLimitForDeckKey = (key: string): number => {
        let limit = reviewLimitByKey.get(key);
        if (limit === undefined) {
            limit = Math.max(0, settingsForDeckKey(key).dailyReviewLimit - usedForDeckKey(key).reviewsAnswered);
            reviewLimitByKey.set(key, limit);
        }
        return limit;
    };

    let reviewCardsForQueue = applyHierarchicalLimit(reviewCards, reviewLimit, deckKeysForCard, reviewLimitForDeckKey);

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

    // Anki's collection-wide "new cards ignore review limit". With it off, the review cap covers
    // the whole day: every review already taken shrinks the room left for new cards, so a large
    // backlog stops the app from also piling new material on top. Reviews are selected first
    // (above) precisely so their final count is known here.
    const newCardsShareReviewLimit = params.settings.newCardsIgnoreReviewLimit === false;
    const reviewsTakenByKey = new Map<string, number>();
    if (newCardsShareReviewLimit) {
        for (const card of reviewCardsForQueue) {
            for (const key of deckKeysForCard(card)) {
                reviewsTakenByKey.set(key, (reviewsTakenByKey.get(key) ?? 0) + 1);
            }
        }
    }
    const effectiveNewLimit = newCardsShareReviewLimit
        ? Math.min(availableNewLimit, Math.max(0, reviewLimit - reviewCardsForQueue.length))
        : availableNewLimit;
    const newLimitForDeckKeyCapped = newCardsShareReviewLimit
        ? (key: string): number => Math.min(
            newLimitForDeckKey(key),
            Math.max(0, reviewLimitForDeckKey(key) - (reviewsTakenByKey.get(key) ?? 0)),
        )
        : newLimitForDeckKey;

    let newCardsForQueue = applyHierarchicalLimit(newCards, effectiveNewLimit, deckKeysForCard, newLimitForDeckKeyCapped);

    if (newCardsForQueue.length < Math.min(effectiveNewLimit, newCount) && newRows.length < newCount) {
        newCards = applyNewCardOrder(
            toStudyCards(
                loadRowsByQueue(
                    'c.queue = 0',
                    [],
                    params.selectedSubject,
                    params.selectedTopic,
                    params.selectedDeckName,
                    newRowOrderSql(params.settings),
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

        newCardsForQueue = applyHierarchicalLimit(newCards, effectiveNewLimit, deckKeysForCard, newLimitForDeckKeyCapped);
    }

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
    const servableNewCount = newCardsForQueue.length;
    const servableReviewCount = reviewCardsForQueue.length;

    return {
        cards,
        stats: {
            newCount: servableNewCount,
            learningCount: intradayLearningCount + interdayLearningCount,
            reviewCount: servableReviewCount,
        },
        nextLearningDue,
        // Reached when new cards exist in scope but none survived the global/per-deck limits.
        dailyNewLimitReached: newCount > 0 && servableNewCount === 0,
        heldBackNewCount: Math.max(0, newCount - servableNewCount),
        heldBackReviewCount: Math.max(0, reviewCount - servableReviewCount),
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

    const reviewType: 0 | 1 | 2 = currentAnkiCard.type === 2 ? 1 : currentAnkiCard.type === 3 ? 2 : 0;
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

/** Anki's "Forget": discards all scheduling progress and returns the card to brand-new. */
export function forgetCard(cardId: number, settings: AppSettings): void {
    const card = getAnkiCard(cardId);
    if (!card) return;
    const freshState = makeDefaultCardState(cardId, settings);
    saveAnkiCard(cardStateToAnkiCard(card, freshState, settings));
}

/** Anki's "Set Due Date": pins the card into the review queue, due in `days` days from today. */
export function setCardDueInDays(cardId: number, days: number, settings: AppSettings): void {
    const card = getAnkiCard(cardId);
    if (!card) return;
    const today = localDayNumber(Date.now(), settings.dayRolloverHour);
    const clampedDays = Math.max(0, Math.floor(days) || 0);
    saveAnkiCard({
        ...card,
        type: 2,
        queue: 2,
        due: today + clampedDays,
        ivl: Math.max(1, clampedDays),
        left: 0,
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
    });
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

export type BrowserCardSortKey = 'sortField' | 'cardType' | 'due' | 'deck' | 'created' | 'modified' | 'interval' | 'ease' | 'lapses' | 'reviews';
export type BrowserCardStateFilter = 'all' | 'new' | 'due';
export type BrowserTableMode = 'cards' | 'notes';

export interface BrowserCardQuery {
    tableMode?: BrowserTableMode;
    limit?: number;
    offset?: number;
    sortKey?: BrowserCardSortKey;
    descending?: boolean;
    deckIds?: number[];
    cardIds?: number[];
    /** Restrict Notes-mode rows by note id. Card mode callers normally leave this unset. */
    noteIds?: number[];
    markedOnly?: boolean;
    suspendedOnly?: boolean;
    cardState?: BrowserCardStateFilter;
    tags?: string[];
    flag?: number | null;
    /** Selected card flags joined with OR. An empty array intentionally matches no cards. */
    flags?: number[];
}

function buildBrowserWhere(query: BrowserCardQuery): { sql: string; params: Array<string | number> } {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    const addIds = (column: string, ids: number[] | undefined) => {
        if (!ids) return;
        if (ids.length === 0) {
            clauses.push('1 = 0');
            return;
        }
        clauses.push(`${column} IN (${ids.map(() => '?').join(', ')})`);
        params.push(...ids);
    };
    addIds('c.deckId', query.deckIds);
    addIds('c.id', query.cardIds);
    addIds('n.id', query.noteIds);
    if (query.markedOnly) {
        clauses.push("n.tags LIKE '% marked %'");
    }
    if (query.suspendedOnly) clauses.push('c.queue = -1');
    if (query.cardState && query.cardState !== 'all') {
        const state = clauseForSearchTerm(`is:${query.cardState}`);
        if (state) {
            clauses.push(state.sql);
            params.push(...state.params);
        }
    }
    if (query.flags) {
        if (query.flags.length === 0) {
            clauses.push('1 = 0');
        } else {
            clauses.push(`(c.flags & 7) IN (${query.flags.map(() => '?').join(', ')})`);
            params.push(...query.flags);
        }
    } else if (query.flag !== null && query.flag !== undefined) {
        clauses.push('(c.flags & 7) = ?');
        params.push(query.flag);
    }
    const tagClauses: string[] = [];
    const tagParams: string[] = [];
    for (const rawTag of query.tags ?? []) {
        const tag = rawTag.trim().toLocaleLowerCase('en-US').replace(/[\\%_]/g, (ch) => `\\${ch}`);
        if (!tag) continue;
        tagClauses.push("(LOWER(n.tags) LIKE ? ESCAPE '\\' OR LOWER(n.tags) LIKE ? ESCAPE '\\')");
        tagParams.push(`% ${tag} %`, `% ${tag}::%`);
    }
    if (tagClauses.length > 0) {
        // AnkiDroid's multi-select tag filter joins selected tags with OR. Requiring every tag
        // would make ordinary category selections unexpectedly empty.
        clauses.push(`(${tagClauses.join(' OR ')})`);
        params.push(...tagParams);
    }
    return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

const BROWSER_SORT_SQL: Record<BrowserCardSortKey, string> = {
    sortField: 'n.sfld COLLATE NOCASE',
    cardType: 'c.ord',
    due: 'c.due',
    deck: 'd.name COLLATE NOCASE',
    created: 'c.noteId',
    modified: 'c.updated_at',
    interval: 'c.ivl',
    ease: 'c.factor',
    lapses: 'c.lapses',
    reviews: 'c.reps',
};

interface BrowserNoteRow {
    noteId: number;
    representativeCardId: number;
    cardCount: number;
    deckCount: number;
    deckNames: string;
    totalReviews: number;
    totalLapses: number;
    averageIntervalDays: number | null;
    averageEasePermille: number | null;
    suspendedCardCount: number;
    buriedCardCount: number;
    flaggedCardCount: number;
}

/**
 * Notes mode searches for matching cards, but renders and sorts one row per matching note.
 * The row's current card is always the note's first template card, even when another sibling
 * was the card that matched a flag, queue or search term. This mirrors Anki's RowContext.
 */
function getBrowserNoteRows(query: BrowserCardQuery): BrowserNoteRow[] {
    const db = getDB();
    const where = buildBrowserWhere(query);
    const direction = query.descending ? 'DESC' : 'ASC';
    const sortSql: Record<BrowserCardSortKey, string> = {
        sortField: 'n.sfld COLLATE NOCASE',
        cardType: 'COUNT(c_all.id)',
        due: 'MIN(CASE WHEN c_all.type != 0 AND c_all.queue >= 0 THEN c_all.due END)',
        deck: "CASE WHEN COUNT(DISTINCT c_all.deckId) > 1 THEN printf('(%d)', COUNT(DISTINCT c_all.deckId)) ELSE MIN(d_all.name) END COLLATE NOCASE",
        created: 'n.id',
        modified: 'MAX(c_all.updated_at)',
        interval: 'AVG(CASE WHEN c_all.type IN (2, 3) THEN c_all.ivl END)',
        ease: 'AVG(CASE WHEN c_all.type != 0 THEN c_all.factor END)',
        lapses: 'SUM(c_all.lapses)',
        reviews: 'SUM(c_all.reps)',
    };

    return db.getAllSync<BrowserNoteRow>(
        `WITH matched_notes AS (
            SELECT DISTINCT c.noteId AS noteId
            FROM anki_cards c
            JOIN notes n ON n.id = c.noteId
            JOIN note_types nt ON nt.id = n.noteTypeId
            JOIN decks d ON d.id = c.deckId
            ${where.sql}
        )
        SELECT
            n.id AS noteId,
            (
                SELECT first_card.id
                FROM anki_cards first_card
                WHERE first_card.noteId = n.id
                ORDER BY first_card.ord ASC, first_card.id ASC
                LIMIT 1
            ) AS representativeCardId,
            COUNT(c_all.id) AS cardCount,
            COUNT(DISTINCT c_all.deckId) AS deckCount,
            GROUP_CONCAT(DISTINCT d_all.name) AS deckNames,
            COALESCE(SUM(c_all.reps), 0) AS totalReviews,
            COALESCE(SUM(c_all.lapses), 0) AS totalLapses,
            AVG(CASE WHEN c_all.type IN (2, 3) THEN c_all.ivl END) AS averageIntervalDays,
            AVG(CASE WHEN c_all.type != 0 THEN c_all.factor END) AS averageEasePermille,
            SUM(CASE WHEN c_all.queue = -1 THEN 1 ELSE 0 END) AS suspendedCardCount,
            SUM(CASE WHEN c_all.queue IN (-2, -3) THEN 1 ELSE 0 END) AS buriedCardCount,
            SUM(CASE WHEN (c_all.flags & 7) != 0 THEN 1 ELSE 0 END) AS flaggedCardCount
        FROM matched_notes matched
        JOIN notes n ON n.id = matched.noteId
        JOIN anki_cards c_all ON c_all.noteId = n.id
        JOIN decks d_all ON d_all.id = c_all.deckId
        GROUP BY n.id
        ORDER BY ${sortSql[query.sortKey ?? 'sortField']} ${direction}, n.id ${direction}`,
        ...where.params,
    );
}

function loadJsonRowsByIds(db: ReturnType<typeof getDB>, table: 'notes' | 'note_types', ids: number[]): Map<number, string> {
    const result = new Map<number, string>();
    for (let index = 0; index < ids.length; index += 400) {
        const chunk = ids.slice(index, index + 400);
        if (!chunk.length) continue;
        for (const row of db.getAllSync<{ id: number; data: string }>(
            `SELECT id, data FROM ${table} WHERE id IN (${chunk.map(() => '?').join(', ')})`,
            ...chunk,
        )) result.set(Number(row.id), row.data);
    }
    return result;
}

/**
 * Return only the ordered row IDs for a browser text search: card IDs in Cards mode and note
 * IDs in Notes mode. This follows the architecture used by
 * Anki's desktop browser and AnkiDroid: search/sort the lightweight identifier list first, then
 * hydrate row content only as pages become visible.
 *
 * Keep the app's existing search semantics exactly: Turkish/ASCII-insensitive prefix matching
 * across rendered question/answer projections, topic, deck path and tags. Notes and note types
 * are parsed once even when they generate multiple cards.
 */
export function getBrowserRowIdsMatchingText(query: BrowserCardQuery, searchQuery: string): number[] {
    const rawQuery = searchQuery.trim();
    if (!rawQuery) return [];

    const db = getDB();
    const nowMs = Date.now();
    const { rolloverHour, learnAheadMinutes } = collectionSearchSettings();
    const matcher = compileCardMatcher(rawQuery, {
        today: localDayNumber(nowMs, rolloverHour),
        nowMs,
        learnAheadMinutes,
        dayCutoffMs: nextRolloverMs(nowMs, rolloverHour) - 86_400_000,
        ratedWithin: reviewLogLookup(db, rolloverHour),
        introducedWithin: firstReviewLookup(db, rolloverHour),
    });
    if (!matcher) return [];

    const where = buildBrowserWhere(query);
    const sortSql = BROWSER_SORT_SQL[query.sortKey ?? 'sortField'];
    const direction = query.descending ? 'DESC' : 'ASC';
    const rows = db.getAllSync<{
        cardId: number;
        noteId: number;
        noteTypeId: number;
        deckName: string;
        ord: number;
        type: number;
        queue: number;
        due: number;
        ivl: number;
        factor: number;
        reps: number;
        lapses: number;
        flags: number;
        createdAt: number;
        noteEditedAt: number;
    }>(
        `SELECT
            c.id AS cardId,
            c.noteId AS noteId,
            n.noteTypeId AS noteTypeId,
            d.name AS deckName,
            c.ord AS ord, c.type AS type, c.queue AS queue, c.due AS due,
            c.ivl AS ivl, c.factor AS factor, c.reps AS reps, c.lapses AS lapses,
            c.flags AS flags, c.created_at AS createdAt,
            n.updated_at AS noteEditedAt
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN note_types nt ON nt.id = n.noteTypeId
         JOIN decks d ON d.id = c.deckId
         ${where.sql}
         ORDER BY ${sortSql} ${direction}, c.id ${direction}`,
        ...where.params,
    );

    const noteData = loadJsonRowsByIds(db, 'notes', [...new Set(rows.map((row) => row.noteId))]);
    const noteTypeData = loadJsonRowsByIds(db, 'note_types', [...new Set(rows.map((row) => row.noteTypeId))]);
    const parsedByNoteId = new Map<number, ParsedSearchNote | null>();
    const matchedNoteIds = new Set<number>();
    const ids: number[] = [];

    for (const row of rows) {
        let parsed = parsedByNoteId.get(row.noteId);
        if (parsed === undefined) {
            const storedNote = noteData.get(row.noteId);
            const storedType = noteTypeData.get(row.noteTypeId);
            try {
                const note = storedNote ? JSON.parse(storedNote) as Note : null;
                const noteType = storedType ? JSON.parse(storedType) as NoteType : null;
                const payload = note && noteType ? parseNotePayload(note, noteType) : null;
                parsed = note && noteType && payload
                    ? {
                        note,
                        noteType,
                        text: [payload.question, payload.answer, payload.topic].join(' '),
                        // Built once per note: a note with siblings would otherwise rebuild the
                        // same field map for every card it generated.
                        fields: Object.fromEntries(
                            noteType.fields.map((field, index) => [field.name, note.fields[index] ?? '']),
                        ),
                    }
                    : null;
            } catch {
                parsed = null;
            }
            parsedByNoteId.set(row.noteId, parsed);
        }
        if (!parsed) continue;

        if (matcher(browserSearchContext(row, parsed))) {
            matchedNoteIds.add(row.noteId);
            if (query.tableMode !== 'notes') ids.push(row.cardId);
        }
    }

    if (query.tableMode !== 'notes') return ids;
    if (matchedNoteIds.size === 0) return [];

    // The search can match any sibling card, but Anki's Notes-mode table is identified by note
    // IDs and sorted using note aggregates. Do not leak the matching sibling card into the row.
    return getBrowserNoteRows({
        ...query,
        cardIds: undefined,
        noteIds: [...matchedNoteIds],
    }).map((row) => row.noteId);
}

/** @deprecated Prefer getBrowserRowIdsMatchingText(), whose name reflects Notes mode too. */
export function getBrowserCardIdsMatchingText(query: BrowserCardQuery, searchQuery: string): number[] {
    return getBrowserRowIdsMatchingText(query, searchQuery);
}

interface ParsedSearchNote {
    note: Note;
    noteType: NoteType;
    /** Rendered question, answer and topic — what a bare search word matches. */
    text: string;
    fields: Record<string, string>;
}

/** One card, in the shape the search terms read (lib/cardSearchMatch.ts). */
function browserSearchContext(
    row: {
        cardId: number; noteId: number; deckName: string; ord: number; type: number; queue: number;
        due: number; ivl: number; factor: number; reps: number; lapses: number; flags: number;
        createdAt: number; noteEditedAt: number;
    },
    parsed: ParsedSearchNote,
): CardSearchContext {
    const { note, noteType, text, fields } = parsed;

    return {
        cardId: row.cardId,
        noteId: row.noteId,
        deckName: row.deckName,
        text,
        tags: note.tags,
        templateOrd: row.ord,
        queue: row.queue,
        type: row.type,
        due: row.due,
        ivl: row.ivl,
        factor: row.factor,
        reps: row.reps,
        lapses: row.lapses,
        flags: row.flags,
        fields,
        noteTypeName: noteType.name,
        templateName: noteType.templates[row.ord]?.name,
        // Cards imported before the created_at column existed fall back to their id, which is the
        // epoch millisecond Anki assigned when the card was made.
        createdAtMs: Number(row.createdAt) || row.cardId,
        noteEditedAtMs: Number(row.noteEditedAt) || (note.mod ? note.mod * 1000 : undefined),
    };
}

/** `rated:N[:E]` — one query per distinct window, reused for every card in the result. */
function reviewLogLookup(db: ReturnType<typeof getDB>, rolloverHour: number) {
    const cache = new Map<string, Set<number>>();
    return (cardId: number, days: number, ease: number | null): boolean => {
        const key = `${days}:${ease ?? ''}`;
        let matched = cache.get(key);
        if (!matched) {
            const cutoff = nextRolloverMs(Date.now(), rolloverHour) - days * 86_400_000;
            const rows = ease !== null && Number.isInteger(ease) && ease >= 1 && ease <= 4
                ? db.getAllSync<{ cardId: number }>(
                    'SELECT DISTINCT cardId FROM revlog WHERE id >= ? AND ease = ?', cutoff, ease)
                : db.getAllSync<{ cardId: number }>(
                    'SELECT DISTINCT cardId FROM revlog WHERE id >= ? AND ease > 0', cutoff);
            matched = new Set(rows.map((row) => Number(row.cardId)));
            cache.set(key, matched);
        }
        return matched.has(cardId);
    };
}

/** `introduced:N` — cards whose first-ever answer falls inside the window. */
function firstReviewLookup(db: ReturnType<typeof getDB>, rolloverHour: number) {
    const cache = new Map<number, Set<number>>();
    return (cardId: number, days: number): boolean => {
        let matched = cache.get(days);
        if (!matched) {
            const cutoff = nextRolloverMs(Date.now(), rolloverHour) - days * 86_400_000;
            const rows = db.getAllSync<{ cardId: number }>(
                `SELECT cardId FROM (SELECT cardId, MIN(id) AS firstReview FROM revlog GROUP BY cardId)
                 WHERE firstReview >= ?`,
                cutoff,
            );
            matched = new Set(rows.map((row) => Number(row.cardId)));
            cache.set(days, matched);
        }
        return matched.has(cardId);
    };
}

export function getBrowserCards(settings: AppSettings, query: BrowserCardQuery = {}): StudyCard[] {
    const db = getDB();

    if (query.tableMode === 'notes') {
        const noteRows = getBrowserNoteRows(query);
        const offset = Number.isFinite(query.offset) ? Math.max(0, Math.floor(query.offset as number)) : 0;
        const end = Number.isFinite(query.limit) && (query.limit as number) > 0
            ? offset + Math.floor(query.limit as number)
            : undefined;
        const pageRows = noteRows.slice(offset, end);
        const representativeIds = pageRows.map((row) => Number(row.representativeCardId));
        if (representativeIds.length === 0) return [];

        // Hydrate the note's first card without reapplying the card-level filter that caused a
        // sibling to match. In Anki, Notes mode always uses the first card as the current card.
        const representatives = getBrowserCards(settings, {
            tableMode: 'cards',
            cardIds: representativeIds,
            sortKey: 'cardType',
        });
        const representativeById = new Map(representatives.map((card) => [card.cardId, card]));

        return pageRows.flatMap((row) => {
            const card = representativeById.get(Number(row.representativeCardId));
            if (!card) return [];
            return [{
                ...card,
                browserNoteSummary: {
                    cardCount: Number(row.cardCount) || 0,
                    deckCount: Number(row.deckCount) || 0,
                    deckNames: String(row.deckNames ?? '').split(',').filter(Boolean),
                    totalReviews: Number(row.totalReviews) || 0,
                    totalLapses: Number(row.totalLapses) || 0,
                    averageIntervalDays: row.averageIntervalDays == null ? null : Number(row.averageIntervalDays),
                    averageEaseFactor: row.averageEasePermille == null ? null : Number(row.averageEasePermille) / 1000,
                    suspendedCardCount: Number(row.suspendedCardCount) || 0,
                    buriedCardCount: Number(row.buriedCardCount) || 0,
                    flaggedCardCount: Number(row.flaggedCardCount) || 0,
                },
            }];
        });
    }

    const hasLimit = Number.isFinite(query.limit) && (query.limit as number) > 0;
    const hasOffset = Number.isFinite(query.offset) && (query.offset as number) > 0;
    const limitSql = hasLimit ? ' LIMIT ?' : '';
    const offsetSql = hasOffset ? (hasLimit ? ' OFFSET ?' : ' LIMIT -1 OFFSET ?') : '';
    const paginationParams: number[] = [
        ...(hasLimit ? [Math.floor(query.limit as number)] : []),
        ...(hasOffset ? [Math.floor(query.offset as number)] : []),
    ];
    const where = buildBrowserWhere(query);
    const sortSql = BROWSER_SORT_SQL[query.sortKey ?? 'sortField'];
    const direction = query.descending ? 'DESC' : 'ASC';

    // Full card blobs are needed here: the browser shows last-review timestamps, which only
    // live in the stored card JSON (the shallow row projection zeroes lastReview).
    // Do not project the large note/notetype JSON blobs through the cards JOIN. A reverse-card
    // note would duplicate its note JSON and a shared notetype (CSS + templates) would otherwise
    // be copied thousands of times into JS memory. Load each unique blob once and hydrate by id.
    const rows = db.getAllSync<QueueCardRow & { noteTypeId: number }>(
        `SELECT
            c.id AS cardId, c.noteId AS noteId, c.deckId AS deckId,
            c.ord AS ord, c.type AS type, c.queue AS queue,
            c.due AS due, c.ivl AS ivl, c.factor AS factor,
            c.reps AS reps, c.lapses AS lapses, c."left" AS "left",
            c.flags AS flags, c.data AS cardData,
            n.noteTypeId AS noteTypeId,
            NULL AS noteData, NULL AS noteTypeData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN note_types nt ON nt.id = n.noteTypeId
         JOIN decks d ON d.id = c.deckId
         ${where.sql}
         ORDER BY ${sortSql} ${direction}, c.id ${direction}${limitSql}${offsetSql}`,
        ...where.params,
        ...paginationParams,
    );
    const noteData = loadJsonRowsByIds(db, 'notes', [...new Set(rows.map((row) => row.noteId))]);
    const noteTypeData = loadJsonRowsByIds(db, 'note_types', [...new Set(rows.map((row) => row.noteTypeId))]);
    const hydratedRows = rows.flatMap((row) => {
        const storedNote = noteData.get(row.noteId);
        const storedType = noteTypeData.get(row.noteTypeId);
        return storedNote && storedType ? [{ ...row, noteData: storedNote, noteTypeData: storedType }] : [];
    });
    return toStudyCards(hydratedRows, settings, Date.now(), { includeRawCard: true, includeRawNote: true });
}

export function getBrowserCardCount(query: BrowserCardQuery = {}): number {
    const db = getDB();
    const where = buildBrowserWhere(query);
    const row = db.getFirstSync<{ cnt: number }>(
        `SELECT COUNT(${query.tableMode === 'notes' ? 'DISTINCT c.noteId' : '*'}) as cnt
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId
         JOIN note_types nt ON nt.id = n.noteTypeId
         JOIN decks d ON d.id = c.deckId${where.sql}`,
        ...where.params,
    );
    return row?.cnt || 0;
}
