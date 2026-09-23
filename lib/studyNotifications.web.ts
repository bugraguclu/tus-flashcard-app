import type { AppSettings } from './types';
import { isPrimaryTab } from './db';
import {
    normalizeStudyNotificationThreshold,
    shouldSendStudyReminder,
} from './studyNotificationPolicy';
import {
    STUDY_REMINDER_KIND,
    getDueReviewCountAt,
    isStudyReminderData,
    studyReminderCopy,
    studyReminderDates,
    studyReminderTime,
} from './studyReminderSchedule';

/**
 * Browser study reminders — the web counterpart of `studyNotifications.ts`, with the same exports.
 *
 * iOS hands a month of dated reminders to the system, which delivers them whether or not the app
 * is running. A web page has no such scheduler without a push server, so this one keeps a single
 * timer for the next reminder while the app is open in a tab, foreground or background, and shows
 * it with the Notification API. When the service worker controls the page the notification goes
 * through it: some browsers (Chrome on Android) refuse notifications a page constructs itself.
 */

export { getDueReviewCountAt, isStudyReminderData };

export type StudyNotificationPermissionState =
    | 'granted'
    | 'limited'
    | 'denied'
    | 'undetermined'
    | 'unavailable';

export type StudyNotificationPermission = {
    state: StudyNotificationPermissionState;
    canAskAgain: boolean;
    allowsAlert: boolean;
};

export type StudyNotificationSyncResult = {
    permission: StudyNotificationPermission;
    scheduledCount: number;
};

/** Posted by `public/sw.js` when a reminder shown through the service worker is clicked. */
const REMINDER_OPENED_MESSAGE = 'tusankim:study-reminder-open';

// setTimeout reads its delay as a signed 32-bit millisecond count and fires at once past it.
const MAX_TIMER_DELAY_MS = 2_147_483_647;

let reminderTimer: ReturnType<typeof setTimeout> | null = null;
let serviceWorkerListenerInstalled = false;
const openListeners = new Set<() => void>();

function notificationApi(): typeof Notification | null {
    return typeof window !== 'undefined' && 'Notification' in window ? window.Notification : null;
}

function currentPermission(): StudyNotificationPermission {
    const api = notificationApi();
    if (!api) return { state: 'unavailable', canAskAgain: false, allowsAlert: false };
    if (api.permission === 'granted') return { state: 'granted', canAskAgain: false, allowsAlert: true };
    if (api.permission === 'denied') return { state: 'denied', canAskAgain: false, allowsAlert: false };
    return { state: 'undetermined', canAskAgain: true, allowsAlert: false };
}

function notifyOpened(): void {
    for (const listener of Array.from(openListeners)) listener();
}

function installServiceWorkerListener(): void {
    if (serviceWorkerListenerInstalled || typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    serviceWorkerListenerInstalled = true;
    navigator.serviceWorker.addEventListener('message', (event) => {
        if ((event.data as { type?: unknown } | null)?.type === REMINDER_OPENED_MESSAGE) notifyOpened();
    });
}

async function controllingRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return null;
    try {
        return (await navigator.serviceWorker.getRegistration()) ?? null;
    } catch {
        return null;
    }
}

async function showReminder(title: string, body: string, dueReviews: number): Promise<void> {
    const options: NotificationOptions = {
        body,
        // One tag across every tab and every day: a new reminder replaces the last one.
        tag: STUDY_REMINDER_KIND,
        icon: '/icons/icon-192.png',
        data: { kind: STUDY_REMINDER_KIND, dueReviews },
    };
    const registration = await controllingRegistration();
    if (registration) {
        await registration.showNotification(title, options);
        return;
    }
    const api = notificationApi();
    if (!api) return;
    const notification = new api(title, options);
    notification.onclick = () => {
        window.focus();
        notification.close();
        notifyOpened();
    };
}

function clearReminderTimer(): void {
    if (reminderTimer) clearTimeout(reminderTimer);
    reminderTimer = null;
}

/** Whether this browser can show notifications at all. */
export function studyNotificationsSupported(): boolean {
    return notificationApi() !== null;
}

export function configureStudyNotificationHandler(): void {
    installServiceWorkerListener();
}

export async function getStudyNotificationPermission(): Promise<StudyNotificationPermission> {
    return currentPermission();
}

/** Asks the browser. Browsers only prompt from a user gesture, which the Settings toggle is. */
export async function requestStudyNotificationPermission(): Promise<StudyNotificationPermission> {
    const api = notificationApi();
    if (!api || api.permission !== 'default') return currentPermission();
    try {
        await api.requestPermission();
    } catch (error) {
        console.warn('[Notifications] permission request failed:', error);
    }
    return currentPermission();
}

/**
 * iOS can start new installs on quiet provisional delivery. No browser has an equivalent, and a
 * prompt nobody asked for is blocked or buried, so the web build never asks on its own.
 */
export async function ensureDefaultStudyNotificationPermission(): Promise<StudyNotificationPermission> {
    return currentPermission();
}

/** Runs `listener` when the learner clicks a reminder; returns the unsubscribe function. */
export function onStudyReminderOpened(listener: () => void): () => void {
    installServiceWorkerListener();
    openListeners.add(listener);
    return () => {
        openListeners.delete(listener);
    };
}

export async function disableStudyNotifications(): Promise<void> {
    clearReminderTimer();
    const registration = await controllingRegistration();
    if (!registration) return;
    const shown = await registration.getNotifications({ tag: STUDY_REMINDER_KIND }).catch(() => []);
    shown.forEach((notification) => notification.close());
}

/**
 * Arms the timer for the next reminder. At the reminder time the due reviews are counted again,
 * the same threshold rule as iOS decides whether to show anything, and the following day is armed.
 * Only the tab that owns the collection keeps a timer, so several open tabs remind once.
 */
export async function syncStudyNotifications(settings: AppSettings): Promise<StudyNotificationSyncResult> {
    clearReminderTimer();
    const permission = currentPermission();
    if (!settings.studyNotificationsEnabled || permission.state !== 'granted' || !isPrimaryTab()) {
        return { permission, scheduledCount: 0 };
    }

    const { hour, minute } = studyReminderTime(settings);
    const threshold = normalizeStudyNotificationThreshold(settings.studyNotificationThreshold);
    const [next] = studyReminderDates(new Date(), hour, minute, 1);
    const delay = Math.min(MAX_TIMER_DELAY_MS, Math.max(0, next.getTime() - Date.now()));

    reminderTimer = setTimeout(() => {
        reminderTimer = null;
        let delivery: Promise<void> = Promise.resolve();
        try {
            const dueReviews = getDueReviewCountAt(Date.now(), settings.dayRolloverHour);
            if (shouldSendStudyReminder(dueReviews, threshold)) {
                const copy = studyReminderCopy(settings, dueReviews);
                delivery = showReminder(copy.title, copy.body, dueReviews);
            }
        } catch (error) {
            delivery = Promise.reject(error);
        }
        void delivery
            .catch((error) => console.warn('[Notifications] reminder failed:', error))
            .finally(() => { void syncStudyNotifications(settings); });
    }, delay);

    return { permission, scheduledCount: 1 };
}
