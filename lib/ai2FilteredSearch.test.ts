// Behavioral reference only: https://docs.ankiweb.net/filtered-decks.html#home-decks
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbIndexAllCards() {}, dbUpsertFtsCard() {}, dbDeleteFtsCard() {}, dbSearchCards: () => [] }));
import { seedBase, settings, makeCard } from '../test/studyQueueFixtures';
import { createFilteredDeck, updateFilteredDeck, rebuildFilteredDeck, emptyFilteredDeck, completeFilteredCard } from './filteredDecks';
import { getStudyQueue } from './studyQueue';
import { getAnkiCard, saveAnkiCard } from './noteManager';
import { localDayNumber } from './ankiState';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());
const ids = (name: string) => getStudyQueue({ settings, selectedDeckName: name }).cards.map((card) => card.cardId);
describe('AI-2 filtered SQL terms', () => {
    it.each([
        ['"deck:Python::Modüller & Hata Ayıklama" is:new', [1010, 1020]],
        ['deck:pyth*', [1010, 1020, 1030]],
        ['note:TUS', [1010, 1020, 1030]],
        ['card:1', [1010, 1020, 1030]],
        ['nid:101,102', [1010, 1020]],
        ['Soru:randint', [1010]],
        ['-Soru:randint', [1020, 1030]],
    ])('gathers %s', (query, expected) => {
        createFilteredDeck('Session', query, 10);
        expect(ids('Session').sort()).toEqual(expected);
    });
    it('introduced ignores preview answers and uses the first regular answer', () => {
        db.runSync('INSERT INTO revlog (id, cardId, ease, type) VALUES (?, ?, 3, 0)', Date.now(), 1010);
        db.runSync('INSERT INTO revlog (id, cardId, ease, type) VALUES (?, ?, 3, 3)', Date.now() + 1, 1020);
        createFilteredDeck('Session', 'introduced:1', 10);
        expect(ids('Session')).toEqual([1010]);
    });
});
