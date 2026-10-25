import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontSize, Spacing, useThemeColors } from '../constants/theme';
import HeaderBackIcon from './HeaderBackIcon';

interface ScreenHeaderProps {
    backAccessibilityLabel: string;
    onBack: () => void;
    title: string;
    /** Icon buttons on the right; without them an empty slot keeps the title's position. */
    actions?: React.ReactNode;
}

/** Shared header for full-screen utility workflows such as Browse, Import and Export. */
export default function ScreenHeader({ backAccessibilityLabel, onBack, title, actions }: ScreenHeaderProps) {
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
                <HeaderBackIcon color={colors.accent} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                {title}
            </Text>
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
    return (
        <TouchableOpacity
            style={styles.iconButton}
            onPress={onPress}
            hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
        >
            {children}
        </TouchableOpacity>
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
    title: { flex: 1, fontSize: FontSize.xl, fontWeight: '800' },
    spacer: { width: 44 },
    actions: { flexDirection: 'row', alignItems: 'center' },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
