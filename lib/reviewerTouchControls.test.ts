import { describe, expect, it } from 'vitest';
import {
    canGradeRevealedCard,
    DEFAULT_ANSWER_TAP_ACTIONS,
    DEFAULT_QUESTION_TAP_ACTIONS,
    DEFAULT_SWIPE_ACTIONS,
    matchingSwipePreset,
    normalizeReviewTapActions,
    normalizeSwipeSensitivity,
    resolveSwipeActions,
    reviewTapZoneAt,
    SWIPE_PRESETS,
    swipeThresholdForSensitivity,
} from './reviewerTouchControls';

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
