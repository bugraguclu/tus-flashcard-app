import React from 'react';
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from './Typography';
import { FontSize, SplashBackground, schemeColors } from '../constants/theme';

/**
 * Startup placeholder painted in the same color as the native launch screen. On native it sits
 * invisibly behind the splash, so the handover is a single fade instead of a flash of white and
 * a second in-app loading screen. On web there is no native splash, so a label is shown.
 */
export function SplashFallback({ label }: { label?: string }) {
    const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
    const colors = schemeColors(scheme);

    return (
        <View style={[styles.container, { backgroundColor: SplashBackground[scheme] }]}>
            {label ? (
                <>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
                </>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    label: { fontSize: FontSize.md },
});
