import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
    Modal,
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
import { useReduceMotion } from '../hooks/useReduceMotion';

/**
 * Bottom sheet for list pickers and action menus. iOS never fades a list of choices into the
 * middle of the screen — it slides one up from the bottom edge, under the user's thumb.
 *
 * The Modal itself keeps `animationType="fade"` so only the scrim fades; the sheet surface is
 * translated by this component. Using the Modal's own "slide" would drag the dimming layer up
 * with it, which reads as a rising grey rectangle rather than a sheet.
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
};

export function SheetModal({ visible, onClose, children, cardStyle, showGrabber = true }: SheetModalProps) {
    const colors = useThemeColors();
    const styles = React.useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const reduceMotion = useReduceMotion();
    const translateY = useRef(new Animated.Value(height)).current;

    useEffect(() => {
        if (!visible) {
            // Reset while hidden so the next open starts from below the screen edge again.
            translateY.setValue(height);
            return;
        }
        const animation = Animated.timing(translateY, {
            toValue: 0,
            duration: reduceMotion ? 0 : 240,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== 'web',
        });
        animation.start();
        return () => animation.stop();
    }, [visible, height, translateY, reduceMotion]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <Animated.View
                    accessibilityViewIsModal
                    style={[
                        styles.card,
                        { paddingBottom: insets.bottom + Spacing.lg, transform: [{ translateY }] },
                        cardStyle,
                    ]}
                >
                    {showGrabber ? <View style={styles.grabber} /> : null}
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
        grabber: {
            width: 38,
            height: 5,
            borderRadius: 3,
            alignSelf: 'center',
            marginBottom: Spacing.md,
            backgroundColor: colors.border,
        },
    });
}

export default SheetModal;
