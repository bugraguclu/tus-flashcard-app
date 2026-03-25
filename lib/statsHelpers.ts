import type { AnkiCard } from './models';

export interface CardBuckets {
    newCount: number;
    learningCount: number;
    reviewCount: number;
    youngCount: number;
    matureCount: number;
    masteredCount: number;
    suspendedCount: number;
    buriedCount: number;
}

const DEFAULT_BUCKETS: CardBuckets = {
    newCount: 0,
    learningCount: 0,
    reviewCount: 0,
    youngCount: 0,
    matureCount: 0,
    masteredCount: 0,
    suspendedCount: 0,
    buriedCount: 0,
};

export function bucketCard(card: AnkiCard): Partial<CardBuckets> {
    if (card.queue === -1) {
        return { suspendedCount: 1 };
    }

    if (card.queue === -2 || card.queue === -3) {
        return { buriedCount: 1 };
    }

    if (card.queue === 0) {
        return { newCount: 1 };
    }

    if (card.queue === 1 || card.queue === 3) {
        return { learningCount: 1 };
    }

    if (card.queue === 2) {
        if (card.ivl >= 90) {
            return { reviewCount: 1, masteredCount: 1 };
        }

        if (card.ivl >= 21) {
            return { reviewCount: 1, matureCount: 1 };
        }

        return { reviewCount: 1, youngCount: 1 };
    }

    return {};
}

export function aggregateBuckets(cards: AnkiCard[]): CardBuckets {
    const result: CardBuckets = { ...DEFAULT_BUCKETS };

    for (const card of cards) {
        const bucket = bucketCard(card);
        result.newCount += bucket.newCount ?? 0;
        result.learningCount += bucket.learningCount ?? 0;
        result.reviewCount += bucket.reviewCount ?? 0;
        result.youngCount += bucket.youngCount ?? 0;
        result.matureCount += bucket.matureCount ?? 0;
        result.masteredCount += bucket.masteredCount ?? 0;
        result.suspendedCount += bucket.suspendedCount ?? 0;
        result.buriedCount += bucket.buriedCount ?? 0;
    }

    return result;
}

export interface SubjectBuckets extends CardBuckets {
    subjectId: string;
    total: number;
}

/** SQL-based per-subject stats - reads directly from DB for accuracy */
export function perSubjectStatsSql(subjectIds: string[]): Map<string, SubjectBuckets> {
    const result = new Map<string, SubjectBuckets>();
    for (const id of subjectIds) {
        result.set(id, { subjectId: id, total: 0, ...DEFAULT_BUCKETS });
    }

    try {
        const { getDB } = require('./db') as typeof import('./db');
        const db = getDB();

        // Note tags column stores space-separated tags; the first tag is the subject id.
        // e.g. "pediatri Neonatoloji"
        const rows = db.getAllSync<{ tags: string; queue: number; ivl: number; cnt: number }>(
            `SELECT n.tags AS tags, c.queue AS queue, c.ivl AS ivl, COUNT(*) as cnt
             FROM anki_cards c
             JOIN notes n ON n.id = c.noteId
             GROUP BY n.tags, c.queue, CASE
                 WHEN c.queue = 2 AND c.ivl >= 90 THEN 3
                 WHEN c.queue = 2 AND c.ivl >= 21 THEN 2
                 WHEN c.queue = 2 THEN 1
                 ELSE 0
             END`,
        );

        const subjectSet = new Set(subjectIds);

        for (const row of rows) {
            const firstTag = (row.tags || '').split(' ')[0];
            if (!subjectSet.has(firstTag)) continue;

            const bucket = result.get(firstTag)!;
            bucket.total += row.cnt;

            if (row.queue === -1) { bucket.suspendedCount += row.cnt; }
            else if (row.queue === -2 || row.queue === -3) { bucket.buriedCount += row.cnt; }
            else if (row.queue === 0) { bucket.newCount += row.cnt; }
            else if (row.queue === 1 || row.queue === 3) { bucket.learningCount += row.cnt; }
            else if (row.queue === 2) {
                bucket.reviewCount += row.cnt;
                if (row.ivl >= 90) bucket.masteredCount += row.cnt;
                else if (row.ivl >= 21) bucket.matureCount += row.cnt;
                else bucket.youngCount += row.cnt;
            }
        }
    } catch (e) {
        console.warn('[StatsHelpers] perSubjectStatsSql failed:', e);
    }

    return result;
}

/** SQL-based aggregation - avoids loading all cards into memory */
export function aggregateBucketsSql(): CardBuckets {
    try {
        const { getDB } = require('./db') as typeof import('./db');
        const db = getDB();
        const rows = db.getAllSync<{ queue: number; ivl: number; cnt: number }>(
            `SELECT queue, ivl, COUNT(*) as cnt FROM anki_cards GROUP BY queue, CASE
                WHEN queue = 2 AND ivl >= 90 THEN 3
                WHEN queue = 2 AND ivl >= 21 THEN 2
                WHEN queue = 2 THEN 1
                ELSE 0
            END`,
        );

        const result: CardBuckets = { ...DEFAULT_BUCKETS };
        for (const row of rows) {
            if (row.queue === -1) { result.suspendedCount += row.cnt; continue; }
            if (row.queue === -2 || row.queue === -3) { result.buriedCount += row.cnt; continue; }
            if (row.queue === 0) { result.newCount += row.cnt; continue; }
            if (row.queue === 1 || row.queue === 3) { result.learningCount += row.cnt; continue; }
            if (row.queue === 2) {
                result.reviewCount += row.cnt;
                if (row.ivl >= 90) result.masteredCount += row.cnt;
                else if (row.ivl >= 21) result.matureCount += row.cnt;
                else result.youngCount += row.cnt;
            }
        }
        return result;
    } catch (e) {
        console.warn('[StatsHelpers] aggregateBucketsSql failed:', e);
        return { ...DEFAULT_BUCKETS };
    }
}
