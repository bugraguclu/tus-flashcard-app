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

/** The four reviewer swipe directions, in the order the Controls screen lists them. */
export type ReviewSwipeActions = {
    swipeLeftAction: ReviewGestureAction;
    swipeRightAction: ReviewGestureAction;
    swipeUpAction: ReviewGestureAction;
    swipeDownAction: ReviewGestureAction;
};

export const DEFAULT_SWIPE_ACTIONS: ReviewSwipeActions = {
    swipeLeftAction: 'tools',
    swipeRightAction: 'decks',
    swipeUpAction: 'off',
    swipeDownAction: 'off',
};

export type SwipePresetId = 'balanced' | 'fastAnswers';

/** Named starting points offered in Settings → Controls. `balanced` mirrors the shipped defaults. */
export const SWIPE_PRESETS: Readonly<Record<SwipePresetId, ReviewSwipeActions>> = {
    balanced: DEFAULT_SWIPE_ACTIONS,
    fastAnswers: {
        swipeLeftAction: 'again',
        swipeRightAction: 'good',
        swipeUpAction: 'easy',
        swipeDownAction: 'hard',
    },
};

export const SWIPE_PRESET_IDS: readonly SwipePresetId[] = ['balanced', 'fastAnswers'];

/** Fill in the per-direction defaults so callers never repeat the `?? 'tools'` fallback chain. */
export function resolveSwipeActions(source: Partial<ReviewSwipeActions> | undefined): ReviewSwipeActions {
    return {
        swipeLeftAction: normalizeReviewGestureAction(source?.swipeLeftAction, DEFAULT_SWIPE_ACTIONS.swipeLeftAction),
        swipeRightAction: normalizeReviewGestureAction(source?.swipeRightAction, DEFAULT_SWIPE_ACTIONS.swipeRightAction),
        swipeUpAction: normalizeReviewGestureAction(source?.swipeUpAction, DEFAULT_SWIPE_ACTIONS.swipeUpAction),
        swipeDownAction: normalizeReviewGestureAction(source?.swipeDownAction, DEFAULT_SWIPE_ACTIONS.swipeDownAction),
    };
}

/** Which preset the current swipe mapping matches exactly, or null once the user has customized it. */
export function matchingSwipePreset(source: Partial<ReviewSwipeActions> | undefined): SwipePresetId | null {
    const actions = resolveSwipeActions(source);
    return SWIPE_PRESET_IDS.find((id) => (
        SWIPE_PRESETS[id].swipeLeftAction === actions.swipeLeftAction
        && SWIPE_PRESETS[id].swipeRightAction === actions.swipeRightAction
        && SWIPE_PRESETS[id].swipeUpAction === actions.swipeUpAction
        && SWIPE_PRESETS[id].swipeDownAction === actions.swipeDownAction
    )) ?? null;
}

const GRADING_ACTIONS: readonly ReviewGestureAction[] = ['again', 'hard', 'good', 'easy'];

export function isGradingGestureAction(action: ReviewGestureAction | undefined): boolean {
    return action !== undefined && GRADING_ACTIONS.includes(action);
}

export type ReviewerAnswerControlInput = Partial<ReviewSwipeActions> & {
    showAnswerButtons?: boolean;
    ninePointTouchEnabled?: boolean;
    gesturesEnabled?: boolean;
    answerTapActions?: ReviewTapActionMap;
};

/**
 * True when the reviewer still offers a way to grade a revealed card. Show Answer always has its
 * own button, so only grading can be stranded: with the answer buttons hidden the user needs at
 * least one enabled tap zone or swipe direction that answers Again, Hard, Good, or Easy.
 */
export function canGradeRevealedCard(input: ReviewerAnswerControlInput): boolean {
    if (input.showAnswerButtons !== false) return true;
    if (input.ninePointTouchEnabled !== false) {
        const actions = input.answerTapActions ?? DEFAULT_ANSWER_TAP_ACTIONS;
        if (REVIEW_TAP_ZONES.some((zone) => isGradingGestureAction(actions[zone]))) return true;
    }
    if (input.gesturesEnabled) {
        const swipes = resolveSwipeActions(input);
        if (Object.values(swipes).some((action) => isGradingGestureAction(action))) return true;
    }
    return false;
}
