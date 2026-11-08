import { describe, expect, it } from 'vitest';
import { advanceQueueAfterAnswer, countsAfterAnswer } from './reviewerQueueRefresh';
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

describe('queue counts after an answer', () => {
    const END_OF_DAY = NOW + 10 * 60 * MINUTE;
    const after = (answered: StudyCard['state']['status'], updated: Partial<StudyCard['state']>) => countsAfterAnswer(
        { newCount: 1, learningCount: 0, reviewCount: 1 },
        { answeredStatus: answered, updatedCard: card(1, updated), nowMs: NOW, today: '2026-10-21', endOfDayMs: END_OF_DAY },
    );

    it('counts a card on an intraday step as today\'s learning', () => {
        expect(after('new', { status: 'learning', dueTime: NOW + 10 * MINUTE })).toEqual({ newCount: 0, learningCount: 1, reviewCount: 1 });
    });

    // With steps "10m 1d", Good on the 10m step moves the card to a day-long step: it is due on a
    // later day (dueTime 0 marks day learning), never again today.
    it('does not count a card moved to a day-long step', () => {
        expect(after('learning', { status: 'learning', dueTime: 0, dueDate: '2026-10-22' }))
            .toEqual({ newCount: 1, learningCount: 0, reviewCount: 1 });
        expect(after('new', { status: 'learning', dueTime: 0, dueDate: '2026-10-22' }))
            .toEqual({ newCount: 0, learningCount: 0, reviewCount: 1 });
    });

    it('does not count a step that ends after the rollover or a review due later', () => {
        expect(after('new', { status: 'learning', dueTime: END_OF_DAY + MINUTE })).toEqual({ newCount: 0, learningCount: 0, reviewCount: 1 });
        expect(after('review', { status: 'review', dueDate: '2026-10-24' })).toEqual({ newCount: 1, learningCount: 0, reviewCount: 0 });
    });
});

// The leech action can suspend the card it answered ("Card was a leech. It has been suspended."):
// the card leaves the session, so the reviewer neither deals it again nor counts it.
describe('a card the leech action suspended', () => {
    const suspendedLeech = card(1, { status: 'learning', dueTime: NOW + 10 * MINUTE, suspended: true });

    it('is not dealt again, even as the last card inside the learn ahead limit', () => {
        const step = advanceQueueAfterAnswer({
            queue: [card(1, { status: 'review' })],
            answeredCardId: 1,
            updatedCard: suspendedLeech,
            nowMs: NOW,
            today: '2026-10-21',
            learnAheadMs: 20 * MINUTE,
            preview: false,
        });
        expect(step.currentCard).toBeNull();
        expect(step.queue).toEqual([]);
        expect(step.nextLearningDue).toBeNull();
    });

    it('leaves the counts', () => {
        expect(countsAfterAnswer({ newCount: 0, learningCount: 0, reviewCount: 3 }, {
            answeredStatus: 'review',
            updatedCard: suspendedLeech,
            nowMs: NOW,
            today: '2026-10-21',
            endOfDayMs: NOW + 10 * 60 * MINUTE,
        })).toEqual({ newCount: 0, learningCount: 0, reviewCount: 2 });
    });
});
