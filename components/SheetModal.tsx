import React, { useEffect, useMemo, useRef } from 'react';
import {
    Animated,
    Easing,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    StyleSheet,
    View,
    useWindowDimensions,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Shadows, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { MotionDuration, MotionSpring, resolveDuration, resolveSpring } from '../lib/motion';
import { isSheetDrag, sheetTranslate, shouldDismissSheet } from '../lib/sheetGesture';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useI18n } from '../hooks/useI18n';

/**
 * Bottom sheet for list pickers and action menus. iOS never fades a list of choices into the
 * middle of the screen — it slides one up from the bottom edge, under the user's thumb.
 *
 * The Modal itself keeps `animationType="fade"` so only the scrim fades; the sheet surface is
 * translated by this component. Using the Modal's own "slide" would drag the dimming layer up
 * with it, which reads as a rising grey rectangle rather than a sheet.
 *
 * The grabber is a real affordance: dragging it (or the sheet's top edge) pulls the sheet down
 * with the finger and releases into a dismissal past the threshold in lib/sheetGesture, matching
 * how UIKit sheets behave. The gesture is claimed only for clear downward drags, so a list
 * inside the sheet still scrolls normally.
 *
 * Alerts that ask for text (rename, reposition, due date) stay centred — that is what
 * UIAlertController does, and a keyboard-bearing dialog should not be pinned to the bottom edge.
 */
type SheetModalProps = {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** Applied to the sheet surface; use it for maxHeight or padding overrides. */
    cardStyle?: StyleProp<ViewStyle>;
    /** Hides the grabber for sheets that draw their own header. */
    showGrabber?: boolean;
    /**
     * Opt out of pull-to-dismiss for sheets holding unsaved input, where an accidental drag
     * would throw work away.
     */
    dismissOnPullDown?: boolean;
};

export function SheetModal({
    visible,
    onClose,
    children,
    cardStyle,
    showGrabber = true,
    dismissOnPullDown = true,
}: SheetModalProps) {
    const colors = useThemeColors();
    const { l } = useI18n();
    const styles = React.useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const reduceMotion = useReduceMotion();
    const translateY = useRef(new Animated.Value(height)).current;
    const sheetHeightRef = useRef(0);

    useEffect(() => {
        if (!visible) {
            // Reset while hidden so the next open starts from below the screen edge again.
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
            onMoveShouldSetPanResponder: (_event, gesture) => (
                dismissOnPullDown && isSheetDrag(gesture.dx, gesture.dy)
            ),
            onPanResponderMove: (_event, gesture) => {
                translateY.setValue(sheetTranslate(gesture.dy));
            },
            onPanResponderRelease: (_event, gesture) => {
                const dismiss = shouldDismissSheet({
                    dy: gesture.dy,
                    vy: gesture.vy,
                    height: sheetHeightRef.current || height,
                });
                if (dismiss) {
                    onClose();
                    return;
                }
                // Came back short: settle to rest rather than snapping, so the sheet reads as
                // elastic instead of broken.
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
        [dismissOnPullDown, height, onClose, reduceMotion, translateY],
    );

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <Animated.View
                    accessibilityViewIsModal
                    onLayout={(event) => {
                        sheetHeightRef.current = event.nativeEvent.layout.height;
                    }}
                    style={[
                        styles.card,
                        { paddingBottom: insets.bottom + Spacing.lg, transform: [{ translateY }] },
                        cardStyle,
                    ]}
                >
                    {showGrabber ? (
                        <View
                            {...panResponder.panHandlers}
                            style={styles.grabberArea}
                            accessibilityRole="adjustable"
                            accessibilityLabel={l('Kapatmak için aşağı çekin', 'Pull down to close')}
                        >
                            <View style={styles.grabber} />
                        </View>
                    ) : null}
                    {children}
                </Animated.View>
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        overlay: {
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.38)',
        },
        card: {
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
            maxHeight: '86%',
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.sm,
            overflow: 'hidden',
            backgroundColor: colors.bgCard,
            borderTopLeftRadius: BorderRadius.lg,
            borderTopRightRadius: BorderRadius.lg,
            ...Shadows.lg,
        },
        // The grabber is 5pt tall but the drag target around it is a full row, so the gesture is
        // reachable without hunting for the bar itself.
        grabberArea: {
            marginHorizontal: -Spacing.lg,
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.xs,
            paddingBottom: Spacing.md,
            alignItems: 'center',
        },
        grabber: {
            width: 38,
            height: 5,
            borderRadius: 3,
            backgroundColor: colors.border,
        },
    });
}

export default SheetModal;
