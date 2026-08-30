import React, { useMemo } from 'react';
import {
    Pressable,
    type PressableProps,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { PRESSED_OPACITY } from './Touchable';

/**
 * Standard touch surface. TouchableOpacity only dims, which on a large button reads as the screen
 * flickering rather than as the button being pushed; this adds the small inward scale UIKit uses,
 * a touch target that stays reachable when the visual is small, and one disabled appearance
 * instead of each screen inventing its own.
 */

/** Just enough shrink to feel the press; more than this reads as the button jumping. */
export const PRESSED_SCALE = 0.98;
export const DISABLED_OPACITY = 0.4;
/** Apple's 44pt minimum is met by padding the touch area rather than the drawn control. */
export const DEFAULT_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 } as const;

type AppPressableProps = Omit<PressableProps, 'style'> & {
    style?: StyleProp<ViewStyle>;
    /**
     * Full-width list rows shrink visibly at 0.98, which UIKit table rows never do — those pass
     * false and keep the dim alone.
     */
    scaleOnPress?: boolean;
};

export function AppPressable({
    style,
    scaleOnPress = true,
    disabled,
    hitSlop,
    accessibilityRole = 'button',
    ...rest
}: AppPressableProps) {
    // "Hareketi Azalt" keeps the press readable through opacity and drops the movement.
    const reduceMotion = useReduceMotion();
    const scales = scaleOnPress && !reduceMotion;

    const pressedStyle = useMemo<ViewStyle>(
        () => ({
            opacity: PRESSED_OPACITY,
            ...(scales ? { transform: [{ scale: PRESSED_SCALE }] } : null),
        }),
        [scales],
    );

    return (
        <Pressable
            disabled={disabled}
            hitSlop={hitSlop ?? DEFAULT_HIT_SLOP}
            accessibilityRole={accessibilityRole}
            accessibilityState={{ disabled: !!disabled, ...rest.accessibilityState }}
            style={({ pressed }) => [
                style,
                disabled ? { opacity: DISABLED_OPACITY } : null,
                pressed && !disabled ? pressedStyle : null,
            ]}
            {...rest}
        />
    );
}

export default AppPressable;
