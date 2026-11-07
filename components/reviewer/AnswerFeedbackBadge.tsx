import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { exitDuration, MotionDuration, NATIVE_DRIVER } from '../../constants/motion';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { BADGE_START_SCALE, keyframes } from '../../lib/motion';

interface AnswerFeedbackBadgeProps {
    /** How long the badge is shown, entrance and exit included; the parent removes it then. */
    lifetimeMs: number;
    style?: StyleProp<ViewStyle>;
    children: React.ReactNode;
    accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
}

/**
 * The brief mark the study screen shows after an answer: it grows into place easing out, holds,
 * and fades a fifth faster than it came, all inside `lifetimeMs`. The steps share one native
 * clock, so they keep time while the answer is being saved. Reduce Motion keeps the fade.
 */
export default function AnswerFeedbackBadge({ lifetimeMs, style, children, accessibilityLiveRegion }: AnswerFeedbackBadgeProps) {
    const reduceMotion = useReduceMotion();
    const clock = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animation = Animated.timing(clock, {
            toValue: 1,
            duration: lifetimeMs,
            easing: Easing.linear,
            useNativeDriver: NATIVE_DRIVER,
            isInteraction: false,
        });
        animation.start();
        return () => animation.stop();
    }, [clock, lifetimeMs]);

    const motionStyle = useMemo(() => {
        const lifetime = Math.max(lifetimeMs, 1);
        const shown = MotionDuration.badge / lifetime;
        const leaving = 1 - exitDuration(MotionDuration.badge) / lifetime;
        const opacity = clock.interpolate({
            ...keyframes(0, [{ at: shown, value: 1 }, { at: leaving, value: 1 }, { at: 1, value: 0 }]),
            extrapolate: 'clamp',
        });
        if (reduceMotion) return { opacity };
        const scale = clock.interpolate({ ...keyframes(BADGE_START_SCALE, [{ at: shown, value: 1 }]), extrapolate: 'clamp' });
        return { opacity, transform: [{ scale }] };
    }, [clock, lifetimeMs, reduceMotion]);

    return (
        <Animated.View style={[style, motionStyle]} accessibilityLiveRegion={accessibilityLiveRegion}>
            {children}
        </Animated.View>
    );
}
