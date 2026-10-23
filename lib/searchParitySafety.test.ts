// Independent search behavior fixtures: https://docs.ankiweb.net/searching.html
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';
const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db, dbUpsertFtsCard: () => {}, dbDeleteFtsCard: () => {} }));
import { BUILTIN_NOTE_TYPES } from './models';
import { buildFilteredSearchClause } from './studySearchSql';
import { getBrowserCardCount, getBrowserRowIdsMatchingText } from './browserRepository';
import { SearchSyntaxError } from './searchQuery';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    h.db = createAppDb(SQL);
    const type = { ...BUILTIN_NOTE_TYPES[0], id: 1, fields: ['Front', 'Back', 'Extra', 'Source'].map((name, ord) => ({ name, ord })), name: 'Probe' };
    h.db.runSync('INSERT INTO note_types (id, name, data) VALUES (1, ?, ?)', 'Probe', JSON.stringify(type));
    h.db.runSync('INSERT INTO decks (id, name, data) VALUES (1, ?, ?)', 'Tıp::Anatomi', JSON.stringify({ id: 1, name: 'Tıp::Anatomi' }));
    for (const [id, fields, tags] of [[1, ['underdog kart', 'answer', '', 'fourth-field'], ['Ünite::İmmünoloji']], [2, ['résumé', 'answer', '', ''], ['Marked']]] as const) {
        const note = { id, guid: `guid-${id}`, noteTypeId: 1, fields, tags, catalogTopic: 'Genel' };
        h.db.runSync('INSERT INTO notes (id, noteTypeId, tags, sfld, data) VALUES (?, 1, ?, ?, ?)', id, ` ${tags.join(' ')} `, fields[0], JSON.stringify(note));
        const card = { id: id + 10, noteId: id, deckId: 1, ord: 0, type: 0, queue: 0, due: id, ivl: 0, factor: 0, reps: 0, lapses: 0, flags: 0 };
        h.db.runSync('INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, flags, data) VALUES (?, ?, 1, 0, 0, 0, ?, 0, 0, 0, 0, 0, ?)', card.id, id, id, JSON.stringify(card));
    }
});
function sqlSearch(query: string) {
    const f = buildFilteredSearchClause(query);
    return h.db.getAllSync(`SELECT c.id FROM anki_cards c JOIN notes n ON n.id = c.noteId JOIN note_types nt ON nt.id = n.noteTypeId JOIN decks d ON d.id = c.deckId WHERE ${f.clauses.join(' AND ') || '1'}`, ...f.params).map((row: any) => row.id);
}
it.each([['dog', [11]], ['art', [11]], ['fourth-field', [11]], ['guid', []], ['fields', []], ['Genel', []], ['anatomi', []], ['resume', []], ['nc:resume', [12]], ['note:Probe', [11, 12]], ['Tag:ünite', [11]], ['"deck:Tıp"', [11, 12]], ['Front:dog', [11]], ['w:dog', []]])('uses the same field-based semantics for %s', (query, ids) => {
    expect(getBrowserRowIdsMatchingText({}, String(query)).sort()).toEqual(ids);
    expect(sqlSearch(String(query)).sort()).toEqual(ids);
});
it.each(['is:suspend', 'flag:9', 'prop:rated=0', 're:"("', 'rated:0', 'dog or', '(dog', 'dog )'])('rejects invalid search %s in the browser and matches nothing in SQL', (query) => {
    expect(() => getBrowserRowIdsMatchingText({}, query)).toThrow(SearchSyntaxError);
    // Saved filtered-deck searches are not migrated: an invalid one gathers no card, never throws.
    expect(sqlSearch(query)).toEqual([]);
});
it('filters Unicode hierarchical tags without ICU and matches marked tags case-insensitively', () => {
    expect(getBrowserCardCount({ tags: ['ünite::immünoloji'] })).toBe(1);
    expect(getBrowserCardCount({ markedOnly: true })).toBe(1);
});
it.each(['%', '+'])('never expands punctuation %s to all cards', (query) => {
    expect(getBrowserRowIdsMatchingText({}, query)).toEqual([]);
    expect(sqlSearch(query)).toEqual([]);
});
it('keeps every stored field searchable even when the note-type field list is incomplete', () => {
    const row = h.db.getFirstSync('SELECT data FROM note_types WHERE id = 1');
    const type = JSON.parse(row.data); type.fields = [];
    h.db.runSync('UPDATE note_types SET data = ? WHERE id = 1', JSON.stringify(type));
    expect(getBrowserRowIdsMatchingText({}, 'fourth-field')).toEqual([11]);
    expect(sqlSearch('fourth-field')).toEqual([11]);
});
it('ignores manual reschedules when finding the first real introduction', () => {
    h.db.runSync('INSERT INTO revlog (id, cardId, ease, type) VALUES (?, 11, 0, 4)', Date.now() - 3 * 86400000);
    h.db.runSync('INSERT INTO revlog (id, cardId, ease, type) VALUES (?, 11, 3, 0)', Date.now() - 1000);
    expect(getBrowserRowIdsMatchingText({}, 'introduced:1')).toEqual([11]);
    expect(sqlSearch('introduced:1')).toEqual([11]);
});
