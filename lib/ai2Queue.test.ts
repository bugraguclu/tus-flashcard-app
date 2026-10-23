// Independently derived behavior: https://docs.ankiweb.net/studying.html#undo
// Queue units: https://docs.ankiweb.net/deck-options.html#day-boundaries
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbIndexAllCards() {}, dbUpsertFtsCard() {}, dbDeleteFtsCard() {}, dbSearchCards: () => [] }));
import { seedBase, settings, makeCard, makeNote, deckConfig } from '../test/studyQueueFixtures';
import { getAnkiCard, getNote, saveAnkiCard, saveNote } from './noteManager';
import { answerStudyCard, undoAnswer } from './studyAnswer';
import { applyReviewerOpState, captureReviewerOpState } from './reviewerUndo';
import { localDayNumber, restoreQueueFromType } from './ankiState';
import { getReviewsAnsweredToday } from './reviewLogger';
import { getStudyQueue } from './studyQueue';
import { saveDeck, saveDeckConfig } from './deckManager';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());
const writers = { saveCard: saveAnkiCard, saveNote, insertReviewLog() {}, deleteReviewLog() {} };
describe('AI-2 bounded unlimited study queue', () => {
    it('mix keeps a review at least every second card regardless of the new backlog', () => {
        for (let id = 200; id < 500; id++) {
            saveNote(makeNote(id, [], ['Question', 'Answer']));
            saveAnkiCard(makeCard(id * 10, id, 7));
        }
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        for (let id = 500; id < 510; id++) {
            saveNote(makeNote(id, [], ['Question', 'Answer']));
            saveAnkiCard(makeCard(id * 10, id, 7, { type: 2, queue: 2, due: today, ivl: 10, factor: 2500 }));
        }
        const queue = getStudyQueue({ settings, selectedDeckName: 'Python' });
        expect(queue.cards.slice(0, 20).filter((card) => card.state.status === 'review')).toHaveLength(10);
        expect(queue.stats.newCount).toBe(303);
        expect(queue.heldBackNewCount).toBe(0);
        expect(queue.cards.length).toBeLessThanOrEqual(210);
    });
    it('new cards stay available after the former daily allowance has been spent', () => {
        const queue = getStudyQueue({ settings: { ...settings, dailyNewLimit: 0 }, newCardsStudiedToday: 100 });
        expect(queue.cards.filter((card) => card.state.status === 'new')).toHaveLength(3);
        expect(queue.dailyNewLimitReached).toBe(false);
    });
    it('deck gather visits parent then alphabetic subdecks before sorting by template', () => {
        saveDeck({ id: 8, name: 'Python::A', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        saveAnkiCard({ ...getAnkiCard(1030)!, deckId: 1, due: 999 });
        saveAnkiCard({ ...getAnkiCard(1020)!, deckId: 8, due: 900 });
        expect(getStudyQueue({ settings, selectedDeckName: 'Python' }).cards.map((card) => card.cardId)).toEqual([1030, 1020, 1010]);
    });
    it('limits interday learning and reviews together', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveAnkiCard({ ...getAnkiCard(1010)!, type: 1, queue: 3, due: today, left: 1 });
        saveAnkiCard({ ...getAnkiCard(1020)!, type: 2, queue: 2, due: today, ivl: 5 });
        saveAnkiCard({ ...getAnkiCard(1030)!, type: 2, queue: 2, due: today, ivl: 5 });
        const queue = getStudyQueue({ settings: { ...settings, dailyReviewLimit: 2 }, selectedDeckName: 'Python' });
        expect(queue.stats.learningCount + queue.stats.reviewCount).toBe(2);
    });
    it('counts only learning inside learn-ahead, not hours later', () => {
        saveAnkiCard({ ...getAnkiCard(1010)!, type: 1, queue: 1, due: Date.now() + 3 * 3600000, left: 1 });
        expect(getStudyQueue({ settings: { ...settings, learnAheadMinutes: 20 } }).stats.learningCount).toBe(0);
    });
    it('suppresses siblings in memory without writing bury state during queue reads', () => {
        saveDeckConfig({ ...deckConfig, buryNewSiblings: true });
        saveAnkiCard(makeCard(1011, 101, 7, { ord: 1 }));
        const queue = getStudyQueue({ settings });
        expect(queue.cards.filter((card) => card.noteId === 101)).toHaveLength(1);
        expect(getAnkiCard(1011)!.queue).toBe(0);
    });
    it('interday answers consume review allowance until undone', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveAnkiCard({ ...getAnkiCard(1010)!, type: 1, queue: 3, due: today, left: 1 });
        const result = answerStudyCard(1010, 3, settings, 100);
        expect(getReviewsAnsweredToday(settings.dayRolloverHour)).toBe(1);
        undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);
        expect(getReviewsAnsweredToday(settings.dayRolloverHour)).toBe(0);
    });
    it('new queue SQL uses LIMIT and does not repeat note-type JSON for every row', () => {
        const query = vi.spyOn(db, 'getAllSync');
        getStudyQueue({ settings });
        const newQuery = query.mock.calls.find(([sql]) => sql.includes('c.queue = 0') && sql.includes('AS noteData'))!;
        expect(newQuery[0]).toContain('LIMIT ?');
        expect(newQuery[0]).not.toContain('nt.data AS noteTypeData');
    });

    it('suppressed review siblings do not waste the review allowance', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveDeckConfig({ ...deckConfig, buryReviewSiblings: true });
        saveAnkiCard({ ...getAnkiCard(1010)!, type: 2, queue: 2, due: today - 2, ivl: 10 });
        saveAnkiCard(makeCard(1011, 101, 7, { ord: 1, type: 2, queue: 2, due: today - 2, ivl: 10 }));
        saveAnkiCard({ ...getAnkiCard(1020)!, type: 2, queue: 2, due: today, ivl: 10 });
        const queue = getStudyQueue({ settings: { ...settings, dailyReviewLimit: 2 }, selectedDeckName: 'Python' });
        expect(queue.stats.reviewCount).toBe(2);
        expect(queue.cards.filter((card) => card.state.status === 'review').map((card) => card.noteId).sort()).toEqual([101, 102]);
    });
    it('interval order considers the full due backlog before cutting to the review limit', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        for (let id = 200; id < 325; id++) {
            saveNote(makeNote(id, [], ['Question', 'Answer']));
            saveAnkiCard(makeCard(id * 10, id, 7, { type: 2, queue: 2, due: today - 5, ivl: 100 }));
        }
        saveAnkiCard({ ...getAnkiCard(1010)!, type: 2, queue: 2, due: today, ivl: 1 });
        saveAnkiCard({ ...getAnkiCard(1020)!, type: 2, queue: 2, due: today, ivl: 1 });
        const queue = getStudyQueue({ settings: { ...settings, dailyReviewLimit: 2, reviewSortOrder: 'intervalsAsc' }, selectedDeckName: 'Python' });
        expect(queue.cards.filter((card) => card.state.status === 'review').map((card) => card.state.interval)).toEqual([1, 1]);
    });

    // https://docs.ankiweb.net/manual/deck-options#burying
    it.each([0, 2, 3] as const)('queue %s cannot bury an earlier sibling queue', (queue) => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveDeckConfig({ ...deckConfig, buryNewSiblings: true, buryReviewSiblings: true, buryInterdayLearningSiblings: true });
        const earlier = queue === 0 ? [2, 3] as const : queue === 2 ? [3] as const : [];
        saveAnkiCard(makeCard(1010, 101, 7, { type: queue === 0 ? 0 : queue === 2 ? 2 : 1, queue, due: today, ivl: 10, left: 1, factor: 2500 }));
        earlier.forEach((siblingQueue, index) => saveAnkiCard(makeCard(1011 + index, 101, 7, { type: siblingQueue === 2 ? 2 : 1, queue: siblingQueue, due: today, ivl: 10, left: 1 })));
        answerStudyCard(1010, 3, settings, 100);
        earlier.forEach((siblingQueue, index) => expect(getAnkiCard(1011 + index)!.queue).toBe(siblingQueue));
    });

});
