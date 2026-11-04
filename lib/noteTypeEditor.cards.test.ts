// A note-type edit here (fields, templates, a new note type) writes the note type and its notes but
// no card. Anki keeps a study session's queue across such a change, since only cards, decks and
// options rebuild it (https://github.com/ankitects/anki/blob/main/rslib/src/ops.rs,
// `requires_study_queue_rebuild`), so app/note-type.tsx passes `keepsStudyQueue`. This pins that
// claim: if one of these paths ever starts adding or removing cards, the flag must go.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbUpsertFtsCard: () => {} }));
import { BUILTIN_NOTE_TYPES } from './models';
import { createNote, getCardsForNote, saveAnkiCard } from './noteStore';
import { getNoteType, saveNoteType } from './noteTypeStore';
import { createDeck } from './deckStore';
import { addField, applyFieldEdit, moveField, removeField, updateTemplate } from './noteTypeEditor';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());

function studiedNotes() {
    const deck = createDeck('Deck');
    const noteType = { ...BUILTIN_NOTE_TYPES[1], id: 9001, name: 'Reversed copy' };
    saveNoteType(noteType);
    const notes = [createNote(noteType, ['Front 1', 'Back 1'], deck.id), createNote(noteType, ['Front 2', 'Back 2'], deck.id)];
    for (const { cards } of notes) saveAnkiCard({ ...cards[0], type: 2, queue: 2, ivl: 9, reps: 3, due: 40 });
    const cardRows = () => notes.flatMap(({ note }) => getCardsForNote(note.id)).sort((a, b) => a.id - b.id);
    return { noteTypeId: noteType.id, cardRows };
}

describe('note-type edits leave every card as it was', () => {
    it('adding, moving and removing a field', () => {
        const { noteTypeId, cardRows } = studiedNotes();
        const before = cardRows();
        expect(before).toHaveLength(4);
        applyFieldEdit(noteTypeId, addField(getNoteType(noteTypeId)!, 'Extra'));
        applyFieldEdit(noteTypeId, moveField(getNoteType(noteTypeId)!, 2, 0));
        applyFieldEdit(noteTypeId, removeField(getNoteType(noteTypeId)!, 0));
        expect(cardRows()).toEqual(before);
    });

    it('saving changed templates and styling', () => {
        const { noteTypeId, cardRows } = studiedNotes();
        const before = cardRows();
        const noteType = getNoteType(noteTypeId)!;
        saveNoteType({ ...updateTemplate(noteType, 0, { qfmt: '<b>{{Front}}</b>' }), css: '.card { color: red; }' });
        expect(cardRows()).toEqual(before);
    });
});
