// ============================================================
// TUS Flashcard - Review Logger (revlog)
// Records every review for statistics and FSRS optimization
// ============================================================

import type { ReviewLog, AnkiCard } from './models';
import { getDB } from './db';
import { uniqueId } from './models';

/** Log a review event */
export function logReview(
    card: AnkiCard,
    ease: 1 | 2 | 3 | 4,
    newIvl: number,
    lastIvl: number,
    newFactor: number,
    timeTakenMs: number,
    reviewType: 0 | 1 | 2 | 3 | 4 // learn, review, relearn, filtered, manual
): ReviewLog {
    const entry: ReviewLog = {
        id: uniqueId(),
        cardId: card.id,
        usn: -1,
        ease,
        ivl: newIvl,
        lastIvl,
        factor: newFactor,
        time: Math.min(timeTakenMs, 60000), // cap at 60 seconds
        type: reviewType,
    };

    const db = getDB();
    db.runSync(
        `INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        entry.id, entry.cardId, entry.usn, entry.ease,
        entry.ivl, entry.lastIvl, entry.factor, entry.time, entry.type
    );

    return entry;
}

/** Get all reviews for a card (for Card Info display) */
export function getReviewsForCard(cardId: number): ReviewLog[] {
    const db = getDB();
    return db.getAllSync<ReviewLog>(
        'SELECT * FROM revlog WHERE cardId = ? ORDER BY id ASC',
        cardId
    );
}

/** Get reviews in a date range (for statistics) */
export function getReviewsInRange(startMs: number, endMs: number): ReviewLog[] {
    const db = getDB();
    return db.getAllSync<ReviewLog>(
        'SELECT * FROM revlog WHERE id >= ? AND id <= ? ORDER BY id ASC',
        startMs, endMs
    );
}

/** Get today's review count */
export function getTodayReviewCount(): number {
    const db = getDB();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const row = db.getFirstSync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM revlog WHERE id >= ?',
        startOfDay.getTime()
    );
    return row?.cnt || 0;
}

/** Get review statistics for a period */
export interface ReviewStats {
    totalReviews: number;
    totalTimeMs: number;
    againCount: number;
    hardCount: number;
    goodCount: number;
    easyCount: number;
    learnCount: number;
    reviewCount: number;
    relearnCount: number;
    averageTimeMs: number;
    retentionRate: number; // good+easy / total for reviews
}

export function getReviewStats(startMs: number, endMs: number): ReviewStats {
    const reviews = getReviewsInRange(startMs, endMs);

    const stats: ReviewStats = {
        totalReviews: reviews.length,
        totalTimeMs: 0,
        againCount: 0,
        hardCount: 0,
        goodCount: 0,
        easyCount: 0,
        learnCount: 0,
        reviewCount: 0,
        relearnCount: 0,
        averageTimeMs: 0,
        retentionRate: 0,
    };

    for (const r of reviews) {
        stats.totalTimeMs += r.time;
        if (r.ease === 1) stats.againCount++;
        else if (r.ease === 2) stats.hardCount++;
        else if (r.ease === 3) stats.goodCount++;
        else if (r.ease === 4) stats.easyCount++;

        if (r.type === 0) stats.learnCount++;
        else if (r.type === 1) stats.reviewCount++;
        else if (r.type === 2) stats.relearnCount++;
    }

    stats.averageTimeMs = stats.totalReviews > 0
        ? Math.round(stats.totalTimeMs / stats.totalReviews)
        : 0;

    // True retention: reviews where ease >= 2
    const reviewTypeReviews = reviews.filter(r => r.type === 1);
    const passed = reviewTypeReviews.filter(r => r.ease >= 2).length;
    stats.retentionRate = reviewTypeReviews.length > 0
        ? passed / reviewTypeReviews.length
        : 0;

    return stats;
}

/** Get daily review counts for chart (last N days) — single GROUP BY query */
export function getDailyReviewCounts(days: number): { date: string; count: number; timeMs: number }[] {
    const db = getDB();
    const startMs = Date.now() - days * 86400000;

    const rows = db.getAllSync<{ date: string; count: number; timeMs: number }>(
        `SELECT date(id/1000, 'unixepoch', 'localtime') as date,
                COUNT(*) as count,
                COALESCE(SUM(time), 0) as timeMs
         FROM revlog WHERE id >= ?
         GROUP BY date ORDER BY date`,
        startMs
    );

    // Fill gaps for days with no reviews
    const rowMap = new Map(rows.map(r => [r.date, r]));
    const result: { date: string; count: number; timeMs: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        result.push(rowMap.get(dateStr) || { date: dateStr, count: 0, timeMs: 0 });
    }
    return result;
}

/** Get future due card counts (for projection chart) — single GROUP BY query */
export function getFutureDueCounts(days: number): { date: string; count: number }[] {
    const db = getDB();

    const rows = db.getAllSync<{ due: number; cnt: number }>(
        `SELECT due, COUNT(*) as cnt FROM anki_cards
         WHERE queue = 2 AND due <= ?
         GROUP BY due ORDER BY due`,
        days
    );

    const dueMap = new Map(rows.map(r => [r.due, r.cnt]));
    const result: { date: string; count: number }[] = [];
    const now = new Date();
    let cumulative = 0;

    for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        cumulative += dueMap.get(i) || 0;
        result.push({ date: `${yyyy}-${mm}-${dd}`, count: cumulative });
    }
    return result;
}

/** Get interval distribution (for statistics) */
export function getIntervalDistribution(): { interval: number; count: number }[] {
    const db = getDB();
    const rows = db.getAllSync<{ ivl: number; cnt: number }>(
        `SELECT ivl as ivl, COUNT(*) as cnt FROM anki_cards
         WHERE type = 2 AND queue >= 0
         GROUP BY ivl ORDER BY ivl`
    );
    return rows.map(r => ({ interval: r.ivl, count: r.cnt }));
}

/** Get ease factor distribution */
export function getEaseDistribution(): { ease: number; count: number }[] {
    const db = getDB();
    const rows = db.getAllSync<{ ease: number; cnt: number }>(
        `SELECT ROUND(factor / 100) * 100 as ease, COUNT(*) as cnt
         FROM anki_cards WHERE type = 2 AND queue >= 0 AND factor > 0
         GROUP BY ease ORDER BY ease`
    );
    return rows.map(r => ({ ease: r.ease / 10, count: r.cnt }));
}

/** Get hourly breakdown of reviews — SQL GROUP BY instead of loading all */
export function getHourlyBreakdown(): { hour: number; count: number; correct: number }[] {
    const db = getDB();
    const rows = db.getAllSync<{ hour: number; count: number; correct: number }>(
        `SELECT CAST(strftime('%H', id/1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
                COUNT(*) as count,
                SUM(CASE WHEN ease >= 2 THEN 1 ELSE 0 END) as correct
         FROM revlog GROUP BY hour ORDER BY hour`
    );

    // Fill all 24 hours (some may have no reviews)
    const hourMap = new Map(rows.map(r => [r.hour, r]));
    const result: { hour: number; count: number; correct: number }[] = [];
    for (let h = 0; h < 24; h++) {
        result.push(hourMap.get(h) || { hour: h, count: 0, correct: 0 });
    }
    return result;
}

/** Get button press distribution */
export function getButtonDistribution(): { ease: number; label: string; count: number }[] {
    const db = getDB();
    const rows = db.getAllSync<{ ease: number; cnt: number }>(
        'SELECT ease, COUNT(*) as cnt FROM revlog GROUP BY ease ORDER BY ease'
    );
    const labels = { 1: 'Tekrar', 2: 'Zor', 3: 'İyi', 4: 'Kolay' };
    return rows.map(r => ({
        ease: r.ease,
        label: labels[r.ease as keyof typeof labels] || `${r.ease}`,
        count: r.cnt,
    }));
}
