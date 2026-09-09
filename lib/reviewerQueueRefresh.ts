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
