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
