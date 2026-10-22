/** Local, one-shot deletion undo. Behavior reference: https://docs.ankiweb.net/stats.html.
 * Keep the actual deleted rows, never a whole-collection snapshot. Refuse an undo after any
 * affected row changes so an old deletion cannot overwrite an edit or resurrect half a note.
 */
import { getDB } from './db';
type Row = Record<string, string | number | null>;
type Table = 'decks' | 'notes' | 'anki_cards';
export interface DeletionUndo { cardCount: number; undo(): void }
export function captureDeletion(ids: { deckIds?: number[]; noteIds?: number[]; cardIds?: number[] }): () => DeletionUndo {
    const db = getDB();
    const tables: [Table, number[]][] = [['decks', ids.deckIds ?? []], ['notes', ids.noteIds ?? []], ['anki_cards', ids.cardIds ?? []]];
    const before = tables.map(([table, keys]) => ({ table, rows: keys.flatMap((id) => {
        const row = db.getFirstSync<Row>(`SELECT * FROM ${table} WHERE id = ?`, id);
        return row ? [row] : [];
    }) }));
    const fts = (ids.cardIds ?? []).flatMap((id) => db.getAllSync<Row>('SELECT * FROM cards_fts WHERE card_id = ?', String(id)));
    const graveStart = db.getFirstSync<{ n: number }>('SELECT COALESCE(MAX(rowid), 0) AS n FROM graves')?.n ?? 0;
    return () => {
        const after = before.map(({ table, rows }) => rows.map((row) => db.getFirstSync<Row>(`SELECT * FROM ${table} WHERE id = ?`, row.id)));
        const graves = db.getAllSync<{ rowid: number }>('SELECT rowid FROM graves WHERE rowid > ?', graveStart);
        let used = false;
        return { cardCount: ids.cardIds?.length ?? 0, undo() {
            if (used || getDB() !== db) throw new Error('This deletion can no longer be undone.');
            db.execSync('BEGIN TRANSACTION;');
            try {
                before.forEach(({ table, rows }, ti) => rows.forEach((row, ri) => {
                    const current = db.getFirstSync<Row>(`SELECT * FROM ${table} WHERE id = ?`, row.id);
                    if (JSON.stringify(current) !== JSON.stringify(after[ti][ri])) throw new Error('An affected row has changed. Undo was cancelled.');
                }));
                for (const { table, rows } of before) for (const row of rows) {
                    const columns = Object.keys(row);
                    db.runSync(`INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...Object.values(row));
                }
                for (const id of ids.cardIds ?? []) db.runSync('DELETE FROM cards_fts WHERE card_id = ?', String(id));
                for (const row of fts) {
                    const columns = Object.keys(row);
                    db.runSync(`INSERT INTO cards_fts (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...Object.values(row));
                }
                for (const grave of graves) db.runSync('DELETE FROM graves WHERE rowid = ?', grave.rowid);
                db.execSync('COMMIT;');
                used = true;
            } catch (error) { db.execSync('ROLLBACK;'); throw error; }
        } };
    };
}
