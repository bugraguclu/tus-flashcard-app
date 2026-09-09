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
