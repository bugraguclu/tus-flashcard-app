import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
    configureStudyNotificationHandler,
    getStudyNotificationPermission,
    requestStudyNotificationPermission,
    type StudyNotificationPermission,
} from './studyNotifications';
import {
    BREAK_OVERRUN_REMINDER_MINUTES,
    stopwatchAlertContent,
    stopwatchAlerts,
    type RunningStopwatch,
    type StopwatchAlert,
    type StopwatchAlertCopy,
    type StopwatchPrefs,
} from './stopwatch';

export type { StopwatchAlertCopy } from './stopwatch';

/**
 * The Kronometre's block reminders on iPhone: a local notification when a study block is over
 * ("Çalışma süresi doldu, mola zamanı!") or a break is over ("Mola süreniz bitti, çalışma
 * zamanı!"), and while a break runs on, one, three and five minutes past its end, as TUSBuddy
 * reminds ("Mola Süresini 3 Dakika Aştınız!"). The web build has its own module with the same
 * exports (`stopwatchNotifications.web.ts`).
 *
 * At most four reminders are pending, each under a fixed identifier, so rescheduling is a plain
 * replace and the daily review reminders keep their share of iOS's 64 pending notifications.
 */

export const STOPWATCH_ALERT_KIND = 'tus-stopwatch-block';
const ALERT_IDENTIFIER = `${STOPWATCH_ALERT_KIND}.current`;
const overrunIdentifier = (minutes: number) => `${STOPWATCH_ALERT_KIND}.over${minutes}`;
const ALL_IDENTIFIERS = [ALERT_IDENTIFIER, ...BREAK_OVERRUN_REMINDER_MINUTES.map(overrunIdentifier)];

const identifierFor = (alert: StopwatchAlert) =>
    alert.kind === 'breakOver' ? overrunIdentifier(alert.overMinutes) : ALERT_IDENTIFIER;

async function cancelPending(): Promise<void> {
    for (const identifier of ALL_IDENTIFIERS) {
        await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
    }
}

export interface StopwatchAlertPermission {
    state: 'granted' | 'denied' | 'undetermined' | 'unavailable';
    /** False once iOS will no longer show its prompt; only the Settings app can change it then. */
    canAskAgain: boolean;
}

let operations: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operations.then(operation, operation);
    operations = result.then(() => undefined, () => undefined);
    return result;
}

function mapPermission(permission: StudyNotificationPermission): StopwatchAlertPermission {
    const state = permission.state === 'granted' || permission.state === 'limited'
        ? 'granted'
        : permission.state;
    return { state, canAskAgain: permission.canAskAgain };
}

export function stopwatchAlertsSupported(): boolean {
    return Platform.OS === 'ios';
}

export function isStopwatchAlertData(data: unknown): boolean {
    return Boolean(data) && typeof data === 'object' && (data as { kind?: unknown }).kind === STOPWATCH_ALERT_KIND;
}

export async function getStopwatchAlertPermission(): Promise<StopwatchAlertPermission> {
    return mapPermission(await getStudyNotificationPermission());
}

export async function requestStopwatchAlertPermission(): Promise<StopwatchAlertPermission> {
    return mapPermission(await requestStudyNotificationPermission());
}

/**
 * Replace the pending reminders with the ones the stopwatch's current phase calls for: none when
 * nothing runs, the reminders are off or the phase has no length set; only those still ahead.
 */
export function syncStopwatchAlert(
    running: RunningStopwatch | null,
    prefs: Pick<StopwatchPrefs, 'alertsEnabled' | 'focusMinutes' | 'breakMinutes'>,
    copy: StopwatchAlertCopy,
    nowMs: number = Date.now(),
): Promise<void> {
    return serialize(async () => {
        if (Platform.OS !== 'ios') return;
        await cancelPending();
        if (!running || !prefs.alertsEnabled) return;
        const alerts = stopwatchAlerts(running, prefs).filter((alert) => alert.atMs > nowMs + 1000);
        if (alerts.length === 0) return;
        const permission = await getStudyNotificationPermission();
        if (permission.state !== 'granted' && permission.state !== 'limited') return;

        configureStudyNotificationHandler();
        for (const alert of alerts) {
            const { title, body } = stopwatchAlertContent(alert, copy);
            await Notifications.scheduleNotificationAsync({
                identifier: identifierFor(alert),
                content: {
                    title,
                    body,
                    sound: 'default',
                    interruptionLevel: 'active',
                    data: { kind: STOPWATCH_ALERT_KIND, route: '/stopwatch' },
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.DATE,
                    date: new Date(alert.atMs),
                },
            });
        }
    });
}

export function cancelStopwatchAlert(): Promise<void> {
    return serialize(async () => {
        if (Platform.OS !== 'ios') return;
        await cancelPending();
    });
}

/** Runs `listener` when the learner opens a block reminder; returns the unsubscribe function. */
export function onStopwatchAlertOpened(listener: () => void): () => void {
    if (Platform.OS !== 'ios') return () => undefined;
    let active = true;
    const open = (response: Notifications.NotificationResponse | null) => {
        if (!active || !response || !isStopwatchAlertData(response.notification.request.content.data)) return;
        listener();
        Notifications.clearLastNotificationResponse();
    };
    void Notifications.getLastNotificationResponseAsync()
        .then(open)
        .catch((error) => console.warn('[Notifications] stopwatch launch response failed:', error));
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
        active = false;
        subscription.remove();
    };
}
