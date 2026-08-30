import React, { forwardRef } from 'react';
import { TouchableOpacity as RNTouchableOpacity } from 'react-native';

/**
 * React Native dims a pressed TouchableOpacity to 0.2, which washes out whole rows and cards and
 * reads nothing like UIKit's light highlight. Screens import this drop-in instead of the
 * react-native one so every control responds the same way; an explicit `activeOpacity` still
 * wins (rows that own a drag gesture pass 1 to stay opaque).
 */
export const PRESSED_OPACITY = 0.6;

type TouchableOpacityProps = React.ComponentProps<typeof RNTouchableOpacity>;

export const TouchableOpacity = forwardRef<
    React.ComponentRef<typeof RNTouchableOpacity>,
    TouchableOpacityProps
>(function TouchableOpacity(props, ref) {
    return <RNTouchableOpacity activeOpacity={PRESSED_OPACITY} {...props} ref={ref} />;
});
