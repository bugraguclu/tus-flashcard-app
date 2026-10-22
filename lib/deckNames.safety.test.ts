// Deck naming and hierarchy: https://docs.ankiweb.net/getting-started.html#decks
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbUpsertFtsCard: () => {} }));
import { createDeck, deleteDeck, getDeck, getDeckByName, renameDeck } from './deckStore';
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
