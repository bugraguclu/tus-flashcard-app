// Independently derived behavior: https://docs.ankiweb.net/studying.html#undo
// Queue units: https://docs.ankiweb.net/deck-options.html#day-boundaries
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbIndexAllCards() {}, dbUpsertFtsCard() {}, dbDeleteFtsCard() {}, dbSearchCards: () => [] }));
import { seedBase, settings, makeCard } from '../test/studyQueueFixtures';
import { getAnkiCard, getNote, saveAnkiCard, saveNote } from './noteManager';
import { answerStudyCard, undoAnswer } from './studyAnswer';
import { applyReviewerOpState, captureReviewerOpState } from './reviewerUndo';
import { localDayNumber, restoreQueueFromType } from './ankiState';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());
const writers = { saveCard: saveAnkiCard, saveNote, insertReviewLog() {}, deleteReviewLog() {} };
describe('AI-2 undo data safety', () => {
    it('undo mark preserves later note fields and unrelated tags', () => {
        const before = captureReviewerOpState([], [101]);
        saveNote({ ...getNote(101)!, tags: ['marked', 'original'] });
        const after = captureReviewerOpState([], [101]);
        saveNote({ ...getNote(101)!, fields: ['corrected', 'answer'], tags: ['marked', 'original', 'later'] });
        applyReviewerOpState(before, after, writers);
        expect(getNote(101)!.fields[0]).toBe('corrected');
        expect(getNote(101)!.tags).toContain('later');
        expect(getNote(101)!.tags).not.toContain('marked');
    });
    it('undo bury never resurrects a card whose note was deleted', () => {
        const before = captureReviewerOpState([1010], []);
        saveAnkiCard({ ...getAnkiCard(1010)!, queue: -3 });
        const after = captureReviewerOpState([1010], []);
        db.runSync('DELETE FROM anki_cards WHERE id = ?', 1010);
        db.runSync('DELETE FROM notes WHERE id = ?', 101);
        applyReviewerOpState(before, after, writers);
        expect(getAnkiCard(1010)).toBeNull();
    });
    it('undo answer preserves later deck and flag edits', () => {
        const result = answerStudyCard(1010, 3, settings, 100);
        saveAnkiCard({ ...getAnkiCard(1010)!, deckId: 2, flags: 4 });
        undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);
        expect(getAnkiCard(1010)).toMatchObject({ deckId: 2, flags: 4, reps: 0, type: 0 });
    });
    it('undo answer never recreates a deleted card', () => {
        const result = answerStudyCard(1010, 3, settings, 100);
        db.runSync('DELETE FROM anki_cards WHERE id = ?', 1010);
        undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);
        expect(getAnkiCard(1010)).toBeNull();
    });
});
describe('AI-2 grade now and queue restoration', () => {
    it.each([-1, -2, -3] as const)('answer clears inactive queue %s and writes complete relearning state', (queue) => {
        saveAnkiCard(makeCard(1010, 101, 7, { type: 2, queue, due: localDayNumber(Date.now(), settings.dayRolloverHour), ivl: 10, factor: 2500, reps: 3 }));
        answerStudyCard(1010, 1, settings, 100);
        expect(getAnkiCard(1010)).toMatchObject({ type: 3, queue: 1, left: 1, lapses: 1 });
    });
    it.each([0, -3, 3])('restores an interday card due today %+d days to queue 3', (offset) => {
        const due = localDayNumber(Date.now(), settings.dayRolloverHour) + offset;
        expect(restoreQueueFromType(makeCard(1, 1, 1, { type: 1, queue: -1, due }))).toBe(3);
    });
});
