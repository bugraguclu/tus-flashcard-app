import { useEffect, useState } from 'react';
import { useNavigation } from 'expo-router';
import {
    addCaptureStateListener,
    addScreenshotListener,
    isScreenBeingCaptured,
    setNativeScreenProtection,
} from '../modules/screen-guard';
import { screenGuard, type ScreenGuardSnapshot } from '../lib/screenGuardPolicy';
import {
    isScreenVisible,
    nextScreenVisibility,
    type ScreenVisibility,
    type ScreenVisibilityEvent,
} from '../lib/screenVisibility';

/**
 * Binds a screen that shows paid catalog content to the app's capture protection.
 *
 * `lib/screenGuardPolicy.ts` owns the "should protection be on" decision; this hook is the only
 * place that talks to the native module, so the policy stays testable and the native switch is
 * driven from exactly one subscriber no matter how many screens hold the guard.
 */

let nativeBindingInstalled = false;
/** Serializes native toggles so a fast mount/unmount cannot leave protection off. */
let pendingNativeWrite: Promise<unknown> = Promise.resolve();
let lastRequestedProtection: boolean | null = null;

function ensureNativeBinding(): void {
    if (nativeBindingInstalled) return;
    nativeBindingInstalled = true;

    screenGuard.setCaptured(isScreenBeingCaptured());
    addCaptureStateListener((captured) => screenGuard.setCaptured(captured));
    addScreenshotListener(() => screenGuard.noteScreenshot());

    screenGuard.subscribe(({ protect }) => {
        if (protect === lastRequestedProtection) return;
        lastRequestedProtection = protect;
        pendingNativeWrite = pendingNativeWrite
            .then(() => setNativeScreenProtection(protect))
            .catch(() => undefined);
    });
}

/**
 * Hold capture protection while `active` is true and the screen can be seen.
 *
 * `holder` names the screen so overlapping screens each keep their own hold; the returned
 * snapshot tells the caller when to blank its content because a recording is already running.
 *
 * Protection covers the whole window, so a screen left mounted underneath another one — the
 * reviewer after "back to decks", or under Settings — lets go once it is fully covered. Holding
 * on would keep the deck list and every other screen out of screenshots and recordings, and
 * count a screenshot of them as one of the catalog. The hold returns on the first frame of any
 * transition that reveals the screen again, a back swipe included.
 */
export function useScreenGuard(active: boolean, holder: string): ScreenGuardSnapshot {
    const [state, setState] = useState<ScreenGuardSnapshot>(() => screenGuard.snapshot());
    const visible = isScreenVisible(useScreenVisibility());

    useEffect(() => {
        ensureNativeBinding();
        return screenGuard.subscribe(setState);
    }, []);

    useEffect(() => {
        if (!active || !visible) return undefined;
        return screenGuard.acquire(holder);
    }, [active, visible, holder]);

    return state;
}

const gestureCancelListeners = new Set<() => void>();

/**
 * Pass as `screenListeners` to every stack. An abandoned back swipe is reported only to the
 * screen on top, and the screen it had started to reveal has to hear about it to let go again.
 */
export const screenGuardStackListeners = {
    gestureCancel: () => gestureCancelListeners.forEach((listener) => listener()),
};

/** The part of a stack screen's navigation object that visibility is read from. */
interface StackScreenEvents {
    isFocused(): boolean;
    addListener(type: 'focus', listener: () => void): () => void;
    addListener(
        type: 'transitionStart' | 'transitionEnd',
        listener: (event: { data: { closing: boolean } }) => void,
    ): () => void;
}

/** Tracks `lib/screenVisibility.ts` for the screen the calling component renders in. */
function useScreenVisibility(): ScreenVisibility {
    const navigation = useNavigation<StackScreenEvents>();
    const [visibility, setVisibility] = useState<ScreenVisibility>('shown');

    useEffect(() => {
        const apply = (event: ScreenVisibilityEvent) => {
            setVisibility((current) => nextScreenVisibility(current, event));
        };
        const onGestureCancel = () => apply({ type: 'gestureCancel' });
        gestureCancelListeners.add(onGestureCancel);
        const unsubscribers = [
            navigation.addListener('focus', () => apply({ type: 'focus' })),
            navigation.addListener('transitionStart', ({ data }) => {
                apply({ type: 'transitionStart', closing: data.closing, focused: navigation.isFocused() });
            }),
            navigation.addListener('transitionEnd', ({ data }) => {
                apply({ type: 'transitionEnd', closing: data.closing, focused: navigation.isFocused() });
            }),
            () => gestureCancelListeners.delete(onGestureCancel),
        ];
        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }, [navigation]);

    return visibility;
}
