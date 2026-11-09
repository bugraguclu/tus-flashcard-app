// Anki shows Unbury on a filtered deck that has buried cards, and a card in a filtered deck belongs
// to that deck rather than to its home deck (https://docs.ankiweb.net/filtered-decks.html,
// https://docs.ankiweb.net/studying.html#burying). Here a filtered deck's membership is virtual.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbIndexAllCards() {}, dbUpsertFtsCard() {} }));
import { seedBase, settings } from '../test/studyQueueFixtures';
import { createFilteredDeck } from './filteredDecks';
import { getStudyQueue } from './studyQueue';
import { getAnkiCard, saveAnkiCard } from './noteManager';
import { getBuriedCountForDeck, getBuriedKindsForDeck, getDeckByName, unburyDeck } from './deckManager';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());

const bury = (cardId: number, queue: -2 | -3) => saveAnkiCard({ ...getAnkiCard(cardId)!, queue });

describe("a filtered deck's buried cards", () => {
    it('are counted and unburied on the filtered deck, not on the home deck', () => {
        const filtered = createFilteredDeck('Session', 'nid:101', 1);
        // The first serving stores the build.
        expect(getStudyQueue({ settings, selectedDeckName: 'Session' }).cards.map((card) => card.cardId)).toEqual([1010]);
        const homeDeckId = getAnkiCard(1010)!.deckId;
        const home = getDeckByName('Python')!;
        const homeBefore = getBuriedCountForDeck(home.id);
        bury(1010, -3);

        expect(getBuriedCountForDeck(filtered.id)).toBe(1);
        expect(getBuriedKindsForDeck(filtered.id)).toEqual({ manual: 1, siblings: 0 });
        // The home deck does not count, or wake, a card the filtered deck holds.
        expect(getBuriedCountForDeck(home.id)).toBe(homeBefore);
        expect(getBuriedCountForDeck(homeDeckId)).toBe(0);
        expect(unburyDeck(home.id, settings.dayRolloverHour)).toBe(homeBefore);
        expect(getAnkiCard(1010)!.queue).toBe(-3);

        expect(unburyDeck(filtered.id, settings.dayRolloverHour, 'manual')).toBe(1);
        expect(getAnkiCard(1010)!.queue).toBeGreaterThanOrEqual(0);
        expect(getBuriedCountForDeck(filtered.id)).toBe(0);
    });

    it('still counts a regular deck subtree as before', () => {
        const home = getDeckByName('Python')!;
        bury(1010, -2);
        expect(getBuriedKindsForDeck(home.id)).toMatchObject({ siblings: expect.any(Number) });
        expect(getBuriedCountForDeck(home.id)).toBeGreaterThanOrEqual(1);
        expect(unburyDeck(home.id, settings.dayRolloverHour, 'siblings')).toBeGreaterThanOrEqual(1);
        expect(getAnkiCard(1010)!.queue).toBeGreaterThanOrEqual(0);
    });
});
