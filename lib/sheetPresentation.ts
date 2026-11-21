/**
 * How a sheet (`AppSheet`) is shown in the window it opens in.
 *
 * - `sheet`: a phone, or any narrow window. The iPhone sheet: it rises from the bottom edge, and
 *   its grabber, a pull-down and the backdrop close it.
 * - `dialog`: a wide window (desktop web, a tablet). The same content in a card centred over the
 *   dimmed screen, with a close button, as iPadOS shows a form sheet and as the app's own dialogs
 *   (`AppDialog`) look. A grabber means nothing under a mouse, and a panel stuck to the bottom of
 *   a wide window reads as a phone layout.
 */
export type SheetPresentation = 'sheet' | 'dialog';

/** From this window width up a sheet is shown as a dialog. A phone held upright is narrower. */
export const SHEET_DIALOG_MIN_WINDOW_WIDTH = 720;

/** The widest a bottom sheet grows on a narrow window. */
export const SHEET_MAX_WIDTH = 680;

/** The widest a sheet shown as a dialog grows: a form or a short text at a comfortable line length. */
export const SHEET_DIALOG_MAX_WIDTH = 560;

/** The tallest a sheet shown as a dialog grows, in percent of the window, as `AppDialog`. */
export const SHEET_DIALOG_MAX_HEIGHT_PERCENT = 86;

export function sheetPresentationFor(windowWidth: number): SheetPresentation {
    return windowWidth >= SHEET_DIALOG_MIN_WINDOW_WIDTH ? 'dialog' : 'sheet';
}

/** A sheet's height limit when it is shown as a dialog: its own limit, never taller than a dialog. */
export function sheetDialogMaxHeight(sheetMaxHeight: `${number}%`): `${number}%` {
    const percent = Number.parseFloat(sheetMaxHeight);
    if (!Number.isFinite(percent) || percent <= 0) return `${SHEET_DIALOG_MAX_HEIGHT_PERCENT}%`;
    return `${Math.min(percent, SHEET_DIALOG_MAX_HEIGHT_PERCENT)}%`;
}
