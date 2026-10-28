import { describe, expect, it } from 'vitest';
import {
    DEFAULT_TEXT_SIZE_LEVEL,
    effectiveTextMultiplier,
    normalizeTextSizeLevel,
    remainingSystemMultiplier,
    scaleFontSize,
    scaleTextStyle,
    TEXT_SIZE_LEVELS,
    textSizeLevelAt,
    textSizeLevelIndex,
    textSizeMultiplier,
} from './textScale';
import { DEFAULT_SETTINGS, validateSettings } from './settingsStore';

describe('text size steps', () => {
    it('offers four steps around the designed size, growing in order', () => {
        expect(TEXT_SIZE_LEVELS).toHaveLength(4);
        expect(DEFAULT_TEXT_SIZE_LEVEL).toBe('default');
        expect(textSizeMultiplier('default')).toBe(1);
        const multipliers = TEXT_SIZE_LEVELS.map(textSizeMultiplier);
        expect([...multipliers].sort((a, b) => a - b)).toEqual(multipliers);
        expect(new Set(multipliers).size).toBe(4);
    });

    it('reads a missing or unknown stored step as the designed size', () => {
        expect(normalizeTextSizeLevel(undefined)).toBe('default');
        expect(normalizeTextSizeLevel('huge')).toBe('default');
        expect(normalizeTextSizeLevel(2)).toBe('default');
        expect(normalizeTextSizeLevel('xlarge')).toBe('xlarge');
        expect(textSizeMultiplier('nonsense')).toBe(1);
        expect(textSizeLevelIndex('large')).toBe(2);
    });

    it('snaps a slider position to the nearest step and clamps outside the track', () => {
        expect(textSizeLevelAt(0)).toBe('small');
        expect(textSizeLevelAt(0.16)).toBe('small');
        expect(textSizeLevelAt(0.17)).toBe('default');
        expect(textSizeLevelAt(0.5)).toBe('large');
        expect(textSizeLevelAt(0.84)).toBe('xlarge');
        expect(textSizeLevelAt(1)).toBe('xlarge');
        expect(textSizeLevelAt(-3)).toBe('small');
        expect(textSizeLevelAt(7)).toBe('xlarge');
        expect(textSizeLevelAt(Number.NaN)).toBe('small');
    });

    it('is a validated preference that defaults to the designed size', () => {
        expect(DEFAULT_SETTINGS.textSizeLevel).toBe('default');
        expect(validateSettings({ ...DEFAULT_SETTINGS, textSizeLevel: 'large' }).textSizeLevel).toBe('large');
        expect(validateSettings({ ...DEFAULT_SETTINGS, textSizeLevel: 'giant' }).textSizeLevel).toBe('default');
    });
});

describe('scaled font sizes', () => {
    it('leaves the designed size untouched', () => {
        expect(scaleFontSize(14, 1)).toBe(14);
        expect(scaleTextStyle({ fontSize: 14, lineHeight: 20 }, 1)).toBeNull();
    });

    it('scales body copy by the full step, on the half-point grid', () => {
        expect(scaleFontSize(14, 1.3)).toBe(18);
        expect(scaleFontSize(12, 1.15)).toBe(14);
        expect(scaleFontSize(16, 0.9)).toBe(14.5);
        expect(scaleFontSize(20, 1.3)).toBe(26);
    });

    it('grows headings and big numbers less than body copy, but never shrinks them', () => {
        const growth = (size: number) => scaleFontSize(size, 1.3) / size;
        expect(growth(28)).toBeLessThan(growth(14));
        expect(growth(56)).toBeLessThan(growth(28));
        expect(scaleFontSize(56, 1.3)).toBeGreaterThan(56);
        // Each step still reads as larger than the one below it, at every size.
        for (const size of [10, 14, 22, 32, 64]) {
            const sizes = TEXT_SIZE_LEVELS.map((level) => scaleFontSize(size, textSizeMultiplier(level)));
            expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
        }
    });

    it('keeps the line box and tracking in proportion to the new size', () => {
        expect(scaleTextStyle({ fontSize: 14, lineHeight: 20, letterSpacing: 0.5 }, 1.3)).toEqual({
            fontSize: 18,
            lineHeight: 25.5,
            letterSpacing: 0.64,
        });
    });

    it('gives a top-level Text without a size the scaled default, and a nested one none', () => {
        expect(scaleTextStyle({}, 1.3)).toEqual({ fontSize: 18 });
        expect(scaleTextStyle(undefined, 1.3)).toEqual({ fontSize: 18 });
        expect(scaleTextStyle({ fontWeight: 'bold' } as never, 1.3, true)).toEqual({});
        expect(scaleTextStyle({ lineHeight: 20 }, 1.3, true)).toEqual({ lineHeight: 26 });
    });
});

describe('opting out and capping', () => {
    it('drops the step for Text that opts out of font scaling', () => {
        expect(effectiveTextMultiplier(1.3, false, undefined)).toBe(1);
        expect(effectiveTextMultiplier(1.3, true, undefined)).toBe(1.3);
        expect(effectiveTextMultiplier(0.9, undefined, undefined)).toBe(0.9);
    });

    it('lets maxFontSizeMultiplier cap the step and then the system size, together', () => {
        expect(effectiveTextMultiplier(1.3, undefined, 1.2)).toBe(1.2);
        expect(effectiveTextMultiplier(1.15, undefined, 1.2)).toBe(1.15);
        expect(effectiveTextMultiplier(1.3, undefined, 0)).toBe(1.3);
        expect(remainingSystemMultiplier(1.3, 1.3)).toBe(1);
        expect(remainingSystemMultiplier(1.5, 1.2)).toBeCloseTo(1.25);
        expect(remainingSystemMultiplier(1.3, 0.9)).toBeCloseTo(1.444);
        expect(remainingSystemMultiplier(undefined, 1.3)).toBeUndefined();
        expect(remainingSystemMultiplier(0, 1.3)).toBe(0);
    });
});
