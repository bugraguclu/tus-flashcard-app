import { getLocales } from 'expo-localization';
import type { AppSettings } from './types';
import { localDayNumber } from './ankiState';
import { getDB } from './db';
import { resolveAppLocale } from './i18n';

/**
 * What a daily study reminder says and when it is due, shared by the iOS scheduler
 * (`studyNotifications.ts`) and the browser one (`studyNotifications.web.ts`).
 */

export const STUDY_REMINDER_KIND = 'tusankim.study-reminder';

export function isStudyReminderData(data: Record<string, unknown> | null | undefined): boolean {
    return data?.kind === STUDY_REMINDER_KIND;
}

/** The learner's reminder time, clamped to a real clock time. */
export function studyReminderTime(settings: Pick<AppSettings, 'studyNotificationHour' | 'studyNotificationMinute'>): {
    hour: number;
    minute: number;
} {
    return {
        hour: Math.max(0, Math.min(23, Number(settings.studyNotificationHour ?? 9) || 0)),
        minute: Math.max(0, Math.min(59, Number(settings.studyNotificationMinute ?? 0) || 0)),
    };
}

/** The next `count` reminder moments at hour:minute local time, starting after `now`. */
export function studyReminderDates(now: Date, hour: number, minute: number, count: number): Date[] {
    const first = new Date(now);
    first.setHours(hour, minute, 0, 0);
    if (first.getTime() <= now.getTime()) first.setDate(first.getDate() + 1);

    return Array.from({ length: count }, (_, index) => {
        const date = new Date(first);
        date.setDate(first.getDate() + index);
        return date;
    });
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

export function studyReminderCopy(
    settings: Pick<AppSettings, 'language'>,
    count: number,
    deviceLanguages: ReadonlyArray<string | null | undefined> = getLocales().map((locale) => locale.languageCode),
): { title: string; body: string } {
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
