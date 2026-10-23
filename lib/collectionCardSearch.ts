import { getDB } from './db';
import { compileCardSearch, type CardMatcherOptions, type CardSearchContext, type CardSearchNeeds, type RevlogLookupKind } from './cardSearchMatch';
import { collectionSearchSettings } from './searchCollectionSettings';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { memoryStateFromCardData, parseAnkiCardData } from './fsrsCardData';
import type { Note, NoteType } from './models';
import { searchDeckInfo, type SearchDeckInfo } from './searchDeckInfo';

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
    deckId: number;
    cardData?: string | null;
    odid?: number | null;
}

interface NotePayload {
    note: Note;
    fields: Record<string, string> | undefined;
    text: string;
}

let currentDeckName: string | null = null;

/**
 * The deck `deck:current` means. The app has no stored "current deck" the way Anki's collection
 * config does; the screen that owns the deck selection (the browser) reports it here.
 */
export function setSearchCurrentDeckName(name: string | null): void {
    currentDeckName = name;
}

const DAY_MS = 86_400_000;

/** A card id is Anki's creation stamp when it reads as a plausible epoch-ms time. */
const EARLIEST_STAMP_MS = 946_684_800_000; // 2000-01-01
export function cardAddedMs(cardId: number, createdAt: number | null | undefined, nowMs: number = Date.now()): number {
    if (cardId >= EARLIEST_STAMP_MS && cardId <= nowMs + DAY_MS) return cardId;
    return createdAt || cardId;
}

/** A note's last edit, from its own `mod` (seconds) as Anki's `edited:` reads it. */
export function noteEditedMs(note: Pick<Note, 'mod'> | null | undefined, updatedAt: number | null | undefined): number {
    const mod = Number(note?.mod);
    return Number.isFinite(mod) && mod > 0 ? mod * 1000 : (updatedAt || 0);
}

function matcherOptions(db: SearchDb, nowMs: number): CardMatcherOptions {
    const { rolloverHour, learnAheadMinutes } = collectionSearchSettings();
    const logCache = new Map<string, Set<number>>();
    const dayCutoffMs = nextRolloverMs(nowMs, rolloverHour) - DAY_MS;
    const dayCache = new Map<RevlogLookupKind, Map<number, number[]>>();
    return {
        today: localDayNumber(nowMs, rolloverHour), nowMs, learnAheadMinutes,
        dayCutoffMs,
        currentDeckName,
        revlogDayOffsets: (cardId, kind) => {
            let byCard = dayCache.get(kind);
            if (!byCard) {
                byCard = new Map();
                const where = kind === 'rated' ? 'ease > 0' : 'ease = 0 AND type IN (4, 5)';
                for (const row of db.getAllSync<{ cardId: number; id: number }>(`SELECT cardId, id FROM revlog WHERE ${where}`)) {
                    const offset = Math.floor((Number(row.id) - dayCutoffMs) / DAY_MS);
                    const list = byCard.get(Number(row.cardId));
                    if (list) { if (!list.includes(offset)) list.push(offset); } else byCard.set(Number(row.cardId), [offset]);
                }
                dayCache.set(kind, byCard);
            }
            return byCard.get(cardId) ?? [];
        },
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
            d.name AS deckName, c.deckId AS deckId${needs.cardData ? ', c.data AS cardData' : ''}
            ${needs.decks ? ", CASE WHEN json_valid(c.data) THEN json_extract(c.data, '$.odid') END AS odid" : ''}
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

/** Anki's custom scheduling data, the `cd` object inside the card's data blob. */
function customDataOf(ankiData: unknown): Record<string, unknown> | null {
    const blob = parseObject(ankiData);
    const cd = blob?.cd;
    return cd && typeof cd === 'object' && !Array.isArray(cd) ? cd as Record<string, unknown> : null;
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
        decks: compiled.some(({ needs }) => needs.decks),
    };
    const decks: SearchDeckInfo | null = needs.decks ? searchDeckInfo(db) : null;
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
                text: needs.fields ? note.fields.join('\x1f') : '',
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
            fieldList: needs.fields ? payload?.note.fields : undefined,
            sortFieldIndex: Number.isInteger(type.sortFieldIdx) ? type.sortFieldIdx : 0,
            noteTypeId: row.noteTypeId, deckId: row.deckId,
            createdAtMs: cardAddedMs(row.id, row.createdAt, nowMs),
            noteEditedAtMs: payload ? noteEditedMs(payload.note, row.noteEditedAt) : (row.noteEditedAt || 0),
        };
        if (decks) Object.assign(context, decks.describe(row.id, row.deckId, row.odid));
        if (needs.cardData) {
            const card = parseObject(row.cardData) ?? {};
            const fsrs = parseAnkiCardData(typeof card.ankiData === 'string' ? card.ankiData : undefined);
            context.memoryState = memoryStateFromCardData(fsrs);
            context.decay = fsrs.decay;
            context.lastReviewedAtMs = card.lastReview;
            context.lastReviewTimeSecs = fsrs.lastReviewTimeSecs;
            context.customData = customDataOf(card.ankiData);
        }
        if (matchers.every((matches) => matches(context))) ids.push(row.id);
    }
    return ids;
}

/** The only complete collection evaluator, shared by browser and saved/filtered searches. */
export function matchingCollectionCardIds(query: string): number[] {
    return matchingCollectionCardIdsForAll([query]);
}
