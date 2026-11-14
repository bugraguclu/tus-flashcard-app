// Behaviour reference: Anki's Manage Note Types › Delete removes the type with all its notes and
// cards after a confirmation naming them (https://docs.ankiweb.net/editing.html#adding-a-note-type).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbUpsertFtsCard: () => {} }));
import { BUILTIN_NOTE_TYPES } from './models';
import { createNote, getNote } from './noteStore';
import { createDeck } from './deckStore';
import { getNoteType } from './noteTypeStore';
import { createNoteTypeFrom } from './noteTypeManage';
import { canDeleteNoteType, deleteNoteTypeWithBackup, NoteTypeDeletionError, noteTypeDeletionImpact } from './noteTypeDeletion';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());

const reversed = BUILTIN_NOTE_TYPES.find((type) => type.id === 2)!;

describe('deleting a note type', () => {
    it('backs up, then deletes the type with its notes, cards and graves, keeping review history', async () => {
        const own = createNoteTypeFrom(reversed, 'Çift yönlü');
        const deck = createDeck('Kardiyo');
        const first = createNote(own, ['Kalp', 'Heart'], deck.id);
        createNote(own, ['Damar', 'Vessel'], deck.id);
        const other = createNote(reversed, ['Ön', 'Arka'], deck.id);
        db.runSync('INSERT INTO revlog (id, cardId) VALUES (?, ?)', 1, first.cards[0].id);
        expect(noteTypeDeletionImpact(own.id)).toEqual({ notes: 2, cards: 4 });
        const calls: string[] = [];

        const outcome = await deleteNoteTypeWithBackup(own, {
            createBackup: async () => { calls.push(`backup with ${noteTypeDeletionImpact(own.id).notes} notes`); return { fileName: 'safety.json' }; },
        });

        expect(calls).toEqual(['backup with 2 notes']);
        expect(outcome).toEqual({ backupFileName: 'safety.json', notes: 2, cards: 4 });
        expect(getNoteType(own.id)).toBeNull();
        expect(getNote(first.note.id)).toBeNull();
        expect(db.getAllSync('SELECT * FROM graves WHERE type = 1')).toHaveLength(2);
        expect(db.getAllSync('SELECT * FROM graves WHERE type = 0')).toHaveLength(4);
        expect(db.getAllSync('SELECT * FROM revlog')).toHaveLength(1);
        expect(getNote(other.note.id)).not.toBeNull();
    });

    it('deletes nothing when the safety backup cannot be taken', async () => {
        const own = createNoteTypeFrom(reversed, 'Çift yönlü');
        const { note } = createNote(own, ['Kalp', 'Heart'], createDeck('Kardiyo').id);

        await expect(deleteNoteTypeWithBackup(own, { createBackup: async () => { throw new Error('disk full'); } }))
            .rejects.toBeInstanceOf(NoteTypeDeletionError);

        expect(getNoteType(own.id)).not.toBeNull();
        expect(getNote(note.id)).not.toBeNull();
    });

    it('never deletes a stock, legacy or catalog type', async () => {
        expect(canDeleteNoteType(reversed)).toBe(false);
        expect(canDeleteNoteType({ id: 4, name: 'TUS Tıp Kartı' })).toBe(false);
        expect(canDeleteNoteType({ ...reversed, id: 777, catalogPack: 'bka-tus' })).toBe(false);
        expect(canDeleteNoteType({ ...reversed, id: 778 })).toBe(true);
        await expect(deleteNoteTypeWithBackup(reversed, { createBackup: async () => ({ fileName: 'x' }) })).rejects.toThrow('cannot be deleted');
    });
});
