import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
    configureStudyNotificationHandler,
    getStudyNotificationPermission,
    requestStudyNotificationPermission,
    type StudyNotificationPermission,
} from './studyNotifications';
import { nextStopwatchAlert, type RunningStopwatch, type StopwatchPrefs } from './stopwatch';

/**
 * The Kronometre's block reminders on iPhone: one local notification when a study block is over
 * ("take a break") or a break is over ("back to work"). The web build has its own module with the
 * same exports (`stopwatchNotifications.web.ts`).
 *
 * At most one reminder is ever pending, under a fixed identifier, so rescheduling is a plain
 * replace and the daily review reminders keep their share of iOS's 64 pending notifications.
 */

export const STOPWATCH_ALERT_KIND = 'tus-stopwatch-block';
const ALERT_IDENTIFIER = `${STOPWATCH_ALERT_KIND}.current`;

export interface StopwatchAlertCopy {
    focusTitle: string;
    focusBody: string;
    breakTitle: string;
    breakBody: string;
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
 * Replace the pending reminder with the one the stopwatch's current phase calls for: none when
 * nothing runs, the reminders are off, the phase has no length set or its end has already passed.
 */
export function syncStopwatchAlert(
    running: RunningStopwatch | null,
    prefs: Pick<StopwatchPrefs, 'alertsEnabled' | 'focusMinutes' | 'breakMinutes'>,
    copy: StopwatchAlertCopy,
    nowMs: number = Date.now(),
): Promise<void> {
    return serialize(async () => {
        if (Platform.OS !== 'ios') return;
        await Notifications.cancelScheduledNotificationAsync(ALERT_IDENTIFIER).catch(() => undefined);
        if (!running || !prefs.alertsEnabled) return;
        const alert = nextStopwatchAlert(running, prefs);
        if (!alert || alert.atMs <= nowMs + 1000) return;
        const permission = await getStudyNotificationPermission();
        if (permission.state !== 'granted' && permission.state !== 'limited') return;

        configureStudyNotificationHandler();
        const focus = alert.kind === 'focus';
        await Notifications.scheduleNotificationAsync({
            identifier: ALERT_IDENTIFIER,
            content: {
                title: focus ? copy.focusTitle : copy.breakTitle,
                body: focus ? copy.focusBody : copy.breakBody,
                sound: 'default',
                interruptionLevel: 'active',
                data: { kind: STOPWATCH_ALERT_KIND, route: '/stopwatch' },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: new Date(alert.atMs),
            },
        });
    });
}

export function cancelStopwatchAlert(): Promise<void> {
    return serialize(async () => {
        if (Platform.OS !== 'ios') return;
        await Notifications.cancelScheduledNotificationAsync(ALERT_IDENTIFIER).catch(() => undefined);
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
