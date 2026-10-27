// Independently derived behaviour: https://docs.ankiweb.net/studying.html#editing-and-more
// (undo is one collection-wide history; a change it cannot take back clears it).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any, flush: async () => {} }));
vi.mock('./db', () => ({
    getDB: () => holder.db,
    flushDatabaseWrites: () => holder.flush(),
    readOnlyTabMessage: () => null,
    dbIndexAllCards() {},
    dbUpsertFtsCard() {},
}));
import { seedBase, settings, makeCard } from '../test/studyQueueFixtures';
import { getAnkiCard, saveAnkiCard } from './noteManager';
import { answerStudyCard } from './studyAnswer';
import { captureReviewerOpState, type ReviewerOpChange } from './reviewerUndo';
import type { ReviewLog } from './models';
import {
    answerUndoCheck,
    checkReviewerOpStep,
    commitReviewerOpStep,
    pruneStaleReviewerSteps,
    replayAnswerOptions,
} from './reviewerUndoSteps';
import { gradeSelectedNow, setSelectedDueDate } from './browserSelection';
import { localDayNumber } from './ankiState';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL);
    holder.db = db;
    holder.flush = async () => {};
    seedBase(db);
});
afterEach(() => db.close());

const today = () => localDayNumber(Date.now(), settings.dayRolloverHour);

/** The reviewer's recordUndoableOp: both sides of the rows, plus the revlog rows it wrote. */
function recordOp(op: ReviewerOpChange['op'], cardIds: number[], mutate: () => ReviewLog[] | void): ReviewerOpChange {
    const before = captureReviewerOpState(cardIds, []);
    const written = mutate() ?? [];
    return { op, before, after: captureReviewerOpState(cardIds, [], written) };
}

describe('reviewer op undo restores scheduling as one unit', () => {
    it('never writes a mixed card after Set Due Date, then Grade Now elsewhere', async () => {
        const change = recordOp('setDueDate', [1010], () => (
            setSelectedDueDate([1010], { minDays: 3, maxDays: 3, forceInterval: false }, settings)
        ));
        expect(getAnkiCard(1010)).toMatchObject({ type: 2, queue: 2 });
        gradeSelectedNow([1010], 3, settings);
        const graded = getAnkiCard(1010)!;

        expect(checkReviewerOpStep(change, 'undo')).toBe('conflict');
        const result = await commitReviewerOpStep(change, 'undo');

        expect(result.skippedSchedulingCardIds).toEqual([1010]);
        const after = getAnkiCard(1010)!;
        for (const key of ['type', 'queue', 'due', 'ivl', 'factor', 'reps', 'lapses', 'left'] as const) {
            expect(after[key]).toBe(graded[key]);
        }
        // The impossible state from the bug report: a new card whose position is a day number.
        expect(after.type === 0 && after.due === today()).toBe(false);
    });

    it('still restores the whole unit when nothing rescheduled the card', async () => {
        const change = recordOp('setDueDate', [1010], () => (
            setSelectedDueDate([1010], { minDays: 3, maxDays: 3, forceInterval: false }, settings)
        ));
        expect(checkReviewerOpStep(change, 'undo')).toBe('ok');
        await commitReviewerOpStep(change, 'undo');
        expect(getAnkiCard(1010)).toMatchObject({ type: 0, queue: 0, due: 1010, ivl: 0, reps: 0 });
        expect(db.getAllSync('SELECT id FROM revlog WHERE cardId = 1010')).toEqual([]);
    });
});

describe('multi-card op undo is atomic', () => {
    it('keeps both cards in their pre-undo state when the second write fails', async () => {
        const reviewDay = today();
        saveAnkiCard(makeCard(1010, 101, 7, { type: 2, queue: 2, due: reviewDay, ivl: 5, factor: 2500, reps: 3 }));
        saveAnkiCard(makeCard(1020, 102, 7, { type: 2, queue: 2, due: reviewDay, ivl: 5, factor: 2500, reps: 3 }));
        const change = recordOp('buryNote', [1010, 1020], () => {
            saveAnkiCard({ ...getAnkiCard(1010)!, queue: -3 });
            saveAnkiCard({ ...getAnkiCard(1020)!, queue: -3 });
        });
        db.execSync(`CREATE TRIGGER fail_second BEFORE UPDATE ON anki_cards WHEN NEW.id = 1020
            BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`);

        await expect(commitReviewerOpStep(change, 'undo')).rejects.toThrow(/injected failure/);

        expect(getAnkiCard(1010)!.queue).toBe(-3);
        expect(getAnkiCard(1020)!.queue).toBe(-3);
    });

    it('takes the step back when the durable flush fails', async () => {
        const change = recordOp('buryCard', [1010], () => {
            saveAnkiCard({ ...getAnkiCard(1010)!, queue: -3 });
        });
        holder.flush = async () => { throw new Error('quota exceeded'); };

        await expect(commitReviewerOpStep(change, 'undo')).rejects.toThrow(/quota/);
        expect(getAnkiCard(1010)!.queue).toBe(-3);
    });
});

describe('answer undo and redo against later changes', () => {
    it('refuses an answer undo once the card was rescheduled elsewhere', () => {
        answerStudyCard(1010, 3, settings, 100);
        const answered = getAnkiCard(1010)!;
        expect(answerUndoCheck(1010, answered)).toBe('ok');
        gradeSelectedNow([1010], 4, settings);
        expect(answerUndoCheck(1010, answered)).toBe('conflict');
        db.runSync('DELETE FROM anki_cards WHERE id = 1010');
        expect(answerUndoCheck(1010, answered)).toBe('gone');
    });

    it('replays a filtered-deck answer as an early review', () => {
        const due = today() + 5;
        saveAnkiCard(makeCard(1010, 101, 7, {
            type: 2, queue: 2, due, ivl: 10, factor: 2500, reps: 3, lastReview: Date.now() - 5 * 86_400_000,
        }));
        const result = answerStudyCard(1010, 3, settings, 100, replayAnswerOptions({ filtered: true }));
        const row = db.getFirstSync<{ type: number }>('SELECT type FROM revlog WHERE id = ?', result.reviewLogId);
        expect(row?.type).toBe(3);
        expect(replayAnswerOptions({})).toEqual({ filtered: false });
        expect(replayAnswerOptions({ preview: { delays: [60] }, filtered: true })).toEqual({ preview: { delays: [60] } });
    });

    it('drops a stale step and everything older, keeping newer steps', () => {
        const stack = [{ kind: 'a', id: 1 }, { kind: 'a', id: 2 }, { kind: 'a', id: 3 }];
        expect(pruneStaleReviewerSteps(stack, (entry) => entry.id === 2)).toEqual([{ kind: 'a', id: 3 }]);
        expect(pruneStaleReviewerSteps(stack, () => false)).toBe(stack);
    });
});
