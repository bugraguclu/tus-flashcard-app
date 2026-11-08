import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Spacing } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    getStopwatchAlertPermission,
    requestStopwatchAlertPermission,
    stopwatchAlertsSupported,
    type StopwatchAlertPermission,
} from '../../lib/stopwatchNotifications';
import type { StopwatchPrefs } from '../../lib/stopwatch';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Notice } from '../ui/Feedback';
import { SwitchRow } from '../ui/Rows';
import { AppSheet } from '../ui/Sheet';

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
        <AppSheet visible={visible} onClose={onClose} title={l('Hatırlatmalar', 'Reminders')} avoidKeyboard>
            <Card>
                <SwitchRow
                    title={l('Ders ve mola hatırlatmaları', 'Study and break reminders')}
                    summary={l(
                        `Ders süresi (${prefs.focusMinutes > 0 ? `${prefs.focusMinutes} dk` : 'kapalı'}) dolunca mola, mola süresi (${prefs.breakMinutes > 0 ? `${prefs.breakMinutes} dk` : 'kapalı'}) dolunca derse dönüş bildirimi gelir.`,
                        `A notification when the study block (${prefs.focusMinutes > 0 ? `${prefs.focusMinutes} min` : 'off'}) or the break (${prefs.breakMinutes > 0 ? `${prefs.breakMinutes} min` : 'off'}) is over.`,
                    )}
                    value={prefs.alertsEnabled}
                    onValueChange={(value) => void toggle(value)}
                />
            </Card>
            {status ? <Notice tone={blocked ? 'danger' : 'info'} style={styles.status}>{status}</Notice> : null}
            <View style={styles.footer}>
                {blocked && Platform.OS === 'ios' ? (
                    <Button label={l('Ayarları Aç', 'Open Settings')} variant="secondary" onPress={() => void Linking.openSettings()} />
                ) : null}
                <Button label={l('Tamam', 'Done')} onPress={onClose} />
            </View>
        </AppSheet>
    );
}

const styles = StyleSheet.create({
    status: { marginTop: Spacing.md },
    footer: { paddingTop: Spacing.lg, gap: Spacing.sm },
});
