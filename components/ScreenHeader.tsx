import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontSize, Spacing, useThemeColors } from '../constants/theme';

interface ScreenHeaderProps {
    backAccessibilityLabel: string;
    onBack: () => void;
    title: string;
}

/** Shared header for full-screen utility workflows such as Browse, Import and Export. */
export default function ScreenHeader({ backAccessibilityLabel, onBack, title }: ScreenHeaderProps) {
    const colors = useThemeColors();

    return (
        <View
            style={[
                styles.header,
                { backgroundColor: colors.bgCard, borderBottomColor: colors.border },
            ]}
        >
            <TouchableOpacity
                style={styles.backButton}
                onPress={onBack}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                accessibilityRole="button"
                accessibilityLabel={backAccessibilityLabel}
            >
                <Text style={[styles.backText, { color: colors.accent }]}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                {title}
            </Text>
            <View style={styles.spacer} />
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backText: { fontSize: 40, lineHeight: 42, fontWeight: '300' },
    title: { flex: 1, fontSize: FontSize.xl, fontWeight: '800' },
    spacer: { width: 44 },
});
