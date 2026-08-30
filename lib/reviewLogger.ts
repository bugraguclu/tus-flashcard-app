// Review log (revlog): append-only history of every answer, plus the stats queries that read it.

import type { ReviewLog, AnkiCard } from './models';
import { getDB } from './db';
import { uniqueId } from './models';
import { dayNumberToYmd, localDayNumber, ymdToLocalDayNumber } from './ankiState';

const HOUR_MS = 3600000;

function startOfStudyDayMs(atMs: number, rolloverHour: number): number {
    const shifted = new Date(atMs - rolloverHour * HOUR_MS);
    return new Date(
        shifted.getFullYear(),
        shifted.getMonth(),
        shifted.getDate(),
        rolloverHour,
        0,
        0,
        0,
    ).getTime();
}

/** Log a review event */
export function logReview(
    card: AnkiCard,
    ease: 1 | 2 | 3 | 4,
    newIvl: number,
    lastIvl: number,
    newFactor: number,
    timeTakenMs: number,
    reviewType: 0 | 1 | 2 | 3 | 4, // learn, review, relearn, filtered, manual
    maxAnswerSecs: number = 60,
): ReviewLog {
    // Clamp to [0, the deck's max answer time] so an idle pause can't skew time stats.
    const timeCapMs = Math.max(1, maxAnswerSecs) * 1000;
    const entry: ReviewLog = {
        id: uniqueId(),
        cardId: card.id,
        usn: -1,
        ease,
        ivl: newIvl,
        lastIvl,
        factor: newFactor,
        time: Math.max(0, Math.min(timeTakenMs, timeCapMs)),
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

/**
 * Anki's `log_manually_scheduled_review`: Set Due Date and Forget record a revlog row with no
 * button and no answer time, so card history shows the change without it counting as a review.
 */
export function logManualReschedule(card: AnkiCard, lastIvl: number): ReviewLog {
    const entry: ReviewLog = {
        id: uniqueId(),
        cardId: card.id,
        usn: -1,
        ease: 0,
        ivl: card.ivl,
        lastIvl,
        factor: card.factor,
        time: 0,
        type: 4,
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

/** Get today's total study time in milliseconds (sum of review times) */
export function getTodayStudyTimeMs(rolloverHour: number = 4): number {
    const db = getDB();
    const startMs = startOfStudyDayMs(Date.now(), rolloverHour);
    const row = db.getFirstSync<{ total: number }>(
        'SELECT COALESCE(SUM(time), 0) as total FROM revlog WHERE ease > 0 AND id >= ?',
        startMs,
    );
    return row?.total || 0;
}

/** Get today's review count */
export function getTodayReviewCount(rolloverHour: number = 4): number {
    const db = getDB();
    const startMs = startOfStudyDayMs(Date.now(), rolloverHour);
    const row = db.getFirstSync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM revlog WHERE ease > 0 AND id >= ?',
        startMs,
    );
    return row?.cnt || 0;
}

export interface TodayAnswerStats {
    reviewed: number;
    /** Answers with ease > 1 (Anki: only "Again" fails). */
    passed: number;
    failed: number;
    /** Cards whose first-ever review happened today ("new cards introduced"). */
    newCardsIntroduced: number;
    studyTimeMs: number;
}

/**
 * Today's study numbers derived from the review log — the persistent source of truth.
 * Unlike a cached session blob, these survive restarts, sleep and multiple tabs, and undo
 * corrects them automatically because it deletes the revlog row.
 *
 * With deckName the numbers cover only that deck's subtree. Reviews of since-deleted cards
 * can't be attributed to a deck anymore, so they count in the global numbers only.
 */
export function getTodayAnswerStats(rolloverHour: number = 4, deckName?: string, scopedCardIds?: number[]): TodayAnswerStats {
    const db = getDB();
    const startMs = startOfStudyDayMs(Date.now(), rolloverHour);

    if (scopedCardIds !== undefined) {
        const cardIds = [...new Set(scopedCardIds.filter(Number.isFinite).map(Math.trunc))];
        if (cardIds.length === 0) {
            return { reviewed: 0, passed: 0, failed: 0, newCardsIntroduced: 0, studyTimeMs: 0 };
        }
        const placeholders = cardIds.map(() => '?').join(', ');
        const totals = db.getFirstSync<{ reviewed: number; failed: number; timeMs: number }>(
            `SELECT COUNT(*) AS reviewed,
                    COALESCE(SUM(CASE WHEN ease = 1 THEN 1 ELSE 0 END), 0) AS failed,
                    COALESCE(SUM(time), 0) AS timeMs
             FROM revlog WHERE ease > 0 AND id >= ? AND cardId IN (${placeholders})`,
            startMs, ...cardIds,
        );
        const introduced = db.getFirstSync<{ cnt: number }>(
            `SELECT COUNT(*) AS cnt
             FROM (
                SELECT cardId, MIN(id) AS firstReview
                FROM revlog
                WHERE ease > 0 AND cardId IN (${placeholders})
                GROUP BY cardId
             )
             WHERE firstReview >= ?`,
            ...cardIds, startMs,
        );
        const reviewed = totals?.reviewed ?? 0;
        const failed = totals?.failed ?? 0;
        return {
            reviewed,
            failed,
            passed: Math.max(0, reviewed - failed),
            newCardsIntroduced: introduced?.cnt ?? 0,
            studyTimeMs: totals?.timeMs ?? 0,
        };
    }

    if (deckName) {
        const escapedPrefix = `${deckName.replace(/[\\%_]/g, (ch) => `\\${ch}`)}::%`;

        const totals = db.getFirstSync<{ reviewed: number; failed: number; timeMs: number }>(
            `SELECT COUNT(*) AS reviewed,
                    COALESCE(SUM(CASE WHEN r.ease = 1 THEN 1 ELSE 0 END), 0) AS failed,
                    COALESCE(SUM(r.time), 0) AS timeMs
             FROM revlog r
             JOIN anki_cards c ON c.id = r.cardId
             JOIN decks d ON d.id = c.deckId
             WHERE r.ease > 0 AND r.id >= ? AND (d.name = ? OR d.name LIKE ? ESCAPE '\\')`,
            startMs, deckName, escapedPrefix,
        );

        const reviewed = totals?.reviewed ?? 0;
        const failed = totals?.failed ?? 0;

        return {
            reviewed,
            failed,
            passed: Math.max(0, reviewed - failed),
            newCardsIntroduced: getNewCardsIntroducedTodayInDeck(deckName, rolloverHour),
            studyTimeMs: totals?.timeMs ?? 0,
        };
    }

    const totals = db.getFirstSync<{ reviewed: number; failed: number; timeMs: number }>(
        `SELECT COUNT(*) AS reviewed,
                COALESCE(SUM(CASE WHEN ease = 1 THEN 1 ELSE 0 END), 0) AS failed,
                COALESCE(SUM(time), 0) AS timeMs
         FROM revlog WHERE ease > 0 AND id >= ?`,
        startMs,
    );

    const introduced = db.getFirstSync<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM (SELECT cardId, MIN(id) AS firstReview FROM revlog WHERE ease > 0 GROUP BY cardId)
         WHERE firstReview >= ?`,
        startMs,
    );

    const reviewed = totals?.reviewed ?? 0;
    const failed = totals?.failed ?? 0;

    return {
        reviewed,
        failed,
        passed: Math.max(0, reviewed - failed),
        newCardsIntroduced: introduced?.cnt ?? 0,
        studyTimeMs: totals?.timeMs ?? 0,
    };
}

/**
 * How many of today's first-ever reviews belong to a deck subtree. Anki tracks the new-card
 * allotment per deck; deriving it from the revlog keeps deck-scoped studying from being
 * throttled by new cards introduced in unrelated decks.
 */
export function getNewCardsIntroducedTodayInDeck(deckName: string, rolloverHour: number = 4): number {
    const db = getDB();
    const startMs = startOfStudyDayMs(Date.now(), rolloverHour);
    const escapedPrefix = `${deckName.replace(/[\\%_]/g, (ch) => `\\${ch}`)}::%`;

    const row = db.getFirstSync<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM (
            SELECT r.cardId, MIN(r.id) AS firstReview
            FROM revlog r
            JOIN anki_cards c ON c.id = r.cardId
            JOIN decks d ON d.id = c.deckId
            WHERE r.ease > 0 AND (d.name = ? OR d.name LIKE ? ESCAPE '\\')
            GROUP BY r.cardId
         )
         WHERE firstReview >= ?`,
        deckName,
        escapedPrefix,
        startMs,
    );

    return row?.cnt ?? 0;
}

export interface StudyStreak {
    /** Consecutive study days ending today (or yesterday, if today has no reviews yet). */
    current: number;
    /** Whether today already counts toward the streak. */
    studiedToday: boolean;
    /** Longest run of consecutive study days on record. */
    best: number;
}

/** Daily streak computed from distinct study days in the review log. */
export function getStudyStreak(rolloverHour: number = 4): StudyStreak {
    const db = getDB();
    const shiftSec = rolloverHour * 3600;

    // Same local-date bucketing as getDailyReviewCounts, so the streak, the history chart
    // and localDayNumber all agree on where a study day starts.
    const rows = db.getAllSync<{ d: string }>(
        `SELECT DISTINCT date(id / 1000 - ?, 'unixepoch', 'localtime') AS d
         FROM revlog WHERE ease > 0 ORDER BY d ASC`,
        shiftSec,
    );

    const dayNumbers = rows
        .map((row) => ymdToLocalDayNumber(row.d, -1))
        .filter((day) => day >= 0);
    const today = localDayNumber(Date.now(), rolloverHour);

    const days = new Set(dayNumbers);
    const studiedToday = days.has(today);

    let current = 0;
    let cursor = studiedToday ? today : today - 1;
    while (days.has(cursor)) {
        current += 1;
        cursor -= 1;
    }

    let best = 0;
    let run = 0;
    let prev: number | null = null;
    for (const day of dayNumbers) {
        run = prev !== null && day === prev + 1 ? run + 1 : 1;
        best = Math.max(best, run);
        prev = day;
    }

    return { current, studiedToday, best };
}

/**
 * Distinct study days with at least one review inside [startDayNumber, endDayNumber],
 * as YYYY-MM-DD strings. Buckets reviews by the same rollover-shifted local date as
 * getStudyStreak and getDailyReviewCounts, so a 2 AM answer belongs to the previous
 * study day everywhere at once.
 */
export function getStudiedDaysBetween(
    startDayNumber: number,
    endDayNumber: number,
    rolloverHour: number = 4,
): Set<string> {
    if (endDayNumber < startDayNumber) return new Set();

    const db = getDB();
    const shiftSec = rolloverHour * 3600;
    const startMs = studyDayStartMsFromDayNumber(startDayNumber, rolloverHour);
    const endMs = studyDayStartMsFromDayNumber(endDayNumber + 1, rolloverHour);

    const rows = db.getAllSync<{ d: string }>(
        `SELECT DISTINCT date(id / 1000 - ?, 'unixepoch', 'localtime') AS d
         FROM revlog WHERE ease > 0 AND id >= ? AND id < ?`,
        shiftSec, startMs, endMs,
    );

    return new Set(rows.map((row) => row.d));
}

/** Local timestamp where the given study day begins (its calendar date at the rollover hour). */
function studyDayStartMsFromDayNumber(dayNumber: number, rolloverHour: number): number {
    const ymd = dayNumberToYmd(dayNumber, rolloverHour);
    const [yyyy, mm, dd] = ymd.split('-').map(Number);
    return new Date(yyyy, mm - 1, dd, rolloverHour, 0, 0, 0).getTime();
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
    // Anki's RevlogEntry::has_rating(): entries with no button pressed (Set Due Date, Reset,
    // and imported "rescheduled" rows) are not study and stay out of every answer statistic.
    const reviews = getReviewsInRange(startMs, endMs).filter((review) => review.ease > 0);

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
export function getDailyReviewCounts(days: number, rolloverHour: number = 4): { date: string; count: number; timeMs: number }[] {
    const db = getDB();
    const startMs = Date.now() - days * 86400000;

    // Shift review timestamps by rolloverHour so that SQL date() groups
    // align with study-day boundaries instead of midnight.
    const shiftSec = rolloverHour * 3600;

    const rows = db.getAllSync<{ date: string; count: number; timeMs: number }>(
        `SELECT date(id/1000 - ?, 'unixepoch', 'localtime') as date,
                COUNT(*) as count,
                COALESCE(SUM(time), 0) as timeMs
         FROM revlog WHERE ease > 0 AND id >= ?
         GROUP BY date ORDER BY date`,
        shiftSec,
        startMs,
    );

    // Fill gaps for days with no reviews
    const rowMap = new Map(rows.map(r => [r.date, r]));
    const result: { date: string; count: number; timeMs: number }[] = [];
    const today = localDayNumber(Date.now(), rolloverHour);

    for (let i = days - 1; i >= 0; i--) {
        const dateStr = dayNumberToYmd(today - i, rolloverHour);
        result.push(rowMap.get(dateStr) || { date: dateStr, count: 0, timeMs: 0 });
    }
    return result;
}

/** Get future due card counts (for projection chart) — single GROUP BY query */
export function getFutureDueCounts(days: number, rolloverHour: number = 4): { date: string; count: number }[] {
    if (days <= 0) return [];

    const db = getDB();
    const today = localDayNumber(Date.now(), rolloverHour);
    const maxDueDay = today + days - 1;

    // Include interday learning (queue 3), whose `due` is also a day number, like Anki's forecast.
    const rows = db.getAllSync<{ due: number; cnt: number }>(
        `SELECT due, COUNT(*) as cnt FROM anki_cards
         WHERE queue IN (2, 3) AND due <= ?
         GROUP BY due ORDER BY due`,
        maxDueDay,
    );

    const dueMap = new Map(rows.map((row) => [row.due, row.cnt]));
    const result: { date: string; count: number }[] = [];

    // Overdue cards (due < today) are all waiting now, so seed the running total with them.
    let cumulative = 0;
    for (const [due, cnt] of dueMap) {
        if (due < today) cumulative += cnt;
    }

    for (let i = 0; i < days; i++) {
        const dueDay = today + i;
        cumulative += dueMap.get(dueDay) || 0;
        result.push({
            date: dayNumberToYmd(dueDay, rolloverHour),
            count: cumulative,
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

/** Get hourly breakdown of reviews — SQL GROUP BY instead of loading all */
export function getHourlyBreakdown(): { hour: number; count: number; correct: number }[] {
    const db = getDB();
    const rows = db.getAllSync<{ hour: number; count: number; correct: number }>(
        `SELECT CAST(strftime('%H', id/1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
                COUNT(*) as count,
                SUM(CASE WHEN ease >= 2 THEN 1 ELSE 0 END) as correct
         FROM revlog WHERE ease > 0 GROUP BY hour ORDER BY hour`
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
        'SELECT ease, COUNT(*) as cnt FROM revlog WHERE ease > 0 GROUP BY ease ORDER BY ease'
    );
    const labels = { 1: 'Tekrar', 2: 'Zor', 3: 'İyi', 4: 'Kolay' };
    return rows.map(r => ({
        ease: r.ease,
        label: labels[r.ease as keyof typeof labels] || `${r.ease}`,
        count: r.cnt,
    }));
}

export function deleteReviewById(reviewId: number): void {
    const db = getDB();
    db.runSync('DELETE FROM revlog WHERE id = ?', reviewId);
}

export function deleteLastReviewForCard(cardId: number): void {
    const db = getDB();
    const row = db.getFirstSync<{ id: number }>(
        'SELECT id FROM revlog WHERE cardId = ? ORDER BY id DESC LIMIT 1',
        cardId,
    );
    if (!row) return;
    deleteReviewById(row.id);
}
