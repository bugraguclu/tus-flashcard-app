// Behavioral reference only: https://docs.ankiweb.net/filtered-decks.html#creating-a-filtered-deck
// Rebuilding a filtered deck first returns its own cards home, so the "no matching cards" check
// that guards Build/Rebuild and Custom Study must count them as gatherable again.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbIndexAllCards() {}, dbUpsertFtsCard() {} }));
import { seedBase, settings } from '../test/studyQueueFixtures';
import { createFilteredDeck, createOrReplaceCustomStudySession, getCustomStudySessionToReplace, updateFilteredDeck } from './filteredDecks';
import { getFilteredDeckGatherCount, getFilteredDeckMatchCount } from './filteredDeckQueue';
import { FILTERED_SEARCH_ORDER } from './filteredDeckOptions';
import { getStudyQueue } from './studyQueue';
import { CUSTOM_STUDY_DECK_NAME } from './customStudy';
import { saveDeck } from './deckManager';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());

const everyPythonCard = { searchQuery: 'deck:"Python"', searchLimit: 100, searchOrder: FILTERED_SEARCH_ORDER.due };
const everyPythonTerm = { search: 'deck:"Python"', limit: 100, order: FILTERED_SEARCH_ORDER.due };
const queueIds = (name: string) => getStudyQueue({ settings, selectedDeckName: name }).cards.map((card) => card.cardId).sort();
const membershipRows = () => db.getAllSync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key LIKE 'filtered_membership_v1:%' ORDER BY key",
);

describe('filtered-deck match counts', () => {
    it('counts the edited deck\'s own members, which a rebuild releases first', () => {
        const deck = createFilteredDeck('Session', everyPythonCard.searchQuery, 100);
        expect(queueIds('Session')).toEqual([1010, 1020, 1030]);

        expect(getFilteredDeckMatchCount(settings, everyPythonCard, deck.id)).toBe(3);
        expect(getFilteredDeckGatherCount(settings, everyPythonTerm, deck.id)).toBe(3);
        // A brand-new deck with the same search really would find nothing.
        expect(getFilteredDeckMatchCount(settings, everyPythonCard)).toBe(0);
        expect(getFilteredDeckGatherCount(settings, everyPythonTerm)).toBe(0);
    });

    it('still leaves out cards another filtered deck holds', () => {
        createFilteredDeck('Other', 'nid:101', 10);
        const deck = createFilteredDeck('Session', everyPythonCard.searchQuery, 100);
        expect(queueIds('Session')).toEqual([1020, 1030]);

        expect(getFilteredDeckMatchCount(settings, everyPythonCard, deck.id)).toBe(2);
        expect(getFilteredDeckGatherCount(settings, everyPythonTerm, deck.id)).toBe(2);
        // The count agrees with what Save & Rebuild then builds.
        updateFilteredDeck(deck.id, { ...everyPythonCard, reschedule: true });
        expect(queueIds('Session')).toEqual([1020, 1030]);
    });

    it('lets Custom Study run again over cards its current session holds', () => {
        const config = { search: 'deck:"Python" is:new', limit: 100, order: FILTERED_SEARCH_ORDER.added, reschedule: true, previewDelays: [60, 600, 0] as const };
        const session = createOrReplaceCustomStudySession(1, config)!;
        expect(getCustomStudySessionToReplace()).toBe(session.id);

        const term = { search: config.search, limit: config.limit, order: config.order };
        expect(getFilteredDeckGatherCount(settings, term, getCustomStudySessionToReplace())).toBe(3);
        expect(createOrReplaceCustomStudySession(1, config)!.id).toBe(session.id);
        expect(queueIds(session.name)).toEqual([1010, 1020, 1030]);
    });

    it('has no session to replace while a regular deck owns the conventional name', () => {
        expect(getCustomStudySessionToReplace()).toBeUndefined();
        saveDeck({ id: 50, name: CUSTOM_STUDY_DECK_NAME, configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        expect(getCustomStudySessionToReplace()).toBeUndefined();
    });

    it('never writes a membership row while counting', () => {
        const deck = createFilteredDeck('Session', 'nid:101', 10);
        const before = membershipRows();
        expect(before.map((row) => row.key)).toEqual([`filtered_membership_v1:${deck.id}`]);

        getFilteredDeckGatherCount(settings, everyPythonTerm);
        getFilteredDeckGatherCount(settings, everyPythonTerm, deck.id);
        getFilteredDeckMatchCount(settings, everyPythonCard);
        getFilteredDeckMatchCount(settings, everyPythonCard, deck.id);

        expect(membershipRows()).toEqual(before);
        expect(db.getFirstSync('SELECT key FROM settings WHERE key = ?', 'filtered_membership_v1:-1')).toBeNull();
        expect(queueIds('Session')).toEqual([1010]);
    });
});
