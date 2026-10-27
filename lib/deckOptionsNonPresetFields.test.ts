import { describe, expect, it } from 'vitest';
import { keepNonPresetEdits, NON_PRESET_FORM_FIELDS } from '../components/deck-options/nonPresetFields';

describe('restoring or adding a preset in Deck Options', () => {
    it('replaces the preset’s values and keeps unsaved edits to the deck and the collection', () => {
        const stored = {
            newPerDay: '20', learningSteps: '1m 10m', easyBonus: '1.3',
            deckNewLimit: '', deckReviewLimit: '', deckDesiredRetention: '',
            todayNewLimit: '', todayReviewLimit: '', description: '',
            newCardsIgnoreReviewLimit: false, limitsStartFromTop: false,
            fsrsEnabled: false, fsrsShortTermWithSteps: false,
        };
        const edited = {
            newPerDay: '5', learningSteps: '', easyBonus: '2',
            deckNewLimit: '7', deckReviewLimit: '70', deckDesiredRetention: '0.85',
            todayNewLimit: '3', todayReviewLimit: '30', description: 'Kardiyoloji',
            newCardsIgnoreReviewLimit: true, limitsStartFromTop: true,
            fsrsEnabled: true, fsrsShortTermWithSteps: true,
        };

        const next = keepNonPresetEdits(stored, edited);

        expect(next).toMatchObject({ newPerDay: '20', learningSteps: '1m 10m', easyBonus: '1.3' });
        for (const field of NON_PRESET_FORM_FIELDS) expect(next[field]).toBe(edited[field]);
        expect(stored.description).toBe('');
    });
});
