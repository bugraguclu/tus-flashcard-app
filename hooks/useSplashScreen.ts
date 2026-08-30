import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// Called at module scope so the native launch screen stays up until the database, migrations
// and the catalog gate have resolved; without it Expo hides it as soon as the bundle runs and
// the first real screen is still a frame away. Every call is a no-op on web.
if (Platform.OS !== 'web') {
    SplashScreen.preventAutoHideAsync().catch(() => undefined);
    SplashScreen.setOptions({ duration: 300, fade: true });
}

let splashHidden = false;

/** Hides the native splash exactly once, whichever startup gate finishes first. */
export function hideSplashScreen(): void {
    if (splashHidden) return;
    splashHidden = true;
    SplashScreen.hideAsync().catch(() => undefined);
}

/**
 * Hides the splash after the frame that paints real content, so the fade reveals the app
 * rather than an empty window. Safe to mount in several gates: the hide itself is idempotent.
 */
export function useHideSplashWhenReady(ready: boolean): void {
    useEffect(() => {
        if (!ready) return;
        let inner = 0;
        const outer = requestAnimationFrame(() => {
            inner = requestAnimationFrame(hideSplashScreen);
        });
        return () => {
            cancelAnimationFrame(outer);
            if (inner) cancelAnimationFrame(inner);
        };
    }, [ready]);
}
