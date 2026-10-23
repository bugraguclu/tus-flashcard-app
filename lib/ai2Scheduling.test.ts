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
import { ankiCardToCardState, localDayNumber, restoreQueueFromType } from './ankiState';
import { getScheduler, formatDays } from './scheduler';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());
const writers = { saveCard: saveAnkiCard, saveNote, insertReviewLog() {}, deleteReviewLog() {} };
describe('AI-2 classic schedule context', () => {
    it('filtered review at zero elapsed days keeps a one-day Good interval', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveAnkiCard(makeCard(1010, 101, 7, { type: 2, queue: 2, ivl: 1, due: today + 1, factor: 2500, lastReview: Date.now() }));
        answerStudyCard(1010, 3, settings, 100, { filtered: true });
        expect(getAnkiCard(1010)!.ivl).toBe(1);
        expect(db.getFirstSync<{ type: number }>('SELECT type FROM revlog')!.type).toBe(3);
    });
    it('Grade Now outside a filtered deck never takes the early review path', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveAnkiCard(makeCard(1010, 101, 7, { type: 2, queue: 2, ivl: 10, due: today + 5, factor: 2500, lastReview: Date.now() - 2 * 86400000 }));
        answerStudyCard(1010, 3, settings, 100);
        expect(getAnkiCard(1010)!.ivl).toBeGreaterThan(20);
        expect(db.getFirstSync<{ type: number }>('SELECT type FROM revlog')!.type).toBe(1);
    });
    it('manual log timestamps do not manufacture an overdue bonus', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveAnkiCard(makeCard(1010, 101, 7, { type: 2, queue: 2, ivl: 10, due: today, factor: 2500, lastReview: Date.now() - 40 * 86400000 }));
        answerStudyCard(1010, 3, settings, 100);
        expect(getAnkiCard(1010)!.ivl).toBeLessThan(30);
    });
    it('every day label matches the interval the same answer persists, for review and graduation', () => {
        for (const type of [0, 2] as const) for (const grade of [2, 3, 4] as const) {
            for (let id = 1010; id < 1022; id++) {
                const today = localDayNumber(Date.now(), settings.dayRolloverHour);
                const card = makeCard(id, 101, 7, { type, queue: type, ivl: type === 2 ? 10 : 0, due: today, factor: 2500, reps: 3 });
                saveAnkiCard(card);
                const state = ankiCardToCardState(card, settings);
                const preview = getScheduler().previewIntervals(state, settings);
                const result = answerStudyCard(id, grade, settings, 100);
                if (result.updatedCard.state.status !== 'review') continue;
                expect(preview[(['again', 'hard', 'good', 'easy'] as const)[grade - 1]]).toBe(formatDays(getAnkiCard(id)!.ivl));
            }
        }
    });
});
