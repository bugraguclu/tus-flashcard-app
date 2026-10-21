import type { StudyCard } from './types';

export type ReviewerQueueRefreshActions = {
    refreshImmediately: () => void;
    scheduleDeferredRefresh: () => void;
};

/**
 * One answer chooses one refresh path. The collection invalidation channel is intentionally not
 * part of this coordinator, so it cannot schedule a second queue query through a React effect.
 */
export function coordinatePostAnswerQueueRefresh(
    shouldRefreshImmediately: boolean,
    actions: ReviewerQueueRefreshActions,
): void {
    if (shouldRefreshImmediately) {
        actions.refreshImmediately();
        return;
    }
    actions.scheduleDeferredRefresh();
}

export type PostAnswerQueueInput = {
    /** The reviewer's queue as it stood when the card was answered, answered card included. */
    queue: StudyCard[];
    answeredCardId: number;
    /** The answered card with its new schedule. */
    updatedCard: StudyCard;
    nowMs: number;
    /** Local study day (YYYY-MM-DD) at `nowMs`, for review cards. */
    today: string;
    /** Preferences > Learn ahead limit, in ms. */
    learnAheadMs: number;
    /** A preview answer never puts the card straight back; its delay brings it back later. */
    preview: boolean;
};

export type PostAnswerQueueStep = {
    queue: StudyCard[];
    /** The card to show next, or null for the waiting screen. */
    currentCard: StudyCard | null;
    /** Earliest due time among learning cards still waiting in memory, if any. */
    nextLearningDue: number | null;
};

function isCardDueNow(card: StudyCard, nowMs: number, today: string): boolean {
    if (card.state.status === 'learning') {
        return Boolean(card.state.dueTime && card.state.dueTime <= nowMs);
    }
    if (card.state.status === 'review') {
        return card.state.dueDate <= today;
    }
    return true;
}

/**
 * The reviewer's local step after an answer: drop the answered card and put it back when it is
 * due again now. Pure, so the screen can apply the result with plain state setters.
 *
 * Anki's learn ahead limit: when nothing else is left, a learning card whose step ends within the
 * limit is shown at once rather than behind a countdown. With other cards waiting it stays out of
 * the local queue; the next full rebuild serves it after them, as `getStudyQueue` does.
 */
export function advanceQueueAfterAnswer(input: PostAnswerQueueInput): PostAnswerQueueStep {
    const { updatedCard, nowMs } = input;
    const withoutAnswered = input.queue.filter((card) => card.cardId !== input.answeredCardId);
    const learnAhead = withoutAnswered.length === 0
        && updatedCard.state.status === 'learning'
        && updatedCard.state.dueTime > 0
        && updatedCard.state.dueTime <= nowMs + Math.max(0, input.learnAheadMs);
    const reinsert = !input.preview && (learnAhead || isCardDueNow(updatedCard, nowMs, input.today));
    const queue = reinsert ? [...withoutAnswered, updatedCard] : withoutAnswered;

    const futureLearningDue = queue
        .filter((card) => card.state.status === 'learning' && card.state.dueTime > nowMs)
        .map((card) => card.state.dueTime);
    if (updatedCard.state.status === 'learning' && updatedCard.state.dueTime > nowMs) {
        futureLearningDue.push(updatedCard.state.dueTime);
    }

    return {
        queue,
        currentCard: queue[0] ?? null,
        nextLearningDue: futureLearningDue.length > 0 ? Math.min(...futureLearningDue) : null,
    };
}
