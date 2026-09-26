import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';

interface StatsCardProps {
    title: string;
    subtitle?: string;
    /** Sits beside the title, e.g. a year navigator. */
    accessory?: React.ReactNode;
    /** The card's own controls, directly under its heading. */
    controls?: React.ReactNode;
    children: React.ReactNode;
}

/** The frame every statistics section is drawn in: heading, optional controls, then content. */
export default function StatsCard({ title, subtitle, accessory, controls, children }: StatsCardProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View style={styles.card}>
            <View style={styles.header}>
                <View style={styles.heading}>
                    <Text style={styles.title} accessibilityRole="header">{title}</Text>
                    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                </View>
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
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            gap: Spacing.md,
            ...Shadows.sm,
        },
        header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
        heading: { flex: 1, minWidth: 0, gap: 3 },
        title: { color: colors.textPrimary, fontSize: FontSize.lg, lineHeight: 22, fontWeight: '800' },
        subtitle: { color: colors.textMuted, fontSize: FontSize.sm, lineHeight: 17 },
        controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
    });
}
