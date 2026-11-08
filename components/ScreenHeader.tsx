import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { FontSize, Spacing, useThemeColors } from '../constants/theme';
import { IconButton } from './ui/Button';
import { BackIcon, CloseIcon } from './ui/icons';
import { Type } from './ui/tokens';

interface ScreenHeaderProps {
    backAccessibilityLabel: string;
    onBack: () => void;
    title: string;
    /** A second line under the title, e.g. the deck the screen is about. */
    subtitle?: string;
    /**
     * `back` (the arrow) for a screen pushed onto the stack; `close` (×) for a full-screen form or
     * workflow presented over another screen.
     */
    leading?: 'back' | 'close';
    /** Icon buttons or a compact button on the right; without them a spacer keeps the title placed. */
    actions?: React.ReactNode;
    /** A coloured header (the Kronometre's): its background, and the arrow and title on it. */
    tint?: { background: string; foreground: string };
}

/** The one header of every routed screen and full-screen form. */
export default function ScreenHeader({
    backAccessibilityLabel,
    onBack,
    title,
    subtitle,
    leading = 'back',
    actions,
    tint,
}: ScreenHeaderProps) {
    const colors = useThemeColors();
    const foreground = tint?.foreground ?? colors.textPrimary;

    return (
        <View
            style={[
                styles.header,
                tint
                    ? { backgroundColor: tint.background, borderBottomWidth: 0 }
                    : { backgroundColor: colors.bgCard, borderBottomColor: colors.border },
            ]}
        >
            <IconButton accessibilityLabel={backAccessibilityLabel} onPress={onBack} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                {leading === 'close'
                    ? <CloseIcon color={tint?.foreground ?? colors.textSecondary} />
                    : <BackIcon color={tint?.foreground ?? colors.accent} />}
            </IconButton>
            <View style={styles.titleBlock}>
                <Text style={[Type.title, { color: foreground }]} numberOfLines={1} accessibilityRole="header">
                    {title}
                </Text>
                {subtitle ? (
                    <Text style={[styles.subtitle, { color: tint ? foreground : colors.textMuted }]} numberOfLines={1}>
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            {actions ? <View style={styles.actions}>{actions}</View> : <View style={styles.spacer} />}
        </View>
    );
}

interface HeaderIconButtonProps {
    accessibilityLabel: string;
    onPress: () => void;
    children: React.ReactNode;
}

/** A 44-point icon button for the `actions` slot of `ScreenHeader`. */
export function HeaderIconButton({ accessibilityLabel, onPress, children }: HeaderIconButtonProps) {
    return <IconButton accessibilityLabel={accessibilityLabel} onPress={onPress}>{children}</IconButton>;
}

const styles = StyleSheet.create({
    header: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    titleBlock: { flex: 1, minWidth: 0, paddingVertical: Spacing.xs },
    subtitle: { fontSize: FontSize.sm },
    spacer: { width: 44 },
    actions: { flexDirection: 'row', alignItems: 'center' },
});
