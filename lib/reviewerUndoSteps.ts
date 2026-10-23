/**
 * The reviewer's undo/redo steps against the real collection.
 *
 * `reviewerUndo.ts` decides what a step restores; this module makes the step durable: every row of
 * one step is written inside a single SQLite savepoint and only counts as done once the collection
 * write has been flushed (`commitCollectionWrite`). A step that fails leaves no row changed, so the
 * screen keeps it on its stack and the learner can try again.
 *
 * It also answers the two staleness questions Anki settles with its collection-wide undo queue:
 * a step whose rows were deleted elsewhere is dropped, and a step whose card was rescheduled
 * elsewhere (Browser Grade Now, Forget, Set Due Date) is refused instead of overwriting that change.
 */

import { getDB } from './db';
import type { AnkiCard } from './models';
import type { Grade } from './types';
import type { AnswerSideEffects } from './studyAnswer';
import { getAnkiCard, saveAnkiCard, saveNote } from './noteManager';
import { deleteReviewById, restoreReviewLog } from './reviewLogger';
import { commitCollectionWrite } from './collectionWrite';
import {
    applyReviewerOpState,
    reviewerOpSchedulingConflicts,
    reviewerOpTargetsGone,
    type ReviewerOpApplyResult,
    type ReviewerOpChange,
    type ReviewerOpName,
    type ReviewerOpWriters,
} from './reviewerUndo';

/**
 * One step on the reviewer's undo stack.
 *
 * Anki puts answers and the reviewer's other actions on a single stack, so Ctrl+Z walks back
 * through "Bury Card", "Set Due Date" and "Answer Card" in the order they happened. An answer
 * needs its own shape because undoing it has to replay scheduling side effects; everything else
 * is restored from a plain snapshot of the rows it touched.
 */
export type AnswerUndoEntry = {
    kind: 'answer';
    cardId: number;
    reviewLogId: number;
    previousSnapshot: AnkiCard;
    /** Rows the answer changed beyond this card: buried siblings, an added leech tag. */
    sideEffects: AnswerSideEffects;
    filteredDeckId?: number;
    /** A preview answer: its deck, the delays it used and the card's wait before the answer. */
    preview?: { deckId: number; delays: number[] | undefined; previousDueMs: number | null };
    grade: Grade;
    answerTimeMs: number;
    /** The answer ran in a filtered deck, so its redo must schedule it there too (early review). */
    filtered?: boolean;
    /** The card as the answer left it; undo refuses once something else rescheduled it. */
    answeredSnapshot?: AnkiCard;
};

export type UndoEntry = AnswerUndoEntry | ({ kind: 'op' } & ReviewerOpChange);

/** The operation an undo step would take back, for the Anki-style "Undo Bury Card" label. */
export function undoEntryOp(entry: UndoEntry | undefined): ReviewerOpName | null {
    if (!entry) return null;
    return entry.kind === 'op' ? entry.op : 'answer';
}

let savepointDepth = 0;

/** Run `write` inside one savepoint: all of its rows land, or none do. */
export function runInReviewerSavepoint<T>(write: () => T): T {
    const db = getDB();
    const name = `reviewer_step_${savepointDepth++}`;
    db.execSync(`SAVEPOINT ${name};`);
    try {
        const result = write();
        db.execSync(`RELEASE SAVEPOINT ${name};`);
        return result;
    } catch (error) {
        db.execSync(`ROLLBACK TO SAVEPOINT ${name}; RELEASE SAVEPOINT ${name};`);
        throw error;
    } finally {
        savepointDepth--;
    }
}

/** The collection writers an op step uses, all inside one savepoint. */
export function reviewerOpDbWriters(): ReviewerOpWriters {
    return {
        saveCard: saveAnkiCard,
        saveNote,
        insertReviewLog: restoreReviewLog,
        deleteReviewLog: deleteReviewById,
        atomic: (run) => runInReviewerSavepoint(run),
    };
}

export type ReviewerStepCheck = 'ok' | 'gone' | 'conflict';

/** Whether an op step can still be applied in this direction. */
export function checkReviewerOpStep(change: ReviewerOpChange, direction: 'undo' | 'redo'): ReviewerStepCheck {
    if (reviewerOpTargetsGone(change)) return 'gone';
    const to = direction === 'undo' ? change.before : change.after;
    const from = direction === 'undo' ? change.after : change.before;
    return reviewerOpSchedulingConflicts(to, from).length > 0 ? 'conflict' : 'ok';
}

/**
 * Apply one op step durably. Throws when the write or the flush fails; the collection is then as it
 * was before the call (the savepoint rolled back, or the reverse step was applied after a failed
 * flush), so the caller may leave its stacks untouched.
 */
export async function commitReviewerOpStep(
    change: ReviewerOpChange,
    direction: 'undo' | 'redo',
): Promise<ReviewerOpApplyResult> {
    const to = direction === 'undo' ? change.before : change.after;
    const from = direction === 'undo' ? change.after : change.before;
    return commitCollectionWrite(
        () => applyReviewerOpState(to, from, reviewerOpDbWriters()),
        () => { applyReviewerOpState(from, to, reviewerOpDbWriters()); },
    );
}

/**
 * The columns an answer, Grade Now, Forget or Set Due Date always rewrite. The opaque data blob is
 * left out on purpose: undo merges single keys back into it, so its text need not match byte for
 * byte even when nothing else touched the card.
 */
const ANSWER_SCHEDULING_KEYS = ['type', 'queue', 'due', 'ivl', 'factor', 'reps', 'lapses', 'left', 'odue', 'odid'] as const;

/**
 * Whether undoing an answer would overwrite a later reschedule of the same card.
 *
 * `answered` is the card as the answer left it. Answer undo owns the card's scheduling fields;
 * once anything else has rewritten them, putting the pre-answer values back would silently discard
 * that later change (the Browser's Grade Now, Forget or Set Due Date). Answers recorded before this
 * snapshot existed carry none and keep the former behaviour.
 */
export function answerUndoCheck(cardId: number, answered: AnkiCard | undefined): ReviewerStepCheck {
    const current = getAnkiCard(cardId);
    if (!current) return 'gone';
    if (!answered) return 'ok';
    const changed = ANSWER_SCHEDULING_KEYS.some((key) => (
        JSON.stringify(current[key] ?? null) !== JSON.stringify(answered[key] ?? null)
    ));
    return changed ? 'conflict' : 'ok';
}

/**
 * Drop undo steps that can no longer be applied because their rows are gone, together with every
 * older step: Anki clears what lies behind a change it cannot undo, so the learner never steps past
 * a hole in the history. Newer steps are independent of the hole and stay.
 */
export function pruneStaleReviewerSteps<T extends { kind: string }>(
    stack: T[],
    isGone: (entry: T) => boolean,
): T[] {
    for (let index = stack.length - 1; index >= 0; index--) {
        if (isGone(stack[index])) return stack.slice(index + 1);
    }
    return stack;
}

/**
 * The answer options a redo replays with. A redone answer must run in the context the original
 * ran in: in a filtered deck an early review keeps its early interval and type-3 revlog row.
 */
export function replayAnswerOptions(entry: {
    preview?: { delays: number[] | undefined };
    filtered?: boolean;
}): { preview: { delays: number[] | undefined } } | { filtered: boolean } {
    return entry.preview ? { preview: { delays: entry.preview.delays } } : { filtered: entry.filtered === true };
}
