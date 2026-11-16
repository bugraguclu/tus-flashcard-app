import React from 'react';
import {
    type AccessibilityActionEvent,
    type AccessibilityActionInfo,
    type Insets,
    type LayoutChangeEvent,
    type StyleProp,
    StyleSheet,
    TouchableOpacity,
    View,
    type ViewStyle,
} from 'react-native';
import { Text } from '../AppText';
import { Spacing, useThemeColors, FontSize } from '../../constants/theme';
import { DISABLED_OPACITY, HIT_TARGET, Radius, Type } from './tokens';

/**
 * Bars of icon controls: the bar of shortcuts or bulk actions along a screen's bottom edge, and
 * the square buttons of a formatting or drawing toolbar.
 */

interface BottomBarProps {
    children: React.ReactNode;
    onLayout?: (event: LayoutChangeEvent) => void;
    style?: StyleProp<ViewStyle>;
}

/** The bar along a screen's bottom edge: a white strip under a hairline that holds `BottomBarItem`s. */
export function BottomBar({ children, onLayout, style }: BottomBarProps) {
    const colors = useThemeColors();
    return (
        <View style={[styles.bar, { backgroundColor: colors.bgCard, borderTopColor: colors.border }, style]} onLayout={onLayout}>
            {children}
        </View>
    );
}

interface BottomBarItemProps {
    /** The short caption under the icon. */
    label: string;
    /** Spoken instead of the caption, e.g. "Open statistics". */
    accessibilityLabel?: string;
    /** A 20-point icon. */
    icon: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
    /** For an item that opens a menu: whether it is showing. */
    expanded?: boolean;
}

/** One shortcut or action of a `BottomBar`: an icon over a one-line caption. */
export function BottomBarItem({ label, accessibilityLabel, icon, onPress, disabled = false, expanded }: BottomBarItemProps) {
    const colors = useThemeColors();
    return (
        <TouchableOpacity
            style={[styles.item, disabled && styles.disabled]}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={expanded === undefined ? { disabled } : { disabled, expanded }}
            aria-disabled={disabled}
            aria-expanded={expanded}
        >
            {icon}
            <Text
                style={[styles.itemLabel, { color: colors.textSecondary }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
            >
                {label}
            </Text>
        </TouchableOpacity>
    );
}

interface ToolButtonProps {
    accessibilityLabel: string;
    onPress: () => void;
    /** A 22-point icon, or a short text mark for a tool that has no icon. */
    children: React.ReactNode;
    /** A one-line caption under the icon, for a tool whose icon alone would not say what it is. */
    label?: string;
    /** The tool is the active one, or the format it applies is on at the cursor. */
    selected?: boolean;
    /** For a tool that opens a row of options (a colour palette): whether it is showing. */
    expanded?: boolean;
    /** The toolbar's own primary action (Done): an accent fill, its icon in `colors.onAccent`. */
    filled?: boolean;
    /** `tab` for the tools of a tablist, of which one is in hand; `button` otherwise. */
    accessibilityRole?: 'button' | 'tab';
    disabled?: boolean;
    onLongPress?: () => void;
    delayLongPress?: number;
    accessibilityHint?: string;
    accessibilityActions?: readonly AccessibilityActionInfo[];
    onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
    hitSlop?: Insets;
    /** Layout only (a width that makes the last tool peek, margins). */
    style?: StyleProp<ViewStyle>;
}

/** One tool of a formatting or drawing toolbar: a 44-point square that tints when it is on. */
export function ToolButton({
    accessibilityLabel, onPress, children, label, selected, expanded, filled = false, accessibilityRole = 'button',
    disabled = false, onLongPress, delayLongPress,
    accessibilityHint, accessibilityActions, onAccessibilityAction, hitSlop, style,
}: ToolButtonProps) {
    const colors = useThemeColors();
    return (
        <TouchableOpacity
            style={[
                styles.tool,
                label ? styles.toolLabelled : null,
                selected && !disabled ? { backgroundColor: colors.accentLight } : null,
                filled ? { backgroundColor: colors.accent } : null,
                disabled && styles.disabled,
                style,
            ]}
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={delayLongPress}
            disabled={disabled}
            hitSlop={hitSlop}
            accessibilityRole={accessibilityRole}
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint}
            accessibilityActions={accessibilityActions}
            onAccessibilityAction={onAccessibilityAction}
            accessibilityState={{
                disabled,
                ...(selected === undefined ? {} : { selected }),
                ...(expanded === undefined ? {} : { expanded }),
            }}
            aria-disabled={disabled}
            aria-selected={selected}
            aria-expanded={expanded}
        >
            {children}
            {label ? (
                <Text
                    style={[styles.toolLabel, { color: selected && !disabled ? colors.accent : colors.textSecondary }]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.15}
                >
                    {label}
                </Text>
            ) : null}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    bar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        minHeight: 60,
        paddingTop: Spacing.xs,
        paddingBottom: Spacing.xxs,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    item: {
        flex: 1,
        minHeight: 52,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xxs,
        paddingHorizontal: Spacing.s6,
        paddingVertical: Spacing.xs,
    },
    itemLabel: { ...Type.micro, textAlign: 'center' },
    disabled: { opacity: DISABLED_OPACITY },
    tool: {
        width: HIT_TARGET,
        height: HIT_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.control,
    },
    toolLabelled: { width: undefined, minWidth: HIT_TARGET, height: undefined, minHeight: 52, gap: Spacing.xxs, paddingHorizontal: Spacing.xs },
    toolLabel: { ...Type.micro, textAlign: 'center' },
});
