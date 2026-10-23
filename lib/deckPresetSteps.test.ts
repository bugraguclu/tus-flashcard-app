// Independent behavioral contract: learning progress survives preset step changes.
// https://github.com/ankitects/anki/blob/main/rslib/src/card/mod.rs
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db, buildFtsPrefixQuery: () => '', dbUpsertFtsCard: () => {} }));
import { DEFAULT_DECK_CONFIG, BUILTIN_NOTE_TYPES } from './models';
import { createDeck } from './deckStore';
import { createNote, saveAnkiCard, getAnkiCard } from './noteStore';
import { saveDeckConfig, assignDeckConfig, getDeckConfig } from './deckPresets';
let SQL: Awaited<ReturnType<typeof initSqlJs>>; let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); h.db = db; });
afterEach(() => db.close());
describe('remaining steps after changing a preset', () => {
 it.each([1, 3])('preserves the last passed delay for learning type %s', type => {
  saveDeckConfig({ ...DEFAULT_DECK_CONFIG, learningSteps: [1,10], relearningSteps: [1,10] });
  const deck = createDeck('Learning');
  const { cards } = createNote(BUILTIN_NOTE_TYPES[0], ['Front','Back'], deck.id);
  const card = { ...cards[0], type: type as 1 | 3, queue: -1 as const, left: 1001, due: 1792700000000 };
  saveAnkiCard(card);
  saveDeckConfig({ ...DEFAULT_DECK_CONFIG, learningSteps: [1,10,60,1440], relearningSteps: [1,10,60,1440] });
  expect(getAnkiCard(card.id)).toMatchObject({ left: 3, due: card.due, queue: -1, type });
 });
});

it('remaps steps when a deck is assigned to a different preset', () => {
 saveDeckConfig({ ...DEFAULT_DECK_CONFIG, learningSteps: [1,10] });
 saveDeckConfig({ ...DEFAULT_DECK_CONFIG, id: 2, learningSteps: [1,10,60] });
 const deck = createDeck('Learning');
 const { cards } = createNote(BUILTIN_NOTE_TYPES[0], ['Front','Back'], deck.id);
 saveAnkiCard({ ...cards[0], type: 1, queue: 1, left: 1 });
 assignDeckConfig(deck.id, 2);
 expect(getAnkiCard(cards[0].id)?.left).toBe(2);
});

it('rolls back the preset together with card counters on a write failure', () => {
 saveDeckConfig({ ...DEFAULT_DECK_CONFIG, learningSteps: [1,10] });
 const deck = createDeck('Atomic');
 const { cards } = createNote(BUILTIN_NOTE_TYPES[0], ['Front','Back'], deck.id);
 saveAnkiCard({ ...cards[0], type: 1, queue: 1, left: 1 });
 const original = db.runSync;
 h.db = { ...db, runSync(sql: string, ...params: any[]) {
  if (sql.startsWith('UPDATE anki_cards SET "left"')) throw new Error('injected failure');
  return original(sql, ...params);
 } };
 expect(() => saveDeckConfig({ ...DEFAULT_DECK_CONFIG, learningSteps: [1,10,60] })).toThrow('injected failure');
 expect(getDeckConfig(1).learningSteps).toEqual([1,10]);
 expect(getAnkiCard(cards[0].id)?.left).toBe(1);
});
