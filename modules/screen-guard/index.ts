import { requireOptionalNativeModule } from 'expo';

/**
 * Native screen-capture protection.
 *
 * The module is optional on purpose: Expo Go and the web build have no native half, and the app
 * must still run there. Every entry point below degrades to "unprotected" rather than throwing,
 * and `isScreenGuardNative` lets callers tell a real guard from a no-op.
 */

/** The only part of an Expo event subscription this module uses. `expo-modules-core` is not
 *  resolvable from the project root, and widening the type here would buy nothing. */
export interface ScreenGuardSubscription {
    remove(): void;
}

interface ScreenGuardNativeModule {
    setProtectedAsync(enabled: boolean, useSecureLayer: boolean): Promise<boolean>;
    isCaptured(): boolean;
    addListener(event: 'onScreenshot', listener: () => void): ScreenGuardSubscription;
    addListener(event: 'onCaptureStateChange', listener: (payload: { isCaptured: boolean }) => void): ScreenGuardSubscription;
}

const nativeModule = requireOptionalNativeModule<ScreenGuardNativeModule>('ScreenGuard');

/** True when a build actually carries the native guard. */
export const isScreenGuardNative = nativeModule !== null;

/**
 * iOS mechanism 1 (see the Swift module) reads a private view hierarchy. It is on by default and
 * can be switched off from the build config if a future iOS release changes that hierarchy —
 * the app-switcher cover and capture detection are unaffected either way.
 */
const USE_SECURE_LAYER = process.env.EXPO_PUBLIC_CATALOG_SECURE_LAYER !== 'false';

/**
 * Turn window-level capture protection on or off.
 * Resolves false when the platform accepted the request but could not install the shield.
 */
export async function setNativeScreenProtection(enabled: boolean): Promise<boolean> {
    if (!nativeModule) return false;
    try {
        return await nativeModule.setProtectedAsync(enabled, USE_SECURE_LAYER);
    } catch {
        return false;
    }
}

/** True while the display is recorded, mirrored or captured over USB (iOS only). */
export function isScreenBeingCaptured(): boolean {
    if (!nativeModule) return false;
    try {
        return nativeModule.isCaptured();
    } catch {
        return false;
    }
}

export function addScreenshotListener(listener: () => void): ScreenGuardSubscription | null {
    if (!nativeModule) return null;
    try {
        return nativeModule.addListener('onScreenshot', listener);
    } catch {
        return null;
    }
}

export function addCaptureStateListener(listener: (isCaptured: boolean) => void): ScreenGuardSubscription | null {
    if (!nativeModule) return null;
    try {
        return nativeModule.addListener('onCaptureStateChange', ({ isCaptured }) => listener(isCaptured));
    } catch {
        return null;
    }
}
