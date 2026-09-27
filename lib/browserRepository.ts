import { getDB } from './db';
import { memoryStateFromCardData, parseAnkiCardData } from './fsrsCardData';
import type { AppSettings, StudyCard } from './types';
import type { Note, NoteType } from './models';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { compileCardMatcher, type CardSearchContext } from './cardSearchMatch';
import { getDeckByName } from './deckManager';
import {
    FSRS_DIFFICULTY_SQL,
    FSRS_RETRIEVABILITY_SQL,
    FSRS_STABILITY_SQL,
    clauseForSearchTerm,
    collectionSearchSettings,
    escapeLikePattern,
} from './studySearchSql';
import { parseNotePayload, toStudyCards, type QueueCardRow } from './studyCardRows';

/**
 * The card browser's queries: search, sort columns, table mode, paging and counts.
 */

export type BrowserCardSortKey = 'sortField' | 'cardType' | 'due' | 'deck' | 'created' | 'modified'
    | 'interval' | 'ease' | 'lapses' | 'reviews' | 'stability' | 'difficulty' | 'retrievability';

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
    stability: FSRS_STABILITY_SQL,
    difficulty: FSRS_DIFFICULTY_SQL,
    retrievability: FSRS_RETRIEVABILITY_SQL,
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
        // A note's FSRS figures are the average across its cards, matching the interval column.
        stability: `AVG(${FSRS_STABILITY_SQL.replaceAll('c.data', 'c_all.data')})`,
        difficulty: `AVG(${FSRS_DIFFICULTY_SQL.replaceAll('c.data', 'c_all.data')})`,
        retrievability: `AVG(${FSRS_RETRIEVABILITY_SQL.replaceAll('c.data', 'c_all.data').replaceAll('c.due', 'c_all.due').replaceAll('c.ivl', 'c_all.ivl').replaceAll('c.type', 'c_all.type')})`,
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
        ankiData: string | null;
        lastReview: number | null;
    }>(
        `SELECT
            c.id AS cardId,
            c.noteId AS noteId,
            n.noteTypeId AS noteTypeId,
            d.name AS deckName,
            c.ord AS ord, c.type AS type, c.queue AS queue, c.due AS due,
            c.ivl AS ivl, c.factor AS factor, c.reps AS reps, c.lapses AS lapses,
            c.flags AS flags, c.created_at AS createdAt,
            n.updated_at AS noteEditedAt,
            json_extract(c.data, '$.ankiData') AS ankiData,
            json_extract(c.data, '$.lastReview') AS lastReview
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
        ankiData?: string | null; lastReview?: number | null;
    },
    parsed: ParsedSearchNote,
): CardSearchContext {
    const { note, noteType, text, fields } = parsed;
    const fsrsData = parseAnkiCardData(row.ankiData ?? undefined);

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
        // FSRS state for prop:s / prop:d / prop:r.
        memoryState: memoryStateFromCardData(fsrsData),
        decay: fsrsData.decay,
        lastReviewedAtMs: Number(row.lastReview) || undefined,
        lastReviewTimeSecs: fsrsData.lastReviewTimeSecs,
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

/**
 * Total physical cards belonging to a deck (including its child decks).
 * Used by study empty-state UI to distinguish an empty deck (0 cards total)
 * from a deck whose cards are completed for today.
 */
export function getDeckTotalCardCount(deckName: string | null): number {
    const db = getDB();
    if (!deckName) {
        const row = db.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM anki_cards');
        return row?.cnt ?? 0;
    }
    const deck = getDeckByName(deckName);
    if (deck?.isFiltered) {
        const row = db.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM anki_cards WHERE deckId = ?', deck.id);
        return row?.cnt ?? 0;
    }
    const row = db.getFirstSync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt
         FROM anki_cards c
         JOIN decks d ON d.id = c.deckId
         WHERE d.name = ? OR d.name LIKE ? ESCAPE '\\'`,
        deckName,
        `${escapeLikePattern(deckName)}::%`,
    );
    return row?.cnt ?? 0;
}
