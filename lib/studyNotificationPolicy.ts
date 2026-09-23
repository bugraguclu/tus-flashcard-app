import type { StudyNotificationThreshold } from './types';

export const STUDY_NOTIFICATION_THRESHOLDS: readonly StudyNotificationThreshold[] = [
    0,
    10,
    25,
    50,
    75,
    100,
    150,
    200,
    500,
];

export function normalizeStudyNotificationThreshold(value: unknown): StudyNotificationThreshold {
    const numeric = Number(value);
    return STUDY_NOTIFICATION_THRESHOLDS.includes(numeric as StudyNotificationThreshold)
        ? numeric as StudyNotificationThreshold
        : 0;
}

/** AnkiDroid's threshold wording is strict: "more than n cards due". */
export function shouldSendStudyReminder(
    dueReviewCount: number,
    threshold: StudyNotificationThreshold,
): boolean {
    const count = Math.max(0, Math.trunc(Number(dueReviewCount) || 0));
    return count > threshold;
}
