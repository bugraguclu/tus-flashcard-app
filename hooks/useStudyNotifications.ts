import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppSettings } from '../lib/types';
import {
    configureStudyNotificationHandler,
    disableStudyNotifications,
    ensureDefaultStudyNotificationPermission,
    studyNotificationsSupported,
    syncStudyNotifications,
} from '../lib/studyNotifications';

/**
 * Keeps AnkiMobile-style reminders aligned with persisted settings and the live collection.
 * iOS schedules them with the system; the web build (`studyNotifications.web.ts`) keeps a timer
 * in the open tab. Both re-plan whenever the app returns to the foreground.
 */
export function useStudyNotifications(settings: AppSettings, isLoading: boolean): void {
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

    useEffect(() => {
        if (!studyNotificationsSupported()) return;
        configureStudyNotificationHandler();
    }, []);

    useEffect(() => {
        if (!studyNotificationsSupported() || isLoading) return;
        const task = settings.studyNotificationsEnabled
            ? ensureDefaultStudyNotificationPermission().then(() => syncStudyNotifications(settings))
            : disableStudyNotifications();
        void task.catch((error) => console.warn('[Notifications] settings sync failed:', error));
    }, [
        isLoading,
        settings.studyNotificationsEnabled,
        settings.studyNotificationThreshold,
        settings.studyNotificationHour,
        settings.studyNotificationMinute,
        settings.dayRolloverHour,
        settings.language,
    ]);

    useEffect(() => {
        if (!studyNotificationsSupported()) return;
        const subscription = AppState.addEventListener('change', (state) => {
            if (state !== 'active' && state !== 'background') return;
            const current = settingsRef.current;
            const task = current.studyNotificationsEnabled
                ? syncStudyNotifications(current)
                : disableStudyNotifications();
            void task.catch((error) => console.warn('[Notifications] lifecycle sync failed:', error));
        });
        return () => subscription.remove();
    }, []);
}
