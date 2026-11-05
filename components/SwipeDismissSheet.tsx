import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
    Animated,
    Keyboard,
    type LayoutChangeEvent,
    PanResponder,
    Platform,
    StyleProp,
    StyleSheet,
    TouchableOpacity,
    useWindowDimensions,
    View,
    ViewStyle,
} from 'react-native';
import { useI18n } from '../hooks/useI18n';
import { useThemeColors } from '../constants/theme';

interface SwipeDismissSheetProps {
    active?: boolean;
    accessibilityViewIsModal?: boolean;
    children: React.ReactNode;
    enabled?: boolean;
    onDismiss: () => void;
    onLayout?: (event: LayoutChangeEvent) => void;
    /**
     * The sheet's vertical offset, owned by whoever presents it (`BottomSheetModal`), so its
     * backdrop can dim with the drag and the owner can slide the sheet in and out. Without it the
     * sheet keeps its own offset and rests at 0 whenever it becomes active.
     */
    position?: Animated.Value;
    style?: StyleProp<ViewStyle>;
}

const DISMISS_DISTANCE = 72;
const DISMISS_VELOCITY = 0.8;
// The browser has no native animation driver; asking for it only logs a fallback warning.
const NATIVE_DRIVER = Platform.OS !== 'web';

/** A bottom-sheet surface whose grabber can be tapped or pulled down to dismiss it. */
export default function SwipeDismissSheet({
    active = true,
    accessibilityViewIsModal,
    children,
    enabled = true,
    onDismiss,
    onLayout,
    position,
    style,
}: SwipeDismissSheetProps) {
    const { height } = useWindowDimensions();
    const { l } = useI18n();
    const colors = useThemeColors();
    const ownTranslateY = useRef(new Animated.Value(0)).current;
    const translateY = position ?? ownTranslateY;
    const dismissing = useRef(false);

    // React Native keeps a Modal's children mounted while `visible` is false. Reset the
    // gesture state whenever that modal opens so the same sheet can be dismissed repeatedly.
    // An owned position is left alone: the owner is sliding the sheet in from below.
    useEffect(() => {
        if (!active) return;
        dismissing.current = false;
        if (position) return;
        translateY.stopAnimation();
        translateY.setValue(0);
    }, [active, position, translateY]);

    const dismiss = useCallback(() => {
        if (dismissing.current) return;
        dismissing.current = true;
        Keyboard.dismiss();
        Animated.timing(translateY, {
            toValue: Math.max(height, 600),
            duration: 180,
            useNativeDriver: NATIVE_DRIVER,
        }).start(() => onDismiss());
    }, [height, onDismiss, translateY]);

    const panResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) => (
            enabled
            && gesture.dy > 4
            && Math.abs(gesture.dy) > Math.abs(gesture.dx)
        ),
        onPanResponderMove: (_event, gesture) => {
            translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
            if (Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8) {
                dismiss();
                return;
            }
            if (gesture.dy >= DISMISS_DISTANCE
                || (gesture.dy > 12 && gesture.vy >= DISMISS_VELOCITY)) {
                dismiss();
                return;
            }
            Animated.spring(translateY, {
                toValue: 0,
                speed: 22,
                bounciness: 5,
                useNativeDriver: NATIVE_DRIVER,
            }).start();
        },
        onPanResponderTerminate: () => {
            Animated.spring(translateY, {
                toValue: 0,
                speed: 22,
                bounciness: 5,
                useNativeDriver: NATIVE_DRIVER,
            }).start();
        },
        onPanResponderTerminationRequest: () => false,
    }), [dismiss, enabled, translateY]);

    return (
        <Animated.View
            style={[style, { transform: [{ translateY }] }]}
            accessibilityViewIsModal={accessibilityViewIsModal}
            onLayout={onLayout}
        >
            {children}
            {enabled && (
                <View
                    style={styles.grabberArea}
                    {...panResponder.panHandlers}
                >
                    <TouchableOpacity
                        style={styles.grabberButton}
                        onPress={dismiss}
                        accessibilityRole="button"
                        accessibilityLabel={l('Paneli kapat', 'Close sheet')}
                        accessibilityHint={l('Dokunun veya aşağı sürükleyin', 'Tap or swipe down')}
                    >
                        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
                    </TouchableOpacity>
                </View>
            )}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    grabberArea: {
        position: 'absolute',
        zIndex: 10,
        top: 0,
        left: 0,
        right: 0,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    grabberButton: {
        width: 72,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    grabber: {
        width: 40,
        height: 4,
        borderRadius: 2,
    },
});
