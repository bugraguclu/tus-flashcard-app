// Deck naming and hierarchy: https://docs.ankiweb.net/getting-started.html#decks
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbUpsertFtsCard: () => {} }));
import { createDeck, deleteDeck, getDeck, getDeckByName, renameDeck, getBuriedCountForDeck, unburyDeck } from './deckStore';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());
function legacy(id: number, name: string) { db.runSync('INSERT INTO decks (id,name,data) VALUES (?,?,?)', id, name, JSON.stringify({id,name,configId:1,isFiltered:false})); }
describe('normalized deck names and exact legacy subtrees', () => {
 it('resolves case variants to the same deck including Unicode', () => {
  const deck = createDeck('Biology');
  expect(createDeck('biology').id).toBe(deck.id);
  const unicode = createDeck('Ünite');
  expect(getDeckByName('ünite')?.id).toBe(unicode.id);
 });
 it('trims each hierarchy component, normalizes NFC and names empty components', () => {
  const root = createDeck('Biology');
  const child = createDeck(' Biology :: Cells ');
  expect(child.name).toBe('Biology::Cells');
  expect(getDeckByName('Biology')?.id).toBe(root.id);
  expect(createDeck('A::::B').name).toBe('A::blank::B');
  expect(createDeck('Chem::').name).toBe('Chem::blank');
  expect(createDeck('Cafe\u0301').name).toBe('Café');
 });
 it('does not delete a legacy sibling tree that differs by case', () => {
  legacy(10, 'Bio'); legacy(11, 'Bio::Cells'); legacy(12, 'bio'); legacy(13, 'bio::Genes');
  deleteDeck(10);
  expect(getDeck(11)).toBeNull();
  expect(getDeck(13)?.name).toBe('bio::Genes');
 });
 it('does not rename a legacy sibling tree that differs by case', () => {
  legacy(10, 'Bio'); legacy(11, 'Bio::Cells'); legacy(12, 'bio'); legacy(13, 'bio::Genes');
  renameDeck(10, 'Zoo');
  expect(getDeck(11)?.name).toBe('Zoo::Cells');
  expect(getDeck(13)?.name).toBe('bio::Genes');
 });
});

import { createNote, saveAnkiCard, getAnkiCard } from './noteStore';
import { BUILTIN_NOTE_TYPES } from './models';
it('counts and unburies only the exact legacy subtree', () => {
 legacy(10, 'Bio'); legacy(11, 'Bio::Cells'); legacy(12, 'bio'); legacy(13, 'bio::Genes');
 const a = createNote(BUILTIN_NOTE_TYPES[0], ['A','B'], 11).cards[0];
 const b = createNote(BUILTIN_NOTE_TYPES[0], ['C','D'], 13).cards[0];
 saveAnkiCard({ ...a, queue: -3 }); saveAnkiCard({ ...b, queue: -3 });
 expect(getBuriedCountForDeck(10)).toBe(1);
 expect(unburyDeck(10)).toBe(1);
 expect(getAnkiCard(b.id)?.queue).toBe(-3);
});

it('keeps default deck id 1 available after deleting its contents', () => {
 legacy(1, 'Renamed Default'); legacy(2, 'Renamed Default::Child');
 const result = deleteDeck(1);
 expect(getDeck(1)?.name).toBe('Default');
 expect(getDeck(2)).toBeNull();
 result!.undo();
 expect(getDeck(1)?.name).toBe('Renamed Default');
 expect(getDeck(2)?.name).toBe('Renamed Default::Child');
});
