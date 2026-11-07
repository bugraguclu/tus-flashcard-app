import React, { useMemo, useRef } from 'react';
import {
    Animated,
    Pressable,
    StyleSheet,
    type GestureResponderEvent,
    type PressableProps,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { MotionDuration, MotionEasing, NATIVE_DRIVER, PRESS_SCALE } from '../constants/motion';
import { useReduceMotion } from '../hooks/useReduceMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
    /**
     * The button's look, which may hold animated values. A plain `opacity` (a dimmed idle or
     * disabled state) is kept and dimmed further while held; a `transform` gives way to the press.
     */
    style?: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
    children?: React.ReactNode;
    /** Opacity while held, as TouchableOpacity's `activeOpacity`; 1 keeps the button solid. */
    activeOpacity?: number;
    /** Size while held. */
    pressedScale?: number;
}

/**
 * A button that sinks to 97% of its size under the finger and comes back as it lifts, so the press
 * is felt the moment it lands, before whatever it does has finished. Below an `activeOpacity` of
 * 1 it also dims, as TouchableOpacity does. Reduce Motion keeps only the dimming.
 */
export default function PressableScale({
    style,
    children,
    activeOpacity = 1,
    pressedScale = PRESS_SCALE,
    onPressIn,
    onPressOut,
    ...props
}: PressableScaleProps) {
    const reduceMotion = useReduceMotion();
    const pressed = useRef(new Animated.Value(0)).current;
    const ownOpacity = (StyleSheet.flatten(style as StyleProp<ViewStyle>) as ViewStyle | undefined)?.opacity;
    const restingOpacity = typeof ownOpacity === 'number' ? ownOpacity : 1;

    const settle = (toValue: number) => {
        Animated.timing(pressed, {
            toValue,
            duration: MotionDuration.press,
            easing: MotionEasing.out,
            useNativeDriver: NATIVE_DRIVER,
            isInteraction: false,
        }).start();
    };

    const motionStyle = useMemo(() => ({
        opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [restingOpacity, restingOpacity * activeOpacity] }),
        transform: [{
            scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, reduceMotion ? 1 : pressedScale] }),
        }],
    }), [activeOpacity, pressed, pressedScale, reduceMotion, restingOpacity]);

    return (
        <AnimatedPressable
            {...props}
            style={[style, motionStyle]}
            onPressIn={(event: GestureResponderEvent) => {
                settle(1);
                onPressIn?.(event);
            }}
            onPressOut={(event: GestureResponderEvent) => {
                settle(0);
                onPressOut?.(event);
            }}
        >
            {children}
        </AnimatedPressable>
    );
}
