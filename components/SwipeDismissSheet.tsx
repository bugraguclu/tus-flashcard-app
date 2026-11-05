import React, { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Keyboard,
    type LayoutChangeEvent,
    PanResponder,
    Platform,
    ScrollView,
    StyleProp,
    StyleSheet,
    TouchableOpacity,
    useWindowDimensions,
    View,
    ViewStyle,
    type PanResponderGestureState,
    type ScrollViewProps,
    type ViewProps,
} from 'react-native';
import { Text } from './AppText';
import { useI18n } from '../hooks/useI18n';
import { FontSize, Spacing, useThemeColors } from '../constants/theme';
import { MotionEasing, MotionSpring } from '../constants/motion';

interface SwipeDismissSheetProps {
    active?: boolean;
    accessibilityViewIsModal?: boolean;
    children: React.ReactNode;
    /**
     * False while the sheet has to stay open (a recording, an unlock in progress): it does not
     * drag or close from the grabber, and the grabber's place stays so nothing moves.
     */
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
    /** The sheet's title, centred under the grabber. A sheet has no close button: it is pulled down. */
    title?: string;
    subtitle?: string;
    /** A control at the title's leading edge, such as a back arrow inside the sheet. */
    headerLeft?: React.ReactNode;
    /** The sheet's commit action, such as Add, at the title's trailing edge. */
    headerRight?: React.ReactNode;
}

/** Finger travel before a touch becomes a drag: a tap that wobbles a little stays a tap. */
const DRAG_SLOP = 8;
const DISMISS_DISTANCE = 72;
const DISMISS_VELOCITY = 0.8;
// The browser has no native animation driver; asking for it only logs a fallback warning.
const NATIVE_DRIVER = Platform.OS !== 'web';

/** Lets a part of the sheet that moves under the finger by itself keep the touch from the sheet. */
interface SheetDragGate {
    exclude: () => void;
}

const SheetDragContext = createContext<SheetDragGate | null>(null);

/**
 * A bottom-sheet surface with a grabber and a title, pulled down to dismiss from anywhere on it
 * except a part that scrolls (`SheetScrollView`) or edits text (`SheetNoDrag`), the way an
 * iPhone sheet does. Tapping the grabber or the VoiceOver escape gesture also dismisses it.
 */
export default function SwipeDismissSheet({
    active = true,
    accessibilityViewIsModal,
    children,
    enabled = true,
    onDismiss,
    onLayout,
    position,
    style,
    title,
    subtitle,
    headerLeft,
    headerRight,
}: SwipeDismissSheetProps) {
    const { height } = useWindowDimensions();
    const { l } = useI18n();
    const colors = useThemeColors();
    const ownTranslateY = useRef(new Animated.Value(0)).current;
    const translateY = position ?? ownTranslateY;
    const dismissing = useRef(false);
    const excludedTouch = useRef(false);
    const dragStart = useRef(0);
    const dragging = useRef(false);

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
            easing: MotionEasing.out,
            useNativeDriver: NATIVE_DRIVER,
        }).start(() => onDismiss());
    }, [height, onDismiss, translateY]);

    const gate = useMemo<SheetDragGate>(() => ({ exclude: () => { excludedTouch.current = true; } }), []);

    const panResponder = useMemo(() => {
        const settle = () => {
            Animated.spring(translateY, {
                toValue: 0,
                ...MotionSpring.snap,
                useNativeDriver: NATIVE_DRIVER,
            }).start();
        };
        const pullsDown = (gesture: PanResponderGestureState) => (
            gesture.dy > DRAG_SLOP && Math.abs(gesture.dy) > Math.abs(gesture.dx)
        );
        return PanResponder.create({
            // The sheet is an ancestor of everything on it, so this runs before any part of it
            // hears about the touch; a scrolling part then marks the touch as its own.
            onStartShouldSetPanResponderCapture: () => {
                excludedTouch.current = false;
                return false;
            },
            // Bubble phase, once every control under the finger has declined the touch. A sheet
            // inside a React Native Modal has to take it here: the Modal claims any touch nobody
            // else wants, and after that the sheet is never asked about the drag.
            onStartShouldSetPanResponder: () => enabled && !excludedTouch.current,
            // A control that took the touch keeps a tap, and gives it up once the finger clearly
            // travels down.
            onMoveShouldSetPanResponder: (_event, gesture) => enabled && !excludedTouch.current && pullsDown(gesture),
            onPanResponderGrant: () => {
                dragging.current = false;
            },
            onPanResponderMove: (_event, gesture) => {
                if (!dragging.current) {
                    if (!pullsDown(gesture)) return;
                    // Follow the finger from here, so the sheet does not jump by the slop.
                    dragging.current = true;
                    dragStart.current = gesture.dy;
                }
                translateY.setValue(Math.max(0, gesture.dy - dragStart.current));
            },
            onPanResponderRelease: (_event, gesture) => {
                if (!dragging.current) return;
                dragging.current = false;
                const distance = gesture.dy - dragStart.current;
                if (distance >= DISMISS_DISTANCE || (distance > 12 && gesture.vy >= DISMISS_VELOCITY)) {
                    dismiss();
                    return;
                }
                settle();
            },
            onPanResponderTerminate: () => {
                if (!dragging.current) return;
                dragging.current = false;
                settle();
            },
            // Until the sheet moves, a part of it that scrolls sideways may still take the touch.
            onPanResponderTerminationRequest: () => !dragging.current,
        });
    }, [dismiss, enabled, translateY]);

    const hasHeader = Boolean(title || subtitle || headerLeft || headerRight);
    const hasSides = Boolean(headerLeft || headerRight);

    return (
        <SheetDragContext.Provider value={gate}>
            <Animated.View
                style={[style, { transform: [{ translateY }] }]}
                accessibilityViewIsModal={accessibilityViewIsModal}
                onAccessibilityEscape={enabled ? dismiss : undefined}
                onLayout={onLayout}
                {...panResponder.panHandlers}
            >
                <TouchableOpacity
                    style={styles.grabberButton}
                    onPress={dismiss}
                    disabled={!enabled}
                    accessibilityElementsHidden={!enabled}
                    importantForAccessibility={enabled ? 'auto' : 'no-hide-descendants'}
                    accessibilityRole="button"
                    accessibilityLabel={l('Paneli kapat', 'Close sheet')}
                    accessibilityHint={l('Dokunun veya aşağı sürükleyin', 'Tap or swipe down')}
                >
                    <View style={[styles.grabber, { backgroundColor: colors.border }, !enabled && styles.grabberLocked]} />
                </TouchableOpacity>
                {hasHeader ? (
                    <View style={[styles.header, hasSides && styles.headerWithSides]}>
                        {hasSides ? <View style={[styles.side, styles.sideStart]}>{headerLeft}</View> : null}
                        <View style={styles.headerCopy}>
                            {title ? (
                                <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={2}>
                                    {title}
                                </Text>
                            ) : null}
                            {subtitle ? (
                                <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>
                                    {subtitle}
                                </Text>
                            ) : null}
                        </View>
                        {hasSides ? <View style={[styles.side, styles.sideEnd]}>{headerRight}</View> : null}
                    </View>
                ) : null}
                {children}
            </Animated.View>
        </SheetDragContext.Provider>
    );
}

/**
 * The scrolling part of a sheet. While its content is taller than it, a drag inside scrolls the
 * content and leaves the sheet where it is; while the content fits, it does not scroll and the
 * sheet is pulled down from it like from anywhere else. A hairline appears under the title only
 * while content is scrolled beneath it. Outside a sheet it is a plain ScrollView.
 */
export const SheetScrollView = forwardRef<ScrollView, ScrollViewProps>(function SheetScrollView(props, ref) {
    const gate = useContext(SheetDragContext);
    if (!gate) return <ScrollView ref={ref} {...props} />;
    return <SheetScrollArea ref={ref} gate={gate} {...props} />;
});

const SheetScrollArea = forwardRef<ScrollView, ScrollViewProps & { gate: SheetDragGate }>(function SheetScrollArea(
    { gate, onLayout, onContentSizeChange, onScroll, scrollEnabled = true, scrollEventThrottle = 16, ...props },
    ref,
) {
    const colors = useThemeColors();
    const [viewportHeight, setViewportHeight] = useState(0);
    const [contentHeight, setContentHeight] = useState(0);
    const [scrolledUnder, setScrolledUnder] = useState(false);
    // Until both are measured it counts as scrolling, so the first touch cannot drag the sheet.
    const overflows = viewportHeight === 0 || contentHeight > viewportHeight + 1;
    const scrolls = scrollEnabled && overflows;

    return (
        <View
            style={styles.scrollArea}
            onStartShouldSetResponderCapture={() => {
                if (scrolls) gate.exclude();
                return false;
            }}
        >
            <ScrollView
                ref={ref}
                {...props}
                scrollEnabled={scrolls}
                scrollEventThrottle={scrollEventThrottle}
                onLayout={(event) => {
                    setViewportHeight(event.nativeEvent.layout.height);
                    onLayout?.(event);
                }}
                onContentSizeChange={(width, height) => {
                    setContentHeight(height);
                    onContentSizeChange?.(width, height);
                }}
                onScroll={(event) => {
                    const under = event.nativeEvent.contentOffset.y > 0.5;
                    setScrolledUnder((current) => (current === under ? current : under));
                    onScroll?.(event);
                }}
            />
            {scrolls && scrolledUnder ? (
                <View style={[styles.scrollEdge, { backgroundColor: colors.border }]} />
            ) : null}
        </View>
    );
});

/**
 * A part of a sheet that never drags it: a multi-line field, which scrolls its text and selects
 * it under the finger by itself.
 */
export function SheetNoDrag({ onStartShouldSetResponderCapture, ...props }: ViewProps) {
    const gate = useContext(SheetDragContext);
    return (
        <View
            {...props}
            onStartShouldSetResponderCapture={(event) => {
                gate?.exclude();
                return onStartShouldSetResponderCapture?.(event) ?? false;
            }}
        />
    );
}

const styles = StyleSheet.create({
    grabberButton: {
        alignSelf: 'center',
        width: 88,
        height: 22,
        alignItems: 'center',
        paddingTop: 8,
    },
    grabber: {
        width: 36,
        height: 5,
        borderRadius: 2.5,
    },
    grabberLocked: { opacity: 0 },
    header: {
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 40,
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.xs,
        paddingBottom: Spacing.md,
    },
    // A side control brings its own touch padding.
    headerWithSides: { paddingHorizontal: Spacing.sm },
    // Equal sides keep the title centred under the grabber whatever sits beside it.
    side: { width: 76, justifyContent: 'center' },
    sideStart: { alignItems: 'flex-start' },
    sideEnd: { alignItems: 'flex-end' },
    headerCopy: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
    title: { fontSize: FontSize.lg, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
    subtitle: { fontSize: FontSize.sm, lineHeight: 17, textAlign: 'center' },
    // A ScrollView's own flex, moved to the area around it so the sheet lays out as before.
    scrollArea: { flexGrow: 1, flexShrink: 1 },
    scrollEdge: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: StyleSheet.hairlineWidth,
        pointerEvents: 'none',
    },
});
