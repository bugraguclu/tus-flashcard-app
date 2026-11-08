import { describe, expect, it } from 'vitest';
import {
    answerScrollTarget,
    canUndoReview,
    isReviewerUndoKey,
    normalizeReviewerToolbarPosition,
    reviewerDeckButtonLabel,
    reviewerFeedbackSide,
    reviewerUndoKeys,
    reviewerUndoShortcutHint,
    shouldShowReviewerToolbarActions,
    visibleReviewerGrades,
} from './reviewerPresentation';
import type { KeyBindings } from './types';

/** Anki's stock reviewer bindings, as shipped in AppSettings. */
const defaultBindings: KeyBindings = {
    showAnswer: ' ',
    again: '1',
    hard: '2',
    good: '3',
    easy: '4',
    replayAudio: 'r',
    buryCard: '-',
    suspendCard: '@',
    markNote: '*',
};

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

describe('reviewer undo shortcut', () => {
    it('offers both defaults while the learner has claimed neither', () => {
        expect(reviewerUndoKeys(defaultBindings)).toEqual(['z', 'u']);
        expect(isReviewerUndoKey('z', ['z', 'u'])).toBe(true);
        expect(isReviewerUndoKey('U', ['z', 'u'])).toBe(true);
        expect(isReviewerUndoKey('r', ['z', 'u'])).toBe(false);
    });

    it('gives a rebound key back to the binding that claimed it', () => {
        const rebound = reviewerUndoKeys({ ...defaultBindings, buryCard: 'z' });

        expect(rebound).toEqual(['u']);
        expect(isReviewerUndoKey('z', rebound)).toBe(false);
        expect(isReviewerUndoKey('u', rebound)).toBe(true);
    });

    it('matches bindings case-insensitively, the way Anki does', () => {
        expect(reviewerUndoKeys({ ...defaultBindings, suspendCard: 'U' })).toEqual(['z']);
    });

    it('leaves no undo key when both defaults are rebound', () => {
        const bindings = { ...defaultBindings, buryCard: 'z', markNote: 'u' };

        expect(reviewerUndoKeys(bindings)).toEqual([]);
        expect(isReviewerUndoKey('z', [])).toBe(false);
        expect(reviewerUndoShortcutHint([], false)).toBe('');
    });

    it('advertises the Ctrl chord only where a modifier can be observed', () => {
        // Web reads DOM key events, so it really does see Ctrl/Cmd+Z.
        expect(reviewerUndoShortcutHint(['z', 'u'], true)).toBe('Ctrl+Z / Z / U');
        // Native gets a key name with no modifier flags: advertise only what works.
        expect(reviewerUndoShortcutHint(['z', 'u'], false)).toBe('Z / U');
        expect(reviewerUndoShortcutHint([], true)).toBe('Ctrl+Z');
    });
});

describe('answerScrollTarget', () => {
    const geometry = { documentInContent: 60, contentHeight: 1400, viewportHeight: 600, margin: 12 };

    it('brings the answer anchor to the top of the viewport', () => {
        expect(answerScrollTarget({ ...geometry, anchorInDocument: 500 })).toBe(548);
    });

    it('stays put when the card already fits on screen', () => {
        expect(answerScrollTarget({ ...geometry, contentHeight: 580, anchorInDocument: 300 })).toBeNull();
    });

    it('stays put when the anchor is already at the top', () => {
        expect(answerScrollTarget({ ...geometry, documentInContent: 0, anchorInDocument: 8 })).toBeNull();
    });

    it('clamps to the end of the content like scrollIntoView does', () => {
        expect(answerScrollTarget({ ...geometry, anchorInDocument: 1300 })).toBe(800);
    });
});

// VoiceOver reads a button by its label alone, so what the reviewer's deck button shows (the
// queue counts in the redesigned toolbar, the streak in the classic one) has to be in it.
describe('reviewer deck button label', () => {
    const tr = (turkish: string) => turkish;
    const en = (_turkish: string, english: string) => english;

    it('reads the counts and the streak the button shows', () => {
        const counts = { newCount: 3, learningCount: 2, reviewCount: 14 };
        expect(reviewerDeckButtonLabel(tr, { deckTitle: 'Dahiliye', counts, streakDays: 5 }))
            .toBe('Deste seç. Geçerli kapsam: Dahiliye. 3 yeni, 2 öğrenme, 14 tekrar kartı. Günlük seri: 5 gün');
        expect(reviewerDeckButtonLabel(en, { deckTitle: 'Dahiliye', counts, streakDays: null }))
            .toBe('Select deck. Current scope: Dahiliye. 3 new, 2 learning, 14 review cards');
    });

    it('is the scope alone when the button shows neither', () => {
        expect(reviewerDeckButtonLabel(en, { deckTitle: 'Cards for Today', counts: null, streakDays: null }))
            .toBe('Select deck. Current scope: Cards for Today');
    });
});
