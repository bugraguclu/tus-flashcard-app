import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import { useReduceMotion } from './useReduceMotion';

/** Matches the ~0.22s iOS uses for drawer and sheet transitions. */
export const DRAWER_DURATION_MS = 220;

/**
 * Single 0..1 progress value shared by the drawer and its dimming overlay, so both move on the
 * same curve instead of snapping. Driven natively, so a busy JS thread cannot stutter it.
 */
export function useDrawerProgress(open: boolean): Animated.Value {
    const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
    // "Hareketi Azalt": the drawer still appears, it just stops sliding across the screen.
    const reduceMotion = useReduceMotion();

    useEffect(() => {
        const animation = Animated.timing(progress, {
            toValue: open ? 1 : 0,
            duration: reduceMotion ? 0 : DRAWER_DURATION_MS,
            // Decelerating on the way in, accelerating on the way out: the drawer settles into
            // place and then gets out of the way, which is how UIKit moves panels.
            easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
            useNativeDriver: Platform.OS !== 'web',
        });
        animation.start();
        return () => animation.stop();
    }, [open, progress, reduceMotion]);

    return progress;
}
