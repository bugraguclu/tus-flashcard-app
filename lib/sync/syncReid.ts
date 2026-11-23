import type { SyncKind } from '../syncContract';
import type { SyncEnv } from './syncCapture';

/*
 * Moving a local object to a new id (docs/HESAP_SENKRON.md §6.5). Ids are timestamps shared by
 * every device, so two devices can, rarely, give two different objects the same id. When the
 * server (or a pull) shows another object under an id this device uses, this device moves its own
 * object and everything that refers to it to a free id; the moved rows are then captured and sent
 * as a new object.
 */

const TABLE_OF: Partial<Record<SyncKind, string>> = {
    note: 'notes', card: 'anki_cards', deck: 'decks', preset: 'deck_configs', ntype: 'note_types', rev: 'revlog', sess: 'study_sessions',
};

function freeId(env: SyncEnv, table: string, from: number): number {
    // Past every id here, so a moved object does not land on the next one it would collide with.
    const highest = Number(env.db.getFirstSync<{ m: number | null }>(`SELECT MAX(id) AS m FROM ${table}`)?.m ?? 0);
    let id = Math.max(from + 1, Math.floor(env.ctx.now()), highest + 1);
    while (env.db.getFirstSync(`SELECT 1 AS x FROM ${table} WHERE id = ?`, id)) id += 1;
    return id;
}

function mark(env: SyncEnv, table: string, ids: readonly (number | string)[]): void {
    for (const id of ids) env.ctx.touched.push([table, String(id)]);
}

function ids(env: SyncEnv, sql: string, ...params: unknown[]): number[] {
    return env.db.getAllSync<{ id: number }>(sql, ...params).map((row) => Number(row.id));
}

/** Moves the local object of `kind` at `lid` to a fresh id. Returns the new local id. */
export function reidLocalObject(env: SyncEnv, kind: SyncKind, lid: string): string | null {
    const table = TABLE_OF[kind];
    if (!table) return null;
    const { db } = env;
    const oldId = Number(lid);
    if (!Number.isFinite(oldId) || !db.getFirstSync(`SELECT 1 AS x FROM ${table} WHERE id = ?`, oldId)) return null;
    const newId = freeId(env, table, oldId);
    switch (kind) {
        case 'note': {
            db.runSync("UPDATE notes SET id = ?, data = json_set(data, '$.id', ?) WHERE id = ?", newId, newId, oldId);
            const cards = ids(env, 'SELECT id FROM anki_cards WHERE noteId = ?', oldId);
            db.runSync("UPDATE anki_cards SET noteId = ?, data = json_set(data, '$.noteId', ?) WHERE noteId = ?", newId, newId, oldId);
            mark(env, 'anki_cards', cards);
            break;
        }
        case 'card': {
            db.runSync("UPDATE anki_cards SET id = ?, data = json_set(data, '$.id', ?) WHERE id = ?", newId, newId, oldId);
            db.runSync('DELETE FROM cards_fts WHERE card_id = ?', String(oldId));
            const answers = ids(env, 'SELECT id FROM revlog WHERE cardId = ?', oldId);
            db.runSync('UPDATE revlog SET cardId = ? WHERE cardId = ?', newId, oldId);
            mark(env, 'revlog', answers);
            break;
        }
        case 'deck': {
            db.runSync("UPDATE decks SET id = ?, data = json_set(data, '$.id', ?) WHERE id = ?", newId, newId, oldId);
            const cards = ids(env, "SELECT id FROM anki_cards WHERE deckId = ? OR json_extract(data, '$.odid') = ?", oldId, oldId);
            db.runSync("UPDATE anki_cards SET deckId = ?, data = json_set(data, '$.deckId', ?) WHERE deckId = ?", newId, newId, oldId);
            db.runSync("UPDATE anki_cards SET data = json_set(data, '$.odid', ?) WHERE json_extract(data, '$.odid') = ?", newId, oldId);
            for (const prefix of ['filtered_membership_v1:', 'deck_today_limits:', 'deck_today_boost:', 'deck_custom_study:']) {
                db.runSync('UPDATE settings SET key = ? WHERE key = ?', `${prefix}${newId}`, `${prefix}${oldId}`);
            }
            mark(env, 'anki_cards', cards);
            break;
        }
        case 'preset': {
            db.runSync("UPDATE deck_configs SET id = ?, data = json_set(data, '$.id', ?) WHERE id = ?", newId, newId, oldId);
            const decks = ids(env, "SELECT id FROM decks WHERE json_extract(data, '$.configId') = ?", oldId);
            db.runSync("UPDATE decks SET data = json_set(data, '$.configId', ?) WHERE json_extract(data, '$.configId') = ?", newId, oldId);
            mark(env, 'decks', decks);
            break;
        }
        case 'ntype': {
            db.runSync("UPDATE note_types SET id = ?, data = json_set(data, '$.id', ?) WHERE id = ?", newId, newId, oldId);
            const notes = ids(env, 'SELECT id FROM notes WHERE noteTypeId = ?', oldId);
            db.runSync("UPDATE notes SET noteTypeId = ?, data = json_set(data, '$.noteTypeId', ?) WHERE noteTypeId = ?", newId, newId, oldId);
            mark(env, 'notes', notes);
            break;
        }
        case 'rev': {
            db.runSync('UPDATE revlog SET id = ? WHERE id = ?', newId, oldId);
            db.runSync('UPDATE settings SET key = ? WHERE key = ?', `interday_review_usage:${newId}`, `interday_review_usage:${oldId}`);
            break;
        }
        case 'sess': {
            db.runSync('UPDATE study_sessions SET id = ? WHERE id = ?', newId, oldId);
            break;
        }
        default:
            return null;
    }
    mark(env, table, [newId]);
    return String(newId);
}
