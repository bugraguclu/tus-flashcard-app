import { describe, expect, it } from 'vitest';
import {
    normalizeStudyNotificationThreshold,
    shouldSendStudyReminder,
    STUDY_NOTIFICATION_THRESHOLDS,
} from './studyNotificationPolicy';

describe('study notification policy', () => {
    it('exposes AnkiDroid\'s supported due-card thresholds', () => {
        expect(STUDY_NOTIFICATION_THRESHOLDS).toEqual([0, 10, 25, 50, 75, 100, 150, 200, 500]);
    });

    it('uses pending reviews as the default policy', () => {
        expect(normalizeStudyNotificationThreshold(undefined)).toBe(0);
        expect(shouldSendStudyReminder(0, 0)).toBe(false);
        expect(shouldSendStudyReminder(1, 0)).toBe(true);
    });

    it('applies each numeric threshold strictly', () => {
        expect(shouldSendStudyReminder(25, 25)).toBe(false);
        expect(shouldSendStudyReminder(26, 25)).toBe(true);
    });

    it('falls back safely when an imported threshold is unsupported', () => {
        expect(normalizeStudyNotificationThreshold(30)).toBe(0);
        expect(normalizeStudyNotificationThreshold('100')).toBe(100);
    });
});
