import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from './types';
import { DEFAULT_SETTINGS } from './storage';

const state = vi.hoisted(() => ({ dueReviews: 12, primaryTab: true }));

vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'tr' }] }));
vi.mock('./db', () => ({
    isPrimaryTab: () => state.primaryTab,
    getDB: () => ({ getFirstSync: () => ({ count: state.dueReviews }) }),
}));

class FakeNotification {
    static permission: NotificationPermission = 'granted';
    static shown: FakeNotification[] = [];
    static requestPermission = vi.fn(async () => FakeNotification.permission);
    onclick: (() => void) | null = null;
    close = vi.fn();
    constructor(public title: string, public options: NotificationOptions) {
        FakeNotification.shown.push(this);
    }
}

const settings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
    ...DEFAULT_SETTINGS,
    studyNotificationsEnabled: true,
    studyNotificationHour: 9,
    studyNotificationMinute: 0,
    studyNotificationThreshold: 0,
    language: 'tr',
    ...overrides,
});

async function loadModule() {
    vi.resetModules();
    return import('./studyNotifications.web');
}

describe('web study reminders', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 23, 8, 0, 0));
        state.dueReviews = 12;
        state.primaryTab = true;
        FakeNotification.permission = 'granted';
        FakeNotification.shown = [];
        vi.stubGlobal('window', { Notification: FakeNotification, focus: vi.fn() });
        vi.stubGlobal('navigator', {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('shows the reminder at the chosen time with the due review count', async () => {
        const reminders = await loadModule();
        const result = await reminders.syncStudyNotifications(settings());
        expect(result).toEqual({ permission: expect.objectContaining({ state: 'granted' }), scheduledCount: 1 });

        await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
        expect(FakeNotification.shown).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(60 * 1000);
        expect(FakeNotification.shown).toHaveLength(1);
        expect(FakeNotification.shown[0].title).toBe('Çalışma zamanı');
        expect(FakeNotification.shown[0].options.body).toBe('12 tekrar kartı sizi bekliyor.');
    });

    it('stays quiet when the due reviews do not pass the threshold, and tries again the next day', async () => {
        state.dueReviews = 10;
        const reminders = await loadModule();
        await reminders.syncStudyNotifications(settings({ studyNotificationThreshold: 10 }));
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(FakeNotification.shown).toHaveLength(0);

        state.dueReviews = 11;
        await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
        expect(FakeNotification.shown).toHaveLength(1);
    });

    it('schedules nothing without permission, when switched off, or in a secondary tab', async () => {
        const reminders = await loadModule();
        FakeNotification.permission = 'default';
        expect((await reminders.syncStudyNotifications(settings())).scheduledCount).toBe(0);
        FakeNotification.permission = 'granted';
        expect((await reminders.syncStudyNotifications(settings({ studyNotificationsEnabled: false }))).scheduledCount).toBe(0);
        state.primaryTab = false;
        expect((await reminders.syncStudyNotifications(settings())).scheduledCount).toBe(0);
        await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000);
        expect(FakeNotification.shown).toHaveLength(0);
    });

    it('opens the app when a reminder is clicked', async () => {
        const reminders = await loadModule();
        const opened = vi.fn();
        reminders.onStudyReminderOpened(opened);
        await reminders.syncStudyNotifications(settings());
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        FakeNotification.shown[0].onclick?.();
        expect(opened).toHaveBeenCalledTimes(1);
    });

    it('reports the browser permission in the same states iOS uses', async () => {
        const reminders = await loadModule();
        FakeNotification.permission = 'denied';
        expect((await reminders.getStudyNotificationPermission()).state).toBe('denied');
        FakeNotification.permission = 'default';
        expect(await reminders.getStudyNotificationPermission()).toEqual({
            state: 'undetermined',
            canAskAgain: true,
            allowsAlert: false,
        });
        vi.stubGlobal('window', {});
        expect(reminders.studyNotificationsSupported()).toBe(false);
    });
});
