import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';

interface StatsCardProps {
    title: string;
    /** Sits beside the title, e.g. a small badge. */
    accessory?: React.ReactNode;
    /** The card's own controls, directly under its heading. */
    controls?: React.ReactNode;
    children: React.ReactNode;
}

/** The rounded surface every statistics section sits on: heading, optional controls, content. */
export default function StatsCard({ title, accessory, controls, children }: StatsCardProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
                {accessory}
            </View>
            {controls ? <View style={styles.controls}>{controls}</View> : null}
            {children}
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        card: {
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.borderLight,
            padding: Spacing.lg,
            gap: Spacing.md,
            ...Shadows.sm,
        },
        header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 24 },
        title: { flex: 1, color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '700' },
        controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
    });
}
