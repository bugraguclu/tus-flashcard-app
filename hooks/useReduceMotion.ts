import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// iOS "Hareketi Azalt" (Settings > Accessibility > Motion) and the Android equivalent ask apps to
// drop non-essential animation. The flag is read once at startup and then kept live through the
// system event, so toggling it in Settings takes effect without restarting the app.

let cachedReduceMotion = false;
const listeners = new Set<(value: boolean) => void>();
let started = false;

function publish(value: boolean): void {
    if (value === cachedReduceMotion) return;
    cachedReduceMotion = value;
    for (const listener of listeners) listener(value);
}

function start(): void {
    if (started || Platform.OS === 'web') return;
    started = true;
    AccessibilityInfo.isReduceMotionEnabled()
        .then(publish)
        .catch(() => undefined);
    AccessibilityInfo.addEventListener('reduceMotionChanged', publish);
}

/**
 * Non-reactive read for code outside the React tree (LayoutAnimation callbacks, imperative
 * Animated timings). Returns the last known value; `useReduceMotion` keeps it fresh.
 */
export function isReduceMotionEnabled(): boolean {
    return cachedReduceMotion;
}

/** Scales an animation duration to 0 when the user has asked for reduced motion. */
export function motionDuration(durationMs: number): number {
    return cachedReduceMotion ? 0 : durationMs;
}

export function useReduceMotion(): boolean {
    const [reduceMotion, setReduceMotion] = useState(cachedReduceMotion);

    useEffect(() => {
        start();
        setReduceMotion(cachedReduceMotion);
        listeners.add(setReduceMotion);
        return () => {
            listeners.delete(setReduceMotion);
        };
    }, []);

    return reduceMotion;
}

// Started on import so the imperative readers above are accurate before the first screen mounts.
start();
