// ============================================================
// TUS Flashcard - Review Logger (revlog)
// Records every review for statistics and FSRS optimization
// ============================================================

import type { ReviewLog, AnkiCard } from './models';
import { getDB } from './db';

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
        id: Date.now(),
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

/** Get daily review counts for chart (last N days) */
export function getDailyReviewCounts(days: number): { date: string; count: number; timeMs: number }[] {
    const result: { date: string; count: number; timeMs: number }[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const startMs = d.getTime();
        const endMs = startMs + 86400000;

        const db = getDB();
        const row = db.getFirstSync<{ cnt: number; totalTime: number }>(
            'SELECT COUNT(*) as cnt, COALESCE(SUM(time), 0) as totalTime FROM revlog WHERE id >= ? AND id < ?',
            startMs, endMs
        );

        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');

        result.push({
            date: `${yyyy}-${mm}-${dd}`,
            count: row?.cnt || 0,
            timeMs: row?.totalTime || 0,
        });
    }

    return result;
}

/** Get future due card counts (for projection chart) */
export function getFutureDueCounts(days: number): { date: string; count: number }[] {
    const db = getDB();
    const result: { date: string; count: number }[] = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        // Count review cards due on this date
        // Cards store due as days since creation epoch - simplified to dueDate
        const row = db.getFirstSync<{ cnt: number }>(
            `SELECT COUNT(*) as cnt FROM anki_cards
             WHERE queue = 2 AND due <= ?`,
            i // days from now
        );

        result.push({
            date: dateStr,
            count: row?.cnt || 0,
        });
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

/** Get hourly breakdown of reviews */
export function getHourlyBreakdown(): { hour: number; count: number; correct: number }[] {
    const reviews = getReviewsInRange(0, Date.now());
    const hourMap = new Map<number, { count: number; correct: number }>();

    for (let h = 0; h < 24; h++) {
        hourMap.set(h, { count: 0, correct: 0 });
    }

    for (const r of reviews) {
        const hour = new Date(r.id).getHours();
        const entry = hourMap.get(hour)!;
        entry.count++;
        if (r.ease >= 2) entry.correct++;
    }

    return Array.from(hourMap.entries()).map(([hour, data]) => ({
        hour,
        ...data,
    }));
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
