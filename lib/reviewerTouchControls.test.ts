import { describe, expect, it } from 'vitest';
import {
    canGradeRevealedCard,
    cardFrameTapRatios,
    cardTapOnlyHidesKeyboard,
    KEYBOARD_DISMISS_TAP_WINDOW_MS,
    DEFAULT_SWIPE_ACTIONS,
    matchingSwipePreset,
    resolveSwipeActions,
    SWIPE_PRESETS,
    DEFAULT_ANSWER_TAP_ACTIONS,
    DEFAULT_QUESTION_TAP_ACTIONS,
    normalizeReviewTapActions,
    normalizeSwipeSensitivity,
    resolveReviewSwipeAction,
    reviewerAllowsFullScreenBackSwipe,
    reviewTapZoneAt,
    swipeThresholdForSensitivity,
    type ReviewSwipeBindings,
} from './reviewerTouchControls';

const BINDINGS: ReviewSwipeBindings = { left: 'tools', right: 'decks', up: 'easy', down: 'off' };

describe('taps on the card frame outside the card document', () => {
    // iPhone: a 200 pt frame (minimum height + padding) around a one-line, 32 pt document.
    const frame = { x: 16, y: 150, width: 370, height: 200 };
    const cardDocument = { x: 40, y: 234, width: 322, height: 32 };

    it('maps the empty part of the frame onto the grid over the whole frame', () => {
        const below = cardFrameTapRatios({ pageX: 30, pageY: 330 }, frame, cardDocument);
        expect(below).not.toBeNull();
        expect(reviewTapZoneAt(below!.xRatio, below!.yRatio)).toBe('bottomLeft');
        const above = cardFrameTapRatios({ pageX: 370, pageY: 160 }, frame, cardDocument);
        expect(reviewTapZoneAt(above!.xRatio, above!.yRatio)).toBe('topRight');
    });

    it('leaves a tap on the document to the document, which reports it itself', () => {
        expect(cardFrameTapRatios({ pageX: 200, pageY: 250 }, frame, cardDocument)).toBeNull();
    });

    it('ignores a frame that has not been laid out yet', () => {
        expect(cardFrameTapRatios({ pageX: 30, pageY: 330 }, { x: 0, y: 0, width: 0, height: 0 }, null)).toBeNull();
    });
});

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

describe('swipe presets', () => {
    it('fills each direction from the shipped defaults and rejects unknown actions', () => {
        expect(resolveSwipeActions(undefined)).toEqual(DEFAULT_SWIPE_ACTIONS);
        expect(resolveSwipeActions({ swipeUpAction: 'nonsense' as never })).toEqual(DEFAULT_SWIPE_ACTIONS);
        expect(resolveSwipeActions({ swipeUpAction: 'easy' }).swipeUpAction).toBe('easy');
    });

    it('reports the balanced preset for an untouched mapping', () => {
        expect(matchingSwipePreset(undefined)).toBe('balanced');
        expect(matchingSwipePreset(DEFAULT_SWIPE_ACTIONS)).toBe('balanced');
        expect(matchingSwipePreset(SWIPE_PRESETS.fastAnswers)).toBe('fastAnswers');
    });

    it('reports no preset once a single direction diverges', () => {
        expect(matchingSwipePreset({ ...SWIPE_PRESETS.fastAnswers, swipeDownAction: 'bury' })).toBeNull();
    });
});

describe('reviewer answer availability', () => {
    it('is satisfied whenever the answer buttons are visible', () => {
        expect(canGradeRevealedCard({})).toBe(true);
        expect(canGradeRevealedCard({
            showAnswerButtons: true,
            ninePointTouchEnabled: false,
            gesturesEnabled: false,
        })).toBe(true);
    });

    it('accepts the default answer tap zones when the buttons are hidden', () => {
        expect(canGradeRevealedCard({
            showAnswerButtons: false,
            ninePointTouchEnabled: true,
        })).toBe(true);
    });

    it('accepts a grading swipe when every tap zone is off', () => {
        expect(canGradeRevealedCard({
            showAnswerButtons: false,
            ninePointTouchEnabled: true,
            answerTapActions: normalizeReviewTapActions({}, {
                ...DEFAULT_ANSWER_TAP_ACTIONS,
                topLeft: 'off',
                middleLeft: 'off',
                bottomLeft: 'off',
                topRight: 'off',
                middleRight: 'off',
                bottomRight: 'off',
            }),
            gesturesEnabled: true,
            swipeUpAction: 'good',
        })).toBe(true);
    });

    it('detects the stranded case where nothing left can grade a card', () => {
        const allOff = normalizeReviewTapActions({}, {
            topLeft: 'off',
            topCenter: 'off',
            topRight: 'off',
            middleLeft: 'off',
            middleCenter: 'off',
            middleRight: 'off',
            bottomLeft: 'off',
            bottomCenter: 'off',
            bottomRight: 'off',
        });
        expect(canGradeRevealedCard({
            showAnswerButtons: false,
            ninePointTouchEnabled: true,
            answerTapActions: allOff,
            gesturesEnabled: true,
            ...DEFAULT_SWIPE_ACTIONS,
        })).toBe(false);
        expect(canGradeRevealedCard({
            showAnswerButtons: false,
            ninePointTouchEnabled: false,
            gesturesEnabled: false,
        })).toBe(false);
    });

    it('ignores tap and swipe mappings whose feature is switched off', () => {
        expect(canGradeRevealedCard({
            showAnswerButtons: false,
            ninePointTouchEnabled: false,
            answerTapActions: DEFAULT_ANSWER_TAP_ACTIONS,
            gesturesEnabled: false,
            swipeUpAction: 'good',
        })).toBe(false);
    });
});

describe('reviewer back swipe', () => {
    it('leaves a right swipe bound to Decks or to nothing to the system back swipe', () => {
        expect(reviewerAllowsFullScreenBackSwipe({ gesturesEnabled: true, whiteboardActive: false })).toBe(true);
        expect(reviewerAllowsFullScreenBackSwipe({ gesturesEnabled: true, swipeRightAction: 'decks', whiteboardActive: false })).toBe(true);
        expect(reviewerAllowsFullScreenBackSwipe({ gesturesEnabled: true, swipeRightAction: 'off', whiteboardActive: false })).toBe(true);
        expect(reviewerAllowsFullScreenBackSwipe({ gesturesEnabled: false, swipeRightAction: 'good', whiteboardActive: false })).toBe(true);
    });

    it('keeps a right swipe bound to another action, and whiteboard ink, on the card', () => {
        expect(reviewerAllowsFullScreenBackSwipe({ gesturesEnabled: true, swipeRightAction: 'good', whiteboardActive: false })).toBe(false);
        expect(reviewerAllowsFullScreenBackSwipe({ gesturesEnabled: true, swipeRightAction: 'tools', whiteboardActive: false })).toBe(false);
        expect(reviewerAllowsFullScreenBackSwipe({ gesturesEnabled: false, whiteboardActive: true })).toBe(false);
    });
});

describe('cardTapOnlyHidesKeyboard', () => {
    const base = { showingAnswer: false, typeAnswerFocused: false, typeAnswerBlurredAt: null, now: 10_000 };

    it('keeps the tap that hides the typed answer keyboard from showing the answer', () => {
        expect(cardTapOnlyHidesKeyboard({ ...base, typeAnswerFocused: true })).toBe(true);
    });

    it('counts a tap that took the focus from the box an instant ago', () => {
        expect(cardTapOnlyHidesKeyboard({ ...base, typeAnswerBlurredAt: 10_000 - 120 })).toBe(true);
        expect(cardTapOnlyHidesKeyboard({ ...base, typeAnswerBlurredAt: 10_000 - KEYBOARD_DISMISS_TAP_WINDOW_MS })).toBe(false);
    });

    it('lets the next tap, a tap without the keyboard and any answer-side tap act as configured', () => {
        expect(cardTapOnlyHidesKeyboard(base)).toBe(false);
        expect(cardTapOnlyHidesKeyboard({ ...base, typeAnswerBlurredAt: 2_000 })).toBe(false);
        expect(cardTapOnlyHidesKeyboard({ ...base, showingAnswer: true, typeAnswerFocused: true })).toBe(false);
    });
});
