import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { useStartupStatus } from '../contexts/AppContext';
import { useI18n } from '../hooks/useI18n';
import { startupIssueView } from '../lib/startupIssue';
import { HourglassGlyph, WarningGlyph } from './UiGlyphs';

/**
 * Shown in place of the deck list (and of an x-callback request on the web) while startup has an
 * issue: it is still running after its budget, or it failed. Each state has its own text and one
 * button (lib/startupIssue.ts). Waiting again never starts a second migration; retrying runs only
 * after a failure. While the attempt that button started is watched, the button stays disabled;
 * once startup succeeds the app shell replaces this screen.
 */
export default function StartupIssueScreen() {
    const { startupError, startupActionPending, continueStartupWait, retryStartup } = useStartupStatus();
    const { t } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    if (!startupError) return null;
    const view = startupIssueView(startupError, t);
    const runAction = view.action === 'keepWaiting' ? continueStartupWait : retryStartup;

    return (
        <View style={styles.container}>
            <View style={styles.icon}>
                {startupError === 'timeout'
                    ? <HourglassGlyph color={colors.warning} size={30} />
                    : <WarningGlyph color={colors.warning} size={30} />}
            </View>
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
        icon: {
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.warningBg,
            marginBottom: Spacing.md,
        },
        title: {
            fontSize: FontSize.lg,
            fontWeight: '600',
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
            marginTop: Spacing.lg,
            paddingHorizontal: Spacing.xl,
            paddingVertical: Spacing.md,
            borderRadius: 12,
            backgroundColor: colors.accent,
        },
        buttonBusy: { opacity: 0.6 },
        buttonText: {
            fontSize: FontSize.md,
            fontWeight: '600',
            color: colors.white,
            textAlign: 'center',
        },
    });
}
