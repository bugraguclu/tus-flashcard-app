/**
 * The read model behind the Statistics screen. `getAnkiStatsSnapshot` feeds the Future Due,
 * Answer Buttons, Review Intervals and Card Counts cards; the per-day history, hourly and per-deck
 * queries after it feed Reviews, Added, Hourly Breakdown and the deck rows. Everything is
 * aggregated in SQL and pinned by `lib/ankiStats.test.ts`.
 */

import { dayNumberToYmd, localDayNumber, nextRolloverMs } from './ankiState';
import { getDB } from './db';
import { MATURE_MIN_IVL } from './statsHelpers';

const DAY_MS = 86_400_000;

export type StatsRangeKey = 'week' | 'month' | 'threeMonths' | 'year' | 'all' | 'custom';

export interface StatsDateRange {
    startMs: number;
    endMs: number;
    /** Calendar days the range covers, or null for all history. */
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
    /** Future due points including overdue cards ahead of today. */
    futureDueWithBacklog: StatsSeriesPoint[];
    futureDueWithBacklogTotal: number;
    futureDueWithBacklogTodayIndex: number;
    futureDueBacklogTotal: number;
    /** Cards already overdue. Only counted when the backlog is being shown. */
    backlogTotal: number;
    dueTomorrow: number;
    dailyLoad: number;
    answerButtons: AnswerButtonPoint[];
    intervals: StatsSeriesPoint[];
    averageInterval: number;
    longestInterval: number;
    cardCounts: CardCountStats;
}

/** One study day of answers, split the way Anki's Reviews graph splits them. */
export interface ReviewDay {
    day: number;
    learn: number;
    relearn: number;
    young: number;
    mature: number;
    filtered: number;
    learnMs: number;
    relearnMs: number;
    youngMs: number;
    matureMs: number;
    filteredMs: number;
}

export interface AddedDay {
    day: number;
    count: number;
}

export interface HourBucket {
    hour: number;
    total: number;
    correct: number;
}

export interface DeckTypeCounts {
    total: number;
    newCards: number;
    learn: number;
    young: number;
    mature: number;
}

function dateAtRollover(date: Date, rolloverHour: number): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), rolloverHour, 0, 0, 0).getTime();
}

/** Start of the study day `nowMs` falls in, counted in calendar days so a DST change cannot shift it. */
function currentStudyDayStart(nowMs: number, rolloverHour: number): number {
    const now = new Date(nowMs);
    const candidate = dateAtRollover(now, rolloverHour);
    if (candidate <= nowMs) return candidate;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, rolloverHour, 0, 0, 0).getTime();
}

/**
 * The time range a period chart covers. A relative range runs to the end of the current study
 * day rather than to the moment it was computed, so answers given after the screen opened still
 * fall inside it.
 */
export function resolveStatsDateRange(
    key: StatsRangeKey,
    customStart: Date,
    customEnd: Date,
    rolloverHour: number,
    nowMs: number = Date.now(),
): StatsDateRange {
    const endOfToday = nextRolloverMs(nowMs, rolloverHour);
    if (key === 'all') return { startMs: 0, endMs: endOfToday, spanDays: null };

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
    const start = new Date(todayStart);
    return {
        startMs: new Date(start.getFullYear(), start.getMonth(), start.getDate() - (days - 1), rolloverHour).getTime(),
        endMs: endOfToday,
        spanDays: days,
    };
}

/** The study days a range covers, inclusive, as day numbers. */
export function rangeStudyDays(range: StatsDateRange, rolloverHour: number, firstDataDay: number | null): {
    firstDay: number;
    lastDay: number;
} {
    const lastDay = localDayNumber(Math.max(range.startMs, range.endMs - 1), rolloverHour);
    if (range.spanDays === null) {
        return { firstDay: Math.min(firstDataDay ?? lastDay, lastDay), lastDay };
    }
    return { firstDay: localDayNumber(range.startMs, rolloverHour), lastDay };
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

/** The card join a revlog query needs before `deckClause` can narrow it to a deck. */
function revlogCardJoin(deckName: string | null, scopedCardIds?: number[]): string {
    return deckName || scopedCardIds !== undefined ? 'JOIN anki_cards c ON c.id = r.cardId' : '';
}

/**
 * The study day, as a day number, that an epoch-milliseconds expression falls in. Takes one
 * parameter: the rollover shift in seconds.
 */
function studyDaySql(msExpression: string): string {
    return `CAST(julianday(date((${msExpression}) / 1000 - ?, 'unixepoch', 'localtime')) - 2440587.5 AS INTEGER)`;
}

/** When a card was added here; an imported card's id records when it was made in Anki instead. */
const CARD_ADDED_MS = 'COALESCE(NULLIF(c.created_at, 0), c.id)';

function toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseYmd(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
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

function getAnswerButtons(deckName: string | null, range: StatsDateRange, scopedCardIds?: number[]): AnswerButtonPoint[] {
    const db = getDB();
    const deck = deckClause(deckName, 'c', scopedCardIds);
    const rows = db.getAllSync<{ ease: 1 | 2 | 3 | 4; category: 0 | 1 | 2; count: number }>(
        `SELECT r.ease AS ease,
                CASE WHEN r.type IN (0, 2) THEN 0 WHEN r.lastIvl < ${MATURE_MIN_IVL} THEN 1 ELSE 2 END AS category,
                COUNT(*) AS count
         FROM revlog r
         ${revlogCardJoin(deckName, scopedCardIds)}
         ${deck.join}
         WHERE r.ease != 0 AND r.id >= ? AND r.id < ? ${deck.where}
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

export function getAnkiStatsSnapshot(
    deckName: string | null,
    range: StatsDateRange,
    rolloverHour: number,
    localeTag: string,
    scopedCardIds?: number[],
    options?: { includeBacklog?: boolean },
): AnkiStatsSnapshot {
    const futureWithoutBacklog = getFutureDue(
        deckName, range, rolloverHour, localeTag, scopedCardIds, false,
    );
    const futureWithBacklog = getFutureDue(
        deckName, range, rolloverHour, localeTag, scopedCardIds, true,
    );
    const future = options?.includeBacklog ? futureWithBacklog : futureWithoutBacklog;
    const intervals = getIntervals(deckName, range, localeTag, scopedCardIds);
    return {
        futureDue: future.points,
        futureDueTotal: future.total,
        futureDueTodayIndex: future.todayIndex,
        futureDueWithBacklog: futureWithBacklog.points,
        futureDueWithBacklogTotal: futureWithBacklog.total,
        futureDueWithBacklogTodayIndex: futureWithBacklog.todayIndex,
        futureDueBacklogTotal: futureWithBacklog.backlogTotal,
        backlogTotal: future.backlogTotal,
        dueTomorrow: futureWithBacklog.dueTomorrow,
        dailyLoad: futureWithBacklog.dailyLoad,
        answerButtons: getAnswerButtons(deckName, range, scopedCardIds),
        intervals: intervals.points,
        averageInterval: intervals.average,
        longestInterval: intervals.longest,
        cardCounts: getCardCounts(deckName, scopedCardIds),
    };
}

/**
 * Every study day with answers, split by kind: learning, relearning, young and mature reviews (by
 * the interval the card was answered at) and filtered-deck answers. Manual rescheduling rows carry
 * no rating and are left out. The screen buckets these days by the chosen range.
 */
export function getReviewDays(deckName: string | null, rolloverHour: number, scopedCardIds?: number[]): ReviewDay[] {
    const db = getDB();
    const deck = deckClause(deckName, 'c', scopedCardIds);
    const young = `r.type = 1 AND r.lastIvl < ${MATURE_MIN_IVL}`;
    const mature = `r.type = 1 AND r.lastIvl >= ${MATURE_MIN_IVL}`;
    const rows = db.getAllSync<Record<string, number>>(
        `SELECT ${studyDaySql('r.id')} AS day,
                SUM(CASE WHEN r.type = 0 THEN 1 ELSE 0 END) AS learn,
                SUM(CASE WHEN r.type = 2 THEN 1 ELSE 0 END) AS relearn,
                SUM(CASE WHEN ${young} THEN 1 ELSE 0 END) AS young,
                SUM(CASE WHEN ${mature} THEN 1 ELSE 0 END) AS mature,
                SUM(CASE WHEN r.type = 3 THEN 1 ELSE 0 END) AS filtered,
                SUM(CASE WHEN r.type = 0 THEN r.time ELSE 0 END) AS learnMs,
                SUM(CASE WHEN r.type = 2 THEN r.time ELSE 0 END) AS relearnMs,
                SUM(CASE WHEN ${young} THEN r.time ELSE 0 END) AS youngMs,
                SUM(CASE WHEN ${mature} THEN r.time ELSE 0 END) AS matureMs,
                SUM(CASE WHEN r.type = 3 THEN r.time ELSE 0 END) AS filteredMs
         FROM revlog r
         ${revlogCardJoin(deckName, scopedCardIds)}
         ${deck.join}
         WHERE r.ease BETWEEN 1 AND 4 AND r.type BETWEEN 0 AND 3 ${deck.where}
         GROUP BY day
         ORDER BY day`,
        rolloverHour * 3600, ...deck.params,
    );
    return rows.map((row) => ({
        day: toNumber(row.day),
        learn: toNumber(row.learn),
        relearn: toNumber(row.relearn),
        young: toNumber(row.young),
        mature: toNumber(row.mature),
        filtered: toNumber(row.filtered),
        learnMs: toNumber(row.learnMs),
        relearnMs: toNumber(row.relearnMs),
        youngMs: toNumber(row.youngMs),
        matureMs: toNumber(row.matureMs),
        filteredMs: toNumber(row.filteredMs),
    }));
}

/** Cards by the study day they were added here. */
export function getAddedDays(deckName: string | null, rolloverHour: number, scopedCardIds?: number[]): AddedDay[] {
    const db = getDB();
    const deck = deckClause(deckName, 'c', scopedCardIds);
    const rows = db.getAllSync<{ day: number; count: number }>(
        `SELECT ${studyDaySql(CARD_ADDED_MS)} AS day, COUNT(*) AS count
         FROM anki_cards c ${deck.join}
         WHERE 1 = 1 ${deck.where}
         GROUP BY day
         ORDER BY day`,
        rolloverHour * 3600, ...deck.params,
    );
    return rows.map((row) => ({ day: toNumber(row.day), count: toNumber(row.count) }));
}

/**
 * The decks holding the cards added on study days `firstDay`…`lastDay`, so a tapped bar of the
 * Added graph can open the browser in the deck those cards went into.
 */
export function getAddedCardDeckNames(
    deckName: string | null,
    firstDay: number,
    lastDay: number,
    rolloverHour: number,
    scopedCardIds?: number[],
): string[] {
    const db = getDB();
    const deck = deckClause(deckName, 'c', scopedCardIds);
    const rows = db.getAllSync<{ name: string }>(
        `SELECT DISTINCT home.name AS name
         FROM anki_cards c
         JOIN decks home ON home.id = c.deckId
         ${deck.join}
         WHERE ${studyDaySql(CARD_ADDED_MS)} BETWEEN ? AND ? ${deck.where}
         ORDER BY home.name`,
        rolloverHour * 3600, firstDay, lastDay, ...deck.params,
    );
    return rows.map((row) => row.name);
}

/**
 * Answers by hour of the day, in local clock time. Filtered-deck answers are left out, as Anki
 * leaves them out: a cram session says nothing about when recall works best.
 */
export function getHourBreakdown(deckName: string | null, range: StatsDateRange, scopedCardIds?: number[]): HourBucket[] {
    const db = getDB();
    const deck = deckClause(deckName, 'c', scopedCardIds);
    const rows = db.getAllSync<{ hour: number; total: number; correct: number }>(
        `SELECT CAST(strftime('%H', r.id / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hour,
                COUNT(*) AS total,
                SUM(CASE WHEN r.ease > 1 THEN 1 ELSE 0 END) AS correct
         FROM revlog r
         ${revlogCardJoin(deckName, scopedCardIds)}
         ${deck.join}
         WHERE r.ease BETWEEN 1 AND 4 AND r.type BETWEEN 0 AND 2
           AND r.id >= ? AND r.id < ? ${deck.where}
         GROUP BY hour`,
        range.startMs, range.endMs, ...deck.params,
    );
    const hours: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, correct: 0 }));
    for (const row of rows) {
        const hour = toNumber(row.hour);
        if (hour < 0 || hour > 23) continue;
        hours[hour] = { hour, total: toNumber(row.total), correct: toNumber(row.correct) };
    }
    return hours;
}

/**
 * Cards per deck by type, for the per-deck progress rows. A suspended or buried card counts as the
 * type it is — a suspended new card has not been studied — and a card lent to a filtered deck is
 * counted in the deck it will return to.
 */
export function getDeckTypeCounts(): Map<number, DeckTypeCounts> {
    const rows = getDB().getAllSync<{ deckId: number } & DeckTypeCounts>(
        `SELECT deckId,
                COUNT(*) AS total,
                SUM(CASE WHEN type = 0 THEN 1 ELSE 0 END) AS newCards,
                SUM(CASE WHEN type IN (1, 3) THEN 1 ELSE 0 END) AS learn,
                SUM(CASE WHEN type = 2 AND ivl < ${MATURE_MIN_IVL} THEN 1 ELSE 0 END) AS young,
                SUM(CASE WHEN type = 2 AND ivl >= ${MATURE_MIN_IVL} THEN 1 ELSE 0 END) AS mature
         FROM (
             SELECT c.type AS type, c.ivl AS ivl,
                    CASE WHEN json_valid(c.data)
                         THEN COALESCE(NULLIF(json_extract(c.data, '$.odid'), 0), c.deckId)
                         ELSE c.deckId END AS deckId
             FROM anki_cards c
         )
         GROUP BY deckId`,
    );
    return new Map(rows.map((row) => [toNumber(row.deckId), {
        total: toNumber(row.total),
        newCards: toNumber(row.newCards),
        learn: toNumber(row.learn),
        young: toNumber(row.young),
        mature: toNumber(row.mature),
    }]));
}
