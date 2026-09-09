/**
 * Anki's `cards.data` column: the JSON blob that carries a card's FSRS memory state.
 *
 * Keys follow Anki's own short names (`rslib/src/storage/card/data.rs`) so a collection written
 * here schedules identically in Anki and vice versa. Unknown keys are preserved untouched: the
 * column is also where add-ons and future Anki versions park their own state.
 */

import type { FsrsMemoryState } from './fsrs';

export interface AnkiCardData {
    /** `pos` — the position a new card had before it was moved out of the new queue. */
    originalPosition?: number;
    /** `s` — FSRS stability in days. */
    stability?: number;
    /** `d` — FSRS difficulty, 1..10. */
    difficulty?: number;
    /** `dr` — the desired retention the card was last scheduled with. */
    desiredRetention?: number;
    /** `decay` — the forgetting-curve shape the card was last scheduled with. */
    decay?: number;
    /** `lrt` — last review time in epoch seconds. */
    lastReviewTimeSecs?: number;
    /** `cd` — custom scheduling data, an opaque JSON string. */
    customData?: string;
}

const FIELD_KEYS = {
    originalPosition: 'pos',
    stability: 's',
    difficulty: 'd',
    desiredRetention: 'dr',
    decay: 'decay',
    lastReviewTimeSecs: 'lrt',
    customData: 'cd',
} as const;

const KNOWN_KEYS = new Set<string>(Object.values(FIELD_KEYS));

function finiteNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

/** Read the column. An unparsable blob reads as empty, exactly as Anki treats it. */
export function parseAnkiCardData(raw: string | undefined | null): AnkiCardData {
    if (!raw || raw.trim() === '') return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const record = parsed as Record<string, unknown>;
    const data: AnkiCardData = {
        originalPosition: finiteNumber(record.pos),
        stability: finiteNumber(record.s),
        difficulty: finiteNumber(record.d),
        desiredRetention: finiteNumber(record.dr),
        decay: finiteNumber(record.decay),
        lastReviewTimeSecs: finiteNumber(record.lrt),
        customData: typeof record.cd === 'string' && record.cd !== '' ? record.cd : undefined,
    };
    return data;
}

/**
 * Write the column back, keeping every key this app does not model. An entry is omitted when it
 * has no value, so a card without FSRS state serializes exactly as Anki would write it.
 */
export function serializeAnkiCardData(data: AnkiCardData, previousRaw?: string | null): string | undefined {
    const result: Record<string, unknown> = {};

    if (previousRaw && previousRaw.trim() !== '') {
        try {
            const existing = JSON.parse(previousRaw);
            if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
                for (const [key, value] of Object.entries(existing as Record<string, unknown>)) {
                    if (!KNOWN_KEYS.has(key)) result[key] = value;
                }
            }
        } catch {
            // A malformed blob carries nothing worth preserving.
        }
    }

    for (const [field, key] of Object.entries(FIELD_KEYS) as Array<[keyof AnkiCardData, string]>) {
        const value = data[field];
        if (value === undefined || value === null) continue;
        if (typeof value === 'number' && !Number.isFinite(value)) continue;
        if (field === 'customData' && value === '') continue;
        result[key] = value;
    }

    return Object.keys(result).length > 0 ? JSON.stringify(result) : undefined;
}

/** The stored memory state, or null when the card has never been scheduled by FSRS. */
export function memoryStateFromCardData(data: AnkiCardData): FsrsMemoryState | null {
    if (data.stability === undefined || data.difficulty === undefined) return null;
    if (!(data.stability > 0)) return null;
    return { stability: data.stability, difficulty: data.difficulty };
}

/** Merge a freshly computed memory state into the column, leaving other keys alone. */
export function withFsrsMemoryState(
    previousRaw: string | undefined | null,
    memory: FsrsMemoryState | null,
    desiredRetention: number | undefined,
    decay: number | undefined,
): string | undefined {
    const data = parseAnkiCardData(previousRaw);
    if (memory) {
        data.stability = memory.stability;
        data.difficulty = memory.difficulty;
        data.desiredRetention = desiredRetention;
        data.decay = decay;
    } else {
        data.stability = undefined;
        data.difficulty = undefined;
        data.desiredRetention = undefined;
        data.decay = undefined;
    }
    return serializeAnkiCardData(data, previousRaw);
}
