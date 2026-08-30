import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
import {
    ankiFilteredOrderFromLegacy,
    FILTERED_DECK_ORDER_UI,
    FILTERED_SEARCH_ORDER,
} from './filteredDeckOptions';
import { filteredOrderLabel } from './i18n';
import { runMigrations } from './db';

describe('filtered deck options', () => {
    it('presents every gather order in the same sequence as Anki', () => {
        expect(FILTERED_DECK_ORDER_UI.map((order) => filteredOrderLabel('en', order))).toEqual([
            'Oldest seen first',
            'Random',
            'Increasing intervals',
            'Decreasing intervals',
            'Most lapses',
            'Order added',
            'Order due',
            'Latest added first',
            'Ascending retrievability',
            'Descending retrievability',
        ]);
    });

    it('keeps scheduler ids stable when labels are localized', () => {
        expect(FILTERED_DECK_ORDER_UI.map((order) => filteredOrderLabel('tr', order))).toEqual([
            'En eski görülen önce',
            'Rastgele',
            'Aralıklar (artan)',
            'Aralıklar (azalan)',
            'En çok unutulan',
            'Ekleniş sırası',
            'Vade sırası',
            'Son eklenen önce',
            'Hatırlanabilirlik (artan)',
            'Hatırlanabilirlik (azalan)',
        ]);
    });
});

// Anki's ordinals: proto/anki/decks.proto, Deck.Filtered.SearchTerm.Order.
describe('filtered deck gather order ordinals', () => {
    it('matches Anki’s enum, and the picker lists them in enum order', () => {
        expect(FILTERED_SEARCH_ORDER).toEqual({
            oldestReviewedFirst: 0,
            random: 1,
            intervalsAscending: 2,
            intervalsDescending: 3,
            lapses: 4,
            added: 5,
            due: 6,
            reverseAdded: 7,
            retrievabilityAscending: 8,
            retrievabilityDescending: 9,
            relativeOverdueness: 10,
        });
        expect([...FILTERED_DECK_ORDER_UI]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('maps each legacy ordinal onto the order it used to mean', () => {
        expect(ankiFilteredOrderFromLegacy(0)).toBe(FILTERED_SEARCH_ORDER.due);
        expect(ankiFilteredOrderFromLegacy(1)).toBe(FILTERED_SEARCH_ORDER.random);
        expect(ankiFilteredOrderFromLegacy(2)).toBe(FILTERED_SEARCH_ORDER.intervalsAscending);
        expect(ankiFilteredOrderFromLegacy(3)).toBe(FILTERED_SEARCH_ORDER.intervalsDescending);
        expect(ankiFilteredOrderFromLegacy(4)).toBe(FILTERED_SEARCH_ORDER.added);
        expect(ankiFilteredOrderFromLegacy(5)).toBe(FILTERED_SEARCH_ORDER.reverseAdded);
        expect(ankiFilteredOrderFromLegacy(6)).toBe(FILTERED_SEARCH_ORDER.lapses);
        expect(ankiFilteredOrderFromLegacy(7)).toBe(FILTERED_SEARCH_ORDER.oldestReviewedFirst);
        expect(ankiFilteredOrderFromLegacy(8)).toBe(FILTERED_SEARCH_ORDER.retrievabilityAscending);
        expect(ankiFilteredOrderFromLegacy(9)).toBe(FILTERED_SEARCH_ORDER.retrievabilityDescending);
    });

    it('falls back to Anki’s default order for anything unrecognised', () => {
        expect(ankiFilteredOrderFromLegacy(undefined)).toBe(FILTERED_SEARCH_ORDER.due);
        expect(ankiFilteredOrderFromLegacy('x')).toBe(FILTERED_SEARCH_ORDER.due);
        expect(ankiFilteredOrderFromLegacy(42)).toBe(FILTERED_SEARCH_ORDER.due);
    });
});

describe('migration 10: stored filtered-deck order', () => {
    let SQL: Awaited<ReturnType<typeof initSqlJs>>;
    let db: SyncDb;

    beforeAll(async () => {
        SQL = await initSqlJs();
    });

    beforeEach(() => {
        db = createAppDb(SQL);
        // Stand where an existing collection stood before this change: schema v9, decks saved
        // with the old local numbering.
        db.execSync('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);');
        db.runSync('INSERT INTO schema_version (version) VALUES (9)');
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        db.close();
    });

    const saveRawDeck = (id: number, deck: Record<string, unknown>) => {
        db.runSync(
            'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
            id,
            String(deck.name),
            JSON.stringify(deck),
        );
    };
    const readDeck = (id: number) => JSON.parse(
        db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE id = ?', id)!.data,
    );

    it('rewrites both filter terms of a filtered deck and leaves normal decks alone', () => {
        saveRawDeck(1, {
            id: 1, name: 'Oturum', isFiltered: true,
            searchQuery: 'deck:"Tıp"', searchOrder: 4,
            searchQuery2: 'deck:"Tıp" is:due', searchOrder2: 0,
        });
        saveRawDeck(2, { id: 2, name: 'Tıp', isFiltered: false, searchOrder: 4 });

        runMigrations(db as never);

        expect(readDeck(1)).toMatchObject({
            searchOrder: FILTERED_SEARCH_ORDER.added,
            searchOrder2: FILTERED_SEARCH_ORDER.due,
        });
        // A normal deck has no gather order; its stray field must not be reinterpreted.
        expect(readDeck(2).searchOrder).toBe(4);
        expect(db.getFirstSync<{ version: number }>('SELECT version FROM schema_version')?.version).toBe(10);
    });

    it('leaves a filtered deck without a stored order untouched', () => {
        saveRawDeck(3, { id: 3, name: 'Oturum', isFiltered: true, searchQuery: 'deck:"Tıp"' });

        runMigrations(db as never);

        expect(readDeck(3).searchOrder).toBeUndefined();
    });
});
