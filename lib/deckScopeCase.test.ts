// P0-9 remainder: deck names are case-sensitive, so subtree scopes must be too. A legacy
// collection can hold "Bio" and "bio" side by side; SQLite LIKE folds ASCII case and treats
// "_" and "%" as wildcards, so it mixed such subtrees.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbIndexAllCards() {}, dbUpsertFtsCard() {}, dbDeleteFtsCard() {}, dbSearchCards: () => [] }));
import { seedBase, settings, makeCard, makeNote } from '../test/studyQueueFixtures';
import { saveAnkiCard, saveNote } from './noteManager';
import { saveDeck } from './deckManager';
import { getStudyQueue } from './studyQueue';
import { answerStudyCard } from './studyAnswer';
import { localDayNumber } from './ankiState';
import { getNewCardsIntroducedTodayInDeck, getReviewsAnsweredTodayInDeck, getTodayAnswerStats } from './reviewLogger';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL);
    holder.db = db;
    seedBase(db);
    const deck = (id: number, name: string) => saveDeck({ id, name, configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    // saveDeck now refuses a case collision; an older collection can still hold one.
    const legacyDeck = (id: number, name: string) => db.runSync(
        'INSERT INTO decks (id, name, data, updated_at, usn) VALUES (?, ?, ?, 0, -1)',
        id, name, JSON.stringify({ id, name, configId: 1, mod: 0, usn: -1, description: '', collapsed: false, isFiltered: false }),
    );
    deck(30, 'Bio');
    legacyDeck(31, 'bio');
    legacyDeck(32, 'bio::Cells');
    deck(33, 'A_B');
    deck(34, 'AxB');
    deck(35, 'AxB::C');
    const today = localDayNumber(Date.now(), settings.dayRolloverHour);
    saveNote(makeNote(800, [], ['lower case subtree', 'x']));
    saveAnkiCard(makeCard(8000, 800, 32, { type: 2, queue: 2, due: today, ivl: 3, factor: 2500, reps: 2 }));
    saveNote(makeNote(801, [], ['wildcard subtree', 'x']));
    saveAnkiCard(makeCard(8010, 801, 35, { type: 2, queue: 2, due: today, ivl: 3, factor: 2500, reps: 2 }));
    saveNote(makeNote(802, [], ['new lower case', 'x']));
    saveAnkiCard(makeCard(8020, 802, 32));
});
afterEach(() => db.close());

describe('deck subtree scopes are exact and case-sensitive', () => {
    it('the queue of "Bio" does not take cards from "bio::Cells"', () => {
        expect(getStudyQueue({ settings, selectedDeckName: 'Bio' }).cards).toEqual([]);
        expect(getStudyQueue({ settings, selectedDeckName: 'bio' }).cards.map((card) => card.cardId).sort()).toEqual([8000, 8020]);
    });

    it('"_" in a deck name is not a wildcard', () => {
        expect(getStudyQueue({ settings, selectedDeckName: 'A_B' }).cards).toEqual([]);
        expect(getStudyQueue({ settings, selectedDeckName: 'AxB' }).cards.map((card) => card.cardId)).toEqual([8010]);
    });

    it('today\'s per-deck usage counts only the exact subtree', () => {
        answerStudyCard(8000, 3, settings, 100);
        answerStudyCard(8020, 3, settings, 100);
        const hour = settings.dayRolloverHour;
        expect(getReviewsAnsweredTodayInDeck('Bio', hour)).toBe(0);
        expect(getReviewsAnsweredTodayInDeck('bio', hour)).toBe(1);
        expect(getNewCardsIntroducedTodayInDeck('Bio', hour)).toBe(0);
        // Neither card has earlier history, so both first answers introduce a card.
        expect(getNewCardsIntroducedTodayInDeck('bio', hour)).toBe(2);
        expect(getTodayAnswerStats(hour, 'Bio').reviewed).toBe(0);
        expect(getTodayAnswerStats(hour, 'bio').reviewed).toBe(2);
    });
});
