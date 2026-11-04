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

/** What a collection change touched, as far as the reviewer's study queue is concerned. */
export type CollectionChange = {
    /**
     * The change left every card's scheduling and deck, the decks and their options alone: it
     * edited a note's text or tags, marked a note, or set a card's flag. Anki keeps its study
     * queue across such a change and only redraws the card on screen; any change to cards (other
     * than a flag), decks or deck options builds the queue again (`requires_study_queue_rebuild`
     * in rslib/src/ops.rs, and `op_executed` in qt/aqt/reviewer.py).
     */
    keepsStudyQueue?: boolean;
};

/**
 * Whether a change must rebuild the study queue. Anything not marked as keeping it does, so a
 * caller that passes something else (a press event handed straight through, say) stays safe.
 */
export function changesStudyQueue(change: unknown): boolean {
    return !(typeof change === 'object' && change !== null && (change as CollectionChange).keepsStudyQueue === true);
}
