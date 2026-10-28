/**
 * The app-wide text size the Settings slider snaps between. Screens keep their fixed `FontSize`
 * styles; `components/AppText` multiplies every Text and TextInput by the chosen step, so a new
 * screen scales without doing anything.
 */
export const TEXT_SIZE_LEVELS = ['small', 'default', 'large', 'xlarge'] as const;
export type TextSizeLevel = typeof TEXT_SIZE_LEVELS[number];
export const DEFAULT_TEXT_SIZE_LEVEL: TextSizeLevel = 'default';

const MULTIPLIERS: Record<TextSizeLevel, number> = {
    small: 0.9,
    default: 1,
    large: 1.15,
    xlarge: 1.3,
};

/** React Native's own size for a Text or TextInput that does not set one, on iOS and on web. */
export const DEFAULT_FONT_SIZE = 14;

/** Above this size type is already legible, so it grows less than body copy (as Dynamic Type does). */
const FULL_SCALE_LIMIT = 20;

export function normalizeTextSizeLevel(value: unknown): TextSizeLevel {
    return TEXT_SIZE_LEVELS.includes(value as TextSizeLevel) ? value as TextSizeLevel : DEFAULT_TEXT_SIZE_LEVEL;
}

export function textSizeMultiplier(level: unknown): number {
    return MULTIPLIERS[normalizeTextSizeLevel(level)];
}

export function textSizeLevelIndex(level: unknown): number {
    return TEXT_SIZE_LEVELS.indexOf(normalizeTextSizeLevel(level));
}

/** The step nearest to a 0–1 position along the slider track. */
export function textSizeLevelAt(ratio: number): TextSizeLevel {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    return TEXT_SIZE_LEVELS[Math.round(clamped * (TEXT_SIZE_LEVELS.length - 1))];
}

/**
 * The multiplier one Text applies: none when it opts out of font scaling, and never more than
 * its own `maxFontSizeMultiplier`, which caps the in-app step the same way it caps the system's.
 */
export function effectiveTextMultiplier(
    multiplier: number,
    allowFontScaling: boolean | undefined,
    maxFontSizeMultiplier: number | null | undefined,
): number {
    if (allowFontScaling === false) return 1;
    if (typeof maxFontSizeMultiplier === 'number' && maxFontSizeMultiplier >= 1) {
        return Math.min(multiplier, maxFontSizeMultiplier);
    }
    return multiplier;
}

/**
 * What is left of a Text's `maxFontSizeMultiplier` for the system text size once the in-app step
 * has been applied, so the two together stay inside the cap the screen asked for.
 */
export function remainingSystemMultiplier(
    maxFontSizeMultiplier: number | null | undefined,
    applied: number,
): number | null | undefined {
    if (typeof maxFontSizeMultiplier !== 'number' || maxFontSizeMultiplier < 1) return maxFontSizeMultiplier;
    return Math.max(1, maxFontSizeMultiplier / applied);
}

/** A font size at the given step, rounded to half a point so glyphs stay on the pixel grid. */
export function scaleFontSize(size: number, multiplier: number): number {
    if (multiplier === 1 || !(size > 0)) return size;
    const weight = size <= FULL_SCALE_LIMIT ? 1 : Math.max(0.5, FULL_SCALE_LIMIT / size);
    return Math.round(size * (1 + (multiplier - 1) * weight) * 2) / 2;
}

type ScalableTextStyle = {
    fontSize?: number;
    lineHeight?: number;
    letterSpacing?: number;
};

/**
 * The style overrides that draw a flattened Text style at the given step. A nested Text that
 * sets no size inherits its parent's already scaled one, so it gets no `fontSize` of its own.
 * Line height and letter spacing follow the font size, keeping the line box and tracking the
 * screen was designed with.
 */
export function scaleTextStyle(
    style: ScalableTextStyle | null | undefined,
    multiplier: number,
    nested = false,
): ScalableTextStyle | null {
    if (multiplier === 1) return null;
    const fontSize = typeof style?.fontSize === 'number' ? style.fontSize : nested ? undefined : DEFAULT_FONT_SIZE;
    const patch: ScalableTextStyle = {};
    let ratio = multiplier;
    if (fontSize !== undefined) {
        patch.fontSize = scaleFontSize(fontSize, multiplier);
        ratio = patch.fontSize / fontSize;
    }
    if (typeof style?.lineHeight === 'number' && style.lineHeight > 0) {
        patch.lineHeight = Math.round(style.lineHeight * ratio * 2) / 2;
    }
    if (typeof style?.letterSpacing === 'number' && style.letterSpacing !== 0) {
        patch.letterSpacing = Math.round(style.letterSpacing * ratio * 100) / 100;
    }
    return patch;
}
