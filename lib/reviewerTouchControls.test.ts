import { describe, expect, it } from 'vitest';
import {
    DEFAULT_ANSWER_TAP_ACTIONS,
    DEFAULT_QUESTION_TAP_ACTIONS,
    normalizeReviewTapActions,
    normalizeSwipeSensitivity,
    resolveReviewSwipeAction,
    reviewTapZoneAt,
    swipeThresholdForSensitivity,
    type ReviewSwipeBindings,
} from './reviewerTouchControls';

const BINDINGS: ReviewSwipeBindings = { left: 'tools', right: 'decks', up: 'easy', down: 'off' };

describe('reviewer touch controls', () => {
    it('maps normalized card points into all nine zones', () => {
        expect(reviewTapZoneAt(0, 0)).toBe('topLeft');
        expect(reviewTapZoneAt(0.5, 0.1)).toBe('topCenter');
        expect(reviewTapZoneAt(1, 0)).toBe('topRight');
        expect(reviewTapZoneAt(0.1, 0.5)).toBe('middleLeft');
        expect(reviewTapZoneAt(0.5, 0.5)).toBe('middleCenter');
        expect(reviewTapZoneAt(0.9, 0.5)).toBe('middleRight');
        expect(reviewTapZoneAt(0, 1)).toBe('bottomLeft');
        expect(reviewTapZoneAt(0.5, 0.9)).toBe('bottomCenter');
        expect(reviewTapZoneAt(1, 1)).toBe('bottomRight');
    });

    it('keeps AnkiMobile question and answer defaults separate', () => {
        expect(new Set(Object.values(DEFAULT_QUESTION_TAP_ACTIONS))).toEqual(new Set(['showAnswer']));
        expect(DEFAULT_ANSWER_TAP_ACTIONS.middleLeft).toBe('again');
        expect(DEFAULT_ANSWER_TAP_ACTIONS.middleCenter).toBe('off');
        expect(DEFAULT_ANSWER_TAP_ACTIONS.middleRight).toBe('good');
    });

    it('sanitizes each persisted zone independently', () => {
        const normalized = normalizeReviewTapActions(
            { topLeft: 'easy', topCenter: 'invalid', middleCenter: 'addNote', bottomRight: 'tools' },
            DEFAULT_ANSWER_TAP_ACTIONS,
        );
        expect(normalized.topLeft).toBe('easy');
        expect(normalized.topCenter).toBe('off');
        expect(normalized.middleCenter).toBe('addNote');
        expect(normalized.bottomRight).toBe('tools');
        expect(normalized.middleRight).toBe('good');
    });

    it('clamps sensitivity and lowers the swipe threshold as sensitivity rises', () => {
        expect(normalizeSwipeSensitivity(-50)).toBe(1);
        expect(normalizeSwipeSensitivity(250)).toBe(200);
        expect(swipeThresholdForSensitivity(1)).toBe(82);
        expect(swipeThresholdForSensitivity(100)).toBe(50);
        expect(swipeThresholdForSensitivity(200)).toBe(28);
    });

    it('reads a horizontal swipe anywhere on the card once it passes the threshold', () => {
        expect(resolveReviewSwipeAction({ dx: 60, dy: 5, x0: 180 }, BINDINGS, 390, 100)).toBe('decks');
        expect(resolveReviewSwipeAction({ dx: -60, dy: 5, x0: 180 }, BINDINGS, 390, 100)).toBe('tools');
        expect(resolveReviewSwipeAction({ dx: 40, dy: 5, x0: 180 }, BINDINGS, 390, 100)).toBeNull();
        expect(resolveReviewSwipeAction({ dx: 40, dy: 5, x0: 180 }, BINDINGS, 390, 200)).toBe('decks');
    });

    it('accepts a vertical swipe only when it began at a screen edge', () => {
        expect(resolveReviewSwipeAction({ dx: 2, dy: -80, x0: 180 }, BINDINGS, 390, 100)).toBeNull();
        expect(resolveReviewSwipeAction({ dx: 2, dy: -80, x0: 20 }, BINDINGS, 390, 100)).toBe('easy');
        expect(resolveReviewSwipeAction({ dx: 2, dy: -80, x0: 370 }, BINDINGS, 390, 100)).toBe('easy');
    });

    it('treats a direction bound to "off" as no action', () => {
        expect(resolveReviewSwipeAction({ dx: 2, dy: 80, x0: 10 }, BINDINGS, 390, 100)).toBeNull();
    });
});
