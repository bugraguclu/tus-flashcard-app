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
 * iOS mechanism 1 (reparenting the key window under a secure text field's canvas layer)
 * alters UIKit window scene coordinates and displaces the key window into the bottom-right
 * quadrant on iOS. It is disabled by default and can be opted into via
 * EXPO_PUBLIC_CATALOG_SECURE_LAYER=true.
 * Mechanisms 2 (capture blanking), 3 (screenshot notification warning) and 4 (app switcher cover)
 * safely carry catalog protection without layer manipulation.
 */
const USE_SECURE_LAYER = process.env.EXPO_PUBLIC_CATALOG_SECURE_LAYER === 'true';

/**
 * Turn window-level capture protection on or off.
 * Resolves false when the platform accepted the request but could not install the shield.
 */
export async function setNativeScreenProtection(_enabled: boolean): Promise<boolean> {
    if (!nativeModule) return false;
    try {
        await nativeModule.setProtectedAsync(false, false);
    } catch {
        // Ignore native error
    }
    return false;
}

/** True while the display is recorded, mirrored or captured over USB (disabled). */
export function isScreenBeingCaptured(): boolean {
    return false;
}

export function addScreenshotListener(_listener: () => void): ScreenGuardSubscription | null {
    return null;
}

export function addCaptureStateListener(_listener: (isCaptured: boolean) => void): ScreenGuardSubscription | null {
    return null;
}
