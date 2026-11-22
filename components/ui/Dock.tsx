import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../AppText';
import PressableScale from '../PressableScale';
import { DECORATIVE_SVG_PROPS } from '../decorativeSvgProps';
import { Spacing, useThemeColors } from '../../constants/theme';
import { exitDuration, MotionDuration, MotionEasing, NATIVE_DRIVER } from '../../constants/motion';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { MotionCurve } from '../../lib/motion';
import {
    DOCK,
    dockBottom,
    dockButtonBottom,
    dockClearance,
    dockHiddenOffset,
    dockNotch,
    dockOutlinePath,
} from '../../lib/dockGeometry';
import { FAB_SIZE, FabFace } from './Fab';
import { Radius, Shadow, Type } from './tokens';

/**
 * The dock: the deck list's shortcuts on a white panel that floats over the bottom of the screen,
 * clear of its edges, with the screen's main action raised into a notch at the middle of its top
 * edge. The look follows Yemek Takibi's dock. The list under it scrolls behind it and keeps
 * `dockClearance` of room under its last row (`useDockClearance`); `useDockScroll` says when it
 * should get out of the way.
 */

/** Room for the raised button and the notch's fillets between the two halves of the shortcuts. */
const ACTION_SLOT = 2 * (FAB_SIZE / 2 + DOCK.notchGap + DOCK.notchFillet);
/** The raised button with its caption: a little wider than the button, so the caption fits. */
const ACTION_WIDTH = FAB_SIZE + 2 * Spacing.sm;
/** Every caption's distance from the panel's bottom edge, the raised button's included. */
const CAPTION_BOTTOM = Spacing.md;
const HAIRLINE = StyleSheet.hairlineWidth;
/**
 * A browser slides the dock with a CSS transition: it runs off the main thread and turns around
 * from where it is. Animated without the native driver hands the same style to React as well,
 * which can commit a frame from mid-slide after the slide has ended.
 */
const CSS_TRANSITION = Platform.OS === 'web';

/** The raised action in the dock's notch, e.g. the deck list's ＋. */
export interface DockAction {
    /** The icon, 28 points in `colors.onAccent`. */
    icon: React.ReactNode;
    /** The caption under the button. */
    label: string;
    /** Spoken instead of the caption, e.g. "Add". */
    accessibilityLabel?: string;
    onPress: () => void;
    /** For an action that opens a menu: whether it is showing. */
    expanded?: boolean;
}

interface DockProps {
    /** `DockItem`s. With an `action`, the first half sits to its left and the rest to its right. */
    children: React.ReactNode;
    action?: DockAction;
    /**
     * Out of the way: slid below the screen's edge (Reduce Motion: faded out), passing touches to
     * what is under it and gone from the accessibility tree.
     */
    hidden?: boolean;
}

/** The room a list under the dock keeps below its last row (`dockClearance` for this screen). */
export function useDockClearance(): number {
    const insets = useSafeAreaInsets();
    return dockClearance(insets.bottom, FAB_SIZE);
}

/** Where a speed dial's button sits to open right over the dock's raised button: its `bottom`. */
export function useDockActionBottom(): number {
    const insets = useSafeAreaInsets();
    return dockButtonBottom(insets.bottom, FAB_SIZE);
}

export function Dock({ children, action, hidden = false }: DockProps) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    const reduceMotion = useReduceMotion();
    // Measured on layout; the estimate draws the panel on the first frame already.
    const [width, setWidth] = useState(() => Math.min(
        DOCK.maxWidth,
        Math.max(0, windowWidth - 2 * DOCK.sideInset - insets.left - insets.right),
    ));
    const progress = useRef(new Animated.Value(hidden ? 1 : 0)).current;

    useEffect(() => {
        if (CSS_TRANSITION) return undefined;
        const target = hidden ? 1 : 0;
        let animation: Animated.CompositeAnimation | undefined;
        let cancelled = false;
        // Turned around halfway (a scroll down, then straight back up), it covers only the way
        // left, in that share of the time: a full-length move over half the distance would drag.
        progress.stopAnimation((value) => {
            if (cancelled) return;
            const distance = Math.min(1, Math.abs(target - value));
            if (distance < 0.01) {
                progress.setValue(target);
                return;
            }
            const full = hidden ? exitDuration(MotionDuration.dock) : MotionDuration.dock;
            animation = Animated.timing(progress, {
                toValue: target,
                duration: Math.round(full * distance),
                easing: MotionEasing.out,
                useNativeDriver: NATIVE_DRIVER,
                // The deck list reads its decks after interactions; the dock moving is not one.
                isInteraction: false,
            });
            animation.start();
        });
        return () => {
            cancelled = true;
            animation?.stop();
        };
    }, [hidden, progress]);

    const hasAction = Boolean(action);
    const path = useMemo(
        () => dockOutlinePath(width, DOCK.height, hasAction ? dockNotch(FAB_SIZE, Radius.sheet) : null, HAIRLINE / 2),
        [hasAction, width],
    );
    const travel = dockHiddenOffset(insets.bottom, FAB_SIZE);
    // One node for the dock's life: a fresh interpolation on every render of the deck list (each
    // scroll event re-renders it) would be re-attached mid-slide and could paint a stale frame.
    const motionStyle = useMemo(() => (reduceMotion
        ? { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }
        : { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }) }] }
    ), [progress, reduceMotion, travel]);
    const transitionStyle = {
        ...(reduceMotion ? { opacity: hidden ? 0 : 1 } : { transform: [{ translateY: hidden ? travel : 0 }] }),
        transitionProperty: reduceMotion ? 'opacity' : 'transform',
        transitionDuration: `${hidden ? exitDuration(MotionDuration.dock) : MotionDuration.dock}ms`,
        transitionTimingFunction: `cubic-bezier(${MotionCurve.easeOut.join(', ')})`,
    } as unknown as ViewStyle; // react-native-web reads the CSS transition props.

    const items = React.Children.toArray(children);
    const half = Math.ceil(items.length / 2);

    return (
        <Animated.View
            // The prop, not the style: react-native-web drops a 'box-none' style.
            pointerEvents={hidden ? 'none' : 'box-none'}
            accessibilityElementsHidden={hidden}
            importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
            aria-hidden={hidden || undefined}
            style={[
                styles.wrap,
                {
                    left: DOCK.sideInset + insets.left,
                    right: DOCK.sideInset + insets.right,
                    bottom: dockBottom(insets.bottom),
                    height: DOCK.height + (hasAction ? FAB_SIZE / 2 : 0),
                },
                CSS_TRANSITION ? transitionStyle : motionStyle,
            ]}
        >
            <View style={styles.column} pointerEvents="box-none">
                <View style={styles.panel} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
                    {/* No fill of its own: its shadow follows the drawn outline, notch included. */}
                    <View style={[StyleSheet.absoluteFill, Shadow.floatingOutline]} pointerEvents="none" shouldRasterizeIOS>
                        {path ? (
                            <Svg width={width} height={DOCK.height} {...DECORATIVE_SVG_PROPS}>
                                <Path d={path} fill={colors.bgCard} stroke={colors.border} strokeWidth={HAIRLINE} />
                            </Svg>
                        ) : null}
                    </View>
                    <View style={styles.row}>
                        {hasAction ? items.slice(0, half) : items}
                        {hasAction ? <View style={styles.actionSlot} /> : null}
                        {hasAction ? items.slice(half) : null}
                    </View>
                </View>
                {action ? <RaisedAction action={action} /> : null}
            </View>
        </Animated.View>
    );
}

/** The raised button and its caption: one button, so the caption takes the press too. */
function RaisedAction({ action }: { action: DockAction }) {
    const colors = useThemeColors();
    return (
        <View style={styles.raisedLayer} pointerEvents="box-none">
            <PressableScale
                style={styles.raised}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel ?? action.label}
                accessibilityState={action.expanded === undefined ? undefined : { expanded: action.expanded }}
                aria-expanded={action.expanded}
            >
                <FabFace>{action.icon}</FabFace>
                <Text
                    style={[styles.caption, { color: colors.textSecondary }]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.15}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                >
                    {action.label}
                </Text>
            </PressableScale>
        </View>
    );
}

interface DockItemProps {
    /** The short caption under the icon. */
    label: string;
    /** Spoken instead of the caption, e.g. "Open statistics". */
    accessibilityLabel?: string;
    /** A 24-point icon in `colors.textPrimary`. */
    icon: React.ReactNode;
    onPress: () => void;
}

/** One shortcut of a `Dock`: an icon over a one-line caption, sinking under the finger. */
export function DockItem({ label, accessibilityLabel, icon, onPress }: DockItemProps) {
    const colors = useThemeColors();
    return (
        <PressableScale
            style={styles.item}
            onPress={onPress}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
        >
            {icon}
            <Text
                style={[styles.caption, { color: colors.textSecondary }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
            >
                {label}
            </Text>
        </PressableScale>
    );
}

const styles = StyleSheet.create({
    wrap: { position: 'absolute' },
    column: { flex: 1, width: '100%', maxWidth: DOCK.maxWidth, alignSelf: 'center' },
    panel: { position: 'absolute', left: 0, right: 0, bottom: 0, height: DOCK.height },
    row: { flex: 1, flexDirection: 'row', paddingHorizontal: Spacing.xs },
    item: {
        flex: 1,
        minWidth: 0,
        height: DOCK.height,
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: Spacing.xs,
        paddingHorizontal: Spacing.xxs,
        paddingBottom: CAPTION_BOTTOM,
    },
    caption: { ...Type.micro, textAlign: 'center' },
    actionSlot: { width: ACTION_SLOT },
    raisedLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center' },
    raised: {
        width: ACTION_WIDTH,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: CAPTION_BOTTOM,
    },
});
