import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

export type ModalAnimationType = 'none' | 'slide' | 'fade';

/** Whether a surface handing off should leave at once: only iOS holds the next modal back. */
export function modalHandoffClosesAtOnce(handingOff: boolean, os: string = Platform.OS): boolean {
    return handingOff && os === 'ios';
}

/**
 * The `animationType` a Modal should carry this render. While a hand-off closes it, it is `none`
 * on iOS so that one dismissal skips its animation; everywhere else, and for every ordinary
 * open or close, it is the Modal's own animation.
 */
export function modalHandoffAnimation(
    animationType: ModalAnimationType,
    handingOff: boolean,
    os: string = Platform.OS,
): ModalAnimationType {
    return modalHandoffClosesAtOnce(handingOff, os) ? 'none' : animationType;
}

/**
 * Lets a menu, sheet or dialog hand the screen to the next surface without making it wait.
 *
 * UIKit presents one view controller at a time. When a menu item closes its modal and opens
 * another one (or a modal route, or an Alert) in the same tap, the next one is held until the
 * menu has finished leaving, and only then starts its own animation: Kartlarım's
 * ••• › Görüntüleme sırasını değiştir showed nothing for about half a second (measured on the
 * iOS 26.5 simulator: 0.33 s fade-out, a 0.18 s gap, then the dialog's fade-in). A `PopoverMenu`
 * holds it for its 160 ms shrink, and an `AppSheet` for its 300 ms slide.
 *
 * `handOff(next)` closes this surface without its exit animation for that one close, so `next`
 * is presented at once and still animates in itself. Its `onDismiss` fires straight away too, so
 * an action deferred to it runs at once. Pass `closeAtOnce` to a `PopoverMenu`, `PopoverModal`,
 * `AppSheet`, `BottomSheetModal` or `AppDialog`, and `animationType` to a plain `Modal`. Backdrop
 * taps, Close buttons and swipe-downs keep the normal exit, and the next time the surface opens
 * it animates in as before.
 *
 * `next` must close this surface (set its `visible` to false) in the same update, along with
 * opening whatever comes next or queueing it for `onDismiss`.
 */
export function useModalHandoff(visible: boolean, animationType: ModalAnimationType = 'fade') {
    const [handingOff, setHandingOff] = useState(false);
    // The hand-off lasts for one dismissal. Clearing it while rendering the surface open again
    // (React re-renders before committing) means the presentation itself is never cut short.
    if (visible && handingOff) setHandingOff(false);

    const handOff = useCallback((next: () => void) => {
        setHandingOff(true);
        next();
    }, []);

    return {
        animationType: modalHandoffAnimation(animationType, handingOff),
        closeAtOnce: modalHandoffClosesAtOnce(handingOff),
        handOff,
    };
}
