import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';

type Props = {
    compact: boolean;
    title: string | null;
    onPress: () => void;
    accessibilityLabel: string;
    tooltip: string;
    children: React.ReactNode;
};

/** Keep deck identity above the counts on a phone, while wide screens retain one row. */
export default function ReviewerDeckScope({ compact, title, onPress, accessibilityLabel, tooltip, children }: Props) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
    return (
        <TouchableOpacity
            style={styles.scope}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            {...(Platform.OS === 'web' ? { title: tooltip } : {})}
        >
            {title !== null ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
            <View style={styles.details}>{children}</View>
        </TouchableOpacity>
    );
}

function createStyles(colors: ColorScheme, compact: boolean) {
    return StyleSheet.create({
        scope: {
            flex: 1,
            minWidth: compact ? 84 : 56,
            minHeight: 44,
            flexDirection: compact ? 'column' : 'row',
            alignItems: compact ? 'flex-start' : 'center',
            justifyContent: compact ? 'center' : 'flex-start',
            gap: compact ? 2 : 10,
            paddingHorizontal: compact ? Spacing.xs : Spacing.sm,
        },
        title: {
            minWidth: 0,
            maxWidth: compact ? '100%' : 220,
            flexShrink: 1,
            fontSize: FontSize.sm,
            fontWeight: '700',
            color: colors.textSecondary,
        },
        details: { flexDirection: 'row', alignItems: 'center', gap: compact ? 7 : 10 },
    });
}
