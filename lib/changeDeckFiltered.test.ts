// Change Deck on a card that sits physically in a filtered deck (only imported Anki packages put
// one there). Anki's `Card::set_deck` takes the card out of the filtered deck first, so it lands in
// the chosen deck on its original due rather than carrying the filtered deck's due and home deck.
// https://docs.ankiweb.net/browsing.html#cards (Change Deck), https://docs.ankiweb.net/filtered-decks.html
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbUpsertFtsCard: () => {} }));
import { BUILTIN_NOTE_TYPES } from './models';
import { createNote, getAnkiCard, moveCardsToDeck, saveAnkiCard, undoCardsMovedToDeck } from './noteStore';
import { createDeck } from './deckStore';
import { createFilteredDeck } from './filteredDecks';
import { updateTusCardByCardId } from './tusCards';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());

/** A review card due in its home deck on day 500, gathered into an imported filtered deck. */
function cardInFilteredDeck() {
    const home = createDeck('Home');
    const target = createDeck('Target');
    const filtered = createFilteredDeck('Imported Filter', 'deck:Home', 100);
    const { cards } = createNote(BUILTIN_NOTE_TYPES[0], ['Front', 'Back'], home.id);
    saveAnkiCard({ ...cards[0], type: 2, queue: 2, ivl: 9, due: -100000, deckId: filtered.id, odid: home.id, odue: 500 });
    return { home, target, filtered, cardId: cards[0].id };
}

describe('Change Deck from a filtered deck', () => {
    it('brings the card home first, then into the chosen deck', () => {
        const { target, cardId } = cardInFilteredDeck();
        moveCardsToDeck([cardId], target.id);
        expect(getAnkiCard(cardId)).toMatchObject({ deckId: target.id, odid: 0, odue: 0, due: 500, queue: 2, type: 2, ivl: 9 });
    });

    it('a new card gets its original position back', () => {
        const home = createDeck('Home');
        const target = createDeck('Target');
        const filtered = createFilteredDeck('Imported Filter', 'deck:Home', 100);
        const { cards } = createNote(BUILTIN_NOTE_TYPES[0], ['Front', 'Back'], home.id);
        saveAnkiCard({ ...cards[0], type: 0, queue: 0, due: -100000, deckId: filtered.id, odid: home.id, odue: 42 });
        moveCardsToDeck([cards[0].id], target.id);
        expect(getAnkiCard(cards[0].id)).toMatchObject({ deckId: target.id, odid: 0, odue: 0, due: 42, queue: 0 });
    });

    it('keeps a suspension', () => {
        const { target, cardId } = cardInFilteredDeck();
        saveAnkiCard({ ...getAnkiCard(cardId)!, queue: -1 });
        moveCardsToDeck([cardId], target.id);
        expect(getAnkiCard(cardId)).toMatchObject({ deckId: target.id, odid: 0, due: 500, queue: -1 });
    });

    it('undo puts an untouched card back into the filtered deck as it was', () => {
        const { filtered, home, target, cardId } = cardInFilteredDeck();
        const moves = moveCardsToDeck([cardId], target.id);
        undoCardsMovedToDeck(moves);
        expect(getAnkiCard(cardId)).toMatchObject({ deckId: filtered.id, odid: home.id, odue: 500, due: -100000, queue: 2 });
    });

    it('undo sends a card studied since to its home deck, not into the filtered deck', () => {
        const { home, target, cardId } = cardInFilteredDeck();
        const moves = moveCardsToDeck([cardId], target.id);
        saveAnkiCard({ ...getAnkiCard(cardId)!, due: 530, ivl: 30 });
        undoCardsMovedToDeck(moves);
        expect(getAnkiCard(cardId)).toMatchObject({ deckId: home.id, odid: 0, odue: 0, due: 530, ivl: 30 });
    });

    it('the editor deck picker takes the card out of the filtered deck the same way', () => {
        const { target, cardId } = cardInFilteredDeck();
        updateTusCardByCardId(cardId, { question: 'Front', answer: 'Back', deckId: target.id });
        expect(getAnkiCard(cardId)).toMatchObject({ deckId: target.id, odid: 0, odue: 0, due: 500, queue: 2 });
    });
});
