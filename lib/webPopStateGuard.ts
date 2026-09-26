import { Platform } from 'react-native';

/**
 * Browser Back and Forward (a button, a trackpad swipe, Alt+Left) reach Expo Router as `popstate`
 * events, which it follows by resetting the navigation state. No `beforeRemove` runs on the way,
 * so a screen cannot refuse to be left as the in-app back button lets it.
 *
 * Guards registered here hear every `popstate` before the router does, and one that handles it
 * keeps the router from following. That depends on order: listeners on `window` run in the order
 * they were added, whatever their phase, in some browsers, so this module adds its listener when
 * the root layout imports it — before the router adds its own on mount.
 */
export type PopStateGuard = (event: PopStateEvent) => boolean;

const guards = new Set<PopStateGuard>();

if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', (event) => {
        for (const guard of Array.from(guards)) {
            if (guard(event)) {
                event.stopImmediatePropagation();
                return;
            }
        }
    }, true);
}

/** Registers `guard`, which returns true for a `popstate` it has handled; returns the remover. */
export function addPopStateGuard(guard: PopStateGuard): () => void {
    guards.add(guard);
    return () => {
        guards.delete(guard);
    };
}
