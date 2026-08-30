import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, Platform, useWindowDimensions } from 'react-native';
import { MotionDuration, MotionSpring, resolveDuration, resolveSpring } from '../lib/motion';
import { isSheetDrag, sheetTranslate, shouldDismissSheet } from '../lib/sheetGesture';
import { useReduceMotion } from './useReduceMotion';

/**
 * Bottom-sheet presentation for surfaces that draw their own chrome and so cannot sit inside
 * components/SheetModal (the pickers with a full-bleed coloured toolbar). Gives them the same
 * slide-up entrance, grabber drag and pull-to-dismiss, so every sheet in the app behaves alike.
 *
 * Pair with `transparent` + `animationType="fade"` on the Modal: only the scrim should fade, the
 * surface itself is translated here.
 */
export function useBottomSheet(visible: boolean, onClose: () => void) {
    const { height } = useWindowDimensions();
    const reduceMotion = useReduceMotion();
    const translateY = useRef(new Animated.Value(height)).current;
    const sheetHeightRef = useRef(0);

    useEffect(() => {
        if (!visible) {
            translateY.setValue(height);
            return;
        }
        const animation = Animated.timing(translateY, {
            toValue: 0,
            duration: resolveDuration(MotionDuration.sheet, reduceMotion),
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== 'web',
        });
        animation.start();
        return () => animation.stop();
    }, [visible, height, translateY, reduceMotion]);

    const panResponder = useMemo(
        () => PanResponder.create({
            onMoveShouldSetPanResponder: (_event, gesture) => isSheetDrag(gesture.dx, gesture.dy),
            onPanResponderMove: (_event, gesture) => {
                translateY.setValue(sheetTranslate(gesture.dy));
            },
            onPanResponderRelease: (_event, gesture) => {
                if (shouldDismissSheet({
                    dy: gesture.dy,
                    vy: gesture.vy,
                    height: sheetHeightRef.current || height,
                })) {
                    onClose();
                    return;
                }
                const spring = resolveSpring(MotionSpring.panel, reduceMotion);
                if (spring) {
                    Animated.spring(translateY, {
                        toValue: 0,
                        ...spring,
                        useNativeDriver: Platform.OS !== 'web',
                    }).start();
                } else {
                    translateY.setValue(0);
                }
            },
            onPanResponderTerminationRequest: () => false,
        }),
        [height, onClose, reduceMotion, translateY],
    );

    return {
        translateY,
        panHandlers: panResponder.panHandlers,
        onSheetLayout: (layoutHeight: number) => {
            sheetHeightRef.current = layoutHeight;
        },
    };
}
