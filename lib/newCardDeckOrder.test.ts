// Behavioral reference only: https://docs.ankiweb.net/deck-options.html (New card gather order)
// "Deck" gathers new cards deck by deck in the order the decks appear in the deck list, with a
// parent before its subdecks. Here the deck list also honours the learner's own deck ordering.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbIndexAllCards() {}, dbUpsertFtsCard() {}, dbDeleteFtsCard() {}, dbSearchCards: () => [] }));
import { seedBase, settings, makeCard, makeNote } from '../test/studyQueueFixtures';
import { saveAnkiCard, saveNote } from './noteManager';
import { buildDeckTree, decksInDisplayOrder, flattenDeckTree, getAllDecks, getDeck, saveDeck } from './deckManager';
import { getStudyQueue, type StudyQueueParams } from './studyQueue';
import type { AppSettings } from './types';
import type { Deck } from './models';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());

const deck = (id: number, name: string, extra: Partial<Deck> = {}): void =>
    saveDeck({ id, name, configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false, ...extra });
const reorder = (id: number, sortOrder: number) => saveDeck({ ...getDeck(id)!, sortOrder });
const addNewCard = (cardId: number, deckId: number, due = cardId) => {
    saveNote(makeNote(cardId, [], [`Q${cardId}`, 'A']));
    saveAnkiCard(makeCard(cardId, cardId, deckId, { due }));
};
const newIds = (params: Partial<StudyQueueParams> = {}, overrides: Partial<AppSettings> = {}) =>
    getStudyQueue({ settings: { ...settings, ...overrides }, ...params }).cards
        .filter((card) => card.state.status === 'new')
        .map((card) => card.cardId);
const treeOrder = () => flattenDeckTree(buildDeckTree(getAllDecks()), true).map((node) => node.deck.id);

describe('deck list display order', () => {
    it('lists decks exactly as the deck tree does', () => {
        deck(8, 'Python::A');
        deck(9, 'Python 2', { sortOrder: 1 });
        deck(10, 'Python-B', { sortOrder: 0 });
        deck(11, 'Python::Temeller::Alt');
        deck(12, 'Yetim::Çocuk');
        deck(13, 'Filtre', { isFiltered: true, searchQuery: 'is:new' });
        reorder(2, 0);
        reorder(7, 1);

        expect(decksInDisplayOrder(getAllDecks()).map((entry) => entry.id)).toEqual(treeOrder());
    });
});

describe('new-card "deck" gather order', () => {
    it('follows a learner\'s reordered decks and the course topic order inside a deck', () => {
        // Moved Temeller above Modüller & Hata Ayıklama; inside that deck the course lists
        // Modüller (1020) before random (1010).
        reorder(2, 0);
        reorder(7, 1);
        expect(newIds({ selectedDeckName: 'Python' })).toEqual([1030, 1020, 1010]);

        reorder(2, 1);
        reorder(7, 0);
        expect(newIds({ selectedDeckName: 'Python' })).toEqual([1020, 1010, 1030]);
    });

    it('keeps a deck\'s subdecks together instead of interleaving look-alike deck names', () => {
        deck(8, 'Python::A');
        deck(9, 'Python 2', { sortOrder: 1 });
        deck(10, 'Python-B', { sortOrder: 2 });
        reorder(1, 0);
        addNewCard(1040, 8);
        addNewCard(1050, 9);
        addNewCard(1060, 10);

        expect(newIds()).toEqual([1040, 1020, 1010, 1030, 1050, 1060]);
    });

    it('takes the 200-card window in the order it serves, with Turkish deck names', () => {
        const names = ['Çocuk', 'Dahiliye', 'İç Hastalıkları', 'Jinekoloji', 'Ödev', 'Psikiyatri', 'Şok', 'Tıp', 'Üroloji', 'Vaka'];
        deck(30, 'Bölümler');
        // Later decks get the lower positions, so neither position nor byte order can stand in
        // for the deck list.
        names.forEach((name, index) => {
            deck(31 + index, `Bölümler::${name}`);
            for (let card = 0; card < 30; card++) addNewCard(100_000 + index * 100 + card, 31 + index, 10_000 - index * 100 + card);
        });
        const expected = treeOrder().flatMap((deckId) => {
            const index = deckId - 31;
            return index >= 0 && index < names.length
                ? Array.from({ length: 30 }, (_, card) => 100_000 + index * 100 + card)
                : [];
        });
        // The deck list reads Ç as a C, before D; SQLite's NOCASE compares bytes and puts it last.
        expect(treeOrder().filter((deckId) => deckId > 30).slice(0, 2)).toEqual([31, 32]);

        const served = newIds({ selectedDeckName: 'Bölümler' });
        expect(served).toHaveLength(200);
        expect(served).toEqual(expected.slice(0, 200));
    });

    it('visits decks in the deck list order when notes are shuffled inside each deck', () => {
        reorder(2, 0);
        reorder(7, 1);
        const served = newIds({ selectedDeckName: 'Python' }, { newCardGatherOrder: 'deckThenRandomNotes', newCardSortOrder: 'noSort' });
        expect(served[0]).toBe(1030);
        expect(served.slice(1).sort()).toEqual([1010, 1020]);
    });
});
