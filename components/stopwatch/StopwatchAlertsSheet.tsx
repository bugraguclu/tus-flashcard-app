import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    getStopwatchAlertPermission,
    requestStopwatchAlertPermission,
    stopwatchAlertsSupported,
    type StopwatchAlertPermission,
} from '../../lib/stopwatchNotifications';
import type { StopwatchPrefs } from '../../lib/stopwatch';
import StopwatchSheet from './StopwatchSheet';
import { SettingRow, SheetButton } from './SheetControls';

interface StopwatchAlertsSheetProps {
    visible: boolean;
    prefs: StopwatchPrefs;
    onChange: (patch: Partial<StopwatchPrefs>) => void;
    onClose: () => void;
}

/**
 * The bell: whether the Kronometre reminds the learner when a study block or a break is over,
 * and what the system currently allows. Turning reminders on asks for permission only here, from
 * the learner's own tap.
 */
export default function StopwatchAlertsSheet({ visible, prefs, onChange, onClose }: StopwatchAlertsSheetProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const supported = stopwatchAlertsSupported();
    const [permission, setPermission] = useState<StopwatchAlertPermission | null>(null);

    const refresh = useCallback(() => {
        if (!supported) return;
        void getStopwatchAlertPermission()
            .then(setPermission)
            .catch((error) => console.warn('[Stopwatch] permission check failed:', error));
    }, [supported]);

    useEffect(() => {
        if (visible) refresh();
    }, [visible, refresh]);

    const toggle = async (enabled: boolean) => {
        onChange({ alertsEnabled: enabled });
        if (!enabled || !supported) return;
        try {
            setPermission(await requestStopwatchAlertPermission());
        } catch (error) {
            console.warn('[Stopwatch] permission request failed:', error);
        }
    };

    const blocked = prefs.alertsEnabled && permission?.state === 'denied';
    const status = !supported
        ? l('Bu cihazda bildirim gösterilemiyor; süreler kronometre ekranında gösterilir.', 'This device cannot show notifications; the times still appear on the stopwatch screen.')
        : blocked
            ? Platform.OS === 'web'
                ? l('Bu tarayıcıda bildirim izni kapalı. Hatırlatmalar için izni tarayıcı ayarlarından açın.', 'This browser blocks notifications from the app. Allow them in the browser settings to get the reminders.')
                : l('Bildirim izni kapalı. Hatırlatmaları almak için izni Ayarlar\'dan açın.', 'Notifications are turned off for this app. Turn them on in Settings to get the reminders.')
            : Platform.OS === 'web'
                ? l('Tarayıcıda hatırlatmalar yalnızca uygulama bir sekmede açıkken gelir.', 'In a browser, reminders arrive only while the app is open in a tab.')
                : null;

    return (
        <StopwatchSheet visible={visible} onClose={onClose} title={l('Hatırlatmalar', 'Reminders')}>
            <SettingRow
                label={l('Ders ve mola hatırlatmaları', 'Study and break reminders')}
                hint={l(
                    `Ders süresi (${prefs.focusMinutes > 0 ? `${prefs.focusMinutes} dk` : 'kapalı'}) dolunca mola, mola süresi (${prefs.breakMinutes > 0 ? `${prefs.breakMinutes} dk` : 'kapalı'}) dolunca derse dönüş bildirimi gelir.`,
                    `A notification when the study block (${prefs.focusMinutes > 0 ? `${prefs.focusMinutes} min` : 'off'}) or the break (${prefs.breakMinutes > 0 ? `${prefs.breakMinutes} min` : 'off'}) is over.`,
                )}
            >
                <Switch
                    value={prefs.alertsEnabled}
                    onValueChange={(value) => void toggle(value)}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    accessibilityLabel={l('Ders ve mola hatırlatmaları', 'Study and break reminders')}
                />
            </SettingRow>
            {status ? <Text style={[styles.status, { color: blocked ? colors.btnAgain : colors.textMuted }]}>{status}</Text> : null}
            <View style={styles.footer}>
                {blocked && Platform.OS === 'ios' ? (
                    <SheetButton label={l('Ayarları Aç', 'Open Settings')} tone="plain" onPress={() => void Linking.openSettings()} />
                ) : null}
                <SheetButton label={l('Tamam', 'Done')} onPress={onClose} />
            </View>
        </StopwatchSheet>
    );
}

const styles = StyleSheet.create({
    status: { marginTop: Spacing.md, fontSize: FontSize.md, lineHeight: 20 },
    footer: { paddingTop: Spacing.lg, gap: Spacing.sm },
});
