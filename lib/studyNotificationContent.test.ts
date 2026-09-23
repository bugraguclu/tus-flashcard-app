import { describe, expect, it } from 'vitest';
import { buildStudyReminderContent } from './studyNotificationContent';

describe('study notification content', () => {
    it('creates a normal alert without an app-icon badge payload', () => {
        const content = buildStudyReminderContent('study', 'Çalışma zamanı', '3 kart bekliyor.', 3);

        expect(content).toMatchObject({
            title: 'Çalışma zamanı',
            body: '3 kart bekliyor.',
            sound: 'default',
            interruptionLevel: 'active',
            data: { kind: 'study', route: '/decks', dueReviews: 3 },
        });
        expect(content).not.toHaveProperty('badge');
    });
});
