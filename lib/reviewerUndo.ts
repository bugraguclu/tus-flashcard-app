/**
 * Undo/redo for the reviewer actions that are not answers.
 *
 * Anki treats Bury, Suspend, Mark, Set Due Date, Forget and a tag edit as ordinary undoable
 * operations. Answers have a bespoke undo; other reviewer operations capture both sides so
 * undo/redo can merge only their delta into existing rows, preserving later edits and deletions.
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

/** Restore only this operation's delta onto rows that still exist. */
export function applyReviewerOpState(
    to: ReviewerOpState,
    from: ReviewerOpState,
    writers: ReviewerOpWriters,
): void {
    for (const target of to.cards) {
        const current = getAnkiCard(target.id);
        const previous = from.cards.find((row) => row.id === target.id);
        if (!current || !previous || current.noteId !== target.noteId) continue;
        writers.saveCard(mergeOperationDelta(current, target, previous));
    }
    for (const target of to.notes) {
        const current = getNote(target.id);
        const previous = from.notes.find((row) => row.id === target.id);
        if (!current || !previous) continue;
        const merged = mergeOperationDelta(current, target, previous);
        // Tags are a set: undo only the additions/removals made by this operation.
        merged.tags = current.tags.filter((tag) => !previous.tags.includes(tag) || target.tags.includes(tag));
        for (const tag of target.tags) {
            if (!previous.tags.includes(tag) && !merged.tags.includes(tag)) merged.tags.push(tag);
        }
        writers.saveNote(merged);
    }
    const kept = new Set(to.reviewLogs.map((log) => log.id));
    for (const log of from.reviewLogs) {
        if (!kept.has(log.id)) writers.deleteReviewLog(log.id);
    }
    const present = new Set(from.reviewLogs.map((log) => log.id));
    for (const log of to.reviewLogs) {
        if (!present.has(log.id)) writers.insertReviewLog(log);
    }
}

function mergeOperationDelta<T extends object>(current: T, target: T, previous: T): T {
    const merged = { ...current };
    for (const key of Object.keys(target) as Array<keyof T>) {
        if (key === 'id' || key === 'mod' || key === 'usn') continue;
        if (JSON.stringify(target[key]) !== JSON.stringify(previous[key])
            && JSON.stringify(current[key]) === JSON.stringify(previous[key])) {
            merged[key] = target[key];
        }
    }
    return merged;
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
