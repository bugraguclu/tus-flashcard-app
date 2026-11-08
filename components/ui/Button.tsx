import React from 'react';
import {
    ActivityIndicator,
    type GestureResponderEvent,
    type Insets,
    type StyleProp,
    StyleSheet,
    TouchableOpacity,
    View,
    type ViewStyle,
} from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { CloseIcon } from './icons';
import { DISABLED_OPACITY, HIT_TARGET, Radius, Type } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'plain';

interface ButtonProps {
    label: string;
    onPress: (event: GestureResponderEvent) => void;
    /**
     * `primary` is the screen's main action (accent fill), `secondary` its companion (outlined),
     * `destructive` deletes or clears (red fill) and `plain` is a text-only action such as Cancel.
     */
    variant?: ButtonVariant;
    /** `compact` fits a header or a toolbar; `regular` is a form's or a sheet's action. */
    size?: 'regular' | 'compact';
    /** A plain button's colour: the accent by default, red for a destructive text action. */
    tone?: 'accent' | 'danger' | 'muted';
    disabled?: boolean;
    /** Shows a spinner in place of the label and blocks presses until the work finishes. */
    busy?: boolean;
    /** Drawn before the label, e.g. an icon from `components/ui/icons`. */
    icon?: React.ReactNode;
    /** Layout only (width, flex, margins); the look comes from `variant`. */
    style?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
    accessibilityHint?: string;
    numberOfLines?: number;
    hitSlop?: Insets;
}

/** The one button: every filled, outlined and text action in the app is drawn by it. */
export function Button({
    label,
    onPress,
    variant = 'primary',
    size = 'regular',
    tone = 'accent',
    disabled = false,
    busy = false,
    icon,
    style,
    accessibilityLabel,
    accessibilityHint,
    numberOfLines = 2,
    hitSlop,
}: ButtonProps) {
    const colors = useThemeColors();
    const compact = size === 'compact';
    const plainColor = tone === 'danger' ? colors.danger : tone === 'muted' ? colors.textSecondary : colors.accent;
    const surface: ViewStyle = variant === 'primary'
        ? { backgroundColor: colors.accent }
        : variant === 'destructive'
            ? { backgroundColor: colors.danger }
            : variant === 'secondary'
                ? { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border }
                : {};
    const labelColor = variant === 'primary' || variant === 'destructive'
        ? colors.onAccent
        : variant === 'secondary' ? colors.textPrimary : plainColor;
    const inactive = disabled || busy;
    // A compact control is drawn shorter than a finger; its slop makes up the rest.
    const slop = hitSlop ?? (compact ? { top: 2, bottom: 2 } : undefined);

    return (
        <TouchableOpacity
            style={[
                styles.base,
                compact ? styles.compact : styles.regular,
                variant === 'plain' && styles.plain,
                surface,
                disabled && styles.disabled,
                style,
            ]}
            onPress={onPress}
            disabled={inactive}
            hitSlop={slop}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ disabled: inactive, busy }}
        >
            {busy ? (
                <ActivityIndicator size="small" color={labelColor} />
            ) : (
                <View style={styles.content}>
                    {icon}
                    <Text
                        style={[
                            variant === 'plain' ? Type.textButton : Type.button,
                            compact && styles.compactLabel,
                            styles.label,
                            { color: labelColor },
                        ]}
                        numberOfLines={numberOfLines}
                    >
                        {label}
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

interface IconButtonProps {
    /** Spoken by VoiceOver; the icon itself is decorative. */
    accessibilityLabel: string;
    onPress: (event: GestureResponderEvent) => void;
    children: React.ReactNode;
    accessibilityHint?: string;
    disabled?: boolean;
    /** Marks a toggle's state, e.g. a pinned or active tool. */
    selected?: boolean;
    /** Marks what the button opens as open or closed, e.g. a help panel. */
    expanded?: boolean;
    style?: StyleProp<ViewStyle>;
    hitSlop?: Insets;
}

/** A 44-point, borderless button around one icon: header actions, close and help. */
export function IconButton({
    accessibilityLabel,
    onPress,
    children,
    accessibilityHint,
    disabled = false,
    selected,
    expanded,
    style,
    hitSlop,
}: IconButtonProps) {
    return (
        <TouchableOpacity
            style={[styles.icon, disabled && styles.disabled, style]}
            onPress={onPress}
            disabled={disabled}
            hitSlop={hitSlop ?? { top: 4, right: 4, bottom: 4, left: 4 }}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint}
            accessibilityState={{
                disabled,
                ...(selected === undefined ? {} : { selected }),
                ...(expanded === undefined ? {} : { expanded }),
            }}
        >
            {children}
        </TouchableOpacity>
    );
}

/** Closes a sheet, dialog or full-screen form. */
export function CloseButton({ accessibilityLabel, onPress, color }: {
    accessibilityLabel: string;
    onPress: () => void;
    /** For a tinted header; the muted text colour otherwise. */
    color?: string;
}) {
    const colors = useThemeColors();
    return (
        <IconButton accessibilityLabel={accessibilityLabel} onPress={onPress}>
            <CloseIcon color={color ?? colors.textSecondary} />
        </IconButton>
    );
}

/** The round “?” beside a heading that opens its explanation. */
export function HelpButton({ accessibilityLabel, onPress, expanded }: {
    accessibilityLabel: string;
    onPress: () => void;
    /** Whether the explanation it opens is showing. */
    expanded?: boolean;
}) {
    const colors = useThemeColors();
    return (
        <IconButton accessibilityLabel={accessibilityLabel} onPress={onPress} expanded={expanded}>
            <View style={[styles.helpCircle, { borderColor: colors.accent, backgroundColor: colors.accentLight }]}>
                <Text style={[styles.helpMark, { color: colors.accent }]} maxFontSizeMultiplier={1.2}>?</Text>
            </View>
        </IconButton>
    );
}

const styles = StyleSheet.create({
    base: {
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.control,
    },
    regular: { minHeight: 50, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
    compact: { minHeight: 40, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
    plain: { minHeight: HIT_TARGET, minWidth: HIT_TARGET, paddingHorizontal: Spacing.md },
    content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, maxWidth: '100%' },
    label: { textAlign: 'center', flexShrink: 1 },
    compactLabel: { fontSize: FontSize.sm },
    disabled: { opacity: DISABLED_OPACITY },
    icon: {
        width: HIT_TARGET,
        height: HIT_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.pill,
    },
    helpCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    helpMark: { fontSize: 13, lineHeight: 16, fontWeight: '800' },
});
