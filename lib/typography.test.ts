import { describe, expect, it } from 'vitest';
import {
    DEFAULT_TYPE_ROLE,
    FONT_SCALE_CAPS,
    MIN_TOUCH_TARGET,
    clampFontScale,
    fontScaleCap,
    scaledFontSize,
    scaledRowHeight,
    type TypeRole,
} from './typography';

const ROLES = Object.keys(FONT_SCALE_CAPS) as TypeRole[];

/** Roughly what iOS reports at the largest accessibility text size. */
const LARGEST_ACCESSIBILITY_SCALE = 3.1;

describe('clampFontScale', () => {
    it('passes a scale through when it is under the cap', () => {
        expect(clampFontScale(1.2, 1.5)).toBe(1.2);
    });

    it('holds the scale at the cap once it is exceeded', () => {
        expect(clampFontScale(LARGEST_ACCESSIBILITY_SCALE, 1.5)).toBe(1.5);
    });

    it('never shrinks text below the design size', () => {
        expect(clampFontScale(0.8, 1.5)).toBe(1);
        expect(clampFontScale(0, 1.5)).toBe(1);
        expect(clampFontScale(-2, 1.5)).toBe(1);
    });

    it('falls back to 1 for an unusable scale or cap', () => {
        expect(clampFontScale(Number.NaN, 1.5)).toBe(1);
        expect(clampFontScale(1.4, Number.NaN)).toBe(1);
        // An unbounded cap means no policy was supplied, not "grow without limit".
        expect(clampFontScale(2, Number.POSITIVE_INFINITY)).toBe(1);
    });

    it('holds an unbounded scale at the cap', () => {
        expect(clampFontScale(Number.POSITIVE_INFINITY, 1.5)).toBe(1.5);
    });

    it('treats a cap below 1 as no scaling rather than as shrinking', () => {
        expect(clampFontScale(2, 0.5)).toBe(1);
    });
});

describe('fontScaleCap', () => {
    it('defaults to the body cap', () => {
        expect(fontScaleCap()).toBe(FONT_SCALE_CAPS.body);
        expect(DEFAULT_TYPE_ROLE).toBe('body');
    });

    it('lets body copy grow further than a title or a badge', () => {
        expect(fontScaleCap('body')).toBeGreaterThan(fontScaleCap('title'));
        expect(fontScaleCap('title')).toBeGreaterThan(fontScaleCap('badge'));
    });

    it('caps every role above 1, so the preference is honoured everywhere', () => {
        for (const role of ROLES) {
            expect(fontScaleCap(role)).toBeGreaterThan(1);
        }
    });

    it('falls back to the body cap for an unknown role', () => {
        expect(fontScaleCap('nope' as TypeRole)).toBe(FONT_SCALE_CAPS.body);
    });
});

describe('scaledFontSize', () => {
    it('grows text with the reader\'s setting', () => {
        expect(scaledFontSize(16, 1.25, 'body')).toBe(20);
    });

    it('stops growing at the role cap', () => {
        expect(scaledFontSize(32, LARGEST_ACCESSIBILITY_SCALE, 'display'))
            .toBe(32 * FONT_SCALE_CAPS.display);
    });

    it('returns 0 for a missing or invalid base size', () => {
        expect(scaledFontSize(0, 1.5)).toBe(0);
        expect(scaledFontSize(-4, 1.5)).toBe(0);
        expect(scaledFontSize(Number.NaN, 1.5)).toBe(0);
    });
});

describe('scaledRowHeight', () => {
    it('keeps the design height at the default text size', () => {
        expect(scaledRowHeight(48, 1, 'body')).toBe(48);
    });

    it('grows a row with its label instead of clipping it', () => {
        expect(scaledRowHeight(48, 1.5, 'body')).toBe(72);
    });

    it('never drops below the 44pt touch target', () => {
        expect(scaledRowHeight(28, 1, 'body')).toBe(MIN_TOUCH_TARGET);
    });

    it('stops growing at the role cap', () => {
        expect(scaledRowHeight(48, LARGEST_ACCESSIBILITY_SCALE, 'badge'))
            .toBe(Math.round(48 * FONT_SCALE_CAPS.badge));
    });

    it('returns whole pixels', () => {
        expect(Number.isInteger(scaledRowHeight(44, 1.3, 'title'))).toBe(true);
    });
});
