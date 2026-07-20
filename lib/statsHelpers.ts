import { getDB } from './db';
import type { AnkiCard } from './models';

// Anki's young/mature cutoff: a review card is "mature" once its interval reaches
// 21 days. (Anki has no "mastered" tier — everything >= 21 days is mature.)
export const MATURE_MIN_IVL = 21;

export interface CardBuckets {
    newCount: number;
    learningCount: number;
    reviewCount: number;
    youngCount: number;
    matureCount: number;
    suspendedCount: number;
    buriedCount: number;
}

const DEFAULT_BUCKETS: CardBuckets = {
    newCount: 0,
    learningCount: 0,
    reviewCount: 0,
    youngCount: 0,
    matureCount: 0,
    suspendedCount: 0,
    buriedCount: 0,
};

/**
 * The bucket counters a card contributes to, from its queue and (for reviews)
 * whether the interval is mature. Single source of truth for both the in-memory
 * and the SQL aggregations below, so the two can never drift.
 */
function bucketKeys(queue: number, mature: boolean): (keyof CardBuckets)[] {
    if (queue === -1) return ['suspendedCount'];
    if (queue === -2 || queue === -3) return ['buriedCount'];
    if (queue === 0) return ['newCount'];
    if (queue === 1 || queue === 3) return ['learningCount'];
    if (queue === 2) return ['reviewCount', mature ? 'matureCount' : 'youngCount'];
    return [];
}

export function bucketCard(card: AnkiCard): Partial<CardBuckets> {
    const partial: Partial<CardBuckets> = {};
    for (const key of bucketKeys(card.queue, card.ivl >= MATURE_MIN_IVL)) partial[key] = 1;
    return partial;
}

export function aggregateBuckets(cards: AnkiCard[]): CardBuckets {
    const result: CardBuckets = { ...DEFAULT_BUCKETS };
    for (const card of cards) {
        for (const key of bucketKeys(card.queue, card.ivl >= MATURE_MIN_IVL)) result[key] += 1;
    }
    return result;
}

export interface SubjectBuckets extends CardBuckets {
    subjectId: string;
    total: number;
}

// A grouped "is this a mature review?" flag (1/0), so COUNT(*) yields per-band totals.
const matureBand = (queueCol: string, ivlCol: string) =>
    `CASE WHEN ${queueCol} = 2 AND ${ivlCol} >= ${MATURE_MIN_IVL} THEN 1 ELSE 0 END`;

/** Per-subject card-state counts, computed in SQL (never loads all cards into memory). */
export function perSubjectStatsSql(subjectIds: string[]): Map<string, SubjectBuckets> {
    const result = new Map<string, SubjectBuckets>();
    for (const id of subjectIds) {
        result.set(id, { subjectId: id, total: 0, ...DEFAULT_BUCKETS });
    }

    try {
        const db = getDB();

        const rows = db.getAllSync<{ tags: string; queue: number; mature: number; cnt: number }>(
            `SELECT n.tags AS tags, c.queue AS queue, ${matureBand('c.queue', 'c.ivl')} AS mature, COUNT(*) AS cnt
             FROM anki_cards c
             JOIN notes n ON n.id = c.noteId
             GROUP BY n.tags, c.queue, ${matureBand('c.queue', 'c.ivl')}`,
        );

        // Tags are serialized Anki-style with surrounding spaces (" subject topic "), so the
        // subject is found by scanning the split tag list — never by position: a leading space
        // makes index 0 empty, and extra tags (e.g. "leech") can join later.
        const subjectSet = new Set(subjectIds);
        for (const row of rows) {
            const tags = (row.tags || '').trim().split(/\s+/);
            const subjectTag = tags.find((tag) => subjectSet.has(tag));
            if (!subjectTag) continue;

            const bucket = result.get(subjectTag)!;
            bucket.total += row.cnt;
            for (const key of bucketKeys(row.queue, row.mature === 1)) bucket[key] += row.cnt;
        }
    } catch (e) {
        console.warn('[StatsHelpers] perSubjectStatsSql failed:', e);
    }

    return result;
}

const escapeLikePattern = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Card-state counts computed in SQL. With no argument the whole collection; with a deck
 * name only that deck's subtree ("Parent::Child" naming, same matching as the scheduler).
 */
export function aggregateBucketsSql(deckName?: string): CardBuckets {
    const result: CardBuckets = { ...DEFAULT_BUCKETS };
    try {
        const db = getDB();

        const deckFilter = deckName
            ? `JOIN decks d ON d.id = c.deckId AND (d.name = ? OR d.name LIKE ? ESCAPE '\\')`
            : '';
        const params = deckName ? [deckName, `${escapeLikePattern(deckName)}::%`] : [];

        const rows = db.getAllSync<{ queue: number; mature: number; cnt: number }>(
            `SELECT c.queue AS queue, ${matureBand('c.queue', 'c.ivl')} AS mature, COUNT(*) AS cnt
             FROM anki_cards c ${deckFilter}
             GROUP BY c.queue, ${matureBand('c.queue', 'c.ivl')}`,
            ...params,
        );
        for (const row of rows) {
            for (const key of bucketKeys(row.queue, row.mature === 1)) result[key] += row.cnt;
        }
    } catch (e) {
        console.warn('[StatsHelpers] aggregateBucketsSql failed:', e);
    }
    return result;
}

export interface DeckBuckets extends CardBuckets {
    total: number;
}

/**
 * Card-state counts grouped by owning deck id, computed in SQL. Callers fold rows into
 * subtree totals themselves — deck hierarchy lives in the "Parent::Child" names, not here.
 */
export function perDeckBucketsSql(): Map<number, DeckBuckets> {
    const result = new Map<number, DeckBuckets>();
    try {
        const db = getDB();
        const rows = db.getAllSync<{ deckId: number; queue: number; mature: number; cnt: number }>(
            `SELECT deckId, queue, ${matureBand('queue', 'ivl')} AS mature, COUNT(*) AS cnt
             FROM anki_cards
             GROUP BY deckId, queue, ${matureBand('queue', 'ivl')}`,
        );
        for (const row of rows) {
            let bucket = result.get(row.deckId);
            if (!bucket) {
                bucket = { total: 0, ...DEFAULT_BUCKETS };
                result.set(row.deckId, bucket);
            }
            bucket.total += row.cnt;
            for (const key of bucketKeys(row.queue, row.mature === 1)) bucket[key] += row.cnt;
        }
    } catch (e) {
        console.warn('[StatsHelpers] perDeckBucketsSql failed:', e);
    }
    return result;
}
