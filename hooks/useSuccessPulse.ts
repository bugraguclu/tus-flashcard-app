import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { NATIVE_DRIVER, SUCCESS_PULSE_SCALE } from '../constants/motion';
import { keyframes, MotionCurve } from '../lib/motion';
import { useReduceMotion } from './useReduceMotion';

const PULSE_MS = 300;
// Up to 1.06 quickly, easing out, then back to 1 easing in and out.
const PULSE = keyframes(1, [
    { at: 110 / PULSE_MS, value: SUCCESS_PULSE_SCALE },
    { at: 1, value: 1, curve: MotionCurve.easeInOut },
]);

/**
 * A scale that pulses once, 1 → 1.06 → 1, each time `confirmed` turns true: a "Saved" label
 * confirms itself with a single beat instead of only changing its words. Use it as the
 * `transform: [{ scale }]` of a view around the confirming control. Both halves of the beat run
 * on one native clock, so a busy save cannot leave the label swollen. Reduce Motion keeps it still.
 */
export function useSuccessPulse(confirmed: boolean): Animated.AnimatedInterpolation<number> {
    const reduceMotion = useReduceMotion();
    // At rest the clock sits at the end of the beat, where the scale is 1.
    const clock = useRef(new Animated.Value(1)).current;
    const wasConfirmed = useRef(confirmed);

    useEffect(() => {
        const turnedOn = confirmed && !wasConfirmed.current;
        wasConfirmed.current = confirmed;
        if (!turnedOn || reduceMotion) return undefined;
        clock.setValue(0);
        const pulse = Animated.timing(clock, {
            toValue: 1,
            duration: PULSE_MS,
            easing: Easing.linear,
            useNativeDriver: NATIVE_DRIVER,
            isInteraction: false,
        });
        pulse.start();
        // An edit that takes "Saved" away mid-beat leaves the control at its own size.
        return () => {
            pulse.stop();
            clock.setValue(1);
        };
    }, [clock, confirmed, reduceMotion]);

    return useMemo(() => clock.interpolate({ ...PULSE, extrapolate: 'clamp' }), [clock]);
}
