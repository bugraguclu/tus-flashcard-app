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
            .then(() => setNativeScreenProtection(protect))
            .catch(() => undefined);
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

    return state;
}
