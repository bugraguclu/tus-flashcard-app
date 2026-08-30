import type { ReviewGestureAction, ReviewTapActionMap, ReviewTapZone } from './types';

export const REVIEW_TAP_ZONES: readonly ReviewTapZone[] = [
    'topLeft',
    'topCenter',
    'topRight',
    'middleLeft',
    'middleCenter',
    'middleRight',
    'bottomLeft',
    'bottomCenter',
    'bottomRight',
];

export const DEFAULT_QUESTION_TAP_ACTIONS: ReviewTapActionMap = {
    topLeft: 'showAnswer',
    topCenter: 'showAnswer',
    topRight: 'showAnswer',
    middleLeft: 'showAnswer',
    middleCenter: 'showAnswer',
    middleRight: 'showAnswer',
    bottomLeft: 'showAnswer',
    bottomCenter: 'showAnswer',
    bottomRight: 'showAnswer',
};

export const DEFAULT_ANSWER_TAP_ACTIONS: ReviewTapActionMap = {
    topLeft: 'again',
    topCenter: 'off',
    topRight: 'good',
    middleLeft: 'again',
    middleCenter: 'off',
    middleRight: 'good',
    bottomLeft: 'again',
    bottomCenter: 'off',
    bottomRight: 'good',
};

export function normalizeReviewGestureAction(
    value: unknown,
    fallback: ReviewGestureAction = 'off',
): ReviewGestureAction {
    return value === 'showAnswer' || value === 'again' || value === 'hard'
        || value === 'good' || value === 'easy' || value === 'undo'
        || value === 'addNote' || value === 'edit' || value === 'mark' || value === 'bury'
        || value === 'suspend' || value === 'replayAudio' || value === 'flag'
        || value === 'tools' || value === 'decks' || value === 'off'
        ? value
        : fallback;
}

export function normalizeReviewTapActions(
    value: unknown,
    fallback: ReviewTapActionMap,
): ReviewTapActionMap {
    const candidate = value && typeof value === 'object'
        ? value as Partial<Record<ReviewTapZone, unknown>>
        : {};
    return REVIEW_TAP_ZONES.reduce((result, zone) => {
        result[zone] = normalizeReviewGestureAction(candidate[zone], fallback[zone]);
        return result;
    }, {} as ReviewTapActionMap);
}

/** Resolve a normalized card-surface point to one of AnkiMobile's 3×3 tap zones. */
export function reviewTapZoneAt(xRatio: number, yRatio: number): ReviewTapZone {
    const column = Math.min(2, Math.max(0, Math.floor(Math.max(0, Math.min(0.999999, xRatio)) * 3)));
    const row = Math.min(2, Math.max(0, Math.floor(Math.max(0, Math.min(0.999999, yRatio)) * 3)));
    return REVIEW_TAP_ZONES[row * 3 + column];
}

export function normalizeSwipeSensitivity(value: unknown): number {
    return Math.max(1, Math.min(200, Math.round(Number(value ?? 100) || 100)));
}

/** Higher percentages require a shorter deliberate movement, matching the Controls copy. */
export function swipeThresholdForSensitivity(value: unknown): number {
    const sensitivity = normalizeSwipeSensitivity(value);
    return Math.max(28, Math.round(82 - sensitivity * 0.32));
}
