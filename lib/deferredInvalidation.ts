/**
 * A monotonically increasing scheduler revision that does not itself publish a React update.
 * Frequent reviewer mutations mark it; count-heavy screens compare it when they regain focus.
 */
export class DeferredSchedulingInvalidation {
    private revision = 0;

    markStale(): void {
        this.revision += 1;
    }

    current(): number {
        return this.revision;
    }
}

/** Run a screen's refresh exactly once when it observes a newer passive revision. */
export function consumeSchedulingRevision(
    visibleRevision: number,
    latestRevision: number,
    refresh: () => void,
): number {
    if (visibleRevision === latestRevision) return visibleRevision;
    refresh();
    return latestRevision;
}
