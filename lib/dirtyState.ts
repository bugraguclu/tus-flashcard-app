/**
 * Serialize persisted form state without depending on object insertion order.
 * Undefined object properties are omitted just as they are by JSON persistence, while array
 * order remains significant because it can affect the stored meaning.
 */
function normalizeForSnapshot(value: unknown): unknown {
    if (value === undefined) return undefined;
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map(normalizeForSnapshot);
    if (typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>)
            .sort()
            .reduce<Record<string, unknown>>((result, key) => {
                const normalized = normalizeForSnapshot((value as Record<string, unknown>)[key]);
                if (normalized !== undefined) result[key] = normalized;
                return result;
            }, {});
    }
    return String(value);
}

export function stableSnapshot(value: unknown): string {
    return JSON.stringify(normalizeForSnapshot(value));
}

export function hasSnapshotChanged(initialSnapshot: string | null, current: unknown): boolean {
    return initialSnapshot !== null && initialSnapshot !== stableSnapshot(current);
}

