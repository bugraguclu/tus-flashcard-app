/**
 * When the deck list's dock (components/ui/Dock.tsx) gets out of the way, as plain numbers so the
 * rule can be tested without React Native.
 *
 * The dock is on screen by default. It slides away only while the learner moves down a long list
 * on purpose, and any small move back up brings it back, as do the top of the list, the end of the
 * list (where the list keeps room for it, so it covers nothing there) and every return to the
 * screen. It never comes back on a timer or when the list comes to rest: it would slide under a
 * finger that is about to tap the row it now covers. The thresholds are Yemek Takibi's
 * (frontend/src/useMobileScrollVisibility.js), whose dock this one follows.
 */
export const DOCK_SCROLL = {
    /** Within this distance of the top the dock always shows. */
    showWithin: 80,
    /** The dock never leaves above this offset, so a short scroll keeps it. */
    hideAfter: 120,
    /** Points moved down in one direction before the dock leaves; jitter never adds up to it. */
    hideTravel: 28,
    /** Points moved up before it returns: bringing it back takes less than sending it away. */
    showTravel: 12,
    /** Within this distance of the end it shows again: the list's footer keeps its room there. */
    showNearEnd: 16,
} as const;

export interface DockScrollSample {
    /** The list's vertical offset (`contentOffset.y`); iOS reports past either end while it bounces. */
    offset: number;
    contentHeight: number;
    viewportHeight: number;
}

export interface DockScrollState {
    /** The last offset seen, held inside the list's ends. */
    offset: number;
    /** Points moved so far in `direction`. */
    travel: number;
    direction: -1 | 0 | 1;
    hidden: boolean;
}

export const DOCK_SCROLL_START: DockScrollState = { offset: 0, travel: 0, direction: 0, hidden: false };

/** The dock's state after the list reports `sample`. */
export function dockScrollStep(state: DockScrollState, sample: DockScrollSample): DockScrollState {
    const end = Math.max(0, sample.contentHeight - sample.viewportHeight);
    // A rubber band past the top or the end is not movement through the list.
    const offset = Math.min(Math.max(sample.offset, 0), end);
    if (offset < DOCK_SCROLL.showWithin || end - offset <= DOCK_SCROLL.showNearEnd) {
        return { offset, travel: 0, direction: 0, hidden: false };
    }
    const delta = offset - state.offset;
    // Under a point per report is a slow read, not a move through the list.
    if (Math.abs(delta) < 1) return { ...state, offset };
    const direction = delta > 0 ? 1 : -1;
    const travel = direction === state.direction ? state.travel + Math.abs(delta) : Math.abs(delta);
    if (travel < (direction > 0 ? DOCK_SCROLL.hideTravel : DOCK_SCROLL.showTravel)) {
        return { offset, travel, direction, hidden: state.hidden };
    }
    return { offset, travel: 0, direction, hidden: direction > 0 && offset > DOCK_SCROLL.hideAfter };
}
