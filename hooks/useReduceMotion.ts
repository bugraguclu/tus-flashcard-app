import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

// One shared subscription to the system setting: every menu, sheet and button that animates
// reads it, and Deck Options alone keeps a sheet mounted for each option card.
let reduceMotionEnabled = false;
let watchingReduceMotion = false;
const listeners = new Set<() => void>();

function setReduceMotion(enabled: boolean) {
    if (enabled === reduceMotionEnabled) return;
    reduceMotionEnabled = enabled;
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    if (!watchingReduceMotion) {
        watchingReduceMotion = true;
        try {
            AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => undefined);
            AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
        } catch {
            // No accessibility module (a test double of React Native): motion stays on.
        }
    }
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/**
 * Whether the learner has asked the system to reduce motion (iOS Settings › Accessibility ›
 * Motion). Animations that move, grow or stretch something cross-fade instead, or jump.
 */
export function useReduceMotion(): boolean {
    return useSyncExternalStore(subscribe, () => reduceMotionEnabled, () => false);
}
