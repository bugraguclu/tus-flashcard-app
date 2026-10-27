// Behavioural reference only: https://docs.ankiweb.net/filtered-decks.html
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbIndexAllCards() {}, dbUpsertFtsCard() {} }));
import { seedBase, settings } from '../test/studyQueueFixtures';
import {
    completeFilteredCard,
    createFilteredDeck,
    createOrReplaceCustomStudySession,
    getCustomStudySessionToReplace,
    updateFilteredDeck,
} from './filteredDecks';
import { getStudyQueue } from './studyQueue';
import { getAnkiCard, saveAnkiCard } from './noteManager';
import { answerStudyCard } from './studyAnswer';
import { getDeckListSnapshot } from './deckListSnapshot';
import { getAllDecks, getDeck } from './deckManager';
import { CUSTOM_STUDY_DECK_NAME, CUSTOM_STUDY_DECK_NAME_EN, CUSTOM_STUDY_PREVIEW_DELAYS } from './customStudy';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());

const queue = (name: string) => getStudyQueue({ settings, selectedDeckName: name });

describe('FLT-7: learning cards in a rescheduling filtered deck', () => {
    it('are dealt at once after the build, then wait for their step once answered', () => {
        saveAnkiCard({ ...getAnkiCard(1010)!, type: 1, queue: 1, due: Date.now() + 30 * 60_000, left: 1, lastReview: Date.now() - 3_600_000 });
        createFilteredDeck('Session', 'is:learn', 10);
        expect(queue('Session').cards.map((card) => card.cardId)).toEqual([1010]);

        answerStudyCard(1010, 1, settings, 100, { filtered: true });
        const after = queue('Session');
        expect(after.cards).toEqual([]);
        expect(after.nextLearningDue).not.toBeNull();
    });
});

describe('preview decks (rescheduling off)', () => {
    it('count every card they hold as review, in the queue and the deck list', () => {
        const deck = createFilteredDeck('Preview', 'is:new', 2);
        updateFilteredDeck(deck.id, { searchQuery: 'is:new', searchLimit: 2, searchOrder: 5, reschedule: false, previewDelays: [60, 600, 0] });
        expect(queue('Preview').stats).toEqual({ newCount: 0, learningCount: 0, reviewCount: 2 });
        expect(getDeckListSnapshot(settings).counts.get(deck.id)).toMatchObject({ new: 0, review: 2 });
    });
});

describe('filtered deck text', () => {
    it('leaves a new filtered deck\'s description empty', () => {
        expect(createFilteredDeck('Session', 'is:new', 1).description).toBe('');
    });

    it('names a custom study session in the interface language and rebuilds one in the other', () => {
        const config = { search: 'is:new', limit: 5, order: 5, reschedule: true, previewDelays: CUSTOM_STUDY_PREVIEW_DELAYS };
        const english = createOrReplaceCustomStudySession(1, config, CUSTOM_STUDY_DECK_NAME_EN)!;
        expect(english.name).toBe(CUSTOM_STUDY_DECK_NAME_EN);
        expect(getCustomStudySessionToReplace(CUSTOM_STUDY_DECK_NAME)).toBe(english.id);

        const rebuilt = createOrReplaceCustomStudySession(1, config, CUSTOM_STUDY_DECK_NAME)!;
        expect(rebuilt.id).toBe(english.id);
        expect(getAllDecks().filter((deck) => deck.isFiltered)).toHaveLength(1);
    });
});

describe('session bookkeeping commits with the answer', () => {
    it('rolls the answer back when the bookkeeping fails, and keeps both when it succeeds', () => {
        const deck = createFilteredDeck('Session', 'is:new', 3);
        const before = getAnkiCard(1010)!;
        expect(() => answerStudyCard(1010, 4, settings, 100, {
            filtered: true,
            inTransaction: () => { throw new Error('crash before the session was updated'); },
        })).toThrow(/crash/);
        expect(getAnkiCard(1010)).toEqual(before);
        expect(db.getAllSync('SELECT id FROM revlog')).toEqual([]);

        answerStudyCard(1010, 4, settings, 100, {
            filtered: true,
            inTransaction: (outcome) => { if (!outcome.isLearning) completeFilteredCard(deck.id, 1010); },
        });
        expect(getDeck(deck.id)!.filteredDoneCardIds).toEqual([1010]);
        expect(getAnkiCard(1010)!.type).toBe(2);
    });
});
