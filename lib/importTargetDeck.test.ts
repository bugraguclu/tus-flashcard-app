import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
    buildFtsPrefixQuery: () => '',
}));

import { createDeck, getAllDecks, getDeck, getDeckByName, saveDeck } from './deckManager';
import { DEFAULT_DECKS } from './models';
import { resolveInitialTargetDeckId } from './importTargetDeck';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    db = createAppDb(SQL);
    dbHolder.db = db;
    // Seed default deck as an initial launch does
    for (const d of DEFAULT_DECKS) {
        saveDeck(d);
    }
});

afterEach(() => {
    db.close();
});

describe('import target deck resolution and picker selection', () => {
    it('defaults to Varsayılan (deck id: 1) on standard import without parameters', () => {
        const resolvedId = resolveInitialTargetDeckId();
        expect(resolvedId).toBe(1);

        const deck = getDeck(resolvedId);
        expect(deck).not.toBeNull();
        expect(deck?.name).toBe('Varsayılan');
    });

    it('honours explicit deckId or deckName route parameters', () => {
        const customDeck = createDeck('Özel Deste');

        expect(resolveInitialTargetDeckId({ deckId: String(customDeck.id) })).toBe(customDeck.id);
        expect(resolveInitialTargetDeckId({ deckName: 'Özel Deste' })).toBe(customDeck.id);
        expect(resolveInitialTargetDeckId({ deck: 'Özel Deste' })).toBe(customDeck.id);
    });

    it('immediately retrieves a newly created deck with getDeckByName before React state updates', () => {
        // Simulating the scenario where the deck picker prop array is stale:
        const staleDeckPickerDecks = getAllDecks().filter((d) => !d.isFiltered);
        expect(staleDeckPickerDecks.find((d) => d.name === 'Yeni Eklenen Deste')).toBeUndefined();

        // User taps "+ Yeni Deste" in DeckPickerModal:
        const created = createDeck('Yeni Eklenen Deste');
        expect(created.name).toBe('Yeni Eklenen Deste');

        // Old buggy behavior would fail:
        const oldLookup = staleDeckPickerDecks.find((d) => d.name === created.name);
        expect(oldLookup).toBeUndefined();

        // Fixed behavior immediately resolves from DB via getDeckByName:
        const newLookup = getDeckByName(created.name) ?? staleDeckPickerDecks.find((d) => d.name === created.name);
        expect(newLookup).toBeDefined();
        expect(newLookup?.id).toBe(created.id);
        expect(newLookup?.name).toBe('Yeni Eklenen Deste');
    });
});
