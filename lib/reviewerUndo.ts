/**
 * Undo/redo for the reviewer actions that are not answers.
 *
 * Anki treats Bury, Suspend, Mark, Set Due Date, Forget and a tag edit as ordinary undoable
 * operations: each one lands on the same stack the answers use, and Ctrl+Z steps back through
 * all of them in order. Answers already have a bespoke undo here (it has to replay scheduling
 * side effects), so this module covers the rest with the simplest thing that is exactly right —
 * a snapshot of the rows the action touched, taken on both sides of the change.
 *
 * Storing both sides is what makes redo free: undo writes `before` over `after`, redo writes
 * `after` over `before`, and one applier serves both directions.
 */

import type { AnkiCard, Note, ReviewLog } from './models';
import { getAnkiCard, getNote } from './noteManager';

/** The rows an action touched, exactly as they read at one point in time. */
export interface ReviewerOpState {
    cards: AnkiCard[];
    notes: Note[];
    /** Bookkeeping revlog rows present in this state; Set Due Date and Forget each write one. */
    reviewLogs: ReviewLog[];
}

/**
 * The reviewer actions that go onto the undo stack.
 *
 * Anki names its undo after the operation it will take back ("Undo Bury Card"), so the stack
 * carries the operation rather than a translated string — the name is looked up at render time
 * and follows a language change like every other label.
 */
export type ReviewerOpName =
    | 'answer'
    | 'buryCard'
    | 'buryNote'
    | 'suspendCard'
    | 'unsuspendCard'
    | 'suspendNote'
    | 'forgetCard'
    | 'setDueDate'
    | 'markNote'
    | 'unmarkNote'
    | 'updateTags'
    | 'setFlag';

/** One undoable non-answer action: what the rows were, and what the action made them. */
export interface ReviewerOpChange {
    op: ReviewerOpName;
    before: ReviewerOpState;
    after: ReviewerOpState;
}

export interface ReviewerOpWriters {
    saveCard: (card: AnkiCard) => void;
    saveNote: (note: Note) => void;
    insertReviewLog: (log: ReviewLog) => void;
    deleteReviewLog: (reviewLogId: number) => void;
}

export const EMPTY_REVIEWER_OP_STATE: ReviewerOpState = { cards: [], notes: [], reviewLogs: [] };

/**
 * Read the rows an action is about to change, or has just changed.
 *
 * Rows that have gone missing are skipped rather than faked: a snapshot only ever promises to
 * restore what actually existed when it was taken.
 */
export function captureReviewerOpState(
    cardIds: readonly number[],
    noteIds: readonly number[],
    reviewLogs: readonly (ReviewLog | null | undefined)[] = [],
): ReviewerOpState {
    return {
        cards: cardIds.map((cardId) => getAnkiCard(cardId)).filter((card): card is AnkiCard => card !== null),
        notes: noteIds.map((noteId) => getNote(noteId)).filter((note): note is Note => note !== null),
        reviewLogs: reviewLogs.filter((log): log is ReviewLog => Boolean(log)),
    };
}

/**
 * Move the collection from `from` to `to`.
 *
 * Card and note rows are restored wholesale, so a field the action did not touch is written back
 * to the same value it already had. Revlog rows are append-only history, so they are reconciled
 * rather than overwritten: a row the other side has and this one does not is deleted, and one
 * this side has and the other does not is put back under its original id.
 */
export function applyReviewerOpState(
    to: ReviewerOpState,
    from: ReviewerOpState,
    writers: ReviewerOpWriters,
): void {
    for (const card of to.cards) writers.saveCard(card);
    for (const note of to.notes) writers.saveNote(note);

    const kept = new Set(to.reviewLogs.map((log) => log.id));
    for (const log of from.reviewLogs) {
        if (!kept.has(log.id)) writers.deleteReviewLog(log.id);
    }

    const present = new Set(from.reviewLogs.map((log) => log.id));
    for (const log of to.reviewLogs) {
        if (!present.has(log.id)) writers.insertReviewLog(log);
    }
}

/**
 * Whether stepping across this change alters the study queue.
 *
 * Anki splits its reviewer refresh the same way: an operation that changed scheduling re-reads
 * the queue and moves to the next card, while one that only changed note text redraws the card
 * on screen. A tag edit or a mark must not swap the card out or hide a revealed answer.
 */
export function reviewerOpChangesScheduling(change: Pick<ReviewerOpChange, 'before' | 'after'>): boolean {
    return change.before.cards.length > 0 || change.after.cards.length > 0;
}
