// "⚡ Beklemeden çalış" (study now) in a filtered deck or a Custom Study session: the learning cards
// the deck holds back on a step or a preview delay are dealt at once, as in a regular deck.
// Behaviour reference: https://docs.ankiweb.net/filtered-decks.html and the learn ahead limit,
// https://docs.ankiweb.net/preferences.html#learn-ahead-limit
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbIndexAllCards() {}, dbUpsertFtsCard() {} }));
import { seedBase, settings } from '../test/studyQueueFixtures';
import { createFilteredDeck, setFilteredPreviewDue, updateFilteredDeck } from './filteredDecks';
import { getStudyQueue, getWaitingLearningCardIds } from './studyQueue';
import { getAnkiCard } from './noteManager';
import { answerStudyCard } from './studyAnswer';
import { getDeck } from './deckManager';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());

const dealt = (name: string, extraLearningCardIds?: number[]) => getStudyQueue({ settings, selectedDeckName: name, extraLearningCardIds });

describe('study now in a filtered deck', () => {
    it('deals a learning card waiting on its step, once per press', () => {
        createFilteredDeck('Session', 'nid:101', 1);
        expect(dealt('Session').cards.map((card) => card.cardId)).toEqual([1010]);
        // Good on the first of the 1m 10m steps: the card waits ten minutes (learn ahead is 0).
        answerStudyCard(1010, 3, settings, 100, { filtered: true });
        expect(getAnkiCard(1010)).toMatchObject({ queue: 1 });
        const waiting = dealt('Session');
        expect(waiting.cards).toEqual([]);
        expect(waiting.nextLearningDue).toBeGreaterThan(Date.now());

        const ids = getWaitingLearningCardIds({ selectedDeckName: 'Session' });
        expect(ids).toEqual([1010]);
        const now = dealt('Session', ids);
        expect(now.cards.map((card) => card.cardId)).toEqual([1010]);
        expect(now.stats.learningCount).toBe(1);
        expect(now.nextLearningDue).toBeNull();

        // Answered, the card leaves the pass and waits for its step again.
        answerStudyCard(1010, 1, settings, 100, { filtered: true });
        expect(getAnkiCard(1010)).toMatchObject({ queue: 1 });
        expect(dealt('Session', []).cards).toEqual([]);
    });

    it('deals a previewed card waiting out its delay', () => {
        const created = createFilteredDeck('Preview', 'nid:101', 1);
        updateFilteredDeck(created.id, { searchQuery: 'nid:101', searchLimit: 1, searchOrder: 0, reschedule: false, previewDelays: [60, 600, 0] });
        const deck = getDeck(created.id)!;
        answerStudyCard(1010, 1, settings, 100, {
            preview: { delays: deck.previewDelays },
            inTransaction: (outcome) => setFilteredPreviewDue(deck.id, 1010, outcome.previewDueMs),
        });
        expect(dealt('Preview').cards).toEqual([]);

        const ids = getWaitingLearningCardIds({ selectedDeckName: 'Preview' });
        expect(ids).toEqual([1010]);
        expect(dealt('Preview', ids).cards.map((card) => card.cardId)).toEqual([1010]);
    });

    it('leaves the order alone when nothing is studied ahead', () => {
        createFilteredDeck('Session', 'nid:101', 1);
        answerStudyCard(1010, 3, settings, 100, { filtered: true });
        // Ids from elsewhere (a regular deck's pass) change nothing in the filtered deck.
        expect(dealt('Session', [1020, 2010]).cards).toEqual([]);
        expect(dealt('Session', [1020, 2010]).nextLearningDue).toBe(dealt('Session').nextLearningDue);
    });
});
