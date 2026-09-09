/**
 * Monotonic-style elapsed timer that counts only while the app is active.
 *
 * React Native's AppState supplies the active/inactive transitions; keeping the
 * arithmetic here makes review-time and timebox behaviour deterministic and
 * independently testable.
 */
export class ActiveElapsedTimer {
    private accumulatedMs = 0;
    private activeSinceMs: number | null;

    constructor(nowMs: number = Date.now(), active: boolean = true) {
        this.activeSinceMs = active ? nowMs : null;
    }

    reset(nowMs: number = Date.now(), active: boolean = this.activeSinceMs !== null): void {
        this.accumulatedMs = 0;
        this.activeSinceMs = active ? nowMs : null;
    }

    setActive(active: boolean, nowMs: number = Date.now()): void {
        if (active) {
            if (this.activeSinceMs === null) this.activeSinceMs = nowMs;
            return;
        }

        if (this.activeSinceMs !== null) {
            this.accumulatedMs += Math.max(0, nowMs - this.activeSinceMs);
            this.activeSinceMs = null;
        }
    }

    elapsed(nowMs: number = Date.now()): number {
        const activeElapsed = this.activeSinceMs === null
            ? 0
            : Math.max(0, nowMs - this.activeSinceMs);
        return this.accumulatedMs + activeElapsed;
    }
}
