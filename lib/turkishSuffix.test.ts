import { describe, expect, it } from 'vitest';
import { STUDY_NOTIFICATION_THRESHOLDS } from './studyNotificationPolicy';
import { turkishAblative } from './turkishSuffix';

describe('turkishAblative', () => {
    it('gives every reminder threshold the ending it is read with', () => {
        expect(STUDY_NOTIFICATION_THRESHOLDS.filter((n) => n > 0).map((n) => `${n}${turkishAblative(n)}`)).toEqual([
            '10’dan', '25’ten', '50’den', '75’ten', '100’den', '150’den', '200’den', '500’den',
        ]);
    });

    it('follows the last word read aloud: units, then tens, then the largest round unit', () => {
        expect([0, 3, 4, 6, 9, 40, 60, 70, 90, 1000, 2_000_000, 3_000_000_000].map((n) => `${n}${turkishAblative(n)}`)).toEqual([
            '0’dan', '3’ten', '4’ten', '6’dan', '9’dan', '40’tan', '60’tan', '70’ten', '90’dan', '1000’den', '2000000’dan', '3000000000’dan',
        ]);
    });
});
