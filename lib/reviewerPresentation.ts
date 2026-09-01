import type { Grade } from './types';

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

