// The deck list a new learner meets: Anki hides an empty Default deck once other decks exist
// ("Anki will hide the default deck if it contains no cards and you have added other decks",
// https://docs.ankiweb.net/getting-started.html#decks), and the welcome card stays until the
// learner has a card of their own or closes it (docs/user-guide/in-app/01-decks.md, help.decks.firstRun.card).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbIndexAllCards() {}, dbUpsertFtsCard() {} }));
import { deckConfig, makeCard, makeNote, noteType, settings } from '../test/studyQueueFixtures';
import { saveAnkiCard, saveNote, saveNoteType } from './noteManager';
import { saveDeck, saveDeckConfig } from './deckManager';
import { getDeckListSnapshot } from './deckListSnapshot';
import { CATALOG_PACK_ID } from './catalogRows';
import type { Deck } from './models';
import type { DeckTreeNode } from './deckTree';
import {
    DEFAULT_DECK_ID,
    dismissFirstRunCard,
    isFirstRunCardDismissed,
    shouldShowFirstRunCard,
    withoutEmptyDefaultDeck,
} from './deckListFirstRun';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL);
    holder.db = db;
    saveDeckConfig(deckConfig);
    saveNoteType(noteType);
    saveDeck(deck(DEFAULT_DECK_ID, 'Varsayılan'));
});
afterEach(() => db.close());

function deck(id: number, name: string, extra: Partial<Deck> = {}): Deck {
    return { id, name, configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false, ...extra };
}

let nextNote = 500;
function addCard(deckId: number) {
    const noteId = nextNote++;
    saveNote(makeNote(noteId, [], [`Soru ${noteId}`, 'Cevap']));
    saveAnkiCard(makeCard(noteId * 10, noteId, deckId));
}

const rootNames = () => getDeckListSnapshot(settings).tree.map((node) => node.deck.name);

describe('the deck list a new learner meets', () => {
    it('shows the empty Default deck while it is the only deck', () => {
        expect(rootNames()).toEqual(['Varsayılan']);
        expect(getDeckListSnapshot(settings).ownCardCount).toBe(0);
    });

    it('hides the empty Default deck once another deck exists, even an empty one', () => {
        saveDeck(deck(20, 'Farmakoloji'));
        expect(rootNames()).toEqual(['Farmakoloji']);
    });

    it('brings the Default deck back as soon as it holds a card', () => {
        saveDeck(deck(20, 'Farmakoloji'));
        addCard(DEFAULT_DECK_ID);
        expect(rootNames()).toEqual(expect.arrayContaining(['Varsayılan', 'Farmakoloji']));
        expect(getDeckListSnapshot(settings).ownCardCount).toBe(1);
    });

    it('keeps an empty Default deck that has subdecks', () => {
        saveDeck(deck(20, 'Farmakoloji'));
        saveDeck(deck(21, 'Varsayılan::Notlar'));
        expect(rootNames()).toEqual(expect.arrayContaining(['Varsayılan', 'Farmakoloji']));
    });

    it('counts only cards outside the TUS pack as the learner\'s own', () => {
        // The installer writes the pack's rows itself; saveDeck refuses a pack deck by design.
        const pack = deck(30, 'TUS Kartları', { catalogPack: CATALOG_PACK_ID });
        db.runSync(
            'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
            pack.id, pack.name, JSON.stringify(pack),
        );
        addCard(30);
        addCard(30);
        const snapshot = getDeckListSnapshot(settings);
        expect(snapshot.ownCardCount).toBe(0);
        // The pack is another deck, so the empty Default deck steps aside for it.
        expect(snapshot.tree.map((node) => node.deck.name)).toEqual(['TUS Kartları']);

        saveDeck(deck(20, 'Farmakoloji'));
        addCard(20);
        expect(getDeckListSnapshot(settings).ownCardCount).toBe(1);
    });

    it('leaves a tree without the Default deck as it is', () => {
        const node = (id: number, name: string, totalCards = 0): DeckTreeNode => ({
            deck: deck(id, name), children: [], depth: 0, newCount: 0, learnCount: 0, reviewCount: 0, totalCards,
        });
        const tree = [node(20, 'Farmakoloji'), node(21, 'Patoloji', 3)];
        expect(withoutEmptyDefaultDeck(tree)).toBe(tree);
        expect(withoutEmptyDefaultDeck([node(DEFAULT_DECK_ID, 'Varsayılan')])).toHaveLength(1);
    });
});

describe('the welcome card', () => {
    it('shows until the learner has a card of their own or closes it', () => {
        expect(shouldShowFirstRunCard(0, false)).toBe(true);
        expect(shouldShowFirstRunCard(1, false)).toBe(false);
        expect(shouldShowFirstRunCard(0, true)).toBe(false);
    });

    it('stays closed once dismissed', () => {
        expect(isFirstRunCardDismissed()).toBe(false);
        dismissFirstRunCard();
        expect(isFirstRunCardDismissed()).toBe(true);
    });
});
