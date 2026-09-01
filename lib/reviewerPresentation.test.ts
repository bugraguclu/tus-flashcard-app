import { describe, expect, it } from 'vitest';
import {
    canUndoReview,
    normalizeReviewerToolbarPosition,
    reviewerFeedbackSide,
    shouldShowReviewerToolbarActions,
    visibleReviewerGrades,
} from './reviewerPresentation';

describe('reviewer presentation', () => {
    it('places only Again feedback on the left', () => {
        expect(reviewerFeedbackSide(1)).toBe('left');
        expect(reviewerFeedbackSide(2)).toBe('right');
        expect(reviewerFeedbackSide(3)).toBe('right');
        expect(reviewerFeedbackSide(4)).toBe('right');
    });

    it('keeps Again and Good in two-button mode', () => {
        expect(visibleReviewerGrades(true)).toEqual([1, 3]);
        expect(visibleReviewerGrades(false)).toEqual([1, 2, 3, 4]);
    });

    it('defaults invalid persisted toolbar positions to the top', () => {
        expect(normalizeReviewerToolbarPosition('bottom')).toBe('bottom');
        expect(normalizeReviewerToolbarPosition('top')).toBe('top');
        expect(normalizeReviewerToolbarPosition('left')).toBe('top');
        expect(normalizeReviewerToolbarPosition(undefined)).toBe('top');
    });

    it('evaluates undo availability and action toolbar visibility', () => {
        expect(canUndoReview(0)).toBe(false);
        expect(canUndoReview(1)).toBe(true);
        expect(canUndoReview(5)).toBe(true);

        expect(shouldShowReviewerToolbarActions(true, 0)).toBe(true);
        expect(shouldShowReviewerToolbarActions(true, 3)).toBe(true);
        expect(shouldShowReviewerToolbarActions(false, 3)).toBe(true);
        expect(shouldShowReviewerToolbarActions(false, 0)).toBe(false);
    });
});
