/** Local, one-shot deletion undo. Behavior reference: https://docs.ankiweb.net/stats.html.
 * Keep the actual deleted rows, never a whole-collection snapshot. Refuse an undo after any
 * affected row changes so an old deletion cannot overwrite an edit or resurrect half a note.
 */
import { getDB } from './db';
type Row = Record<string, string | number | null>;
type Table = 'decks' | 'notes' | 'anki_cards';
export interface DeletionUndo { cardCount: number; undo(): void }

const IN_IDS = 'IN (SELECT value FROM json_each(?))';
const idsParam = (ids: number[]) => JSON.stringify(ids);
const ftsIdsParam = (ids: number[]) => JSON.stringify(ids.map(String));

/** Rows of `table` by id, read in one statement (large decks used to cost one query per row). */
function rowsById(table: Table, ids: number[]): Map<number, Row> {
    const map = new Map<number, Row>();
    if (!ids.length) return map;
    for (const row of getDB().getAllSync<Row>(`SELECT * FROM ${table} WHERE id ${IN_IDS}`, idsParam(ids))) map.set(Number(row.id), row);
    return map;
}

/** Capture rows before an operation; call the returned function after it (inside the same
 * transaction). Rows the operation created (`createdCardIds`) are removed again on undo. */
export function captureDeletion(ids: { deckIds?: number[]; noteIds?: number[]; cardIds?: number[] }): (createdCardIds?: number[]) => DeletionUndo {
    const db = getDB();
    const tables: [Table, number[]][] = [['decks', [...new Set(ids.deckIds ?? [])]], ['notes', [...new Set(ids.noteIds ?? [])]], ['anki_cards', [...new Set(ids.cardIds ?? [])]]];
    const before = tables.map(([table, keys]) => {
        const found = rowsById(table, keys);
        return { table, keys, rows: keys.flatMap((id) => (found.has(id) ? [found.get(id)!] : [])) };
    });
    const boardSettings = (ids.deckIds ?? []).flatMap(id => [`tus_whiteboard_deck_v1:${id}`, `tus_whiteboard_cards_v1:${id}`]).map(key => ({
        key, before: db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key),
    }));
    const cardIds = tables[2][1];
    const fts = cardIds.length ? db.getAllSync<Row>(`SELECT * FROM cards_fts WHERE card_id ${IN_IDS}`, ftsIdsParam(cardIds)) : [];
    const graveStart = db.getFirstSync<{ n: number }>('SELECT COALESCE(MAX(rowid), 0) AS n FROM graves')?.n ?? 0;
    const snapshot = () => before.map(({ table, rows }) => {
        const current = rowsById(table, rows.map((row) => Number(row.id)));
        return rows.map((row) => current.get(Number(row.id)) ?? null);
    });
    return (createdCardIds = []) => {
        const after = snapshot();
        const createdAfter = rowsById('anki_cards', createdCardIds);
        const graves = db.getAllSync<{ rowid: number }>('SELECT rowid FROM graves WHERE rowid > ?', graveStart);
        let used = false;
        return { cardCount: ids.cardIds?.length ?? 0, undo() {
            if (used || getDB() !== db) throw new Error('This deletion can no longer be undone.');
            db.execSync('BEGIN TRANSACTION;');
            try {
                const current = snapshot();
                before.forEach((_, ti) => current[ti].forEach((row, ri) => {
                    if (JSON.stringify(row) !== JSON.stringify(after[ti][ri])) throw new Error('An affected row has changed. Undo was cancelled.');
                }));
                const createdNow = rowsById('anki_cards', createdCardIds);
                for (const id of createdCardIds) {
                    if (JSON.stringify(createdNow.get(id) ?? null) !== JSON.stringify(createdAfter.get(id) ?? null)) throw new Error('An affected row has changed. Undo was cancelled.');
                }
                for (const setting of boardSettings) {
                    const value = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', setting.key);
                    if (value?.value && value.value !== setting.before?.value) throw new Error('Whiteboard preferences changed. Undo was cancelled.');
                }
                for (const { table, rows } of before) for (const row of rows) {
                    const columns = Object.keys(row);
                    db.runSync(`INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...Object.values(row));
                }
                if (createdCardIds.length) {
                    db.runSync(`DELETE FROM anki_cards WHERE id ${IN_IDS}`, idsParam(createdCardIds));
                    db.runSync(`DELETE FROM cards_fts WHERE card_id ${IN_IDS}`, ftsIdsParam(createdCardIds));
                }
                if (cardIds.length) db.runSync(`DELETE FROM cards_fts WHERE card_id ${IN_IDS}`, ftsIdsParam(cardIds));
                for (const row of fts) {
                    const columns = Object.keys(row);
                    db.runSync(`INSERT INTO cards_fts (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...Object.values(row));
                }
                for (const setting of boardSettings) {
                    if (setting.before) db.runSync('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', setting.key, setting.before.value);
                    else db.runSync('DELETE FROM settings WHERE key = ?', setting.key);
                }
                if (graves.length) db.runSync(`DELETE FROM graves WHERE rowid ${IN_IDS}`, idsParam(graves.map((grave) => grave.rowid)));
                db.execSync('COMMIT;');
                used = true;
            } catch (error) { db.execSync('ROLLBACK;'); throw error; }
        } };
    };
}

/** The only ordinary card-row removal path. Caller owns the enclosing transaction and
 * catalog/confirmation checks. Review history deliberately has no deletion here.
 */
export function deleteCardRows(cardIds: number[]): number {
    const unique = [...new Set(cardIds)];
    if (!unique.length) return 0;
    const db = getDB();
    const existing = db.getAllSync<{ id: number }>(`SELECT id FROM anki_cards WHERE id ${IN_IDS} ORDER BY id`, idsParam(unique)).map((row) => Number(row.id));
    if (!existing.length) return 0;
    db.runSync(`DELETE FROM cards_fts WHERE card_id ${IN_IDS}`, ftsIdsParam(existing));
    db.runSync(`DELETE FROM anki_cards WHERE id ${IN_IDS}`, idsParam(existing));
    db.runSync(`INSERT INTO graves (oid, type, usn) SELECT value, 0, -1 FROM json_each(?)`, idsParam(existing));
    return existing.length;
}
