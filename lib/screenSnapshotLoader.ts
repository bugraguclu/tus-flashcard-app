/**
 * Small, UI-agnostic primitives shared by heavy screens.
 *
 * The database APIs are synchronous, so screens schedule snapshot construction after native
 * interactions. These primitives make the result side deterministic: an old generation can
 * never commit over a newer scope/filter, and an identical key is only built once per cache.
 */
export class LatestSnapshotGeneration {
    private generation = 0;

    begin(): number {
        this.generation += 1;
        return this.generation;
    }

    cancel(): void {
        this.generation += 1;
    }

    isCurrent(token: number): boolean {
        return token === this.generation;
    }

    commit(token: number, action: () => void): boolean {
        if (!this.isCurrent(token)) return false;
        action();
        return true;
    }
}

export class ScreenSnapshotRepository<T> {
    private readonly snapshots = new Map<string, T>();

    constructor(private readonly capacity = 8) {}

    has(key: string): boolean {
        return this.snapshots.has(key);
    }

    get(key: string): T | undefined {
        const cached = this.snapshots.get(key);
        if (cached !== undefined) {
            this.snapshots.delete(key);
            this.snapshots.set(key, cached);
        }
        return cached;
    }

    getOrCreate(key: string, create: () => T): T {
        const cached = this.snapshots.get(key);
        if (cached !== undefined) {
            // Refresh insertion order so frequently toggled filters remain cached.
            this.snapshots.delete(key);
            this.snapshots.set(key, cached);
            return cached;
        }

        const snapshot = create();
        this.snapshots.set(key, snapshot);
        while (this.snapshots.size > this.capacity) {
            const oldestKey = this.snapshots.keys().next().value as string | undefined;
            if (oldestKey === undefined) break;
            this.snapshots.delete(oldestKey);
        }
        return snapshot;
    }

    clear(): void {
        this.snapshots.clear();
    }
}

export interface CancellableTask {
    cancel(): void;
}

/**
 * Runs `work` once the screen's interactions have settled, and at the latest after `maxWaitMs`.
 *
 * `InteractionManager` waits for every running animation to end. One that never does (a page whose
 * animation frames are paused, as in a hidden browser tab) would otherwise hold a screen's refresh
 * back for good, and the screen would keep showing data the learner has just changed.
 */
export function runAfterInteractionsWithin(
    work: () => void,
    afterInteractions: (callback: () => void) => CancellableTask,
    maxWaitMs: number,
): CancellableTask {
    let finished = false;
    let task: CancellableTask | null = null;
    const stop = () => {
        finished = true;
        clearTimeout(timer);
        task?.cancel();
    };
    const run = () => {
        if (finished) return;
        stop();
        work();
    };
    const timer = setTimeout(run, maxWaitMs);
    task = afterInteractions(run);
    return { cancel: stop };
}

/**
 * Runs `work` once `frames` animation frames have passed.
 *
 * React Native shows nothing of a JavaScript turn until that turn ends, and an immediate or a
 * microtask still belongs to the turn that queued it. A build long enough to notice that starts
 * there keeps the very frame it was meant to follow off the screen: a tap on Statistics left the
 * deck list standing until every query had run. Waiting for frames lets the pushed screen and its
 * loading state be drawn, and take their safe-area insets, before the thread goes quiet.
 */
export function runAfterFrames(
    work: () => void,
    frames: number,
    requestFrame: (callback: () => void) => number = (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
): CancellableTask {
    let remaining = Math.max(1, Math.floor(frames));
    let cancelled = false;
    const next = () => {
        if (cancelled) return;
        remaining -= 1;
        if (remaining <= 0) work();
        else handle = requestFrame(next);
    };
    let handle = requestFrame(next);
    return {
        cancel: () => {
            cancelled = true;
            cancelFrame(handle);
        },
    };
}
