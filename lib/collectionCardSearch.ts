import { getDB } from './db';
import { compileCardMatcher } from './cardSearchMatch';
import { collectionSearchSettings } from './searchCollectionSettings';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { memoryStateFromCardData, parseAnkiCardData } from './fsrsCardData';
import type { Note, NoteType } from './models';

/** The only complete collection evaluator, shared by browser and saved/filtered searches. */
export function matchingCollectionCardIds(query: string): number[] {
    const db = getDB(); const nowMs = Date.now();
    const { rolloverHour, learnAheadMinutes } = collectionSearchSettings();
    const logCache = new Map<string, Set<number>>();
    const matcher = compileCardMatcher(query, {
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
    });
    const rows = db.getAllSync<any>(`SELECT c.*, n.data AS noteData, n.updated_at AS noteEditedAt, nt.data AS typeData, d.name AS deckName
        FROM anki_cards c JOIN notes n ON n.id = c.noteId JOIN note_types nt ON nt.id = n.noteTypeId JOIN decks d ON d.id = c.deckId`);
    const parsed = new Map<number, { note: Note; type: NoteType; fields: Record<string, string> } | null>();
    const ids: number[] = [];
    for (const row of rows) {
        if (!parsed.has(row.noteId)) {
            try {
                const note = JSON.parse(row.noteData) as Note; const type = JSON.parse(row.typeData) as NoteType;
                parsed.set(row.noteId, { note, type, fields: Object.fromEntries(type.fields.map((field, i) => [field.name, note.fields[i] ?? ''])) });
            } catch { parsed.set(row.noteId, null); }
        }
        const payload = parsed.get(row.noteId); if (!payload) continue;
        const { note, type, fields } = payload;
        let card: any; try { card = JSON.parse(row.data); } catch { card = {}; }
        const fsrs = parseAnkiCardData(card.ankiData);
        if (!matcher || matcher({
            cardId: row.id, noteId: row.noteId, deckName: row.deckName, text: note.fields.join(' '), tags: note.tags ?? [],
            templateOrd: row.ord, queue: row.queue, type: row.type, due: row.due, ivl: row.ivl, factor: row.factor,
            reps: row.reps, lapses: row.lapses, flags: row.flags, fields, noteTypeName: type.name, templateName: type.templates[row.ord]?.name,
            createdAtMs: row.created_at || row.id, noteEditedAtMs: row.noteEditedAt || (note.mod ? note.mod * 1000 : 0),
            memoryState: memoryStateFromCardData(fsrs), decay: fsrs.decay, lastReviewedAtMs: card.lastReview,
            lastReviewTimeSecs: fsrs.lastReviewTimeSecs,
        })) ids.push(row.id);
    }
    return ids;
}
