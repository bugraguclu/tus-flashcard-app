import type { TextStyle } from 'react-native';
import { BorderRadius, FontSize } from '../../constants/theme';

/**
 * The design system's roles, built on the scales in `constants/theme`. Components in this folder
 * draw every button, row, card, sheet and dialog from these, so one change here reaches every
 * screen. See docs/DESIGN_SYSTEM.md.
 */

/** Corner radius by kind of surface. */
export const Radius = {
    /** Buttons, text fields, steppers and other controls. */
    control: BorderRadius.sm,
    /** Popover menus, segmented tracks and boxes set inside a card. */
    inset: BorderRadius.md,
    /** Cards and dialogs. */
    card: BorderRadius.lg,
    /** The top corners of a bottom sheet. */
    sheet: BorderRadius.xl,
    /** Chips, badges and anything drawn as a capsule. */
    pill: BorderRadius.full,
} as const;

/** The smallest touch target, in points, for anything the user taps. */
export const HIT_TARGET = 44;

/** How faded a control is while it cannot be used. */
export const DISABLED_OPACITY = 0.45;

/** Text roles: each pairs a size with a weight, so the same job reads the same everywhere. */
export const Type = {
    /** Screen, sheet and dialog titles. */
    title: { fontSize: FontSize.xl, fontWeight: '600' },
    /** A card's heading. */
    sectionTitle: { fontSize: FontSize.lg, fontWeight: '600' },
    /** The title of a list row or setting. */
    rowTitle: { fontSize: FontSize.md, fontWeight: '500' },
    body: { fontSize: FontSize.md, fontWeight: '400' },
    bodyStrong: { fontSize: FontSize.md, fontWeight: '600' },
    /** Labels on filled and outlined buttons. */
    button: { fontSize: FontSize.md, fontWeight: '600' },
    /** Labels on text-only buttons. */
    textButton: { fontSize: FontSize.md, fontWeight: '600' },
    /** Summaries, hints and footnotes under a title. */
    caption: { fontSize: FontSize.sm, fontWeight: '400', lineHeight: 18 },
    /** A small sentence-case label that names a group above its card. */
    label: { fontSize: FontSize.sm, fontWeight: '500' },
} as const satisfies Record<string, TextStyle>;
