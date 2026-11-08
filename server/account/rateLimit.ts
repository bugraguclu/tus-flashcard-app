/*
 * Fixed-window counters kept in memory. One server process is the deployment this is built for;
 * a restart forgets the counters, which only ever makes the limits more lenient for a moment.
 */

export type Clock = () => number;

export type RateDecision = { ok: true } | { ok: false; retryAfter: number };

/** Past this many keys, expired windows are swept on the next `take`. */
const SWEEP_THRESHOLD = 50_000;

export class RateLimiter {
    private readonly windows = new Map<string, { count: number; resetAt: number }>();
    private readonly now: Clock;

    constructor(now: Clock = Date.now) {
        this.now = now;
    }

    /** Counts one use of `key`; refuses once `limit` uses fall inside the current window. */
    take(key: string, limit: number, windowMs: number): RateDecision {
        const now = this.now();
        if (this.windows.size > SWEEP_THRESHOLD) this.sweep();
        let window = this.windows.get(key);
        if (!window || window.resetAt <= now) {
            window = { count: 0, resetAt: now + windowMs };
            this.windows.set(key, window);
        }
        if (window.count >= limit) {
            return { ok: false, retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1000)) };
        }
        window.count += 1;
        return { ok: true };
    }

    /** Gives a use back, e.g. when the mail it paid for could not be sent. */
    refund(key: string): void {
        const window = this.windows.get(key);
        if (!window) return;
        window.count -= 1;
        if (window.count <= 0) this.windows.delete(key);
    }

    sweep(): void {
        const now = this.now();
        for (const [key, window] of this.windows) {
            if (window.resetAt <= now) this.windows.delete(key);
        }
    }

    get size(): number {
        return this.windows.size;
    }
}
