import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { useStartupStatus } from '../contexts/AppContext';
import { useI18n } from '../hooks/useI18n';
import { startupIssueView } from '../lib/startupIssue';

/**
 * Shown in place of the deck list while startup has an issue: it is still running after its
 * budget, or it failed. Each state has its own text and one button (lib/startupIssue.ts). While
 * the attempt that button started is being watched, the button stays busy and the spinner shows;
 * once startup succeeds the app shell replaces this screen with the deck list.
 */
export default function StartupIssueScreen() {
    const { startupError, startupActionPending, continueStartupWait, retryStartup } = useStartupStatus();
    const { l } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    if (!startupError) return null;
    const view = startupIssueView(startupError, l);
    const runAction = view.action === 'keepWaiting' ? continueStartupWait : retryStartup;
    const working = view.action === 'keepWaiting' || startupActionPending;

    return (
        <View style={styles.container}>
            {working ? (
                <ActivityIndicator size="large" color={colors.accent} style={styles.indicator} />
            ) : (
                <Text style={styles.icon}>📱</Text>
            )}
            <Text style={styles.title} accessibilityRole="header">{view.title}</Text>
            <Text style={styles.message}>{view.message}</Text>
            <TouchableOpacity
                style={[styles.button, startupActionPending && styles.buttonBusy]}
                onPress={runAction}
                disabled={startupActionPending}
                accessibilityRole="button"
                accessibilityLabel={view.actionLabel}
                accessibilityState={{ disabled: startupActionPending, busy: startupActionPending }}
            >
                <Text style={styles.buttonText}>{view.actionLabel}</Text>
            </TouchableOpacity>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: Spacing.xl,
            backgroundColor: colors.bgPrimary,
        },
        icon: { fontSize: 48, marginBottom: Spacing.md },
        indicator: { marginBottom: Spacing.md },
        title: {
            fontSize: FontSize.lg,
            fontWeight: '700',
            color: colors.textPrimary,
            textAlign: 'center',
            marginBottom: Spacing.sm,
        },
        message: {
            fontSize: FontSize.md,
            color: colors.textMuted,
            textAlign: 'center',
            maxWidth: 420,
        },
        button: {
            marginTop: Spacing.xl,
            minHeight: 48,
            paddingHorizontal: Spacing.xl,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accent,
        },
        buttonBusy: { opacity: 0.6 },
        buttonText: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
    });
}
