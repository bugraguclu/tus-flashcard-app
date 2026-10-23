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
import { answerStudyCard, undoAnswer } from './studyAnswer';
import { getDeckListSnapshot } from './deckListSnapshot';
import { dayNumberToYmd, localDayNumber } from './ankiState';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());
const ids = (name: string) => getStudyQueue({ settings, selectedDeckName: name }).cards.map((card) => card.cardId);
describe('AI-2 fixed filtered builds', () => {
    it('holds one random membership and excludes it from the home queue', () => {
        createFilteredDeck('Session', 'is:new', 2);
        const first = ids('Session');
        for (let i = 0; i < 8; i++) expect(ids('Session')).toEqual(first);
        expect(ids('Python').filter((id) => first.includes(id))).toEqual([]);
    });
    it('does not refill completed slots or drop a card after it stops matching', () => {
        const deck = createFilteredDeck('Session', 'is:new', 1);
        const [id] = ids('Session');
        saveAnkiCard({ ...getAnkiCard(id)!, type: 1, queue: 1, due: Date.now() - 1, left: 1 });
        expect(ids('Session')).toEqual([id]);
        completeFilteredCard(deck.id, id);
        expect(ids('Session')).toEqual([]);
        rebuildFilteredDeck(deck.id);
        expect(ids('Session')).toHaveLength(1);
    });
    it('a second filter fills its limit after excluding cards taken by the first', () => {
        const deck = createFilteredDeck('Session', 'is:new', 1);
        updateFilteredDeck(deck.id, { searchQuery: 'is:new', searchLimit: 1, searchOrder: 5, searchQuery2: 'is:new', searchLimit2: 2, searchOrder2: 5, reschedule: true });
        expect(ids('Session')).toHaveLength(3);
    });
    it('prevents two filtered decks from claiming the same card', () => {
        createFilteredDeck('One', 'is:new', 2);
        const first = ids('One');
        createFilteredDeck('Two', 'is:new', 2);
        expect(ids('Two').filter((id) => first.includes(id))).toEqual([]);
        expect(ids('Two')).toHaveLength(1);
    });
    it('empty returns imported physical cards home while retaining suspend/bury', () => {
        const deck = createFilteredDeck('Session', 'is:new', 1);
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveAnkiCard(makeCard(1010, 101, deck.id, { odid: 7, odue: today, type: 2, queue: -1, due: -100000, ivl: 10 }));
        emptyFilteredDeck(deck.id);
        expect(getAnkiCard(1010)).toMatchObject({ deckId: 7, odid: 0, odue: 0, queue: -1, due: today });
        expect(ids('Session')).toEqual([]);
    });
    it('accepts an entire quoted deck term', () => {
        createFilteredDeck('Session', '"deck:Python::Modüller & Hata Ayıklama" is:new', 10);
        expect(ids('Session').sort()).toEqual([1010, 1020]);
    });
    it('answers an imported physical review using home due and returns its new schedule home', () => {
        const deck = createFilteredDeck('Session', 'nid:101', 1);
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveAnkiCard(makeCard(1010, 101, deck.id, { odid: 7, odue: today + 1, type: 2, queue: 2, due: -100000, ivl: 1, factor: 2500 }));
        const shown = getStudyQueue({ settings, selectedDeckName: 'Session' }).cards.find((card) => card.cardId === 1010)!;
        expect(shown.state.dueDate).toBe(dayNumberToYmd(today + 1));
        const result = answerStudyCard(1010, 3, settings, 100);
        expect(getAnkiCard(1010)).toMatchObject({ deckId: 7, odid: 0, odue: 0, due: today + 1, ivl: 1 });
        undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);
        expect(getAnkiCard(1010)).toMatchObject({ deckId: deck.id, odid: 7, odue: today + 1, due: -100000, ivl: 1 });
    });

    it('a future filtered review does not subtract an unrelated due review from the home count', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveAnkiCard({ ...getAnkiCard(1010)!, type: 2, queue: 2, due: today + 10, ivl: 10 });
        saveAnkiCard({ ...getAnkiCard(1020)!, type: 2, queue: 2, due: today, ivl: 10 });
        createFilteredDeck('Ahead', 'nid:101', 1);
        expect(getDeckListSnapshot(settings).counts.get(7)!.review).toBe(1);
    });

    it('fixed membership counts card IDs independently of their timestamp-shaped value', () => {
        saveAnkiCard(makeCard(Date.now() + 86400000, 101, 7));
        const deck = createFilteredDeck('Session', 'nid:101', 10);
        expect(ids('Session')).toHaveLength(2);
        expect(getDeckListSnapshot(settings).counts.get(deck.id)!.total).toBe(2);
    });

});
