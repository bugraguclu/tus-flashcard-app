import { getDB } from './db';
import { compileCardSearch, type CardMatcherOptions, type CardSearchContext, type CardSearchNeeds } from './cardSearchMatch';
import { collectionSearchSettings } from './searchCollectionSettings';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { memoryStateFromCardData, parseAnkiCardData } from './fsrsCardData';
import type { Note, NoteType } from './models';

type SearchDb = ReturnType<typeof getDB>;

/** One card row of the scan: the card's own columns, plus its note-type id and deck name. */
interface ScanRow {
    id: number;
    noteId: number;
    noteTypeId: number;
    ord: number;
    type: number;
    queue: number;
    due: number;
    ivl: number;
    factor: number;
    reps: number;
    lapses: number;
    flags: number;
    createdAt: number | null;
    noteEditedAt: number | null;
    deckName: string;
    cardData?: string | null;
}

interface NotePayload {
    note: Note;
    fields: Record<string, string> | undefined;
    text: string;
}

function matcherOptions(db: SearchDb, nowMs: number): CardMatcherOptions {
    const { rolloverHour, learnAheadMinutes } = collectionSearchSettings();
    const logCache = new Map<string, Set<number>>();
    return {
        today: localDayNumber(nowMs, rolloverHour), nowMs, learnAheadMinutes,
        dayCutoffMs: nextRolloverMs(nowMs, rolloverHour) - 86_400_000,
        ratedWithin: (cardId, days, ease) => {
            const key = `${days}:${ease}`;
            if (!logCache.has(key)) {
                const rows = db.getAllSync<{ cardId: number }>(`SELECT DISTINCT cardId FROM revlog WHERE id >= ? AND ${ease === null ? 'ease > 0' : 'ease = ?'}`, nextRolloverMs(nowMs, rolloverHour) - days * 86_400_000, ...(ease === null ? [] : [ease]));
                logCache.set(key, new Set(rows.map(row => row.cardId)));
            }
            return logCache.get(key)!.has(cardId);
        },
        introducedWithin: (cardId, days) => {
            const key = `introduced:${days}`;
            if (!logCache.has(key)) {
                const rows = db.getAllSync<{ cardId: number }>('SELECT cardId FROM revlog WHERE ease > 0 AND type IN (0, 1, 2) GROUP BY cardId HAVING MIN(id) >= ?', nextRolloverMs(nowMs, rolloverHour) - days * 86_400_000);
                logCache.set(key, new Set(rows.map(row => row.cardId)));
            }
            return logCache.get(key)!.has(cardId);
        },
    };
}

/**
 * The scan reads card columns only. A note type carries its CSS and templates (an imported one
 * twice, inside `ankiRaw`), so projecting it through the card join copied it into JS once per
 * card: tens of kilobytes times every card in the collection. Note types are read by id, once
 * each; notes are read once each, and only when a term reads note content; the card's own JSON
 * blob only for the FSRS terms.
 *
 * A card counts only when its note and note type are readable, as before: a note type that is
 * not a JSON object with a field list, or a note without a field list, matches nothing. When the
 * query reads no note content the note is checked in SQL rather than parsed here.
 */
function scanRows(db: SearchDb, needs: CardSearchNeeds, readsNotes: boolean): ScanRow[] {
    const noteReadable = readsNotes ? '' : `WHERE (CASE WHEN json_valid(n.data) THEN json_type(n.data, '$.fields') END) = 'array'`;
    return db.getAllSync<ScanRow>(`SELECT c.id AS id, c.noteId AS noteId, n.noteTypeId AS noteTypeId, c.ord AS ord,
            c.type AS type, c.queue AS queue, c.due AS due, c.ivl AS ivl, c.factor AS factor, c.reps AS reps,
            c.lapses AS lapses, c.flags AS flags, c.created_at AS createdAt, n.updated_at AS noteEditedAt,
            d.name AS deckName${needs.cardData ? ', c.data AS cardData' : ''}
        FROM anki_cards c JOIN notes n ON n.id = c.noteId JOIN note_types nt ON nt.id = n.noteTypeId JOIN decks d ON d.id = c.deckId
        ${noteReadable}`);
}

function parseObject(raw: unknown): any {
    if (typeof raw !== 'string') return null;
    try {
        const value = JSON.parse(raw);
        return value && typeof value === 'object' ? value : null;
    } catch {
        return null;
    }
}

/** Card ids matching every query: one pass over the cards however many filters are combined. */
export function matchingCollectionCardIdsForAll(queries: readonly string[]): number[] {
    const db = getDB(); const nowMs = Date.now();
    const options = matcherOptions(db, nowMs);
    const compiled = queries.map((query) => compileCardSearch(query, options));
    const matchers = compiled.flatMap(({ matcher }) => (matcher ? [matcher] : []));
    const needs: CardSearchNeeds = {
        fields: compiled.some(({ needs }) => needs.fields),
        tags: compiled.some(({ needs }) => needs.tags),
        noteEdited: compiled.some(({ needs }) => needs.noteEdited),
        cardData: compiled.some(({ needs }) => needs.cardData),
    };
    const readsNotes = needs.fields || needs.tags || needs.noteEdited;

    const types = new Map<number, NoteType | null>();
    const typeOf = (typeId: number): NoteType | null => {
        if (!types.has(typeId)) {
            const type = parseObject(db.getFirstSync<{ data: string }>('SELECT data FROM note_types WHERE id = ?', typeId)?.data);
            types.set(typeId, type && type.fields != null ? type as NoteType : null);
        }
        return types.get(typeId)!;
    };

    const noteData = new Map<number, string>();
    if (readsNotes) {
        for (const row of db.getAllSync<{ id: number; data: string }>('SELECT id, data FROM notes')) noteData.set(Number(row.id), row.data);
    }
    const notes = new Map<number, NotePayload | null>();
    const noteOf = (noteId: number, type: NoteType): NotePayload | null => {
        if (!notes.has(noteId)) {
            const note = parseObject(noteData.get(noteId)) as Note | null;
            noteData.delete(noteId);
            notes.set(noteId, note && Array.isArray(note.fields) ? {
                note,
                fields: needs.fields
                    ? Object.fromEntries(note.fields.map((value, i) => [type.fields[i]?.name ?? `__field_${i}`, value]))
                    : undefined,
                text: needs.fields ? note.fields.join(' ') : '',
            } : null);
        }
        return notes.get(noteId)!;
    };

    const ids: number[] = [];
    for (const row of scanRows(db, needs, readsNotes)) {
        const type = typeOf(row.noteTypeId); if (!type) continue;
        const payload = readsNotes ? noteOf(row.noteId, type) : null;
        if (readsNotes && !payload) continue;
        const context: CardSearchContext = {
            cardId: row.id, noteId: row.noteId, deckName: row.deckName, text: payload?.text ?? '',
            tags: payload?.note.tags ?? [], templateOrd: row.ord, queue: row.queue, type: row.type, due: row.due,
            ivl: row.ivl, factor: row.factor, reps: row.reps, lapses: row.lapses, flags: row.flags,
            fields: payload?.fields, noteTypeName: type.name, templateName: type.templates?.[row.ord]?.name,
            createdAtMs: row.createdAt || row.id,
            noteEditedAtMs: row.noteEditedAt || (payload?.note.mod ? payload.note.mod * 1000 : 0),
        };
        if (needs.cardData) {
            const card = parseObject(row.cardData) ?? {};
            const fsrs = parseAnkiCardData(typeof card.ankiData === 'string' ? card.ankiData : undefined);
            context.memoryState = memoryStateFromCardData(fsrs);
            context.decay = fsrs.decay;
            context.lastReviewedAtMs = card.lastReview;
            context.lastReviewTimeSecs = fsrs.lastReviewTimeSecs;
        }
        if (matchers.every((matches) => matches(context))) ids.push(row.id);
    }
    return ids;
}

/** The only complete collection evaluator, shared by browser and saved/filtered searches. */
export function matchingCollectionCardIds(query: string): number[] {
    return matchingCollectionCardIdsForAll([query]);
}
