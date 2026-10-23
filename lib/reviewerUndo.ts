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
    /**
     * Runs the whole step as one unit, so a failure part-way leaves no row changed. The reviewer
     * passes a SQLite savepoint here; unit tests that record writes can leave it out.
     */
    atomic?: (run: () => void) => void;
}

/** What one undo/redo step could not take back. */
export interface ReviewerOpApplyResult {
    /**
     * Cards whose scheduling changed again after the operation (an answer, Grade Now or Forget in
     * the Browser). Their scheduling, and the bookkeeping revlog row that came with it, was left
     * as it is now instead of being mixed with the operation's values.
     */
    skippedSchedulingCardIds: number[];
}

/**
 * The card fields that only make sense together. A day-number `due` is meaningless on a new card,
 * an interval on a learning card that never graduated, and so on, so these are restored as one unit
 * or not at all. A card whose filtered home changed also moves its deck with the unit.
 */
export const REVIEWER_OP_SCHEDULING_KEYS = [
    'type', 'queue', 'due', 'ivl', 'factor', 'reps', 'lapses', 'left', 'odue', 'odid', 'lastReview', 'ankiData',
] as const satisfies readonly (keyof AnkiCard)[];

function schedulingKeysFor(target: AnkiCard, previous: AnkiCard): (keyof AnkiCard)[] {
    const keys: (keyof AnkiCard)[] = [...REVIEWER_OP_SCHEDULING_KEYS];
    if (target.odid !== previous.odid || (target.odid && target.deckId !== previous.deckId)) keys.push('deckId');
    return keys;
}

const sameValue = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

/** The operation changed the unit, and the card now holds neither side of that change. */
function schedulingUnitConflicts(keys: (keyof AnkiCard)[], current: AnkiCard, target: AnkiCard, previous: AnkiCard): boolean {
    const opChanged = keys.some((key) => !sameValue(target[key], previous[key]));
    return opChanged
        && keys.some((key) => !sameValue(current[key], previous[key]))
        && keys.some((key) => !sameValue(current[key], target[key]));
}

/**
 * Whether stepping from `from` to `to` would have to overwrite scheduling that changed after the
 * operation. The reviewer refuses such a step outright rather than restoring half of it.
 */
export function reviewerOpSchedulingConflicts(to: ReviewerOpState, from: ReviewerOpState): number[] {
    const conflicts: number[] = [];
    for (const target of to.cards) {
        const current = getAnkiCard(target.id);
        const previous = from.cards.find((row) => row.id === target.id);
        if (!current || !previous || current.noteId !== target.noteId) continue;
        const keys = schedulingKeysFor(target, previous);
        if (schedulingUnitConflicts(keys, current, target, previous)) conflicts.push(target.id);
    }
    return conflicts;
}

/** True when none of the rows a step would touch exist any more (deleted, or a restore replaced them). */
export function reviewerOpTargetsGone(change: Pick<ReviewerOpChange, 'before' | 'after'>): boolean {
    const cardIds = new Set([...change.before.cards, ...change.after.cards].map((card) => card.id));
    const noteIds = new Set([...change.before.notes, ...change.after.notes].map((note) => note.id));
    if (cardIds.size === 0 && noteIds.size === 0) return false;
    for (const id of cardIds) if (getAnkiCard(id)) return false;
    for (const id of noteIds) if (getNote(id)) return false;
    return true;
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
): ReviewerOpApplyResult {
    const skipped: number[] = [];
    const run = () => {
        for (const target of to.cards) {
            const current = getAnkiCard(target.id);
            const previous = from.cards.find((row) => row.id === target.id);
            if (!current || !previous || current.noteId !== target.noteId) continue;
            const keys = schedulingKeysFor(target, previous);
            const merged = mergeOperationDelta(current, target, previous, new Set(keys));
            if (schedulingUnitConflicts(keys, current, target, previous)) {
                skipped.push(target.id);
            } else if (keys.some((key) => !sameValue(target[key], previous[key]))) {
                for (const key of keys) Object.assign(merged, { [key]: target[key] });
                // An absent blob has to replace the stored one, not merge into it.
                if (merged.ankiData === undefined && current.ankiData !== undefined) merged.ankiData = '';
            }
            if (JSON.stringify(merged) !== JSON.stringify(current)) writers.saveCard(merged);
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
        // The bookkeeping row of a Set Due Date or Forget belongs to the scheduling it recorded.
        const keepsSchedule = new Set(skipped);
        const kept = new Set(to.reviewLogs.map((log) => log.id));
        for (const log of from.reviewLogs) {
            if (!kept.has(log.id) && !keepsSchedule.has(log.cardId)) writers.deleteReviewLog(log.id);
        }
        const present = new Set(from.reviewLogs.map((log) => log.id));
        for (const log of to.reviewLogs) {
            if (!present.has(log.id) && !keepsSchedule.has(log.cardId)) writers.insertReviewLog(log);
        }
    };
    if (writers.atomic) writers.atomic(run);
    else run();
    return { skippedSchedulingCardIds: skipped };
}

function mergeOperationDelta<T extends object>(current: T, target: T, previous: T, exclude: ReadonlySet<PropertyKey> = new Set()): T {
    const merged = { ...current };
    for (const key of Object.keys(target) as Array<keyof T>) {
        if (key === 'id' || key === 'mod' || key === 'usn' || exclude.has(key)) continue;
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
