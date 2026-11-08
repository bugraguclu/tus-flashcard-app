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

/** How many answers the reviewer advances in memory before it reads the queue again. */
export const ANSWERS_BETWEEN_REBUILDS = 8;

/**
 * Whether the reviewer reads the queue again straight after an answer, rather than after a pause.
 *
 * It does when the in-memory queue has run out or is about to, and after a batch of answers. It
 * also does in two cases where Anki would deal a card the in-memory queue does not hold, or holds
 * in the wrong place (rslib scheduler/queue/learning.rs):
 * - A learning card has come due. Anki moves its learning cutoff to the present after every answer
 *   (`update_learning_cutoff_and_count`), so a card whose step has ended is shown next.
 * - The main queue has run out and the next card is learning dealt ahead of its due time. Anki
 *   then deals every learning card inside the learn-ahead limit in due order
 *   (`intraday_ahead_iter`), the ones answered since the last build included.
 */
export function shouldRebuildAfterAnswer(input: {
    /** Cards in the in-memory queue before the answer, the answered one included. */
    queueLengthBefore: number;
    /** Cards left in it after the answer. */
    queueLengthAfter: number;
    answersSinceRebuild: number;
    /** The earliest due time among learning cards not yet in front, if any. */
    learningComesDueAt: number | null;
    /** The next card was dealt after the last build's main queue, inside the learn-ahead limit. */
    nextCardIsLearningAhead: boolean;
    nowMs: number;
}): boolean {
    return input.queueLengthAfter === 0
        || input.queueLengthBefore <= 1
        || input.answersSinceRebuild >= ANSWERS_BETWEEN_REBUILDS
        || (input.learningComesDueAt !== null && input.learningComesDueAt <= input.nowMs)
        || input.nextCardIsLearningAhead;
}

/**
 * A rebuilt queue whose main queue keeps the order this study session has been dealing it in.
 *
 * Anki builds a session's queue once. Answering a card takes it off and requeues it as learning,
 * undoing the answer puts it back on top, and the queue is built again only after an operation
 * that changes cards, decks or options, or on a new day (`update_queues_after_answering_card` and
 * `maybe_clear_study_queues_after_op` in rslib scheduler/queue/mod.rs). The reviewer here reads
 * the queue again every few answers as well, to pick up learning cards that have come due and fresh
 * counts. A fresh build spreads the remaining new and day learning cards through the reviews anew,
 * which would deal them in a different order from the one the session started with.
 *
 * So the cards both builds hold in their main queue are dealt in the previous order, in the places
 * the fresh build gives its main queue, and a card only the fresh build holds (the next card of a
 * new-card window, or one an undo brought back) keeps its own place. Intraday learning stays where
 * the fresh build put it, since its due times decide its order.
 */
export function keepSessionOrder<T extends { cardId: number }>(
    previous: readonly T[],
    fresh: readonly T[],
    mainQueue: { start: number; end: number },
): T[] {
    const main = fresh.slice(mainQueue.start, mainQueue.end);
    const freshById = new Map(main.map((card) => [card.cardId, card]));
    const kept: T[] = [];
    const keptIds = new Set<number>();
    for (const card of previous) {
        const current = freshById.get(card.cardId);
        if (!current || keptIds.has(card.cardId)) continue;
        kept.push(current);
        keptIds.add(card.cardId);
    }
    let next = 0;
    const ordered = main.map((card) => (keptIds.has(card.cardId) ? kept[next++] : card));
    return [...fresh.slice(0, mainQueue.start), ...ordered, ...fresh.slice(mainQueue.end)];
}

/**
 * The queue with one card moved to the front, or null when that card cannot be studied now.
 *
 * Undo puts the card it took back on screen, as Anki's reviewer does. The rebuilt queue may not
 * hold it in front (or at all, when today's limits or the serving order would deal it later), so
 * it is read on its own when missing. A card that is suspended or buried is not shown.
 */
export function queueWithFocusedCard<T extends { cardId: number; state: { suspended: boolean; buried: boolean } }>(
    queue: T[],
    cardId: number,
    load: () => T | null,
): T[] | null {
    const focused = queue.find((card) => card.cardId === cardId) ?? load();
    if (!focused || focused.state.suspended || focused.state.buried) return null;
    return [focused, ...queue.filter((card) => card.cardId !== cardId)];
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
    // A card the leech action suspended has left the session.
    const stillStudied = !updatedCard.state.suspended;
    const learnAhead = withoutAnswered.length === 0
        && updatedCard.state.status === 'learning'
        && updatedCard.state.dueTime > 0
        && updatedCard.state.dueTime <= nowMs + Math.max(0, input.learnAheadMs);
    const reinsert = !input.preview && stillStudied && (learnAhead || isCardDueNow(updatedCard, nowMs, input.today));
    const queue = reinsert ? [...withoutAnswered, updatedCard] : withoutAnswered;

    const futureLearningDue = queue
        .filter((card) => card.state.status === 'learning' && card.state.dueTime > nowMs)
        .map((card) => card.state.dueTime);
    if (stillStudied && updatedCard.state.status === 'learning' && updatedCard.state.dueTime > nowMs) {
        futureLearningDue.push(updatedCard.state.dueTime);
    }

    return {
        queue,
        currentCard: queue[0] ?? null,
        nextLearningDue: futureLearningDue.length > 0 ? Math.min(...futureLearningDue) : null,
    };
}

export type ReviewerQueueCounts = { newCount: number; learningCount: number; reviewCount: number };

/** The count a card on screen is drawn from (Anki underlines it). */
export function queueCountBucket(status: StudyCard['state']['status']): keyof ReviewerQueueCounts {
    if (status === 'new') return 'newCount';
    if (status === 'learning') return 'learningCount';
    return 'reviewCount';
}

/**
 * The counts straight after an answer, until the next rebuild reads them again: the answered card
 * leaves the count it was drawn from and joins the one it is due in today.
 *
 * A card on an intraday step counts as learning for the rest of the study day, so ÖĞRENİYOR grows
 * the moment a new card enters learning. A day-long step (`dueTime` 0, as Anki's interday learning
 * is stored) is due on a later day after any answer, so it is not today's work, and a card the leech
 * action suspended has left the session.
 */
export function countsAfterAnswer(counts: ReviewerQueueCounts, input: {
    answeredStatus: StudyCard['state']['status'];
    /** The answered card with its new schedule. */
    updatedCard: StudyCard;
    nowMs: number;
    /** Local study day (YYYY-MM-DD) at `nowMs`, for review cards. */
    today: string;
    /** When the study day ends (the next rollover). */
    endOfDayMs: number;
}): ReviewerQueueCounts {
    const next = { ...counts };
    const answeredBucket = queueCountBucket(input.answeredStatus);
    next[answeredBucket] = Math.max(0, next[answeredBucket] - 1);
    const updated = input.updatedCard;
    if (updated.state.suspended) return next;
    if (updated.state.status === 'learning') {
        if (updated.state.dueTime > 0 && updated.state.dueTime < input.endOfDayMs) next.learningCount += 1;
    } else if (isCardDueNow(updated, input.nowMs, input.today)) {
        next[queueCountBucket(updated.state.status)] += 1;
    }
    return next;
}

/**
 * A queue built straight after an answer, without the answered card in front when the main queue
 * has run out and another learning card is waiting inside the learn-ahead limit.
 *
 * Anki requeues a learning card answered while its main queue is empty behind the next learning
 * card, one second after that card's due, if it would otherwise be shown again at once
 * (`requeue_learning_entry` in rslib scheduler/queue/learning.rs), so the same card does not come
 * twice in a row. Once that next card is answered, the earlier step of the requeued card puts it
 * in front by its own due time, so moving it one place back is all that rule changes.
 */
export function avoidImmediateRepeat<T extends { cardId: number }>(
    cards: readonly T[],
    mainQueue: { start: number; end: number },
    answeredCardId: number,
): T[] {
    if (mainQueue.start !== mainQueue.end || cards.length < 2 || cards[0].cardId !== answeredCardId) return [...cards];
    return [cards[1], cards[0], ...cards.slice(2)];
}
