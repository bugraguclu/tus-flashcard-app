import { describe, expect, it } from 'vitest';
import { advanceQueueAfterAnswer } from './reviewerQueueRefresh';
import type { StudyCard } from './types';

const NOW = Date.UTC(2026, 9, 21, 13, 5, 37);
const MINUTE = 60_000;

function card(cardId: number, state: Partial<StudyCard['state']>): StudyCard {
    return {
        cardId,
        state: { cardId, status: 'new', dueTime: 0, dueDate: '2026-10-21', ...state },
    } as StudyCard;
}

function answerGood(queue: StudyCard[], dueInMs: number, learnAheadMs = 20 * MINUTE) {
    return advanceQueueAfterAnswer({
        queue,
        answeredCardId: 1,
        updatedCard: card(1, { status: 'learning', dueTime: NOW + dueInMs }),
        nowMs: NOW,
        today: '2026-10-21',
        learnAheadMs,
        preview: false,
    });
}

describe('reviewer queue after an answer (learn ahead limit)', () => {
    // Anki manual, Preferences > Learn ahead limit: with nothing else left to study, a learning
    // card due within the limit is shown at once instead of the congratulations screen.
    it('shows the sole card again at once when its 10-minute step is inside the 20-minute limit', () => {
        const step = answerGood([card(1, { status: 'new' })], 10 * MINUTE);
        expect(step.currentCard?.cardId).toBe(1);
        expect(step.queue.map((c) => c.cardId)).toEqual([1]);
    });

    it('keeps the learned-ahead card behind every other card still waiting', () => {
        const step = answerGood([card(1, { status: 'new' }), card(2, { status: 'new' })], 10 * MINUTE);
        expect(step.currentCard?.cardId).toBe(2);
        expect(step.queue.map((c) => c.cardId)).toEqual([2]);
        expect(step.nextLearningDue).toBe(NOW + 10 * MINUTE);
    });

    it('waits when the step runs past the limit', () => {
        const step = answerGood([card(1, { status: 'new' })], 30 * MINUTE);
        expect(step.currentCard).toBeNull();
        expect(step.nextLearningDue).toBe(NOW + 30 * MINUTE);
    });

    it('waits for the step timer when the limit is zero', () => {
        const step = answerGood([card(1, { status: 'new' })], 10 * MINUTE, 0);
        expect(step.currentCard).toBeNull();
        expect(step.nextLearningDue).toBe(NOW + 10 * MINUTE);
    });

    it('never puts a preview answer straight back', () => {
        const step = advanceQueueAfterAnswer({
            queue: [card(1, { status: 'new' })],
            answeredCardId: 1,
            updatedCard: card(1, { status: 'new' }),
            nowMs: NOW,
            today: '2026-10-21',
            learnAheadMs: 20 * MINUTE,
            preview: true,
        });
        expect(step.currentCard).toBeNull();
    });
});
