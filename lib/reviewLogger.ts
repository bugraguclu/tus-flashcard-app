// Review log (revlog): append-only history of every answer, plus the queries that derive
// today's totals, daily-limit usage, the study streak and the studied days of the weekly strip
// from it. The Statistics charts read the log through ankiStats.ts.

import type { FsrsMemoryState } from './fsrs';
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
 * Anki's `difficulty_shifted`: FSRS difficulty mapped onto 0.1–1.1, the range of the revlog's ease
 * column when FSRS wrote the row. Computed in f32 like Anki.
 */
function difficultyShifted(memory: FsrsMemoryState): number {
    const f32 = Math.fround;
    return f32(f32(f32(f32(memory.difficulty) - 1) / 9) + f32(0.1));
}

/**
 * The ease column of an answer's revlog row: the shifted difficulty under FSRS, rounded to
 * permille (`RevlogEntryPartial::into_revlog_entry`); otherwise the SM-2 ease the answer left,
 * which is 0 for a (re)learning step of a card that has not graduated.
 */
export function revlogFactorForAnswer(memory: FsrsMemoryState | null | undefined, easePermille: number): number {
    if (!memory) return easePermille;
    return Math.round(Math.fround(difficultyShifted(memory) * 1000));
}

/**
 * The ease column of a bookkeeping row (`log_scheduled_review`): the shifted difficulty truncated
 * to permille when the card has a memory state, otherwise its ease factor.
 */
export function revlogFactorForScheduling(memory: FsrsMemoryState | null | undefined, easePermille: number): number {
    if (!memory) return easePermille;
    return Math.trunc(Math.fround(difficultyShifted(memory) * 1000));
}

/**
 * Append the rating-less row Anki writes when a card is rescheduled other than by an answer.
 *
 * Anki records these so the history stays complete, and gives them no rating: `ease = 0` is what
 * marks a row as bookkeeping rather than an answer, which is why every counting query in this
 * file excludes it. The kinds are not interchangeable:
 * - `reset` (type 4, factor 0) is the marker "Forget" leaves behind. FSRS looks for exactly this
 *   pair and throws away everything before it, so the card is modelled from scratch.
 * - `manual` (type 4, non-zero factor) is what "Set Due Date" leaves behind.
 * - `rescheduled` (type 5) is what rescheduling after a preset change leaves behind.
 * FSRS skips the last two, since they carry no answer; they keep the change visible in card
 * info and survive an export.
 */
export function logManualEntry(
    card: AnkiCard,
    kind: 'reset' | 'manual' | 'rescheduled',
    newIvl: number,
    lastIvl: number,
    factor: number = 0,
): ReviewLog {
    const entry: ReviewLog = {
        id: uniqueId(),
        cardId: card.id,
        usn: -1,
        ease: 0,
        ivl: newIvl,
        lastIvl,
        factor: kind === 'reset' ? 0 : factor,
        time: 0,
        type: kind === 'rescheduled' ? 5 : 4,
    };

    getDB().runSync(
        `INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        entry.id, entry.cardId, entry.usn, entry.ease,
        entry.ivl, entry.lastIvl, entry.factor, entry.time, entry.type,
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

/** Get today's total study time in milliseconds (sum of review times) */
export function getTodayStudyTimeMs(rolloverHour: number = 4): number {
    const db = getDB();
    const startMs = startOfStudyDayMs(Date.now(), rolloverHour);
    const row = db.getFirstSync<{ total: number }>(
        'SELECT COALESCE(SUM(time), 0) as total FROM revlog WHERE id >= ? AND ease != 0',
        startMs,
    );
    return row?.total || 0;
}

/** Get today's review count */
export function getTodayReviewCount(rolloverHour: number = 4): number {
    const db = getDB();
    const startMs = startOfStudyDayMs(Date.now(), rolloverHour);
    const row = db.getFirstSync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM revlog WHERE id >= ? AND ease != 0',
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
             FROM revlog WHERE id >= ? AND ease != 0 AND cardId IN (${placeholders})`,
            startMs, ...cardIds,
        );
        const introduced = db.getFirstSync<{ cnt: number }>(
            `SELECT COUNT(*) AS cnt
             FROM (
                SELECT cardId, MIN(id) AS firstReview
                FROM revlog
                WHERE ease != 0 AND cardId IN (${placeholders})
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
             WHERE r.id >= ? AND r.ease != 0 AND (d.name = ? OR d.name LIKE ? ESCAPE '\\')`,
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
         FROM revlog WHERE id >= ? AND ease != 0`,
        startMs,
    );

    const introduced = db.getFirstSync<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM (SELECT cardId, MIN(id) AS firstReview FROM revlog WHERE ease != 0 GROUP BY cardId)
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
            WHERE r.ease != 0 AND (d.name = ? OR d.name LIKE ? ESCAPE '\\')
            GROUP BY r.cardId
         )
         WHERE firstReview >= ?`,
        deckName,
        escapedPrefix,
        startMs,
    );

    return row?.cnt ?? 0;
}

/**
 * Average time one answer has been taking recently, in milliseconds — the pace the reviewer's
 * remaining-time estimate is built on. Anki derives the same figure from the review log rather
 * than from a session counter, so it survives restarts and reflects how the learner actually
 * works. Manual reschedules (type 4) carry no answer time and are excluded.
 *
 * Returns null when the log holds nothing to average, which is the reviewer's cue to show no
 * estimate at all instead of inventing a pace.
 */
export function getAverageAnswerMs(rolloverHour: number = 4, days: number = 7): number | null {
    const db = getDB();
    const windowDays = Math.max(1, Math.floor(days) || 1);
    const cutoffMs = startOfStudyDayMs(Date.now(), rolloverHour) - (windowDays - 1) * 86_400_000;

    const row = db.getFirstSync<{ average: number | null; samples: number }>(
        `SELECT AVG(time) AS average, COUNT(*) AS samples
         FROM revlog
         WHERE id >= ? AND ease != 0 AND time > 0`,
        cutoffMs,
    );

    if (!row || !row.samples || row.average === null) return null;
    return Math.max(0, Math.round(Number(row.average)));
}

/**
 * How much of today's daily allowance a deck has already spent.
 *
 * Anki keeps `newToday` / `revToday` counters on every deck and subtracts them from the deck's
 * limits, which is what makes "Maximum reviews/day" hold for the rest of the day instead of
 * refilling on the next queue rebuild. This app has no per-deck counters, so the same numbers are
 * derived from the review log: a card's first-ever answer today introduced a new card, and an
 * answer logged as a review (type 1) spent a review slot.
 */
export interface DailyLimitUsage {
    newIntroduced: number;
    reviewsAnswered: number;
}

export const EMPTY_DAILY_LIMIT_USAGE: DailyLimitUsage = { newIntroduced: 0, reviewsAnswered: 0 };

/**
 * Today's spent allowance for every deck that has one, keyed by deck id. Cards answered in a deck
 * and moved elsewhere afterwards count where they live now, exactly as Anki's counters would after
 * the move. Two grouped queries cover the whole collection, so callers can build a deck tree
 * without a query per node.
 */
export function getTodayLimitUsageByDeck(rolloverHour: number = 4): Map<number, DailyLimitUsage> {
    const db = getDB();
    const startMs = startOfStudyDayMs(Date.now(), rolloverHour);
    const usage = new Map<number, DailyLimitUsage>();

    const entryFor = (deckId: number): DailyLimitUsage => {
        let entry = usage.get(deckId);
        if (!entry) {
            entry = { newIntroduced: 0, reviewsAnswered: 0 };
            usage.set(deckId, entry);
        }
        return entry;
    };

    try {
        for (const row of db.getAllSync<{ deckId: number; cnt: number }>(
            `SELECT c.deckId AS deckId, COUNT(*) AS cnt
             FROM (SELECT cardId, MIN(id) AS firstReview FROM revlog WHERE ease != 0 GROUP BY cardId) f
             JOIN anki_cards c ON c.id = f.cardId
             WHERE f.firstReview >= ?
             GROUP BY c.deckId`,
            startMs,
        )) entryFor(Number(row.deckId)).newIntroduced = Number(row.cnt) || 0;

        for (const row of db.getAllSync<{ deckId: number; cnt: number }>(
            `SELECT c.deckId AS deckId, COUNT(*) AS cnt
             FROM revlog r
             JOIN anki_cards c ON c.id = r.cardId
             WHERE r.id >= ? AND r.type = 1
             GROUP BY c.deckId`,
            startMs,
        )) entryFor(Number(row.deckId)).reviewsAnswered = Number(row.cnt) || 0;
    } catch (error) {
        // A collection mid-migration must not block the deck list; an empty map simply means
        // "nothing spent yet", which is the same answer as before the counters existed.
        console.warn('[Revlog] daily limit usage unavailable:', error);
        return new Map();
    }

    return usage;
}

/**
 * Reviews answered today in a deck subtree — the number Anki subtracts from "Maximum reviews/day".
 * Only answers on cards that were already in review state count; learning and relearning steps
 * are not review slots.
 */
export function getReviewsAnsweredTodayInDeck(deckName: string, rolloverHour: number = 4): number {
    const db = getDB();
    const startMs = startOfStudyDayMs(Date.now(), rolloverHour);
    const escapedPrefix = `${deckName.replace(/[\\%_]/g, (ch) => `\\${ch}`)}::%`;

    const row = db.getFirstSync<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM revlog r
         JOIN anki_cards c ON c.id = r.cardId
         JOIN decks d ON d.id = c.deckId
         WHERE r.id >= ? AND r.type = 1 AND (d.name = ? OR d.name LIKE ? ESCAPE '\\')`,
        startMs,
        deckName,
        escapedPrefix,
    );

    return row?.cnt ?? 0;
}

/** Reviews answered today across the whole collection. */
export function getReviewsAnsweredToday(rolloverHour: number = 4): number {
    const db = getDB();
    const startMs = startOfStudyDayMs(Date.now(), rolloverHour);
    const row = db.getFirstSync<{ cnt: number }>(
        'SELECT COUNT(*) AS cnt FROM revlog WHERE id >= ? AND type = 1',
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

    // Same rollover-shifted local date as studyDaySql in ankiStats.ts, so the streak, the
    // statistics charts and localDayNumber all agree on where a study day starts.
    const rows = db.getAllSync<{ d: string }>(
        `SELECT DISTINCT date(id / 1000 - ?, 'unixepoch', 'localtime') AS d
         FROM revlog WHERE ease != 0 ORDER BY d ASC`,
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
 * getStudyStreak and the statistics charts, so a 2 AM answer belongs to the previous
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
         FROM revlog WHERE id >= ? AND id < ? AND ease != 0`,
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

/**
 * Put a revlog row back under its original id.
 *
 * Undo restores history rather than rewriting it, so a row an undone action had written comes
 * back with the same id and timestamp when the action is redone.
 */
export function restoreReviewLog(entry: ReviewLog): void {
    getDB().runSync(
        `INSERT OR REPLACE INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        entry.id, entry.cardId, entry.usn, entry.ease,
        entry.ivl, entry.lastIvl, entry.factor, entry.time, entry.type,
    );
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
