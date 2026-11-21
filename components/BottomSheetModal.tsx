import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    KeyboardAvoidingView,
    type LayoutChangeEvent,
    Modal,
    Platform,
    Pressable,
    type StyleProp,
    StyleSheet,
    useWindowDimensions,
    type ViewStyle,
} from 'react-native';
import { useI18n } from '../hooks/useI18n';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { MotionDuration, MotionEasing, POPOVER_START_SCALE, exitDuration } from '../constants/motion';
import { Spacing, useThemeColors } from '../constants/theme';
import type { SheetPresentation } from '../lib/sheetPresentation';
import SwipeDismissSheet from './SwipeDismissSheet';

// The browser has no native animation driver; asking for it only logs a fallback warning.
const NATIVE_DRIVER = Platform.OS !== 'web';
// iOS sheets leave quickly and ease into place; this curve gives the same settle.
const SHEET_EASING = Easing.bezier(0.32, 0.72, 0, 1);
const ENTER_MS = 440;
const EXIT_MS = 300;
// A dialog grows in place from 95% as a popover does, and leaves a fifth faster.
const DIALOG_ENTER_MS = MotionDuration.popover;
const DIALOG_EXIT_MS = exitDuration(DIALOG_ENTER_MS);

interface BottomSheetModalProps {
    visible: boolean;
    /** Asked to close: backdrop tap, grabber, pull-down, the dialog's close button or the system back action. */
    onClose: () => void;
    children: React.ReactNode;
    /** The sheet surface (size, colour, corners, padding). */
    sheetStyle?: StyleProp<ViewStyle>;
    /** The full-screen layer that holds the sheet, e.g. safe-area padding. */
    containerStyle?: StyleProp<ViewStyle>;
    /**
     * `dialog` on a wide window (`lib/sheetPresentation`): centred instead of at the bottom edge,
     * fading and growing in place instead of sliding, with a close button instead of a grabber.
     */
    presentation?: SheetPresentation;
    /** Whether the grabber and pull-down close the sheet; as a dialog, whether its close button does. */
    swipeEnabled?: boolean;
    accessibilityViewIsModal?: boolean;
    /** Lift the sheet above the keyboard while one of its fields has focus. */
    avoidKeyboard?: boolean;
    /** Spoken for the backdrop and a dialog's close button. */
    backdropLabel?: string;
    /** Hide the backdrop's close button from VoiceOver, e.g. while `overlay` covers the sheet. */
    backdropHidden?: boolean;
    /** Drawn over the sheet inside the same modal (a picker on its own dimmed layer). */
    overlay?: React.ReactNode;
    /**
     * Runs once the sheet has slid away and its modal is gone, so what was chosen in it can present
     * another modal: iOS will not show one while this one is still on screen.
     */
    onDismiss?: () => void;
    /** The sheet's title, centred under the grabber (`SwipeDismissSheet`). */
    title?: string;
    subtitle?: string;
    headerLeft?: React.ReactNode;
    headerRight?: React.ReactNode;
    /**
     * Leaves at once, without its exit animation, when `visible` turns false: set by
     * `useModalHandoff` while it hands the screen to another modal, which UIKit would
     * otherwise hold back until this one has gone.
     */
    closeAtOnce?: boolean;
}

/**
 * A bottom sheet over a dimmed backdrop, presented the way iOS presents one: the backdrop fades in
 * place while only the sheet slides up, the dimming lightens as the sheet is pulled down, and both
 * leave together. React Native's `animationType="slide"` would instead carry the backdrop up with
 * the sheet, so the modal itself is shown without animation and the sheet animates here. As a
 * `dialog` the same surface sits in the middle of the window and grows in from 95% as it fades.
 *
 * The sheet stays mounted until its exit finishes, so keep this component mounted and drive it with
 * `visible`: unmounting it removes the sheet at once.
 */
export default function BottomSheetModal({
    visible,
    onClose,
    children,
    sheetStyle,
    containerStyle,
    presentation = 'sheet',
    swipeEnabled = true,
    accessibilityViewIsModal = true,
    avoidKeyboard = false,
    backdropLabel,
    backdropHidden = false,
    overlay,
    onDismiss,
    title,
    subtitle,
    headerLeft,
    headerRight,
    closeAtOnce = false,
}: BottomSheetModalProps) {
    const colors = useThemeColors();
    const { l } = useI18n();
    const { height: windowHeight } = useWindowDimensions();
    const reduceMotion = useReduceMotion();
    const [mounted, setMounted] = useState(visible);
    // How far the sheet travels to leave the screen; the backdrop is clear at that distance.
    const [travel, setTravel] = useState(windowHeight);
    // How far the sheet is from resting on screen: 0 shown, `travel` gone. A dialog does not move;
    // it is drawn faded and smaller the further this is from 0.
    const position = useRef(new Animated.Value(windowHeight)).current;
    const dialog = presentation === 'dialog';
    const latest = useRef({ mounted, travel, windowHeight, reduceMotion, closeAtOnce, dialog });
    latest.current = { mounted, travel, windowHeight, reduceMotion, closeAtOnce, dialog };
    const generation = useRef(0);
    // Set when a pull-down has already carried the sheet off screen.
    const pulledAway = useRef(false);

    useEffect(() => {
        const run = ++generation.current;
        position.stopAnimation();
        if (visible) {
            pulledAway.current = false;
            setMounted(true);
            if (latest.current.reduceMotion) {
                position.setValue(0);
                return undefined;
            }
            Animated.timing(position, {
                toValue: 0,
                duration: latest.current.dialog ? DIALOG_ENTER_MS : ENTER_MS,
                easing: latest.current.dialog ? MotionEasing.out : SHEET_EASING,
                useNativeDriver: NATIVE_DRIVER,
            }).start();
            return undefined;
        }
        // A sheet that has never been shown has nothing to slide away.
        if (!latest.current.mounted) return undefined;
        const finish = () => {
            if (run !== generation.current) return;
            setMounted(false);
            position.setValue(latest.current.windowHeight);
        };
        if (pulledAway.current || latest.current.reduceMotion || latest.current.closeAtOnce) {
            finish();
            return undefined;
        }
        // The native driver starts from wherever the sheet is now. Its end callback is not relied
        // on alone: a modal left up after its sheet has gone would swallow every touch.
        const exitMs = latest.current.dialog ? DIALOG_EXIT_MS : EXIT_MS;
        const fallback = setTimeout(finish, exitMs + 250);
        Animated.timing(position, {
            toValue: latest.current.travel,
            duration: exitMs,
            easing: latest.current.dialog ? MotionEasing.out : SHEET_EASING,
            useNativeDriver: NATIVE_DRIVER,
        }).start(() => {
            clearTimeout(fallback);
            finish();
        });
        return () => clearTimeout(fallback);
    }, [position, visible]);

    const handlePulledAway = () => {
        pulledAway.current = true;
        onClose();
    };

    const measureSheet = (event: LayoutChangeEvent) => {
        const { y, height } = event.nativeEvent.layout;
        // The sheet's top edge must clear the bottom of the screen, whatever padding sits under it.
        const next = Math.ceil(Math.max(height, windowHeight - y));
        if (next > 0 && Math.abs(next - travel) > 1) setTravel(next);
    };

    const leavingAtOnce = closeAtOnce && !visible;

    const backdropOpacity = useMemo(() => position.interpolate({
        inputRange: [0, Math.max(travel, 1)],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    }), [position, travel]);

    // A dialog fades with the backdrop and grows from 95%; Reduce Motion keeps only the fade.
    const dialogMotion = useMemo(() => {
        if (!dialog) return null;
        const range = { inputRange: [0, Math.max(travel, 1)], extrapolate: 'clamp' as const };
        return {
            opacity: position.interpolate({ ...range, outputRange: [1, 0] }),
            transform: [{ scale: position.interpolate({ ...range, outputRange: [1, reduceMotion ? 1 : POPOVER_START_SCALE] }) }],
        };
    }, [dialog, position, reduceMotion, travel]);

    const closeLabel = backdropLabel ?? (dialog ? l('Kapat', 'Close') : l('Paneli kapat', 'Close sheet'));

    return (
        <Modal
            // A hand-off takes the sheet down in this commit, not after the next render.
            visible={mounted && !leavingAtOnce}
            transparent
            animationType={reduceMotion && !leavingAtOnce ? 'fade' : 'none'}
            onRequestClose={onClose}
            onDismiss={onDismiss}
        >
            <KeyboardAvoidingView
                style={[styles.container, dialog && styles.dialogContainer, containerStyle, { pointerEvents: visible ? 'auto' : 'none' }]}
                behavior={avoidKeyboard && Platform.OS === 'ios' ? 'padding' : undefined}
                enabled={avoidKeyboard}
            >
                <Animated.View
                    style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: backdropOpacity, pointerEvents: 'none' }]}
                />
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={closeLabel}
                    importantForAccessibility={backdropHidden ? 'no-hide-descendants' : 'auto'}
                    accessibilityElementsHidden={backdropHidden}
                />
                <SwipeDismissSheet
                    active={visible}
                    enabled={swipeEnabled}
                    presentation={presentation}
                    position={position}
                    onLayout={measureSheet}
                    onClose={onClose}
                    closeLabel={closeLabel}
                    onDismiss={handlePulledAway}
                    accessibilityViewIsModal={accessibilityViewIsModal}
                    style={dialogMotion ? [sheetStyle, dialogMotion] : sheetStyle}
                    title={title}
                    subtitle={subtitle}
                    headerLeft={headerLeft}
                    headerRight={headerRight}
                >
                    {children}
                </SwipeDismissSheet>
                {overlay}
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'flex-end' },
    // `AppDialog`'s layer: the card in the middle, clear of the window's edges.
    dialogContainer: { justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
});
