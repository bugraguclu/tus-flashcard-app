// SQLite refuses a statement with more than 32,766 bound variables
// (https://www.sqlite.org/limits.html#max_variable_number). Filtered-deck reservations have no
// such bound, so excluding them must not spend one variable per card.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbIndexAllCards() {}, dbUpsertFtsCard() {} }));
import { seedBase, settings } from '../test/studyQueueFixtures';
import { createFilteredDeck } from './filteredDecks';
import { reservedFilteredCardIds } from './filteredDeckMembership';
import { getStudyQueue } from './studyQueue';
import { saveDeck } from './deckManager';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());

const RESERVED = 33_000;
const FIRST_ID = 500_000;

/** One new card per note, inserted in bulk so the fixture stays fast at this size. */
function insertNewCards(deckId: number, extra: Record<string, number> = {}) {
    db.runSync(
        `WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < ?)
         INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone)
         SELECT ? + n, 4, 'Q' || n, 0, '', json_object('id', ? + n, 'guid', 'bulk-' || n, 'noteTypeId', 4, 'mod', 0,
             'usn', -1, 'tags', json_array(), 'fields', json_array('Q' || n, 'A', ''), 'sfld', 'Q' || n, 'csum', 0, 'flags', 0),
             0, -1, 0
         FROM seq`,
        RESERVED - 1, FIRST_ID, FIRST_ID,
    );
    db.runSync(
        `WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < ?)
         INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
         SELECT ? + n, ? + n, ?, 0, 0, 0, ? + n, 0, 0, 0, 0, 0, 0,
             json_patch(json_object('id', ? + n, 'noteId', ? + n, 'deckId', ?, 'ord', 0, 'mod', 0, 'usn', -1, 'type', 0, 'queue', 0,
                 'due', ? + n, 'ivl', 0, 'factor', 0, 'reps', 0, 'lapses', 0, 'left', 0, 'odue', 0, 'odid', 0, 'flags', 0, 'lastReview', 0), ?),
             0, 0, -1, 0
         FROM seq`,
        RESERVED - 1, FIRST_ID, FIRST_ID, deckId, FIRST_ID, FIRST_ID, FIRST_ID, deckId, FIRST_ID, JSON.stringify(extra),
    );
}

const newIds = (deckName: string) => getStudyQueue({ settings, selectedDeckName: deckName }).cards
    .filter((card) => card.state.status === 'new')
    .map((card) => card.cardId)
    .sort();

describe('filtered-deck reservations past SQLite\'s variable limit', () => {
    it('builds the home queue and a second filtered deck around a 33,000-card build', () => {
        insertNewCards(2);
        const big = createFilteredDeck('Big', 'deck:"Python::Temeller" is:new', 99_999);
        expect(reservedFilteredCardIds()).toHaveLength(RESERVED + 1);

        expect(newIds('Python')).toEqual([1010, 1020]);
        expect(getStudyQueue({ settings, selectedDeckName: 'Python' }).stats.newCount).toBe(2);

        const second = createFilteredDeck('Second', 'is:new', 100);
        expect(newIds(second.name)).toEqual([1010, 1020]);
        expect(reservedFilteredCardIds(big.id).sort()).toEqual([1010, 1020]);
    });

    it('builds around an imported filtered deck physically holding 33,000 cards', () => {
        saveDeck({
            id: 60, name: 'Imported', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: true,
            searchQuery: 'nid:424242', searchLimit: 100, filteredBuildAt: 1, filteredDeckEmpty: false, filteredDoneCardIds: [],
        });
        insertNewCards(60, { odid: 2 });

        expect(newIds('Python')).toEqual([1010, 1020, 1030]);
        expect(reservedFilteredCardIds()).toHaveLength(RESERVED);
        expect(newIds(createFilteredDeck('Second', 'is:new', 100).name)).toEqual([1010, 1020, 1030]);
    });
});
