/**
 * The extra side inset that centres a column of `maxWidth` in a window `windowWidth` wide, or 0
 * while the window is narrower (every phone). Whole points, so a bar and the list under it line up.
 */
export function centeredInset(windowWidth: number, maxWidth: number): number {
    return Math.max(0, Math.floor((windowWidth - maxWidth) / 2));
}
