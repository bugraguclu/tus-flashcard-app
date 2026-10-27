// Independent behavior tests: https://docs.ankiweb.net/stats.html (deleted-note history).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbUpsertFtsCard: () => {} }));
import { BUILTIN_NOTE_TYPES } from './models';
import { legacyFieldChecksum } from './noteChecksum';
import { createNote, deleteAnkiCardsOnly, getNote, getCardsForNote, saveNote, saveAnkiCard, findDuplicateNote } from './noteStore';
import { createDeck } from './deckStore';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());

import { updateTusCardByCardId } from './tusCards';
import { findEmptyCards, changeNotesType, saveNoteType } from './noteTypeStore';
import { NoteTypeChangeConfirmationRequired } from './noteTypeChange';
import type { NoteType } from './models';
const builtin = (id: number) => BUILTIN_NOTE_TYPES.find(t => t.id === id)!;
function noteOf(type: NoteType, fields: string[]) { return createNote(type, fields, createDeck('Cards').id); }
// https://docs.ankiweb.net/templates/generation.html: editing adds cards, never removes them.
describe('non-destructive card generation', () => {
 it('keeps a reviewed cloze after its deletion is removed from the text', () => {
  const { note, cards } = noteOf(builtin(3), ['{{c1::one}} {{c2::two}}', '']);
  saveAnkiCard({ ...cards[1], reps: 8, type: 2, queue: 2, ivl: 20 });
  updateTusCardByCardId(cards[0].id, { question: '{{c1::one}}', answer: '' });
  expect(getCardsForNote(note.id)).toHaveLength(2);
  expect(getCardsForNote(note.id).find(c => c.ord === 1)?.reps).toBe(8);
  expect(findEmptyCards().map(c => c.cardId)).toContain(cards[1].id);
 });
 it('creates card 1 for a cloze note without deletions', () => {
  expect(noteOf(builtin(3), ['Still valuable text', 'Extra']).cards.map(c => c.ord)).toEqual([0]);
 });
 it('unions cloze ordinals from all referenced cloze fields', () => {
  const type = { ...builtin(3), id: 100, templates: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}{{cloze:Back Extra}}', afmt: '{{cloze:Text}}{{cloze:Back Extra}}' }] };
  saveNoteType(type);
  const { cards } = noteOf(type, ['{{c1::one}}', '{{c2::two}}']);
  expect(cards.map(c => c.ord)).toEqual([0, 1]);
  expect(findEmptyCards()).toHaveLength(0);
 });
 it('keeps one card by default when every card of a note is empty', () => {
  const { note, cards } = noteOf(builtin(2), ['Front', 'Back']);
  saveNote({ ...note, fields: ['', ''] });
  deleteAnkiCardsOnly(cards.map(c => c.id));
  expect(getCardsForNote(note.id).map(c => c.ord)).toEqual([0]);
  expect(getNote(note.id)?.fields).toEqual(['', '']);
 });
 it('does not consume a source field twice when matching names before position', () => {
  const source = { ...builtin(1), id: 100, fields: [{ ...builtin(1).fields[0], name: 'A' }, { ...builtin(1).fields[1], name: 'Front' }] };
  const target = { ...builtin(1), id: 101, fields: [{ ...builtin(1).fields[0], name: 'Front' }, { ...builtin(1).fields[1], name: 'B' }] };
  saveNoteType(source); saveNoteType(target);
  const { note } = noteOf(source, ['a', 'f']);
  changeNotesType([note.id], target.id);
  expect(getNote(note.id)?.fields).toEqual(['f', 'a']);
 });
 it('maps a lone reverse card by template name instead of shifting it to the front', () => {
  const { note, cards } = noteOf(builtin(2), ['', 'Back']);
  expect(cards.map(c => c.ord)).toEqual([1]);
  saveAnkiCard({ ...cards[0], reps: 9 });
  changeNotesType([note.id], 7);
  expect(getCardsForNote(note.id).find(c => c.id === cards[0].id)).toMatchObject({ ord: 1, reps: 9 });
 });
 it('refuses unmapped-card deletion without confirmation and preserves revlog after confirmation', () => {
  const { note, cards } = noteOf(builtin(2), ['Front', 'Back']);
  db.runSync('INSERT INTO revlog (id, cardId) VALUES (?, ?)', 321, cards[1].id);
  expect(() => changeNotesType([note.id], 1)).toThrow(NoteTypeChangeConfirmationRequired);
  expect(getNote(note.id)?.noteTypeId).toBe(2);
  changeNotesType([note.id], 1, { allowCardDeletion: true });
  expect(getCardsForNote(note.id)).toHaveLength(1);
  expect(db.getAllSync('SELECT * FROM revlog')).toHaveLength(1);
 });
});

// https://docs.ankiweb.net/editing.html#duplicate-check
it('detects imported SHA1 checksums through equivalent first-field HTML and legacy local notes by their stored checksum', () => {
 const { note } = noteOf(builtin(1), ['Digoksin', 'Back']);
 db.runSync('UPDATE notes SET csum = ? WHERE id = ?', 898989217, note.id);
 expect(findDuplicateNote(1, '<b>Digoksin</b>')?.noteId).toBe(note.id);
 const legacy = noteOf(builtin(1), ['<b>kalp</b>', 'Back']);
 db.runSync('UPDATE notes SET csum = ? WHERE id = ?', legacyFieldChecksum('<b>kalp</b>'), legacy.note.id);
 expect(findDuplicateNote(1, '<b>kalp</b>')?.noteId).toBe(legacy.note.id);
});

it('reports the total unmapped card count before any bulk note-type conversion', () => {
 const a = noteOf(builtin(2), ['Front A','Back A']);
 const b = noteOf(builtin(2), ['Front B','Back B']);
 let count = 0;
 try { changeNotesType([a.note.id, b.note.id], 1); }
 catch (error) { count = (error as {cardCount:number}).cardCount; }
 expect(count).toBe(2);
 expect(getNote(a.note.id)?.noteTypeId).toBe(2);
 expect(getNote(b.note.id)?.noteTypeId).toBe(2);
});

it('finds empty cards even when their template surrounds the blank field with static text (BAK-9)', () => {
 const type = { ...builtin(1), id: 111, templates: [{ ...builtin(1).templates[0], qfmt: 'Soru: {{Front}}' }] };
 saveNoteType(type);
 const { note, cards } = noteOf(type, ['Question','Valuable answer']);
 saveNote({ ...note, fields: ['', 'Valuable answer'] });
 expect(findEmptyCards().map(entry => entry.cardId)).toContain(cards[0].id);
});
