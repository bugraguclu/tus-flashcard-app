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
