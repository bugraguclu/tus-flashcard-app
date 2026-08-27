import { Platform } from 'react-native';
import { getLocales } from 'expo-localization';
import * as Notifications from 'expo-notifications';
import type { AppSettings } from './types';
import { localDayNumber } from './ankiState';
import { getDB } from './db';
import { resolveAppLocale } from './i18n';
import { buildStudyReminderContent } from './studyNotificationContent';
import {
    normalizeStudyNotificationThreshold,
    shouldSendStudyReminder,
} from './studyNotificationPolicy';

const STUDY_REMINDER_KIND = 'tusankim.study-reminder';
// iOS retains at most 64 pending local notifications. Twenty-eight daily reminders leave
// headroom for future app-owned notifications.
const STUDY_REMINDER_DAYS = 28;

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

let operations: Promise<unknown> = Promise.resolve();
let handlerConfigured = false;

function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = operations.then(operation, operation);
    operations = result.then(() => undefined, () => undefined);
    return result;
}

function isIosAuthorized(status: Notifications.NotificationPermissionsStatus): boolean {
    const iosStatus = status.ios?.status;
    return Boolean(
        status.granted
        || iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED
        || iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL
        || iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL,
    );
}

function mapPermission(status: Notifications.NotificationPermissionsStatus): StudyNotificationPermission {
    if (Platform.OS !== 'ios') {
        return { state: 'unavailable', canAskAgain: false, allowsAlert: false };
    }

    const authorized = isIosAuthorized(status);
    const allowsAlert = authorized && status.ios?.allowsAlert !== false;
    let state: StudyNotificationPermissionState;

    if (authorized) {
        state = allowsAlert ? 'granted' : 'limited';
    } else if (status.ios?.status === Notifications.IosAuthorizationStatus.NOT_DETERMINED) {
        state = 'undetermined';
    } else {
        state = 'denied';
    }

    return { state, canAskAgain: status.canAskAgain, allowsAlert };
}

function canUsePermission(permission: StudyNotificationPermission): boolean {
    return permission.state === 'granted' || permission.state === 'limited';
}

export function configureStudyNotificationHandler(): void {
    if (handlerConfigured || Platform.OS !== 'ios') return;
    Notifications.setNotificationHandler({
        handleNotification: async () => {
            return {
                shouldShowBanner: true,
                shouldShowList: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
            };
        },
    });
    handlerConfigured = true;
}

export async function getStudyNotificationPermission(): Promise<StudyNotificationPermission> {
    if (Platform.OS !== 'ios') {
        return { state: 'unavailable', canAskAgain: false, allowsAlert: false };
    }
    return mapPermission(await Notifications.getPermissionsAsync());
}

export async function requestStudyNotificationPermission(): Promise<StudyNotificationPermission> {
    if (Platform.OS !== 'ios') return getStudyNotificationPermission();
    configureStudyNotificationHandler();
    const current = await Notifications.getPermissionsAsync();
    const mappedCurrent = mapPermission(current);
    const provisional = current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (mappedCurrent.allowsAlert || (!provisional && !current.canAskAgain)) return mappedCurrent;

    const requested = await Notifications.requestPermissionsAsync({
        ios: {
            allowAlert: true,
            allowBadge: false,
            allowSound: true,
        },
    });
    return mapPermission(requested);
}

/**
 * New installs default reminders on without throwing an out-of-context system prompt. Apple
 * provisional authorization delivers the first reminders quietly and lets the learner keep or
 * disable them from Notification Center. An explicit toggle still requests normal alert access.
 */
export async function ensureDefaultStudyNotificationPermission(): Promise<StudyNotificationPermission> {
    if (Platform.OS !== 'ios') return getStudyNotificationPermission();
    configureStudyNotificationHandler();
    const current = await Notifications.getPermissionsAsync();
    if (current.ios?.status !== Notifications.IosAuthorizationStatus.NOT_DETERMINED) {
        return mapPermission(current);
    }

    return mapPermission(await Notifications.requestPermissionsAsync({
        ios: {
            allowAlert: true,
            allowBadge: false,
            allowSound: true,
            allowProvisional: true,
        },
    }));
}

/**
 * Counts only due review cards for reminder text. New cards and
 * learning-step timers are deliberately excluded, as is every suspended/buried card (their
 * queues are negative in Anki's schema).
 */
export function getDueReviewCountAt(atMs: number, rolloverHour: number): number {
    const today = localDayNumber(atMs, rolloverHour);
    const row = getDB().getFirstSync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM anki_cards WHERE queue = 2 AND due <= ?',
        today,
    );
    return Math.max(0, Number(row?.count) || 0);
}

function reminderDates(now: Date, hour: number, minute: number): Date[] {
    const first = new Date(now);
    first.setHours(hour, minute, 0, 0);
    if (first.getTime() <= now.getTime()) first.setDate(first.getDate() + 1);

    return Array.from({ length: STUDY_REMINDER_DAYS }, (_, index) => {
        const date = new Date(first);
        date.setDate(first.getDate() + index);
        return date;
    });
}

function reminderCopy(settings: AppSettings, count: number): { title: string; body: string } {
    const deviceLanguages = getLocales().map((locale) => locale.languageCode);
    const locale = resolveAppLocale(settings.language, deviceLanguages);
    if (locale === 'tr') {
        return {
            title: 'Çalışma zamanı',
            body: count === 1 ? '1 tekrar kartı sizi bekliyor.' : `${count} tekrar kartı sizi bekliyor.`,
        };
    }
    return {
        title: 'Time to study',
        body: count === 1 ? '1 review is waiting.' : `${count} reviews are waiting.`,
    };
}

export function isStudyReminderData(data: Record<string, unknown> | null | undefined): boolean {
    return data?.kind === STUDY_REMINDER_KIND;
}

async function cancelOwnedStudyNotifications(): Promise<void> {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
        scheduled
            .filter((request) => isStudyReminderData(request.content.data))
            .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
    );
}

async function dismissOwnedStudyNotifications(): Promise<void> {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
        presented
            .filter((notification) => isStudyReminderData(notification.request.content.data))
            .map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier)),
    );
}

export function disableStudyNotifications(): Promise<void> {
    return serialize(async () => {
        if (Platform.OS !== 'ios') return;
        await cancelOwnedStudyNotifications();
        await dismissOwnedStudyNotifications();
        await Notifications.setBadgeCountAsync(0).catch(() => false);
    });
}

/**
 * Rebuilds one-off local reminders for the next 28 days. One-off requests let every day's
 * message carry the expected number of reviews while skipping days with none due.
 * Re-entering/backgrounding the app recalculates the series.
 */
export function syncStudyNotifications(settings: AppSettings): Promise<StudyNotificationSyncResult> {
    return serialize(async () => {
        if (Platform.OS !== 'ios') {
            return {
                permission: await getStudyNotificationPermission(),
                scheduledCount: 0,
            };
        }

        configureStudyNotificationHandler();
        await cancelOwnedStudyNotifications();
        // Clear badges left by older builds; this version never sets an app-icon badge.
        await Notifications.setBadgeCountAsync(0).catch(() => false);
        const permission = await getStudyNotificationPermission();

        if (!settings.studyNotificationsEnabled || !canUsePermission(permission)) {
            return { permission, scheduledCount: 0 };
        }

        const hour = Math.max(0, Math.min(23, Number(settings.studyNotificationHour ?? 9) || 0));
        const minute = Math.max(0, Math.min(59, Number(settings.studyNotificationMinute ?? 0) || 0));
        const threshold = normalizeStudyNotificationThreshold(settings.studyNotificationThreshold);
        const scheduledIdentifiers: string[] = [];

        try {
            for (const date of reminderDates(new Date(), hour, minute)) {
                const dueReviews = getDueReviewCountAt(date.getTime(), settings.dayRolloverHour);
                if (!shouldSendStudyReminder(dueReviews, threshold)) continue;
                const copy = reminderCopy(settings, dueReviews);
                const dayKey = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
                const identifier = await Notifications.scheduleNotificationAsync({
                    identifier: `${STUDY_REMINDER_KIND}.${dayKey}`,
                    content: buildStudyReminderContent(
                        STUDY_REMINDER_KIND,
                        copy.title,
                        copy.body,
                        dueReviews,
                    ),
                    trigger: {
                        type: Notifications.SchedulableTriggerInputTypes.DATE,
                        date,
                    },
                });
                scheduledIdentifiers.push(identifier);
            }
        } catch (error) {
            await Promise.all(scheduledIdentifiers.map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined)));
            throw error;
        }

        return { permission, scheduledCount: scheduledIdentifiers.length };
    });
}
