/**
 * The widest a screen's reading column grows on a wide window (desktop web, iPad). Lists,
 * forms and cards wider than this are hard to scan, so wider screens centre the column and
 * leave the extra width empty. A phone is always narrower, so it never sees the limit.
 */
export const READABLE_WIDTH = 760;

/** The deck list and the card browser: tables whose counts sit at the right edge. */
export const LIST_WIDTH = 920;

/**
 * The extra side inset that centres a column of `maxWidth` in a window `windowWidth` wide, or 0
 * while the window is narrower (every phone). Whole points, so a bar and the list under it line up.
 */
export function centeredInset(windowWidth: number, maxWidth: number): number {
    return Math.max(0, Math.floor((windowWidth - maxWidth) / 2));
}
