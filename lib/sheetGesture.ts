// Pull-to-dismiss thresholds for sheets presented from the bottom edge. UIKit dismisses a sheet
// on either a long enough drag or a fast enough flick, so a short flick still closes and a slow
// drag that stops short springs back. Kept pure so both rules are unit tested; the PanResponder
// in components/SheetModal.tsx only feeds it numbers.

/** Past this fraction of the sheet's height, the drag alone dismisses. */
export const DISMISS_DISTANCE_RATIO = 0.28;
/** Points per millisecond; a flick this fast dismisses regardless of how far it travelled. */
export const DISMISS_VELOCITY = 0.5;
/** A drag shorter than this is a tap or a scroll nudge, never a dismissal. */
export const MIN_DISMISS_DISTANCE = 8;

export interface SheetDragState {
    /** Downward drag in points; upward drags are negative. */
    dy: number;
    /** Vertical velocity in points per millisecond, as PanResponder reports it. */
    vy: number;
    /** Sheet height, so the distance rule scales with the surface rather than the screen. */
    height: number;
}

/** How far the sheet has actually moved: it follows the finger down but never lifts above its resting position. */
export function sheetTranslate(dy: number): number {
    if (!Number.isFinite(dy) || dy <= 0) return 0;
    return dy;
}

export function shouldDismissSheet({ dy, vy, height }: SheetDragState): boolean {
    if (!Number.isFinite(dy) || dy < MIN_DISMISS_DISTANCE) return false;
    if (Number.isFinite(vy) && vy >= DISMISS_VELOCITY) return true;
    if (!Number.isFinite(height) || height <= 0) return false;
    return dy >= height * DISMISS_DISTANCE_RATIO;
}

/**
 * Whether a touch that has begun moving should be treated as a sheet drag rather than handed to
 * the list inside it. Only downward movement claims the gesture, and only once it is clearly
 * vertical, so a horizontal swipe or a scroll up still reaches the content.
 */
export function isSheetDrag(dx: number, dy: number): boolean {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    return dy > 4 && dy > Math.abs(dx) * 1.5;
}
