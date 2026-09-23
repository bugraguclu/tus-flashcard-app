/**
 * Whether a stack screen can still be seen, derived from the events its navigator emits.
 *
 * `blur` is not enough to decide that a screen is gone. A screen stays visible behind a sheet it
 * presents, and a back swipe reveals it while its focus is still elsewhere: focus only returns
 * once the finger lifts. So a screen counts as hidden only after a covering transition has
 * finished with it unfocused, and as visible again from the first frame of any transition that
 * brings it back.
 */

/**
 * `revealing` is a back swipe in progress: the screen is partly on show but not focused yet.
 * If the swipe is abandoned it is covered again, and nothing tells the screen so directly.
 */
export type ScreenVisibility = 'shown' | 'revealing' | 'hidden';

export type ScreenVisibilityEvent =
    | { type: 'focus' }
    | { type: 'transitionStart'; closing: boolean; focused: boolean }
    | { type: 'transitionEnd'; closing: boolean; focused: boolean }
    /** An interactive transition was abandoned, in this screen's stack or any other. */
    | { type: 'gestureCancel' };

export function isScreenVisible(visibility: ScreenVisibility): boolean {
    return visibility !== 'hidden';
}

export function nextScreenVisibility(
    visibility: ScreenVisibility,
    event: ScreenVisibilityEvent,
): ScreenVisibility {
    switch (event.type) {
        case 'focus':
            return 'shown';
        case 'transitionStart':
            // A closing transition is still animating the screen away. An opening one that starts
            // before focus returns is a back swipe, which the learner can still abandon.
            if (event.closing) return visibility;
            return event.focused ? 'shown' : 'revealing';
        case 'transitionEnd':
            // Sheets and transparent modals never end a closing transition on the screen below
            // them, so that screen keeps counting as visible for as long as they are up.
            return event.closing && !event.focused ? 'hidden' : visibility;
        case 'gestureCancel':
            // react-native-screens reports an abandoned swipe only to the screen on top; the one
            // it had started to reveal gets no event at all. One swipe runs at a time, so any
            // screen still half revealed is the one that went back under.
            return visibility === 'revealing' ? 'hidden' : visibility;
    }
}
