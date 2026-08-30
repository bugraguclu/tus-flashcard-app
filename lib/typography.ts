// Dynamic Type policy. iOS lets the reader raise the system text size to roughly 3.1x at the
// largest accessibility setting; React Native applies that to every Text and has no global cap.
// Uncapped, a 32pt title becomes 99pt and pushes everything off the row. Capping per role rather
// than globally lets body copy grow further than a title that has to share a line with controls.
//
// Kept free of react and react-native so the arithmetic is unit tested; constants/theme.ts
// re-exports the policy as the app-facing surface.

/** What a run of text is doing, which decides how far it may grow. */
export type TypeRole =
    /** Screen titles and hero numbers: share a row with controls, so they grow least. */
    | 'display'
    /** Section and row titles. */
    | 'title'
    /** Default: paragraphs, labels, menu entries. The reader needs these most. */
    | 'body'
    /** Secondary lines under a title. */
    | 'caption'
    /** Counts inside a fixed pill; growth breaks the circle, so barely any. */
    | 'badge';

export const FONT_SCALE_CAPS: Record<TypeRole, number> = {
    display: 1.2,
    title: 1.3,
    body: 1.5,
    caption: 1.4,
    badge: 1.2,
};

export const DEFAULT_TYPE_ROLE: TypeRole = 'body';

/** Text inputs are laid out by the platform text view, so they stay tighter than body copy. */
export const INPUT_FONT_SCALE_CAP = 1.3;

/**
 * The reader's scale, held between 1 and the role's cap. Scales below 1 are pinned to 1: the
 * caps exist to stop clipping, never to render text smaller than the design size. An unbounded
 * cap means no policy was supplied, which is treated as "do not scale" rather than "no limit".
 */
export function clampFontScale(scale: number, cap: number): number {
    if (Number.isNaN(scale) || Number.isNaN(cap)) return 1;
    if (!Number.isFinite(cap) || cap < 1) return 1;
    if (scale < 1) return 1;
    return Math.min(scale, cap);
}

export function fontScaleCap(role: TypeRole = DEFAULT_TYPE_ROLE): number {
    return FONT_SCALE_CAPS[role] ?? FONT_SCALE_CAPS[DEFAULT_TYPE_ROLE];
}

/** The size a run of text actually renders at once the cap is applied. */
export function scaledFontSize(baseSize: number, scale: number, role: TypeRole = DEFAULT_TYPE_ROLE): number {
    if (!Number.isFinite(baseSize) || baseSize <= 0) return 0;
    return baseSize * clampFontScale(scale, fontScaleCap(role));
}

/**
 * A row's minimum height at the reader's text size. Rows are laid out with a fixed height in
 * StyleSheet, which clips as soon as the text outgrows it; feeding this into minHeight lets the
 * row grow with its label while never dropping below Apple's 44pt touch target.
 */
export const MIN_TOUCH_TARGET = 44;

export function scaledRowHeight(
    baseHeight: number,
    scale: number,
    role: TypeRole = DEFAULT_TYPE_ROLE,
): number {
    const grown = baseHeight * clampFontScale(scale, fontScaleCap(role));
    return Math.max(MIN_TOUCH_TARGET, Math.round(grown));
}
