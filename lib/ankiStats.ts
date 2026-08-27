import { dayNumberToYmd, localDayNumber } from './ankiState';
import { getDB } from './db';
import { MATURE_MIN_IVL } from './statsHelpers';

const DAY_MS = 86_400_000;

export type StatsRangeKey = 'week' | 'month' | 'threeMonths' | 'year' | 'all' | 'custom';

export interface StatsDateRange {
    startMs: number;
    endMs: number;
    spanDays: number | null;
}

export interface StatsSeriesPoint {
    label: string;
    values: number[];
}

export interface AnswerButtonPoint {
    ease: 1 | 2 | 3 | 4;
    learning: number;
    young: number;
    mature: number;
}

export interface CardCountStats {
    mature: number;
    youngLearn: number;
    unseen: number;
    suspendedBuried: number;
    totalCards: number;
    totalNotes: number;
}

export interface AnkiStatsSnapshot {
    futureDue: StatsSeriesPoint[];
    futureDueTotal: number;
    /** Index of the bucket holding today, so the chart can rule off the backlog. */
    futureDueTodayIndex: number;
    /** Cards already overdue. Only counted when the backlog is being shown. */
    backlogTotal: number;
    dueTomorrow: number;
    dailyLoad: number;
    reviews: StatsSeriesPoint[];
    /** The same buckets as `reviews`, but each series holds minutes instead of card counts. */
    reviewMinutes: StatsSeriesPoint[];
    reviewTotal: number;
    reviewTimeMs: number;
    daysStudied: number;
    answerButtons: AnswerButtonPoint[];
    intervals: StatsSeriesPoint[];
    averageInterval: number;
    longestInterval: number;
    cardCounts: CardCountStats;
    added: StatsSeriesPoint[];
    addedTotal: number;
    /** Calendar span used by the Added graph's daily average, including all-history mode. */
    addedSpanDays: number;
}

type DailyReviewRow = {
    day: string;
    learning: number;
    young: number;
    mature: number;
    relearning: number;
    filtered: number;
    learningMs: number;
    youngMs: number;
    matureMs: number;
    relearningMs: number;
    filteredMs: number;
    timeMs: number;
};

type DailyCountRow = { day: string; count: number };

function dateAtRollover(date: Date, rolloverHour: number): number {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        rolloverHour,
        0,
        0,
        0,
    ).getTime();
}

function currentStudyDayStart(nowMs: number, rolloverHour: number): number {
    const now = new Date(nowMs);
    const candidate = dateAtRollover(now, rolloverHour);
    if (candidate <= nowMs) return candidate;
    const previous = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, rolloverHour, 0, 0, 0);
    return previous.getTime();
}

export function resolveStatsDateRange(
    key: StatsRangeKey,
    customStart: Date,
    customEnd: Date,
    rolloverHour: number,
    nowMs: number = Date.now(),
): StatsDateRange {
    if (key === 'all') return { startMs: 0, endMs: nowMs + 1, spanDays: null };

    if (key === 'custom') {
        const startMs = dateAtRollover(customStart, rolloverHour);
        const endMs = dateAtRollover(customEnd, rolloverHour) + DAY_MS;
        return {
            startMs: Math.min(startMs, endMs - DAY_MS),
            endMs: Math.max(startMs + DAY_MS, endMs),
            spanDays: Math.max(1, Math.round((endMs - startMs) / DAY_MS)),
        };
    }

    const days = key === 'week' ? 7 : key === 'month' ? 31 : key === 'threeMonths' ? 90 : 365;
    const todayStart = currentStudyDayStart(nowMs, rolloverHour);
    return {
        startMs: todayStart - (days - 1) * DAY_MS,
        endMs: nowMs + 1,
        spanDays: days,
    };
}

function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function deckClause(deckName: string | null, cardAlias: string = 'c', scopedCardIds?: number[]) {
    if (scopedCardIds !== undefined) {
        const cardIds = [...new Set(scopedCardIds.filter(Number.isFinite).map(Math.trunc))];
        if (cardIds.length === 0) return { join: '', where: 'AND 1 = 0', params: [] as unknown[] };
        return {
            join: '',
            where: `AND ${cardAlias}.id IN (${cardIds.map(() => '?').join(', ')})`,
            params: cardIds,
        };
    }
    if (!deckName) return { join: '', where: '', params: [] as unknown[] };
    return {
        join: `JOIN decks d ON d.id = ${cardAlias}.deckId`,
        where: `AND (d.name = ? OR d.name LIKE ? ESCAPE '\\')`,
        params: [deckName, `${escapeLikePattern(deckName)}::%`],
    };
}

function parseYmd(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
}

type TimeBucketUnit = 'day' | 'week' | 'month' | 'year';

function chooseHistoryUnit(spanDays: number | null, rows: { day: string }[]): TimeBucketUnit {
    if (spanDays !== null) {
        if (spanDays <= 35) return 'day';
        if (spanDays <= 180) return 'week';
        return 'month';
    }
    if (rows.length < 2) return 'month';
    const first = parseYmd(rows[0].day).getTime();
    const last = parseYmd(rows[rows.length - 1].day).getTime();
    return (last - first) / DAY_MS > 1_100 ? 'year' : 'month';
}

function bucketIdentity(date: Date, unit: TimeBucketUnit, firstDate: Date): string {
    if (unit === 'day') return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (unit === 'week') return `w${Math.floor((date.getTime() - firstDate.getTime()) / (7 * DAY_MS))}`;
    if (unit === 'month') return `${date.getFullYear()}-${date.getMonth()}`;
    return `${date.getFullYear()}`;
}

function bucketLabel(date: Date, unit: TimeBucketUnit, localeTag: string): string {
    if (unit === 'day') return date.toLocaleDateString(localeTag, { day: 'numeric', month: 'short' });
    if (unit === 'week') return date.toLocaleDateString(localeTag, { day: 'numeric', month: 'short' });
    if (unit === 'month') return date.toLocaleDateString(localeTag, { month: 'short', year: '2-digit' });
    return String(date.getFullYear());
}

function bucketDailyRows<T extends { day: string }>(
    rows: T[],
    range: StatsDateRange,
    localeTag: string,
    valuesForRow: (row: T) => number[],
): StatsSeriesPoint[] {
    if (rows.length === 0) return [];
    const unit = chooseHistoryUnit(range.spanDays, rows);
    const firstDataDate = parseYmd(rows[0].day);
    const firstDate = range.spanDays === null
        ? firstDataDate
        : new Date(new Date(range.startMs).getFullYear(), new Date(range.startMs).getMonth(), new Date(range.startMs).getDate(), 12);
    const endInstant = new Date(Math.max(range.startMs, range.endMs - 1));
    const lastDate = range.spanDays === null
        ? new Date(endInstant.getFullYear(), endInstant.getMonth(), endInstant.getDate(), 12)
        : new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate() + range.spanDays - 1, 12);
    const grouped = new Map<string, { date: Date; values: number[] }>();
    const valueCount = valuesForRow(rows[0]).length;

    // Materialize empty buckets as well as buckets containing data. Otherwise a seven-day
    // selection with activity on one day renders as a single, visually static bar and its axis
    // no longer describes the selected period.
    let cursor = new Date(firstDate);
    while (cursor.getTime() <= lastDate.getTime()) {
        const key = bucketIdentity(cursor, unit, firstDate);
        if (!grouped.has(key)) grouped.set(key, { date: new Date(cursor), values: Array(valueCount).fill(0) });
        if (unit === 'day') cursor.setDate(cursor.getDate() + 1);
        else if (unit === 'week') cursor.setDate(cursor.getDate() + 7);
        else if (unit === 'month') cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12);
        else cursor = new Date(cursor.getFullYear() + 1, 0, 1, 12);
    }

    for (const row of rows) {
        const date = parseYmd(row.day);
        const key = bucketIdentity(date, unit, firstDate);
        const values = valuesForRow(row);
        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, { date, values: [...values] });
            continue;
        }
        values.forEach((value, index) => { existing.values[index] = (existing.values[index] ?? 0) + value; });
    }

    return [...grouped.values()].map((bucket) => {
        return {
            label: bucketLabel(bucket.date, unit, localeTag),
            values: bucket.values,
        };
    });
}

function futureHorizonDays(range: StatsDateRange, maxFutureDay: number): number {
    if (range.spanDays !== null) return Math.max(7, range.spanDays);
    return Math.max(31, Math.min(3_650, maxFutureDay + 1));
}

/** How far back the backlog view reaches; Anki caps it at a year of overdue cards. */
const MAX_BACKLOG_DAYS = 365;

function getFutureDue(
    deckName: string | null,
    range: StatsDateRange,
    rolloverHour: number,
    localeTag: string,
    scopedCardIds?: number[],
    includeBacklog: boolean = false,
) {
    const db = getDB();
    const today = localDayNumber(Date.now(), rolloverHour);
    const deck = deckClause(deckName, 'c', scopedCardIds);
    const maxRow = db.getFirstSync<{ maxDay: number | null }>(
        `SELECT MAX(c.due - ?) AS maxDay
         FROM anki_cards c ${deck.join}
         WHERE c.queue IN (2, 3) AND c.due >= ? ${deck.where}`,
        today, today, ...deck.params,
    );
    const horizon = futureHorizonDays(range, Math.max(0, maxRow?.maxDay ?? 0));

    // Anki's backlog checkbox extends the same chart to the left: overdue cards keep their real
    // due day, so they pile up in negative buckets ahead of today rather than being folded into
    // it. Without the checkbox the chart starts at today, exactly as Anki draws it.
    const oldestRow = includeBacklog
        ? db.getFirstSync<{ minDay: number | null }>(
            `SELECT MIN(c.due - ?) AS minDay
             FROM anki_cards c ${deck.join}
             WHERE c.queue IN (2, 3) AND c.due < ? ${deck.where}`,
            today, today, ...deck.params,
        )
        : null;
    const backlogDays = includeBacklog
        ? Math.min(MAX_BACKLOG_DAYS, Math.max(0, -(oldestRow?.minDay ?? 0)))
        : 0;

    const span = horizon + backlogDays;
    const chunk = span <= 35 ? 1 : span <= 180 ? 7 : span <= 730 ? 14 : 31;
    // Bucket 0 starts at the oldest day shown, so today keeps a whole bucket boundary.
    const firstDay = -Math.ceil(backlogDays / chunk) * chunk;
    const bucketCount = Math.ceil((horizon - firstDay) / chunk);
    const rows = db.getAllSync<{ bucket: number; young: number; mature: number }>(
        `SELECT CAST((c.due - ?) / ? AS INTEGER) AS bucket,
                SUM(CASE WHEN c.ivl < ${MATURE_MIN_IVL} THEN 1 ELSE 0 END) AS young,
                SUM(CASE WHEN c.ivl >= ${MATURE_MIN_IVL} THEN 1 ELSE 0 END) AS mature
         FROM anki_cards c ${deck.join}
         WHERE c.queue IN (2, 3) AND c.due >= ? AND c.due < ? ${deck.where}
         GROUP BY bucket ORDER BY bucket`,
        today + firstDay, chunk, today + firstDay, today + horizon, ...deck.params,
    );

    const rowByBucket = new Map(rows.map((row) => [row.bucket, row]));
    const points = Array.from({ length: bucketCount }, (_, bucket) => {
        const row = rowByBucket.get(bucket);
        const values = [row?.young ?? 0, row?.mature ?? 0];
        const dayOffset = firstDay + bucket * chunk;
        const date = parseYmd(dayNumberToYmd(today + dayOffset, rolloverHour));
        return {
            label: date.toLocaleDateString(localeTag, { day: 'numeric', month: 'short' }),
            values,
        };
    });
    const todayIndex = Math.round(-firstDay / chunk);
    const backlogTotal = points
        .slice(0, todayIndex)
        .reduce((sum, point) => sum + point.values[0] + point.values[1], 0);

    const dueTomorrow = db.getFirstSync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM anki_cards c ${deck.join}
         WHERE c.queue IN (2, 3) AND c.due = ? ${deck.where}`,
        today + 1, ...deck.params,
    )?.count ?? 0;
    const dailyLoad = db.getFirstSync<{ load: number }>(
        `SELECT COALESCE(SUM(1.0 / CASE WHEN c.ivl < 1 THEN 1 ELSE c.ivl END), 0) AS load
         FROM anki_cards c ${deck.join}
         WHERE c.queue IN (2, 3) ${deck.where}`,
        ...deck.params,
    )?.load ?? 0;

    const total = points.reduce(
        (sum, point) => sum + point.values.reduce((pointSum, value) => pointSum + value, 0),
        0,
    );
    return { points, total, dueTomorrow, dailyLoad, todayIndex, backlogTotal };
}

function getReviews(deckName: string | null, range: StatsDateRange, rolloverHour: number, localeTag: string, scopedCardIds?: number[]) {
    const db = getDB();
    const deck = deckClause(deckName, 'c', scopedCardIds);
    const rows = db.getAllSync<DailyReviewRow>(
        `SELECT date(r.id / 1000 - ?, 'unixepoch', 'localtime') AS day,
                SUM(CASE WHEN r.type = 0 THEN 1 ELSE 0 END) AS learning,
                SUM(CASE WHEN r.type = 1 AND r.lastIvl < ${MATURE_MIN_IVL} THEN 1 ELSE 0 END) AS young,
                SUM(CASE WHEN r.type = 1 AND r.lastIvl >= ${MATURE_MIN_IVL} THEN 1 ELSE 0 END) AS mature,
                SUM(CASE WHEN r.type = 2 THEN 1 ELSE 0 END) AS relearning,
                SUM(CASE WHEN r.type = 3 THEN 1 ELSE 0 END) AS filtered,
                COALESCE(SUM(CASE WHEN r.type = 0 THEN r.time ELSE 0 END), 0) AS learningMs,
                COALESCE(SUM(CASE WHEN r.type = 1 AND r.lastIvl < ${MATURE_MIN_IVL} THEN r.time ELSE 0 END), 0) AS youngMs,
                COALESCE(SUM(CASE WHEN r.type = 1 AND r.lastIvl >= ${MATURE_MIN_IVL} THEN r.time ELSE 0 END), 0) AS matureMs,
                COALESCE(SUM(CASE WHEN r.type = 2 THEN r.time ELSE 0 END), 0) AS relearningMs,
                COALESCE(SUM(CASE WHEN r.type = 3 THEN r.time ELSE 0 END), 0) AS filteredMs,
                COALESCE(SUM(r.time), 0) AS timeMs
         FROM revlog r
         ${deckName || scopedCardIds !== undefined ? 'JOIN anki_cards c ON c.id = r.cardId' : ''}
         ${deck.join}
         WHERE r.type != 4 AND r.id >= ? AND r.id < ? ${deck.where}
         GROUP BY day ORDER BY day`,
        rolloverHour * 3600,
        range.startMs,
        range.endMs,
        ...deck.params,
    );
    const points = bucketDailyRows(
        rows,
        range,
        localeTag,
        (row) => [row.learning, row.young, row.mature, row.relearning, row.filtered],
    );
    // Anki's "Time" toggle keeps the same buckets and only swaps what is measured in them, so
    // both series are built from one query and share an identical x axis.
    const minutePoints = bucketDailyRows(
        rows,
        range,
        localeTag,
        (row) => [row.learningMs, row.youngMs, row.matureMs, row.relearningMs, row.filteredMs]
            .map((ms) => ms / 60_000),
    );
    return {
        points,
        minutePoints,
        total: rows.reduce((sum, row) => sum + row.learning + row.young + row.mature + row.relearning + row.filtered, 0),
        timeMs: rows.reduce((sum, row) => sum + row.timeMs, 0),
        daysStudied: rows.length,
    };
}

function getAnswerButtons(deckName: string | null, range: StatsDateRange, scopedCardIds?: number[]): AnswerButtonPoint[] {
    const db = getDB();
    const deck = deckClause(deckName, 'c', scopedCardIds);
    const rows = db.getAllSync<{ ease: 1 | 2 | 3 | 4; category: 0 | 1 | 2; count: number }>(
        `SELECT r.ease AS ease,
                CASE WHEN r.type IN (0, 2) THEN 0 WHEN r.lastIvl < ${MATURE_MIN_IVL} THEN 1 ELSE 2 END AS category,
                COUNT(*) AS count
         FROM revlog r
         ${deckName || scopedCardIds !== undefined ? 'JOIN anki_cards c ON c.id = r.cardId' : ''}
         ${deck.join}
         WHERE r.type != 4 AND r.id >= ? AND r.id < ? ${deck.where}
         GROUP BY category, r.ease ORDER BY r.ease, category`,
        range.startMs, range.endMs, ...deck.params,
    );
    const result: AnswerButtonPoint[] = [1, 2, 3, 4].map((ease) => ({
        ease: ease as 1 | 2 | 3 | 4,
        learning: 0,
        young: 0,
        mature: 0,
    }));
    for (const row of rows) {
        const target = result[row.ease - 1];
        if (row.category === 0) target.learning += row.count;
        else if (row.category === 1) target.young += row.count;
        else target.mature += row.count;
    }
    return result;
}

function getIntervals(deckName: string | null, range: StatsDateRange, localeTag: string, scopedCardIds?: number[]) {
    const db = getDB();
    const deck = deckClause(deckName, 'c', scopedCardIds);
    const limit = range.spanDays === null ? null : Math.max(1, range.spanDays);
    const maxClause = limit === null ? '' : 'AND c.ivl <= ?';
    const params = limit === null ? deck.params : [limit, ...deck.params];
    const rows = db.getAllSync<{ ivl: number; count: number }>(
        `SELECT c.ivl AS ivl, COUNT(*) AS count
         FROM anki_cards c ${deck.join}
         WHERE c.queue = 2 ${maxClause} ${deck.where}
         GROUP BY c.ivl ORDER BY c.ivl`,
        ...params,
    );
    const summary = db.getFirstSync<{ average: number; longest: number }>(
        `SELECT COALESCE(AVG(c.ivl), 0) AS average, COALESCE(MAX(c.ivl), 0) AS longest
         FROM anki_cards c ${deck.join} WHERE c.queue = 2 ${deck.where}`,
        ...deck.params,
    );
    const chunk = limit === null ? Math.max(1, Math.ceil((summary?.longest ?? 1) / 24)) : limit <= 35 ? 1 : limit <= 180 ? 7 : 14;
    const grouped = new Map<number, number>();
    for (const row of rows) {
        const bucket = Math.floor(row.ivl / chunk) * chunk;
        grouped.set(bucket, (grouped.get(bucket) ?? 0) + row.count);
    }
    const points = [...grouped].map(([bucket, count]) => {
        return {
            label: chunk === 1 ? `${bucket}g` : `${bucket}–${bucket + chunk - 1}g`,
            values: [count],
        };
    });
    void localeTag;
    return { points, average: summary?.average ?? 0, longest: summary?.longest ?? 0 };
}

function getCardCounts(deckName: string | null, scopedCardIds?: number[]): CardCountStats {
    const db = getDB();
    const deck = deckClause(deckName, 'c', scopedCardIds);
    const row = db.getFirstSync<CardCountStats>(
        `SELECT
            COALESCE(SUM(CASE WHEN c.queue = 2 AND c.ivl >= ${MATURE_MIN_IVL} THEN 1 ELSE 0 END), 0) AS mature,
            COALESCE(SUM(CASE WHEN c.queue IN (1, 3) OR (c.queue = 2 AND c.ivl < ${MATURE_MIN_IVL}) THEN 1 ELSE 0 END), 0) AS youngLearn,
            COALESCE(SUM(CASE WHEN c.queue = 0 THEN 1 ELSE 0 END), 0) AS unseen,
            COALESCE(SUM(CASE WHEN c.queue IN (-1, -2, -3) THEN 1 ELSE 0 END), 0) AS suspendedBuried,
            COUNT(c.id) AS totalCards,
            COUNT(DISTINCT c.noteId) AS totalNotes
         FROM anki_cards c ${deck.join} WHERE 1 = 1 ${deck.where}`,
        ...deck.params,
    );
    return row ?? { mature: 0, youngLearn: 0, unseen: 0, suspendedBuried: 0, totalCards: 0, totalNotes: 0 };
}

function getAdded(
    deckName: string | null,
    range: StatsDateRange,
    rolloverHour: number,
    localeTag: string,
    scopedCardIds?: number[],
) {
    const db = getDB();
    const deck = deckClause(deckName, 'c', scopedCardIds);
    const rows = db.getAllSync<DailyCountRow>(
        `SELECT date(COALESCE(NULLIF(c.created_at, 0), c.id) / 1000 - ?, 'unixepoch', 'localtime') AS day,
                COUNT(*) AS count
         FROM anki_cards c ${deck.join}
         WHERE COALESCE(NULLIF(c.created_at, 0), c.id) >= ?
           AND COALESCE(NULLIF(c.created_at, 0), c.id) < ? ${deck.where}
         GROUP BY day ORDER BY day`,
        rolloverHour * 3600, range.startMs, range.endMs, ...deck.params,
    );
    const points = bucketDailyRows(rows, range, localeTag, (row) => [row.count]);
    const firstDay = rows[0]?.day;
    const allHistorySpanDays = firstDay
        ? Math.max(1, Math.floor((range.endMs - parseYmd(firstDay).getTime()) / DAY_MS) + 1)
        : 0;
    return {
        points,
        total: rows.reduce((sum, row) => sum + row.count, 0),
        spanDays: range.spanDays ?? allHistorySpanDays,
    };
}

export function getAnkiStatsSnapshot(
    deckName: string | null,
    range: StatsDateRange,
    rolloverHour: number,
    localeTag: string,
    scopedCardIds?: number[],
    options?: { includeBacklog?: boolean },
): AnkiStatsSnapshot {
    const future = getFutureDue(
        deckName, range, rolloverHour, localeTag, scopedCardIds, options?.includeBacklog,
    );
    const reviews = getReviews(deckName, range, rolloverHour, localeTag, scopedCardIds);
    const intervals = getIntervals(deckName, range, localeTag, scopedCardIds);
    const added = getAdded(deckName, range, rolloverHour, localeTag, scopedCardIds);
    return {
        futureDue: future.points,
        futureDueTotal: future.total,
        futureDueTodayIndex: future.todayIndex,
        backlogTotal: future.backlogTotal,
        dueTomorrow: future.dueTomorrow,
        dailyLoad: future.dailyLoad,
        reviews: reviews.points,
        reviewMinutes: reviews.minutePoints,
        reviewTotal: reviews.total,
        reviewTimeMs: reviews.timeMs,
        daysStudied: reviews.daysStudied,
        answerButtons: getAnswerButtons(deckName, range, scopedCardIds),
        intervals: intervals.points,
        averageInterval: intervals.average,
        longestInterval: intervals.longest,
        cardCounts: getCardCounts(deckName, scopedCardIds),
        added: added.points,
        addedTotal: added.total,
        addedSpanDays: added.spanDays,
    };
}
