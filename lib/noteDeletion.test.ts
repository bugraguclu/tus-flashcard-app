// Independent behavior tests: https://docs.ankiweb.net/stats.html (deleted-note history).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbUpsertFtsCard: () => {} }));
import { BUILTIN_NOTE_TYPES } from './models';
import { createNote, deleteNote, deleteAnkiCardOnly, getNote, getCardsForNote } from './noteStore';
import { createDeck, deleteDeck, getDeck } from './deckStore';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());
function fixture() {
    const deck = createDeck('History');
    const { note, cards } = createNote(BUILTIN_NOTE_TYPES[0], ['Front', 'Back'], deck.id);
    db.runSync('INSERT INTO revlog (id, cardId) VALUES (?, ?)', 123, cards[0].id);
    return { deck, note, card: cards[0] };
}
describe('deletion retains history and offers conflict-safe undo', () => {
    it.each(['note', 'card', 'deck'])('preserves revlog when deleting a %s', (kind) => {
        const { deck, note, card } = fixture();
        if (kind === 'note') deleteNote(note.id);
        if (kind === 'card') deleteAnkiCardOnly(card.id, { preserveNotes: false });
        if (kind === 'deck') deleteDeck(deck.id);
        expect(db.getAllSync('SELECT * FROM revlog')).toHaveLength(1);
    });
    it('restores note, cards and graves on undo', () => {
        const { note, card } = fixture();
        const result = deleteNote(note.id);
        expect(getNote(note.id)).toBeNull();
        result!.undo();
        expect(getNote(note.id)).toEqual(note);
        expect(getCardsForNote(note.id)[0]).toEqual(card);
        expect(db.getAllSync('SELECT * FROM graves')).toHaveLength(0);
        expect(() => result!.undo()).toThrow();
    });
    it('restores a deleted subtree without changing unrelated notes', () => {
        const { deck, note } = fixture();
        const child = createDeck('History::Child');
        const result = deleteDeck(deck.id);
        result!.undo();
        expect(getDeck(child.id)?.name).toBe(child.name);
        expect(getNote(note.id)).toEqual(note);
    });
    it('refuses undo if an affected id was reused', () => {
        const { note } = fixture();
        const result = deleteNote(note.id);
        db.runSync('INSERT INTO notes (id, data) VALUES (?, ?)', note.id, '{}');
        expect(() => result!.undo()).toThrow();
        expect(db.getFirstSync<{ data: string }>('SELECT data FROM notes WHERE id = ?', note.id)?.data).toBe('{}');
    });
});

it('restores deck whiteboard preferences when deck deletion is undone', () => {
    const { deck } = fixture();
    const key = `tus_whiteboard_deck_v1:${deck.id}`;
    db.runSync('INSERT INTO settings (key,value) VALUES (?,?)', key, '{"enabled":true}');
    const result = deleteDeck(deck.id);
    result!.undo();
    expect(db.getFirstSync<{value:string}>('SELECT value FROM settings WHERE key = ?', key)?.value).toBe('{"enabled":true}');
});

it('rolls back a failed bulk removal, including graves, while retaining history', () => {
    const deck = createDeck('Atomic');
    const { note, cards } = createNote(BUILTIN_NOTE_TYPES.find(t => t.id === 2)!, ['Front', 'Back'], deck.id);
    const original = db.runSync;
    holder.db = { ...db, runSync(sql: string, ...params: any[]) {
        if (sql.startsWith('DELETE FROM anki_cards') && String(params[0]).includes(String(cards[1].id))) throw new Error('injected failure');
        return original(sql, ...params);
    } };
    expect(() => deleteNote(note.id)).toThrow('injected failure');
    expect(getCardsForNote(note.id)).toHaveLength(2);
    expect(getNote(note.id)).not.toBeNull();
    expect(db.getAllSync('SELECT * FROM graves')).toHaveLength(0);
});

it('deletes a browser selection of notes as one transaction with one undo', async () => {
    const { deleteNotes } = await import('./noteStore');
    const deck = createDeck('Bulk');
    const type = BUILTIN_NOTE_TYPES.find(t => t.id === 2)!;
    const a = createNote(type, ['A', 'a'], deck.id);
    const b = createNote(type, ['B', 'b'], deck.id);
    db.runSync('INSERT INTO revlog (id, cardId) VALUES (?, ?)', 9, a.cards[0].id);
    const deletion = deleteNotes([a.note.id, b.note.id, a.note.id]);
    expect(deletion.cardCount).toBe(4);
    expect(getNote(a.note.id)).toBeNull();
    expect(db.getAllSync('SELECT * FROM graves')).toHaveLength(6);
    expect(db.getAllSync('SELECT * FROM revlog')).toHaveLength(1);
    deletion.undo();
    expect(getCardsForNote(a.note.id)).toHaveLength(2);
    expect(getCardsForNote(b.note.id)).toHaveLength(2);
    expect(db.getAllSync('SELECT * FROM graves')).toHaveLength(0);
});

it('gives every card of a new note the same new-card position, and the next note the next one', () => {
    const deck = createDeck('Positions');
    const type = BUILTIN_NOTE_TYPES.find(t => t.id === 2)!;
    const a = createNote(type, ['A', 'a'], deck.id).cards;
    const b = createNote(type, ['B', 'b'], deck.id).cards;
    expect(a[0].due).toBe(a[1].due);
    expect(b[0].due).toBe(b[1].due);
    expect(b[0].due).toBe(a[0].due + 1);
});

it('does not add a second leech tag beside a differently cased one', async () => {
    const { handleLeech } = await import('./noteStore');
    const deck = createDeck('Leech');
    const { note, cards } = createNote(BUILTIN_NOTE_TYPES[0], ['F', 'B'], deck.id, ['Leech']);
    handleLeech(cards[0], 'tag');
    expect(getNote(note.id)?.tags).toEqual(['Leech']);
});
