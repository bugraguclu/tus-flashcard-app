import { matchesKeyBinding } from './hardwareKeyboard';
import type { Grade, KeyBindings } from './types';

/**
 * Presentation rules for the compact reviewer.
 *
 * Independently derived from AnkiDroid's documented new-study-screen behavior:
 * https://forums.ankiweb.net/t/new-study-screen-official-thread/67394
 * No upstream implementation code is copied into this MIT project.
 */
export type ReviewerToolbarPosition = 'top' | 'bottom';
export type ReviewerFeedbackSide = 'left' | 'right';

export function normalizeReviewerToolbarPosition(value: unknown): ReviewerToolbarPosition {
    return value === 'bottom' ? 'bottom' : 'top';
}

/** Again is the sole failing grade; Hard, Good and Easy are passing grades. */
export function reviewerFeedbackSide(grade: Grade): ReviewerFeedbackSide {
    return grade === 1 ? 'left' : 'right';
}

/** Two-button mode keeps the same scheduler and exposes only Again and Good. */
export function visibleReviewerGrades(hideHardAndEasy: boolean): Grade[] {
    return hideHardAndEasy ? [1, 3] : [1, 2, 3, 4];
}

/** Undo is available whenever at least one answer is on the undo stack. */
export function canUndoReview(undoStackLength: number): boolean {
    return undoStackLength > 0;
}

/**
 * Reviewer action buttons (Undo, Flag, More) stay visible while reviewing a card or when an
 * answer on the stack can still be undone (including session completion).
 */
export function shouldShowReviewerToolbarActions(hasCurrentCard: boolean, undoStackLength: number): boolean {
    return hasCurrentCard || undoStackLength > 0;
}

/**
 * Single-key undo defaults. `z` is AnkiDroid's undo key and `u` collides with no Anki reviewer
 * shortcut, so both are offered — but neither is reserved.
 */
export const DEFAULT_UNDO_KEYS = ['z', 'u'];

/**
 * The default undo keys the learner's own bindings have not claimed.
 *
 * Undo has no entry in the key-binding settings, so it is the side that must yield: moving bury
 * onto `z` has to bury the card rather than silently undo the previous answer.
 */
export function reviewerUndoKeys(bindings: KeyBindings): string[] {
    const bound = Object.values(bindings);
    return DEFAULT_UNDO_KEYS.filter((key) => !bound.some((binding) => matchesKeyBinding(key, binding)));
}

/** Whether a pressed key should undo the last answer, given the keys still left to undo. */
export function isReviewerUndoKey(key: string, undoKeys: string[]): boolean {
    return undoKeys.some((undoKey) => matchesKeyBinding(key, undoKey));
}

/**
 * Shortcut text for the undo action.
 *
 * Only the web build sees modifier chords. The native capture is a hidden `TextInput` whose
 * `onKeyPress` reports a key name and nothing else — no Ctrl/Cmd/Alt flags — so a Ctrl+Z chord
 * cannot reach the reviewer on iOS and must never be advertised there. Empty when the learner
 * has rebound every undo key away.
 */
export function reviewerUndoShortcutHint(undoKeys: string[], supportsModifierChords: boolean): string {
    const labels = undoKeys.map((key) => key.toLocaleUpperCase('en-US'));
    if (supportsModifierChords) labels.unshift('Ctrl+Z');
    return labels.join(' / ');
}

