import { useEffect, useState } from 'react';
import {
    addCaptureStateListener,
    addScreenshotListener,
    isScreenBeingCaptured,
    setNativeScreenProtection,
} from '../modules/screen-guard';
import { screenGuard, type ScreenGuardSnapshot } from '../lib/screenGuardPolicy';

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
            // The native call reports whether the window-level shield actually went in. That
            // answer used to be dropped, so a build that could not install it — a future iOS
            // that moves the private layer, the build switch off, Expo Go with no native half —
            // went on believing it was protected while every screenshot went through. The
            // policy is told either way, so the layers that do work can carry more of the load.
            .then(() => setNativeScreenProtection(protect))
            .then((installed) => screenGuard.setShielded(protect && installed))
            .catch(() => screenGuard.setShielded(false));
    });
}

/**
 * Hold capture protection while `active` is true.
 *
 * `holder` names the screen so overlapping screens each keep their own hold; the returned
 * snapshot tells the caller when to blank its content because a recording is already running.
 */
export function useScreenGuard(active: boolean, holder: string): ScreenGuardSnapshot {
    const [state, setState] = useState<ScreenGuardSnapshot>(() => screenGuard.snapshot());

    useEffect(() => {
        ensureNativeBinding();
        return screenGuard.subscribe(setState);
    }, []);

    useEffect(() => {
        if (!active) return undefined;
        return screenGuard.acquire(holder);
    }, [active, holder]);

    // Blanking after a screenshot ends on a clock, and the policy only emits when something is
    // done to it. Without this the card would stay hidden until the next unrelated change.
    useEffect(() => {
        if (state.blankUntil === null) return undefined;
        const timer = setTimeout(() => setState(screenGuard.snapshot()), Math.max(0, state.blankUntil - Date.now()));
        return () => clearTimeout(timer);
    }, [state.blankUntil]);

    return state;
}
