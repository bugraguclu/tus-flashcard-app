import React from 'react';
import { Animated, Platform, type StyleProp, StyleSheet, TouchableOpacity, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { menuOpenHaptic } from '../../lib/haptics';
import { PopoverBackdrop, PopoverItem, PopoverModal, usePopoverProgress } from '../Popover';
import PressableScale from '../PressableScale';
import { Radius, Shadow } from './tokens';
import { focusFaceProps } from './focusFace';

/** The side of a floating button, in points. */
export const FAB_SIZE = 56;

/** The side of a speed dial action's small button. */
const ACTION_BUTTON_SIZE = 46;

/**
 * How a speed dial lays out its actions: a column hugging the right edge (names left of their
 * buttons), or a row above a centred button (names under their buttons).
 */
const SpeedDialLayout = React.createContext<'column' | 'row'>('column');

/** How far a row of actions slides up as it opens, like a drawer pulled out from behind ＋. */
const ROW_SLIDE = 40;
/** A row action's width: room for its name on two lines under its button. */
const ROW_ACTION_WIDTH = 104;

/** `rounded` is the deck list's ＋ (a rounded square); `round` is the Kronometre's orange circle. */
export type FabShape = 'rounded' | 'round';

interface FabProps {
    accessibilityLabel: string;
    onPress: () => void;
    /** The icon, in `colors.onAccent`. */
    children: React.ReactNode;
    shape?: FabShape;
    /** The fill: the accent by default; `colors.studyTool` for the Kronometre's tools. May be animated. */
    color?: Animated.WithAnimatedValue<string>;
    /** For a button that opens a menu: whether it is showing. */
    expanded?: boolean;
    /** Where it floats (`position`, `right`, `bottom`); the look comes from `shape` and `color`. */
    style?: StyleProp<ViewStyle>;
}

/**
 * The floating button's face (its fill, corners, shadow and icon) for a control that wraps it in a
 * larger button: the dock's raised ＋, whose caption under it is part of the same button.
 */
export function FabFace({ children, shape = 'rounded', color }: {
    /** The icon, in `colors.onAccent`. */
    children: React.ReactNode;
    shape?: FabShape;
    color?: string;
}) {
    const colors = useThemeColors();
    return (
        <View style={[styles.fab, shape === 'round' ? styles.round : styles.rounded, { backgroundColor: color ?? colors.accent }]} {...focusFaceProps}>
            {children}
        </View>
    );
}

/** The floating button: the one action a screen keeps above its content. It sinks under the finger. */
export function Fab({ accessibilityLabel, onPress, children, shape = 'rounded', color, expanded, style }: FabProps) {
    const colors = useThemeColors();
    return (
        <PressableScale
            style={[styles.fab, shape === 'round' ? styles.round : styles.rounded, style, { backgroundColor: color ?? colors.accent }]}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={expanded === undefined ? undefined : { expanded }}
            aria-expanded={expanded}
        >
            {children}
        </PressableScale>
    );
}

/** How much the open menu's button grows as the menu opens: lifted toward the finger, not jumping. */
const OPEN_GROW = 1.06;
/** How far its glow reaches past the button once open. */
const GLOW_GROW = 1.3;
/** How strong the glow is at its fullest: a hint of light, not a second button. */
const GLOW_OPACITY = 0.35;
/** The glow's soft edge: a wide shadow of its own colour (a CSS box shadow in a browser). */
function glowShadow(color: string): ViewStyle {
    return Platform.OS === 'web'
        ? ({ boxShadow: `0 0 24px 6px ${color}` } as ViewStyle)
        : { shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 18 };
}

/**
 * The open menu's button: its icon turns 45° (＋ becomes ×), its fill deepens, it grows a little
 * and a soft glow of its own colour lights up behind it as the menu opens, all on the menu's own
 * clock, so they shrink back together as it closes. Reduce Motion keeps the glow's fade only.
 */
function OpenFab({ shape, color, openColor, turns, icon, onPress, label, style }: {
    shape: FabShape;
    color: string;
    openColor: string;
    turns: boolean;
    icon: React.ReactNode;
    onPress: () => void;
    label: string;
    style: StyleProp<ViewStyle>;
}) {
    const progress = usePopoverProgress();
    const reduceMotion = useReduceMotion();
    const rotate = !turns ? '0deg' : progress && !reduceMotion
        ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] })
        : '45deg';
    const fill = progress && openColor !== color
        ? progress.interpolate({ inputRange: [0, 1], outputRange: [color, openColor] })
        : openColor;
    const grow = (to: number) => (progress && !reduceMotion
        ? progress.interpolate({ inputRange: [0, 1], outputRange: [1, to] })
        : 1);
    const corners = shape === 'round' ? styles.round : styles.rounded;
    return (
        <Animated.View style={[style, styles.openFab, { transform: [{ scale: grow(OPEN_GROW) }] }]} pointerEvents="box-none">
            <Animated.View
                pointerEvents="none"
                style={[
                    styles.glow,
                    corners,
                    { backgroundColor: openColor },
                    glowShadow(openColor),
                    {
                        opacity: progress ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, GLOW_OPACITY] }) : GLOW_OPACITY,
                        transform: [{ scale: grow(GLOW_GROW) }],
                    },
                ]}
            />
            <Fab accessibilityLabel={label} onPress={onPress} shape={shape} color={fill} expanded>
                <Animated.View style={{ transform: [{ rotate }] }}>{icon}</Animated.View>
            </Fab>
        </Animated.View>
    );
}

interface SpeedDialProps {
    visible: boolean;
    onOpen: () => void;
    onClose: () => void;
    /** Runs once the menu has gone, e.g. to open what was chosen without two modals at once. */
    onDismiss?: () => void;
    /** Leaves at once, without sinking back into the button (`useModalHandoff`). */
    closeAtOnce?: boolean;
    /** Distance of the button from the screen's bottom edge. */
    bottom: number;
    /**
     * Where the button sits: at the right edge (a floating button), with its actions rising above
     * it in a column, or centred on the screen (the dock's raised ＋), with its actions side by
     * side over it, sliding up together from behind it like a drawer.
     */
    placement?: 'right' | 'center';
    /**
     * False when the closed button is drawn by its container at the same spot (the dock draws its
     * raised ＋ in its notch): the speed dial then brings only the open menu and its turning button.
     */
    withButton?: boolean;
    /**
     * Extra side inset that keeps the button and its actions at the edge of a column centred in
     * a wide window (`useCenteredInset`); 0 on a phone. A centred speed dial needs none.
     */
    inset?: number;
    shape?: FabShape;
    /** The button's fill; the accent by default. */
    color?: string;
    /** Its fill while the menu is open; the same by default. */
    openColor?: string;
    /** The button's icon, in `colors.onAccent`. */
    icon: React.ReactNode;
    /** Turns the icon 45° while the menu is open, so ＋ reads as ×. */
    turnsToClose?: boolean;
    openLabel: string;
    closeLabel: string;
    /** Actions span the screen (`SpeedDialCard`) instead of hugging the right edge (`SpeedDialAction`). */
    stretch?: boolean;
    /** One `SpeedDialAction` or `SpeedDialCard` per action; the last one sits nearest the button. */
    children: React.ReactNode;
}

/**
 * A floating button that opens its actions above itself, over the strong dimming: they rise out of
 * the button one after another and sink back into it when the menu closes. Tapping the dimming or
 * the button again closes it.
 */
export function SpeedDial({
    visible, onOpen, onClose, onDismiss, closeAtOnce, bottom, placement = 'right', withButton = true, inset = 0,
    shape = 'rounded', color, openColor, icon, turnsToClose = false, openLabel, closeLabel, stretch = false, children,
}: SpeedDialProps) {
    const colors = useThemeColors();
    React.useEffect(() => {
        if (visible) menuOpenHaptic();
    }, [visible]);
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    const { l } = useI18n();
    const fill = color ?? colors.accent;
    const items = React.Children.toArray(children);
    const centred = placement === 'center';
    const buttonPlace: ViewStyle = centred
        ? { bottom, left: (windowWidth - FAB_SIZE) / 2 }
        : { bottom, right: Spacing.lg + inset };
    const layout = centred && !stretch ? 'row' : 'column';
    return (
        <>
            {withButton ? (
                <Fab accessibilityLabel={openLabel} onPress={onOpen} shape={shape} color={fill} expanded={false} style={[styles.floating, buttonPlace]}>
                    {icon}
                </Fab>
            ) : null}
            <PopoverModal visible={visible} onRequestClose={onClose} onDismiss={onDismiss} closeAtOnce={closeAtOnce} itemCount={items.length}>
                <View style={styles.overlay}>
                    <PopoverBackdrop
                        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrimStrong }]}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kapat', 'Close')}
                    />
                    {/* The prop, not the style: react-native-web drops a 'box-none' style. */}
                    <View
                        style={[
                            styles.actions,
                            layout === 'row' ? styles.actionsRow : !stretch && styles.actionsHug,
                            {
                                paddingBottom: bottom + FAB_SIZE + (stretch ? Spacing.lg : Spacing.md),
                                paddingLeft: Spacing.lg + insets.left + (stretch ? inset : 0),
                                paddingRight: Spacing.lg + (layout === 'row' ? insets.right : inset + (stretch ? insets.right : 0)),
                            },
                        ]}
                        pointerEvents="box-none"
                        accessibilityRole="menu"
                        accessibilityLabel={openLabel}
                    >
                        <SpeedDialLayout.Provider value={layout}>
                            {items.map((item, index) => (
                                layout === 'row' ? (
                                    // All together, sliding up from behind the button like a drawer.
                                    <PopoverItem
                                        key={(item as React.ReactElement).key ?? index}
                                        slide={{ axis: 'y', distance: ROW_SLIDE }}
                                    >
                                        {item}
                                    </PopoverItem>
                                ) : (
                                    // The action nearest the button comes out first.
                                    <PopoverItem
                                        key={(item as React.ReactElement).key ?? index}
                                        index={items.length - 1 - index}
                                        origin="bottom right"
                                    >
                                        {item}
                                    </PopoverItem>
                                )
                            ))}
                        </SpeedDialLayout.Provider>
                    </View>
                    <OpenFab
                        shape={shape}
                        color={fill}
                        openColor={openColor ?? fill}
                        turns={turnsToClose}
                        icon={icon}
                        onPress={onClose}
                        label={closeLabel}
                        style={[styles.floating, buttonPlace]}
                    />
                </View>
            </PopoverModal>
        </>
    );
}

/** A speed dial's short action: its name on the dimming and a small filled button with its icon. */
export function SpeedDialAction({ label, icon, onPress }: {
    label: string;
    /** A 22-point icon in `colors.onAccent`. */
    icon: React.ReactNode;
    onPress: () => void;
}) {
    const colors = useThemeColors();
    const row = React.useContext(SpeedDialLayout) === 'row';
    return (
        <TouchableOpacity style={row ? styles.rowAction : styles.action} onPress={onPress} accessibilityRole="menuitem" accessibilityLabel={label}>
            <View style={row ? styles.rowActionLabel : styles.actionLabel}>
                <Text
                    style={[styles.actionLabelText, row && styles.rowActionLabelText, { color: colors.onAccent }]}
                    numberOfLines={row ? 2 : undefined}
                >
                    {label}
                </Text>
            </View>
            <View style={[styles.actionButton, { backgroundColor: colors.accent }]} {...focusFaceProps}>{icon}</View>
        </TouchableOpacity>
    );
}

/** A speed dial's explained action: a filled card with an icon, a title and what it does. */
export function SpeedDialCard({ title, subtitle, icon, onPress, color }: {
    title: string;
    subtitle: string;
    /** A 32-point icon in `colors.onAccent`. */
    icon: React.ReactNode;
    onPress: () => void;
    /** The card's fill; the accent by default. */
    color?: string;
}) {
    const colors = useThemeColors();
    return (
        <TouchableOpacity
            style={[styles.card, { backgroundColor: color ?? colors.accent }]}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${title}. ${subtitle}`}
        >
            <View style={styles.cardIcon}>{icon}</View>
            <View style={styles.cardCopy}>
                <Text style={[styles.cardTitle, { color: colors.onAccent }]}>{title}</Text>
                <Text style={[styles.cardSubtitle, { color: colors.onAccent }]}>{subtitle}</Text>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    fab: {
        width: FAB_SIZE,
        height: FAB_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadow.floating,
    },
    // A rounded square, not a circle (the owner chose it for the deck list's ＋).
    rounded: { borderRadius: Radius.sheet },
    round: { borderRadius: FAB_SIZE / 2 },
    floating: { position: 'absolute' },
    openFab: { width: FAB_SIZE, height: FAB_SIZE },
    // Light behind the button: its own colour, faint, with a wide soft shadow of the same colour.
    glow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    overlay: { flex: 1, justifyContent: 'flex-end' },
    actions: { gap: Spacing.md },
    actionsHug: { alignItems: 'flex-end' },
    actionsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: Spacing.sm },
    action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: Spacing.md },
    // Name under the button: the button first on screen, the name read first by VoiceOver.
    rowAction: { width: ROW_ACTION_WIDTH, flexDirection: 'column-reverse', alignItems: 'center', gap: Spacing.sm },
    // A name too long for the room beside its button wraps, hugging the button.
    actionLabel: { flexShrink: 1, maxWidth: 240, paddingHorizontal: 10, paddingVertical: 7 },
    actionLabelText: { fontSize: FontSize.sm, fontWeight: '500', textAlign: 'right' },
    rowActionLabel: { alignSelf: 'stretch', minHeight: 36, justifyContent: 'flex-start' },
    rowActionLabelText: { textAlign: 'center', lineHeight: 18 },
    actionButton: {
        width: ACTION_BUTTON_SIZE,
        height: ACTION_BUTTON_SIZE,
        borderRadius: Radius.inset,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadow.floating,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        minHeight: 76,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderRadius: Radius.card,
        ...Shadow.floating,
    },
    cardIcon: { width: 36, alignItems: 'center' },
    cardCopy: { flex: 1, gap: 3 },
    cardTitle: { fontSize: FontSize.lg, fontWeight: '600' },
    cardSubtitle: { fontSize: FontSize.sm, lineHeight: 18 },
});
