// Anki's default Change Note Type mapping, derived from behaviour:
// https://docs.ankiweb.net/browsing.html#changing-the-note-type
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbUpsertFtsCard: () => {} }));
import { BUILTIN_NOTE_TYPES, type NoteType } from './models';
import { createNote, getCardsForNote, getNote, saveAnkiCard } from './noteStore';
import { createDeck } from './deckStore';
import { changeNotesType, changeNotesTypeUndoable, getNoteTypeChangeDeletionCount, saveNoteType } from './noteTypeStore';
import { mapNoteTypeCardOrd } from './noteTypeChange';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());
const builtin = (id: number) => BUILTIN_NOTE_TYPES.find(t => t.id === id)!;
const noteOf = (type: NoteType, fields: string[]) => createNote(type, fields, createDeck('Cards').id);

describe('template mapping', () => {
    it('fills an unmatched target template with the unused source template by position', () => {
        const forward: NoteType = { ...builtin(1), id: 120, name: 'Forward only', templates: [{ ...builtin(1).templates[0], name: 'Forward' }] };
        saveNoteType(forward);
        const { note, cards } = noteOf(builtin(1), ['Q', 'A']);
        saveAnkiCard({ ...cards[0], reps: 6, type: 2, queue: 2, ivl: 12 });
        expect(getNoteTypeChangeDeletionCount([note.id], forward.id)).toBe(0);
        changeNotesType([note.id], forward.id);
        expect(getCardsForNote(note.id)).toEqual([expect.objectContaining({ id: cards[0].id, ord: 0, reps: 6, ivl: 12 })]);
    });

    it('prefers name matches and then position, never using one source template twice', () => {
        const source: NoteType = { ...builtin(2), id: 121, templates: [{ ...builtin(2).templates[0], name: 'A' }, { ...builtin(2).templates[1], name: 'B', ord: 1 }] };
        const target: NoteType = { ...builtin(2), id: 122, templates: [{ ...builtin(2).templates[0], name: 'B' }, { ...builtin(2).templates[1], name: 'C', ord: 1 }] };
        expect(mapNoteTypeCardOrd(source, target, 1)).toBe(0);
        expect(mapNoteTypeCardOrd(source, target, 0)).toBe(1);
    });

    it('keeps every card when converting into a cloze type', () => {
        const { note, cards } = noteOf(builtin(2), ['Front', 'Back']);
        saveAnkiCard({ ...cards[1], reps: 4 });
        expect(getNoteTypeChangeDeletionCount([note.id], 3)).toBe(0);
        changeNotesType([note.id], 3);
        expect(getCardsForNote(note.id).map(c => [c.id, c.ord])).toEqual([[cards[0].id, 0], [cards[1].id, 1]]);
        expect(getNote(note.id)?.fields).toEqual(['Front', 'Back']);
    });

    it('cloze → standard removes only ordinals at or above the target template count', () => {
        const { note, cards } = noteOf(builtin(3), ['{{c1::a}} {{c2::b}} {{c3::c}}', '']);
        expect(cards).toHaveLength(3);
        expect(getNoteTypeChangeDeletionCount([note.id], 2)).toBe(1);
        changeNotesType([note.id], 2, { allowCardDeletion: true });
        expect(getCardsForNote(note.id).map(c => [c.id, c.ord])).toEqual([[cards[0].id, 0], [cards[1].id, 1]]);
    });
});

describe('undo', () => {
    it('restores the note, the removed card and drops cards the conversion created', () => {
        const { note, cards } = noteOf(builtin(2), ['Front', 'Back']);
        const before = getCardsForNote(note.id);
        const result = changeNotesTypeUndoable([note.id], 1, { allowCardDeletion: true });
        expect(result).toMatchObject({ changed: 1, cardCount: 1 });
        expect(getCardsForNote(note.id)).toHaveLength(1);
        result.undo();
        expect(getNote(note.id)?.noteTypeId).toBe(2);
        expect(getCardsForNote(note.id)).toEqual(before);
        expect(db.getAllSync('SELECT * FROM graves')).toHaveLength(0);
        expect(() => result.undo()).toThrow();
        expect(cards).toHaveLength(2);
    });

    it('removes a card the conversion generated', () => {
        const { note } = noteOf(builtin(1), ['Front', 'Back']);
        const result = changeNotesTypeUndoable([note.id], 2);
        expect(getCardsForNote(note.id)).toHaveLength(2);
        result.undo();
        expect(getCardsForNote(note.id).map(c => c.ord)).toEqual([0]);
    });

    it('refuses to undo after the note was edited again', () => {
        const { note } = noteOf(builtin(1), ['Front', 'Back']);
        const result = changeNotesTypeUndoable([note.id], 2);
        db.runSync('UPDATE notes SET sfld = ? WHERE id = ?', 'edited', note.id);
        expect(() => result.undo()).toThrow(/changed/);
        expect(getNote(note.id)?.noteTypeId).toBe(2);
    });
});
