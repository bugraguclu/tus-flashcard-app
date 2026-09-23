import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { AppSettings } from './types';
import { buildStudyReminderContent } from './studyNotificationContent';
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

export { getDueReviewCountAt, isStudyReminderData };
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

/** Whether this build can deliver study reminders at all. */
export function studyNotificationsSupported(): boolean {
    return Platform.OS === 'ios';
}

/**
 * A tap on an iPhone reminder arrives as a notification response, which `app/_layout.tsx`
 * handles directly. This hook-up point exists for the web build, whose reminders are shown by the
 * page itself; here it never fires.
 */
export function onStudyReminderOpened(_listener: () => void): () => void {
    return () => undefined;
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

        const { hour, minute } = studyReminderTime(settings);
        const threshold = normalizeStudyNotificationThreshold(settings.studyNotificationThreshold);
        const scheduledIdentifiers: string[] = [];

        try {
            for (const date of studyReminderDates(new Date(), hour, minute, STUDY_REMINDER_DAYS)) {
                const dueReviews = getDueReviewCountAt(date.getTime(), settings.dayRolloverHour);
                if (!shouldSendStudyReminder(dueReviews, threshold)) continue;
                const copy = studyReminderCopy(settings, dueReviews);
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
