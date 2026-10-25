import { nextStopwatchAlert, type RunningStopwatch, type StopwatchPrefs } from './stopwatch';

/**
 * Browser block reminders — the web counterpart of `stopwatchNotifications.ts`, with the same
 * exports. A page cannot hand a notification to the system for later, so this one keeps a timer
 * for the pending reminder while the app is open in a tab and shows it with the Notification API.
 */

export const STOPWATCH_ALERT_KIND = 'tus-stopwatch-block';

export interface StopwatchAlertCopy {
    focusTitle: string;
    focusBody: string;
    breakTitle: string;
    breakBody: string;
}

export interface StopwatchAlertPermission {
    state: 'granted' | 'denied' | 'undetermined' | 'unavailable';
    canAskAgain: boolean;
}

// setTimeout reads its delay as a signed 32-bit millisecond count and fires at once past it.
const MAX_TIMER_DELAY_MS = 2_147_483_647;

let alertTimer: ReturnType<typeof setTimeout> | null = null;
const openListeners = new Set<() => void>();

function notificationApi(): typeof Notification | null {
    return typeof window !== 'undefined' && 'Notification' in window ? window.Notification : null;
}

function currentPermission(): StopwatchAlertPermission {
    const api = notificationApi();
    if (!api) return { state: 'unavailable', canAskAgain: false };
    if (api.permission === 'granted') return { state: 'granted', canAskAgain: false };
    if (api.permission === 'denied') return { state: 'denied', canAskAgain: false };
    return { state: 'undetermined', canAskAgain: true };
}

export function stopwatchAlertsSupported(): boolean {
    return notificationApi() !== null;
}

export function isStopwatchAlertData(data: unknown): boolean {
    return Boolean(data) && typeof data === 'object' && (data as { kind?: unknown }).kind === STOPWATCH_ALERT_KIND;
}

export async function getStopwatchAlertPermission(): Promise<StopwatchAlertPermission> {
    return currentPermission();
}

export async function requestStopwatchAlertPermission(): Promise<StopwatchAlertPermission> {
    const api = notificationApi();
    if (!api || api.permission !== 'default') return currentPermission();
    try {
        await api.requestPermission();
    } catch (error) {
        console.warn('[Notifications] stopwatch permission request failed:', error);
    }
    return currentPermission();
}

function clearTimer(): void {
    if (alertTimer !== null) clearTimeout(alertTimer);
    alertTimer = null;
}

function show(title: string, body: string): void {
    const api = notificationApi();
    if (!api || api.permission !== 'granted') return;
    try {
        const notification = new api(title, { body, tag: STOPWATCH_ALERT_KIND, data: { kind: STOPWATCH_ALERT_KIND } });
        notification.onclick = () => {
            window.focus();
            notification.close();
            for (const listener of Array.from(openListeners)) listener();
        };
    } catch (error) {
        // Some browsers only show notifications through a service worker; the in-app notice remains.
        console.warn('[Notifications] stopwatch notification failed:', error);
    }
}

export async function syncStopwatchAlert(
    running: RunningStopwatch | null,
    prefs: Pick<StopwatchPrefs, 'alertsEnabled' | 'focusMinutes' | 'breakMinutes'>,
    copy: StopwatchAlertCopy,
    nowMs: number = Date.now(),
): Promise<void> {
    clearTimer();
    if (!running || !prefs.alertsEnabled || currentPermission().state !== 'granted') return;
    const alert = nextStopwatchAlert(running, prefs);
    if (!alert || alert.atMs <= nowMs + 1000) return;
    const focus = alert.kind === 'focus';
    alertTimer = setTimeout(() => {
        alertTimer = null;
        show(focus ? copy.focusTitle : copy.breakTitle, focus ? copy.focusBody : copy.breakBody);
    }, Math.min(MAX_TIMER_DELAY_MS, alert.atMs - nowMs));
}

export async function cancelStopwatchAlert(): Promise<void> {
    clearTimer();
}

export function onStopwatchAlertOpened(listener: () => void): () => void {
    openListeners.add(listener);
    return () => {
        openListeners.delete(listener);
    };
}
