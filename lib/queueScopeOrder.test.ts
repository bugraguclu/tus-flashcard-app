// Independently derived behaviour:
// https://docs.ankiweb.net/deck-options.html#daily-limits (limits belong to decks)
// https://docs.ankiweb.net/deck-options.html#display-order (gather/sort orders are per study day)
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbIndexAllCards() {}, dbUpsertFtsCard() {}, dbDeleteFtsCard() {}, dbSearchCards: () => [] }));
import { seedBase, settings, makeCard, makeNote, deckConfig } from '../test/studyQueueFixtures';
import { saveAnkiCard, saveNote } from './noteManager';
import { answerStudyCard } from './studyAnswer';
import { localDayNumber } from './ankiState';
import { getStudyQueue, studyScopeSettings } from './studyQueue';
import { saveDeck, saveDeckConfig } from './deckManager';
import { getDeckOverviewSnapshot } from './screenSnapshots';
import type { AppSettings, StudyCard } from './types';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());

const today = () => localDayNumber(Date.now(), settings.dayRolloverHour);
const reviewIds = (cards: StudyCard[]) => cards.filter((card) => card.state.status === 'review').map((card) => card.cardId);
const newIds = (cards: StudyCard[]) => cards.filter((card) => card.state.status === 'new').map((card) => card.cardId);

function addDeck(id: number, name: string, configId = 1, sortOrder?: number) {
    saveDeck({ id, name, configId, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false, ...(sortOrder === undefined ? {} : { sortOrder }) });
}

function addReview(noteId: number, deckId: number, due = today()) {
    saveNote(makeNote(noteId, [], [`Q${noteId}`, 'A']));
    saveAnkiCard(makeCard(noteId * 10, noteId, deckId, { type: 2, queue: 2, due, ivl: 5, factor: 2500, reps: 3 }));
}

function addNew(noteId: number, deckId: number) {
    saveNote(makeNote(noteId, [], [`Q${noteId}`, 'A']));
    saveAnkiCard(makeCard(noteId * 10, noteId, deckId, { due: noteId }));
}

describe('KUY-9: scopes that are not a deck', () => {
    it('let every top-level deck spend its own review limit instead of Default capping them all', () => {
        saveDeckConfig({ ...deckConfig, maxReviewsPerDay: 2 });
        addDeck(9, 'Kimya');
        for (let id = 300; id < 303; id++) addReview(id, 7);
        for (let id = 310; id < 313; id++) addReview(id, 9);
        const limited: AppSettings = { ...settings, dailyReviewLimit: 2 };

        const all = getStudyQueue({ settings: limited });
        expect(reviewIds(all.cards)).toHaveLength(4);
        expect(all.stats.reviewCount).toBe(4);
        // Inside one deck its own limit still holds.
        expect(reviewIds(getStudyQueue({ settings: limited, selectedDeckName: 'Kimya' }).cards)).toHaveLength(2);
    });
});

describe('KUY-7: deck overview counts', () => {
    it('use the deck\'s own preset, exactly as the reviewer does', () => {
        saveDeckConfig({ ...deckConfig, maxReviewsPerDay: 1 });
        saveDeckConfig({ ...deckConfig, id: 2, name: 'Wide', maxReviewsPerDay: 5 });
        addDeck(9, 'Kimya', 2);
        for (let id = 310; id < 314; id++) addReview(id, 9);
        const global: AppSettings = { ...settings, dailyReviewLimit: 1 };

        const overview = getDeckOverviewSnapshot('Kimya', global);
        const reviewer = getStudyQueue({ settings: studyScopeSettings(global, 'Kimya'), selectedDeckName: 'Kimya' });
        expect(overview.queue?.stats.reviewCount).toBe(4);
        expect(overview.queue?.stats).toEqual(reviewer.stats);
    });
});

describe('bug 4: random new-card gathers are stable for the day', () => {
    it.each(['randomCards', 'randomNotes'] as const)('%s reads the same window on every rebuild', (order) => {
        for (let id = 400; id < 700; id++) addNew(id, 7);
        const random: AppSettings = { ...settings, newCardGatherOrder: order, newCardSortOrder: 'noSort', queueOrder: 'after' };
        const first = newIds(getStudyQueue({ settings: random, selectedDeckName: 'Python' }).cards);
        const second = newIds(getStudyQueue({ settings: random, selectedDeckName: 'Python' }).cards);
        expect(first).toHaveLength(200);
        expect(second).toEqual(first);

        // Answering the first card leaves the rest of the window, in the same order.
        answerStudyCard(first[0], 3, random, 100);
        const third = newIds(getStudyQueue({ settings: random, selectedDeckName: 'Python' }).cards);
        expect(third.slice(0, 199)).toEqual(first.slice(1));
        // And the window is not simply position order.
        expect([...first].sort((a, b) => a - b)).not.toEqual(first);
    });
});

describe('bug 9: deck-aware review orders follow the deck list', () => {
    it('deckThenDue serves decks in their manual display order, not by name', () => {
        addDeck(20, 'Anatomi', 1, 2);
        addDeck(21, 'Zooloji', 1, 1);
        addReview(500, 20, today() - 3);
        addReview(501, 21, today());
        const ordered = getStudyQueue({ settings: { ...settings, reviewSortOrder: 'deckThenDue' } });
        const ids = reviewIds(ordered.cards);
        expect(ids.indexOf(5010)).toBeLessThan(ids.indexOf(5000));
    });
});

describe('bug 11: new cards before reviews with no daily new cap', () => {
    it('serves the day\'s first window of new cards first, then reaches the reviews', () => {
        for (let id = 600; id < 605; id++) addNew(id, 7);
        addReview(700, 7);
        const newFirst: AppSettings = { ...settings, queueOrder: 'before' };

        const fresh = getStudyQueue({ settings: newFirst, selectedDeckName: 'Python', newCardsStudiedToday: 0 });
        expect(fresh.cards[0].state.status).toBe('new');
        expect(fresh.cards.findIndex((card) => card.state.status === 'review')).toBe(fresh.cards.length - 1);

        const spent = getStudyQueue({ settings: newFirst, selectedDeckName: 'Python', newCardsStudiedToday: 200 });
        expect(spent.cards[0].cardId).toBe(7000);
        expect(newIds(spent.cards)).toHaveLength(8);
    });
});
