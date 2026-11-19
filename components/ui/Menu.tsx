import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, type StyleProp, StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { PopoverBackdrop, PopoverItem, PopoverModal, usePopoverItemStyle } from '../Popover';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, MinusIcon } from './icons';
import { DISABLED_OPACITY, Radius, Shadow, Type } from './tokens';

interface PopoverMenuProps {
    visible: boolean;
    onClose: () => void;
    /** Runs once the menu has gone, e.g. to open what was chosen without two modals at once. */
    onDismiss?: () => void;
    /**
     * Leaves at once, without its exit animation, when `visible` turns false: set by
     * `useModalHandoff` while it hands the screen to another modal, which UIKit would
     * otherwise hold back until this one has gone.
     */
    closeAtOnce?: boolean;
    /**
     * Where the menu hangs: its top edge below the screen's top (safe area included) and its
     * distance from the right edge. By default it hangs under a 56-point header's right corner.
     */
    anchor?: { top?: number; right?: number };
    /** Names the menu for VoiceOver. */
    accessibilityLabel?: string;
    /** Spoken for the dimmed backdrop that closes the menu; "Menüyü kapat" by default. */
    closeLabel?: string;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

/**
 * The one ••• menu: a white card that hangs from the button that opened it, over a light dimming
 * that closes it. Rows are `MenuItem`s. Keep it mounted and drive it with `visible`, so it can
 * shrink back into its button.
 */
export function PopoverMenu({ visible, onClose, onDismiss, closeAtOnce, anchor, accessibilityLabel, closeLabel, children, style }: PopoverMenuProps) {
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const { l } = useI18n();
    return (
        // It grows out of the button that opened it, from its top right corner, while the dimming
        // fades in, and shrinks back into it a fifth faster (components/Popover.tsx).
        <PopoverModal visible={visible} onRequestClose={onClose} onDismiss={onDismiss} closeAtOnce={closeAtOnce}>
            <View style={styles.layer} pointerEvents="box-none">
                <PopoverBackdrop
                    style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrimLight }]}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={closeLabel ?? l('Menüyü kapat', 'Close menu')}
                />
                <PopoverItem
                    origin="top right"
                    style={[
                        styles.menu,
                        {
                            top: insets.top + (anchor?.top ?? 52),
                            right: anchor?.right ?? Spacing.sm,
                            maxHeight: '80%',
                            backgroundColor: colors.bgCard,
                            borderColor: colors.border,
                        },
                        style,
                    ]}
                    accessibilityViewIsModal
                    accessibilityRole="menu"
                    accessibilityLabel={accessibilityLabel}
                >
                    <ScrollView bounces={false} contentContainerStyle={styles.menuContent}>{children}</ScrollView>
                </PopoverItem>
            </View>
        </PopoverModal>
    );
}

interface MenuItemProps {
    label: string;
    onPress: () => void;
    /** A 22-point line icon in the muted text colour. */
    icon?: React.ReactNode;
    /** A one-line explanation under the label. */
    hint?: string;
    /** Draws a tick at the end: the item is an option that is on; `mixed` for a partly chosen group. */
    checked?: boolean | 'mixed';
    /** With `checked`: the item is one of a set of which exactly one is chosen (a radio button). */
    exclusive?: boolean;
    /** Draws a trailing › : the item opens a submenu or another list. */
    chevron?: boolean;
    /** Makes the item a disclosure that opens rows under it: a down or up chevron and its state. */
    expanded?: boolean;
    /** Drawn at the end before any tick or chevron, e.g. a count `Badge`. */
    accessory?: React.ReactNode;
    destructive?: boolean;
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityHint?: string;
}

/** One action of a `PopoverMenu` or of an action sheet. */
export function MenuItem({
    label,
    onPress,
    icon,
    hint,
    checked,
    exclusive = false,
    chevron = false,
    expanded,
    accessory,
    destructive = false,
    disabled = false,
    accessibilityLabel,
    accessibilityHint,
}: MenuItemProps) {
    const colors = useThemeColors();
    const role = checked === undefined ? 'menuitem' : exclusive ? 'radio' : 'checkbox';
    return (
        <TouchableOpacity
            style={[styles.item, disabled && styles.disabled]}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole={role}
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityHint={accessibilityHint}
            accessibilityState={{
                disabled,
                ...(checked === undefined ? {} : { checked }),
                ...(expanded === undefined ? {} : { expanded }),
            }}
            aria-disabled={disabled}
            aria-checked={checked}
            aria-expanded={expanded}
        >
            {icon ? <View style={styles.icon}>{icon}</View> : null}
            <View style={styles.copy}>
                <Text style={[styles.label, { color: destructive ? colors.danger : colors.textPrimary }]}>{label}</Text>
                {hint ? <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text> : null}
            </View>
            {accessory}
            {checked === true ? <CheckIcon color={colors.accent} size={20} /> : null}
            {checked === 'mixed' ? <MinusIcon color={colors.accent} size={20} /> : null}
            {expanded === undefined
                ? null
                : expanded ? <ChevronUpIcon color={colors.textMuted} size={16} /> : <ChevronDownIcon color={colors.textMuted} size={16} />}
            {chevron ? <ChevronRightIcon color={colors.textMuted} size={16} /> : null}
        </TouchableOpacity>
    );
}

interface MenuDialogProps {
    visible: boolean;
    /** What the menu acts on, e.g. the deck's path. */
    title: string;
    onClose: () => void;
    /**
     * Runs once the menu has left the screen. iOS cannot present a route, dialog or sheet chosen
     * in it until then, so the caller holds the chosen action back until this is called.
     */
    onDismissed?: () => void;
    /** Leaves without its fade (`useModalHandoff`). */
    closeAtOnce?: boolean;
    /** Spoken for the dimmed backdrop that closes the menu. */
    closeLabel?: string;
    /** `MenuItem`s. */
    children: React.ReactNode;
}

/**
 * A long action menu as a card centred over the dimmed screen, titled with what it acts on: the
 * deck row's ••• menu, whose thirteen actions would not fit a popover. Its actions open alerts,
 * sheets and routes at once, so it fades with a native `Modal` and only grows its card in. A short
 * menu is a `PopoverMenu`.
 */
export function MenuDialog({ visible, title, onClose, onDismissed, closeAtOnce = false, closeLabel, children }: MenuDialogProps) {
    const colors = useThemeColors();
    const { l } = useI18n();
    return (
        <Modal
            visible={visible}
            transparent
            animationType={closeAtOnce && !visible ? 'none' : 'fade'}
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={[styles.dialogLayer, { backgroundColor: colors.scrim }]}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={closeLabel ?? l('Menüyü kapat', 'Close menu')}
                />
                <MenuDialogCard title={title}>{children}</MenuDialogCard>
                {onDismissed ? <DismissedSignal onDismissed={onDismissed} /> : null}
            </View>
        </Modal>
    );
}

/**
 * Reports its own unmount. A closing modal's content stays mounted until the modal is gone (on
 * iOS until UIKit has dismissed it), so this is the moment the menu has left, on every platform.
 */
function DismissedSignal({ onDismissed }: { onDismissed: () => void }) {
    const latest = useRef(onDismissed);
    latest.current = onDismissed;
    useEffect(() => () => latest.current(), []);
    return null;
}

/** The card, mounted afresh each time the menu opens: it grows in from 95% while the modal fades. */
function MenuDialogCard({ title, children }: { title: string; children: React.ReactNode }) {
    const colors = useThemeColors();
    const scrollRef = useRef<ScrollView>(null);
    const heights = useRef({ viewport: 0, content: 0, flashed: false });
    const growIn = usePopoverItemStyle();

    // On a short phone the last rows sit below the fold. Flashing the indicator once says the list
    // goes on; a row cut off at the card's edge alone left the last action looking absent.
    const flashWhenScrollable = () => {
        const { viewport, content, flashed } = heights.current;
        if (flashed || viewport === 0 || content <= viewport + 1) return;
        heights.current.flashed = true;
        scrollRef.current?.flashScrollIndicators();
    };

    return (
        <Animated.View style={[styles.dialogCard, { backgroundColor: colors.bgCard }, growIn]} accessibilityViewIsModal accessibilityRole="menu">
            <Text style={[Type.title, styles.dialogTitle, { color: colors.textPrimary }]} accessibilityRole="header">{title}</Text>
            <ScrollView
                ref={scrollRef}
                style={styles.dialogScroll}
                contentContainerStyle={styles.dialogContent}
                onLayout={(event) => {
                    heights.current.viewport = event.nativeEvent.layout.height;
                    flashWhenScrollable();
                }}
                onContentSizeChange={(_, height) => {
                    heights.current.content = height;
                    flashWhenScrollable();
                }}
            >
                {children}
            </ScrollView>
        </Animated.View>
    );
}

/** A hairline between groups of menu items. */
export function MenuSeparator() {
    const colors = useThemeColors();
    return <View style={[styles.separator, { backgroundColor: colors.borderLight }]} />;
}

const styles = StyleSheet.create({
    layer: { flex: 1 },
    menu: {
        position: 'absolute',
        minWidth: 220,
        maxWidth: 320,
        borderRadius: Radius.inset,
        borderWidth: 1,
        ...Shadow.floating,
    },
    menuContent: { paddingVertical: Spacing.xs },
    item: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    disabled: { opacity: DISABLED_OPACITY },
    icon: { width: 22, alignItems: 'center' },
    copy: { flex: 1, minWidth: 0, gap: Spacing.xxs },
    label: { fontSize: FontSize.md, fontWeight: '500' },
    hint: { fontSize: FontSize.sm, lineHeight: 17 },
    separator: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs },
    dialogLayer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    dialogCard: {
        width: '100%',
        maxWidth: 520,
        maxHeight: '88%',
        zIndex: 1,
        overflow: 'hidden',
        borderRadius: 28,
        paddingTop: Spacing.xl,
        ...Shadow.floating,
    },
    dialogTitle: { paddingHorizontal: 30, paddingBottom: Spacing.sm, lineHeight: 24 },
    dialogScroll: { flexGrow: 0 },
    // With a menu item's own 16-point inset the labels line up with the title, 30 points in.
    dialogContent: { paddingHorizontal: 14, paddingBottom: Spacing.xl },
});
