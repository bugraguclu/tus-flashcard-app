import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// One shared subscription to the system setting, as useReduceMotion keeps for its own.
let screenReaderEnabled = false;
let watchingScreenReader = false;
const listeners = new Set<() => void>();

function setScreenReader(enabled: boolean) {
    if (enabled === screenReaderEnabled) return;
    screenReaderEnabled = enabled;
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    // A browser cannot tell: react-native-web answers true for everyone, which would hold every
    // such control in place for every web visitor.
    if (!watchingScreenReader && Platform.OS !== 'web') {
        watchingScreenReader = true;
        try {
            AccessibilityInfo.isScreenReaderEnabled?.().then(setScreenReader).catch(() => undefined);
            AccessibilityInfo.addEventListener?.('screenReaderChanged', setScreenReader);
        } catch {
            // No accessibility module (a test double of React Native): no screen reader.
        }
    }
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/**
 * Whether VoiceOver (or another screen reader) is running. Controls that would come and go with a
 * gesture stay put while it is: it moves through the screen element by element and scrolls the
 * list on its own, so a control that left would drop out from under it.
 */
export function useScreenReaderEnabled(): boolean {
    return useSyncExternalStore(subscribe, () => screenReaderEnabled, () => false);
}
