export interface TimeboxCheckpoint {
    cards: number;
    minutes: number;
}

/**
 * Reviewer-scoped Timebox state.
 *
 * Anki measures wall-clock time from the start of the block and checks the limit only after a
 * card has been answered. It reports the configured block length rather than the learner's
 * potentially longer elapsed time, then starts a fresh block only when Continue is chosen.
 */
export class TimeboxTracker {
    private startedAtMs: number;
    private repetitions = 0;

    constructor(nowMs: number = Date.now()) {
        this.startedAtMs = nowMs;
    }

    recordRepetition(): void {
        this.repetitions += 1;
    }

    checkpoint(limitMinutes: number, nowMs: number = Date.now()): TimeboxCheckpoint | null {
        if (!Number.isFinite(limitMinutes) || limitMinutes <= 0) return null;

        const limitMs = limitMinutes * 60_000;
        const elapsedMs = Math.max(0, nowMs - this.startedAtMs);
        if (elapsedMs <= limitMs) return null;

        return {
            cards: this.repetitions,
            minutes: Math.round(limitMs / 60_000),
        };
    }

    reset(nowMs: number = Date.now()): void {
        this.startedAtMs = nowMs;
        this.repetitions = 0;
    }
}

/**
 * The reviewer's Timebox check after an answer. Anki checks the block only once a repetition has
 * completed, so the answer's own bookkeeping (`completeRepetition`) is done before the learner is
 * asked, and holds whether they continue or finish there. Resolves true to keep studying; Continue
 * starts a new block.
 */
export async function checkTimeboxAfterAnswer(input: {
    tracker: TimeboxTracker;
    limitMinutes: number;
    completeRepetition: () => void;
    /** Shows the checkpoint; resolves true for Continue, false for Finish. */
    ask: (checkpoint: TimeboxCheckpoint) => Promise<boolean>;
    now?: () => number;
}): Promise<boolean> {
    const now = input.now ?? Date.now;
    input.completeRepetition();
    input.tracker.recordRepetition();
    const checkpoint = input.tracker.checkpoint(input.limitMinutes, now());
    if (!checkpoint) return true;
    if (!(await input.ask(checkpoint))) return false;
    input.tracker.reset(now());
    return true;
}
