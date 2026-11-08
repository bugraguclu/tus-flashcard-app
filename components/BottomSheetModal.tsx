import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
    AccessibilityInfo,
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
import SwipeDismissSheet from './SwipeDismissSheet';

// The browser has no native animation driver; asking for it only logs a fallback warning.
const NATIVE_DRIVER = Platform.OS !== 'web';
// iOS sheets leave quickly and ease into place; this curve gives the same settle.
const SHEET_EASING = Easing.bezier(0.32, 0.72, 0, 1);
const ENTER_MS = 440;
const EXIT_MS = 300;
const DIM_COLOR = 'rgba(0, 0, 0, 0.4)';

interface BottomSheetModalProps {
    visible: boolean;
    /** Asked to close: backdrop tap, grabber, pull-down or the system back action. */
    onClose: () => void;
    children: React.ReactNode;
    /** The sheet surface (size, colour, corners, padding). */
    sheetStyle?: StyleProp<ViewStyle>;
    /** The full-screen layer that holds the sheet, e.g. safe-area padding. */
    containerStyle?: StyleProp<ViewStyle>;
    /** Whether the grabber and pull-down close the sheet. */
    swipeEnabled?: boolean;
    accessibilityViewIsModal?: boolean;
    /** Lift the sheet above the keyboard while one of its fields has focus. */
    avoidKeyboard?: boolean;
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
}

// One shared Reduce Motion subscription: every option card on Deck Options keeps a sheet mounted.
let reduceMotionEnabled = false;
let watchingReduceMotion = false;
const reduceMotionListeners = new Set<() => void>();

function setReduceMotion(enabled: boolean) {
    if (enabled === reduceMotionEnabled) return;
    reduceMotionEnabled = enabled;
    reduceMotionListeners.forEach((listener) => listener());
}

function subscribeReduceMotion(listener: () => void) {
    if (!watchingReduceMotion) {
        watchingReduceMotion = true;
        AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotion).catch(() => undefined);
        AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    }
    reduceMotionListeners.add(listener);
    return () => { reduceMotionListeners.delete(listener); };
}

const useReduceMotion = () => useSyncExternalStore(subscribeReduceMotion, () => reduceMotionEnabled, () => false);

/**
 * A bottom sheet over a dimmed backdrop, presented the way iOS presents one: the backdrop fades in
 * place while only the sheet slides up, the dimming lightens as the sheet is pulled down, and both
 * leave together. React Native's `animationType="slide"` would instead carry the backdrop up with
 * the sheet, so the modal itself is shown without animation and the sheet animates here.
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
    swipeEnabled = true,
    accessibilityViewIsModal = true,
    avoidKeyboard = false,
    backdropLabel,
    backdropHidden = false,
    overlay,
    onDismiss,
}: BottomSheetModalProps) {
    const { l } = useI18n();
    const { height: windowHeight } = useWindowDimensions();
    const reduceMotion = useReduceMotion();
    const [mounted, setMounted] = useState(visible);
    // How far the sheet travels to leave the screen; the backdrop is clear at that distance.
    const [travel, setTravel] = useState(windowHeight);
    const position = useRef(new Animated.Value(windowHeight)).current;
    const latest = useRef({ mounted, travel, windowHeight, reduceMotion });
    latest.current = { mounted, travel, windowHeight, reduceMotion };
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
                duration: ENTER_MS,
                easing: SHEET_EASING,
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
        if (pulledAway.current || latest.current.reduceMotion) {
            finish();
            return undefined;
        }
        // The native driver starts from wherever the sheet is now. Its end callback is not relied
        // on alone: a modal left up after its sheet has gone would swallow every touch.
        const fallback = setTimeout(finish, EXIT_MS + 250);
        Animated.timing(position, {
            toValue: latest.current.travel,
            duration: EXIT_MS,
            easing: SHEET_EASING,
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

    const backdropOpacity = useMemo(() => position.interpolate({
        inputRange: [0, Math.max(travel, 1)],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    }), [position, travel]);

    return (
        <Modal
            visible={mounted}
            transparent
            animationType={reduceMotion ? 'fade' : 'none'}
            onRequestClose={onClose}
            onDismiss={onDismiss}
        >
            <KeyboardAvoidingView
                style={[styles.container, containerStyle, { pointerEvents: visible ? 'auto' : 'none' }]}
                behavior={avoidKeyboard && Platform.OS === 'ios' ? 'padding' : undefined}
                enabled={avoidKeyboard}
            >
                <Animated.View
                    style={[StyleSheet.absoluteFill, styles.dim, { opacity: backdropOpacity, pointerEvents: 'none' }]}
                />
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={backdropLabel ?? l('Paneli kapat', 'Close sheet')}
                    importantForAccessibility={backdropHidden ? 'no-hide-descendants' : 'auto'}
                    accessibilityElementsHidden={backdropHidden}
                />
                <SwipeDismissSheet
                    active={visible}
                    enabled={swipeEnabled}
                    position={position}
                    onLayout={measureSheet}
                    onDismiss={handlePulledAway}
                    accessibilityViewIsModal={accessibilityViewIsModal}
                    style={sheetStyle}
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
    dim: { backgroundColor: DIM_COLOR },
});
