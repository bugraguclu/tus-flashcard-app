// Anki's classic multiplier ranges (DST-10): https://docs.ankiweb.net/deck-options.html#advanced
import { describe, expect, it } from 'vitest';
import { MULTIPLIER_BOUNDS, untouchedLegacyMultiplier } from '../components/deck-options/multiplierBounds';

describe('classic multiplier bounds', () => {
    it("uses Anki's ranges", () => {
        expect(MULTIPLIER_BOUNDS.startingEase).toMatchObject({ min: 1.31, max: 5 });
        expect(MULTIPLIER_BOUNDS.hardIvl).toMatchObject({ min: 0.5, max: 1.3 });
        expect(MULTIPLIER_BOUNDS.ivlModifier).toMatchObject({ min: 0.5, max: 2 });
    });
    it('keeps an untouched legacy value instead of changing it on save', () => {
        expect(untouchedLegacyMultiplier('hardIvl', '1.5', 1.5)).toBe(1.5);
        expect(untouchedLegacyMultiplier('startingEase', '1.30', 1.3)).toBe(1.3);
        expect(untouchedLegacyMultiplier('ivlModifier', '0,1', 0.1)).toBe(0.1);
    });
    it('validates an edited or in-range value against Anki\'s range', () => {
        expect(untouchedLegacyMultiplier('hardIvl', '1.6', 1.5)).toBeUndefined();
        expect(untouchedLegacyMultiplier('hardIvl', '1.2', 1.2)).toBeUndefined();
    });
});
