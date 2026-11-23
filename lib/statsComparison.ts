/**
 * Side-by-side comparison read model for Statistics: compares either two equal-length study
 * periods (e.g. last 7 study days vs the preceding 7 study days) in one scope, or two decks over
 * the exact same study-day window. Evaluates answers, study time, accuracy and active days
 * together while keeping missing data (`null`) distinct from zero and exposing raw denominators.
 */

import { localDayNumber } from './ankiState';
import type { StatsDateRange } from './ankiStats';
import { getDB } from './db';
import type { SupportedLocale } from './i18n';
import { revlogLocalSecondsSql } from './localClockSql';
import type { Deck } from './models';
import { formatStudyDay, formatStudyDayRange } from './statsPresentation';

const DAY_MS = 86_400_000;

export type ComparisonMode = 'period' | 'deck';
export type ComparisonPeriodPreset = 'week' | 'month' | 'threeMonths';
export type ComparisonChartMetric = 'answers' | 'time' | 'accuracy';

export interface ComparisonPeriodBounds {
    /** Inclusive first study-day index (0 when all-time). */
    firstDay: number;
    /** Inclusive last study-day index. */
    lastDay: number;
    /** Inclusive epoch-ms start at `rolloverHour` (0 when all-time). */
    startMs: number;
    /** Exclusive epoch-ms end at `rolloverHour`. */
    endMs: number;
    /** Exact count of study days covered, or null for all-time deck comparison. */
    spanDays: number | null;
}

export interface ComparisonDayRow {
    day: number;
    answers: number;
    passed: number;
    studyTimeMs: number;
}

export interface ComparisonDailyPoint {
    dayOffset: number;
    day: number;
    answers: number;
    passed: number;
    studyTimeMs: number;
    /** 0–100 accuracy, or null when nothing was answered on this day. */
    accuracyPct: number | null;
}

export interface ComparisonSeriesMetrics {
    answers: number;
    passed: number;
    failed: number;
    studyTimeMs: number;
    studiedDays: number;
    periodDays: number | null;
    /** 0–100 accuracy (`passed / answers`), or null when `answers === 0`. */
    accuracyPct: number | null;
    /** Average seconds per answer, or null when `answers === 0`. */
    secondsPerAnswer: number | null;
    /** Average answers per calendar day in the window, or null when `periodDays === null`. */
    answersPerDay: number | null;
    /** Average study time per calendar day in ms, or null when `periodDays === null`. */
    studyTimePerDayMs: number | null;
    /** One entry per calendar day of a fixed window, ordered 0..spanDays-1. */
    daily: ComparisonDailyPoint[];
}

export interface ComparisonDelta {
    answersDiff: number;
    /** Relative % change from baseline, or null when baseline has 0 answers. */
    answersPctChange: number | null;
    studyTimeDiffMs: number;
    /** Relative % change from baseline, or null when baseline has 0 study time. */
    studyTimePctChange: number | null;
    /** Percentage-point difference (`primary - baseline`), or null when either side lacks data. */
    accuracyDiffPts: number | null;
    studiedDaysDiff: number;
    hasPrimaryData: boolean;
    hasBaselineData: boolean;
}

export interface PairedComparisonBucket {
    /** Compact x-axis label on the shared comparison axis. */
    label: string;
    /** Full date or range of series A in this bucket. */
    detailPrimary: string;
    /** Full date or range of series B in this bucket. */
    detailBaseline: string;
    /** Value plotted for series A, or null when undefined (accuracy with 0 answers). */
    primaryValue: number | null;
    /** Value plotted for series B, or null when undefined (accuracy with 0 answers). */
    baselineValue: number | null;
    primaryAnswers: number;
    primaryPassed: number;
    primaryStudyTimeMs: number;
    baselineAnswers: number;
    baselinePassed: number;
    baselineStudyTimeMs: number;
}

export interface PeriodComparisonResult {
    preset: ComparisonPeriodPreset;
    currentBounds: ComparisonPeriodBounds;
    previousBounds: ComparisonPeriodBounds;
    current: ComparisonSeriesMetrics;
    previous: ComparisonSeriesMetrics;
    delta: ComparisonDelta;
}

export interface DeckComparisonResult {
    bounds: ComparisonPeriodBounds;
    primary: ComparisonSeriesMetrics;
    baseline: ComparisonSeriesMetrics;
    delta: ComparisonDelta;
}

function normalizeRolloverHour(rolloverHour: number): number {
    if (!Number.isFinite(rolloverHour)) return 4;
    return Math.max(0, Math.min(23, Math.trunc(rolloverHour)));
}

function toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

/** Local epoch-ms start of a study day at `rolloverHour:00` (calendar-based, DST-safe). */
export function studyDayStartMs(dayNumber: number, rolloverHour: number): number {
    const hour = normalizeRolloverHour(rolloverHour);
    const utc = new Date(dayNumber * DAY_MS);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), hour, 0, 0, 0).getTime();
}

export function comparisonPresetDays(preset: ComparisonPeriodPreset): number {
    if (preset === 'week') return 7;
    if (preset === 'month') return 30;
    return 90;
}

/**
 * Two contiguous, non-overlapping study-day windows of identical length anchored to the current
 * study day. `previous.endMs === current.startMs`, so every answer belongs to at most one window.
 */
export function resolveEqualComparisonPeriods(
    preset: ComparisonPeriodPreset,
    rolloverHour: number,
    nowMs: number = Date.now(),
): { current: ComparisonPeriodBounds; previous: ComparisonPeriodBounds } {
    const hour = normalizeRolloverHour(rolloverHour);
    const spanDays = comparisonPresetDays(preset);
    const today = localDayNumber(nowMs, hour);

    const currentFirst = today - (spanDays - 1);
    const currentLast = today;
    const previousFirst = currentFirst - spanDays;
    const previousLast = currentFirst - 1;

    const previousStartMs = studyDayStartMs(previousFirst, hour);
    const currentStartMs = studyDayStartMs(currentFirst, hour);
    const currentEndMs = studyDayStartMs(currentLast + 1, hour);

    return {
        current: {
            firstDay: currentFirst,
            lastDay: currentLast,
            startMs: currentStartMs,
            endMs: currentEndMs,
            spanDays,
        },
        previous: {
            firstDay: previousFirst,
            lastDay: previousLast,
            startMs: previousStartMs,
            endMs: currentStartMs,
            spanDays,
        },
    };
}

/** Shared study-day window for comparing two decks under the active statistics range. */
export function resolveDeckComparisonPeriod(
    range: StatsDateRange,
    rolloverHour: number,
): ComparisonPeriodBounds {
    const hour = normalizeRolloverHour(rolloverHour);
    const lastDay = localDayNumber(Math.max(range.startMs, range.endMs - 1), hour);
    if (range.spanDays === null) {
        return {
            firstDay: 0,
            lastDay,
            startMs: 0,
            endMs: range.endMs,
            spanDays: null,
        };
    }
    const firstDay = localDayNumber(range.startMs, hour);
    const spanDays = Math.max(1, lastDay - firstDay + 1);
    return {
        firstDay,
        lastDay,
        startMs: studyDayStartMs(firstDay, hour),
        endMs: studyDayStartMs(lastDay + 1, hour),
        spanDays,
    };
}

/** Aggregate per-day answer rows inside `bounds`, keeping missing data separate from zero. */
export function summarizeComparisonDays(
    rows: readonly ComparisonDayRow[],
    bounds: ComparisonPeriodBounds,
): ComparisonSeriesMetrics {
    const byDay = new Map<number, ComparisonDayRow>();
    let answers = 0;
    let passed = 0;
    let studyTimeMs = 0;
    let studiedDays = 0;

    for (const row of rows) {
        if (bounds.spanDays !== null && row.day < bounds.firstDay) continue;
        if (row.day > bounds.lastDay) continue;
        const rowAnswers = Math.max(0, Math.trunc(row.answers));
        const rowPassed = Math.max(0, Math.min(rowAnswers, Math.trunc(row.passed)));
        const rowTime = Math.max(0, row.studyTimeMs);
        if (rowAnswers <= 0 && rowTime <= 0) continue;

        const existing = byDay.get(row.day);
        if (existing) {
            existing.answers += rowAnswers;
            existing.passed += rowPassed;
            existing.studyTimeMs += rowTime;
        } else {
            byDay.set(row.day, { day: row.day, answers: rowAnswers, passed: rowPassed, studyTimeMs: rowTime });
        }
    }

    for (const row of byDay.values()) {
        if (row.answers <= 0) continue;
        answers += row.answers;
        passed += row.passed;
        studyTimeMs += row.studyTimeMs;
        studiedDays += 1;
    }

    const daily: ComparisonDailyPoint[] = [];
    if (bounds.spanDays !== null) {
        for (let offset = 0; offset < bounds.spanDays; offset++) {
            const day = bounds.firstDay + offset;
            const entry = byDay.get(day);
            const dayAnswers = entry?.answers ?? 0;
            const dayPassed = entry?.passed ?? 0;
            const dayTime = entry?.studyTimeMs ?? 0;
            daily.push({
                dayOffset: offset,
                day,
                answers: dayAnswers,
                passed: dayPassed,
                studyTimeMs: dayTime,
                accuracyPct: dayAnswers > 0 ? (dayPassed / dayAnswers) * 100 : null,
            });
        }
    }

    const failed = Math.max(0, answers - passed);
    return {
        answers,
        passed,
        failed,
        studyTimeMs,
        studiedDays,
        periodDays: bounds.spanDays,
        accuracyPct: answers > 0 ? (passed / answers) * 100 : null,
        secondsPerAnswer: answers > 0 ? studyTimeMs / 1000 / answers : null,
        answersPerDay: bounds.spanDays !== null ? answers / bounds.spanDays : null,
        studyTimePerDayMs: bounds.spanDays !== null ? studyTimeMs / bounds.spanDays : null,
        daily,
    };
}

/** Compare primary series (A) against baseline series (B); missing denominators stay `null`. */
export function compareSeriesMetrics(
    primary: ComparisonSeriesMetrics,
    baseline: ComparisonSeriesMetrics,
): ComparisonDelta {
    const answersDiff = primary.answers - baseline.answers;
    const studyTimeDiffMs = primary.studyTimeMs - baseline.studyTimeMs;
    return {
        answersDiff,
        answersPctChange: baseline.answers > 0 ? (answersDiff / baseline.answers) * 100 : null,
        studyTimeDiffMs,
        studyTimePctChange: baseline.studyTimeMs > 0 ? (studyTimeDiffMs / baseline.studyTimeMs) * 100 : null,
        accuracyDiffPts: primary.accuracyPct !== null && baseline.accuracyPct !== null
            ? primary.accuracyPct - baseline.accuracyPct
            : null,
        studiedDaysDiff: primary.studiedDays - baseline.studiedDays,
        hasPrimaryData: primary.answers > 0,
        hasBaselineData: baseline.answers > 0,
    };
}

function chooseBucketSize(spanDays: number): number {
    if (spanDays <= 10) return 1;
    if (spanDays <= 35) return 5;
    if (spanDays <= 100) return 15;
    return Math.max(1, Math.ceil(spanDays / 12));
}

function bucketMetricValue(
    metric: ComparisonChartMetric,
    answers: number,
    passed: number,
    studyTimeMs: number,
): number | null {
    if (metric === 'answers') return answers;
    if (metric === 'time') return studyTimeMs / 60_000;
    return answers > 0 ? (passed / answers) * 100 : null;
}

/**
 * Group aligned daily points from two equal-length series into paired chart buckets on a shared
 * axis. Accuracy buckets use weighted `passed / answers` and return `null` when `answers === 0`.
 */
export function buildPairedComparisonBuckets(
    primary: ComparisonSeriesMetrics,
    baseline: ComparisonSeriesMetrics,
    metric: ComparisonChartMetric,
    locale: SupportedLocale,
    sameCalendarDays: boolean,
): PairedComparisonBucket[] {
    const length = Math.min(primary.daily.length, baseline.daily.length);
    if (length === 0) return [];
    const bucketSize = chooseBucketSize(length);
    const dayPrefix = locale === 'tr' ? 'G' : 'D';
    const buckets: PairedComparisonBucket[] = [];

    for (let start = 0; start < length; start += bucketSize) {
        const end = Math.min(length - 1, start + bucketSize - 1);
        let pAnswers = 0;
        let pPassed = 0;
        let pTime = 0;
        let bAnswers = 0;
        let bPassed = 0;
        let bTime = 0;

        for (let i = start; i <= end; i++) {
            const p = primary.daily[i];
            const b = baseline.daily[i];
            pAnswers += p.answers;
            pPassed += p.passed;
            pTime += p.studyTimeMs;
            bAnswers += b.answers;
            bPassed += b.passed;
            bTime += b.studyTimeMs;
        }

        const pFirstDay = primary.daily[start].day;
        const pLastDay = primary.daily[end].day;
        const bFirstDay = baseline.daily[start].day;
        const bLastDay = baseline.daily[end].day;

        const label = sameCalendarDays
            ? formatStudyDay(pFirstDay, locale, { day: 'numeric', month: 'short' })
            : start === end
                ? `${dayPrefix}${start + 1}`
                : `${start + 1}–${end + 1}`;

        const detailPrimary = start === end
            ? formatStudyDay(pFirstDay, locale, { day: 'numeric', month: 'short', year: 'numeric' })
            : formatStudyDayRange(pFirstDay, pLastDay, locale);
        const detailBaseline = start === end
            ? formatStudyDay(bFirstDay, locale, { day: 'numeric', month: 'short', year: 'numeric' })
            : formatStudyDayRange(bFirstDay, bLastDay, locale);

        buckets.push({
            label,
            detailPrimary,
            detailBaseline,
            primaryValue: bucketMetricValue(metric, pAnswers, pPassed, pTime),
            baselineValue: bucketMetricValue(metric, bAnswers, bPassed, bTime),
            primaryAnswers: pAnswers,
            primaryPassed: pPassed,
            primaryStudyTimeMs: pTime,
            baselineAnswers: bAnswers,
            baselinePassed: bPassed,
            baselineStudyTimeMs: bTime,
        });
    }

    return buckets;
}

/** Pick a reasonable default second deck for deck comparison (different from `primaryDeckName`). */
export function pickDefaultBaselineDeck(
    decks: readonly Pick<Deck, 'name' | 'isFiltered'>[],
    primaryDeckName: string | null,
): string | null {
    const regular = decks.filter((deck) => !deck.isFiltered && deck.name !== primaryDeckName);
    if (regular.length === 0) return null;
    if (primaryDeckName) {
        const prefix = `${primaryDeckName}::`;
        const sibling = regular.find((deck) => !deck.name.startsWith(prefix) && !primaryDeckName.startsWith(`${deck.name}::`));
        if (sibling) return sibling.name;
    }
    const topLevel = regular.find((deck) => !deck.name.includes('::'));
    return (topLevel ?? regular[0]).name;
}

function buildDeckClause(deckName: string | null, scopedCardIds?: number[]) {
    if (scopedCardIds !== undefined) {
        const cardIds = [...new Set(scopedCardIds.filter(Number.isFinite).map(Math.trunc))];
        if (cardIds.length === 0) return { join: '', where: 'AND 1 = 0', params: [] as unknown[] };
        return {
            join: '',
            where: 'AND c.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))',
            params: [JSON.stringify(cardIds)] as unknown[],
        };
    }
    if (!deckName) return { join: '', where: '', params: [] as unknown[] };
    return {
        join: 'JOIN decks d ON d.id = c.deckId',
        where: 'AND (d.name = ? OR instr(d.name, ?) = 1)',
        params: [deckName, `${deckName}::`] as unknown[],
    };
}

/**
 * Query per-study-day answers, passed answers (`ease > 1`) and study time inside `[startMs, endMs)`.
 * Uses an indexed primary-key range scan on `revlog.id` and mirrors `ankiStats.ts` deck semantics.
 */
export function queryComparisonDays(
    deckName: string | null,
    startMs: number,
    endMs: number,
    rolloverHour: number,
    scopedCardIds?: number[],
): ComparisonDayRow[] {
    const db = getDB();
    const hour = normalizeRolloverHour(rolloverHour);
    const shiftSeconds = hour * 3600;
    const dayExpr = `(${revlogLocalSecondsSql(`(r.id) / 1000 - ${shiftSeconds}`)} / 86400)`;
    const cardJoin = deckName || scopedCardIds !== undefined ? 'JOIN anki_cards c ON c.id = r.cardId' : '';
    const deck = buildDeckClause(deckName, scopedCardIds);

    const rows = db.getAllSync<Record<string, number>>(
        `SELECT ${dayExpr} AS day,
                COUNT(*) AS answers,
                SUM(CASE WHEN r.ease > 1 THEN 1 ELSE 0 END) AS passed,
                COALESCE(SUM(r.time), 0) AS studyTimeMs
         FROM revlog r
         ${cardJoin}
         ${deck.join}
         WHERE r.ease BETWEEN 1 AND 4
           AND r.type BETWEEN 0 AND 3
           AND r.id >= ?
           AND r.id < ?
           ${deck.where}
         GROUP BY day
         ORDER BY day`,
        startMs,
        endMs,
        ...deck.params,
    );

    return rows.map((row) => ({
        day: toNumber(row.day),
        answers: toNumber(row.answers),
        passed: toNumber(row.passed),
        studyTimeMs: toNumber(row.studyTimeMs),
    }));
}

/** Compare the latest `preset` study-day window against the immediately preceding window of equal length. */
export function getPeriodComparison(params: {
    deckName: string | null;
    preset: ComparisonPeriodPreset;
    rolloverHour: number;
    nowMs?: number;
    scopedCardIds?: number[];
}): PeriodComparisonResult {
    const { current: currentBounds, previous: previousBounds } = resolveEqualComparisonPeriods(
        params.preset,
        params.rolloverHour,
        params.nowMs,
    );
    const rows = queryComparisonDays(
        params.deckName,
        previousBounds.startMs,
        currentBounds.endMs,
        params.rolloverHour,
        params.scopedCardIds,
    );
    const current = summarizeComparisonDays(rows, currentBounds);
    const previous = summarizeComparisonDays(rows, previousBounds);
    return {
        preset: params.preset,
        currentBounds,
        previousBounds,
        current,
        previous,
        delta: compareSeriesMetrics(current, previous),
    };
}

/** Compare two decks (or whole collection vs a deck) over the exact same study-day range. */
export function getDeckComparison(params: {
    primaryDeckName: string | null;
    baselineDeckName: string | null;
    range: StatsDateRange;
    rolloverHour: number;
    primaryScopedCardIds?: number[];
    baselineScopedCardIds?: number[];
}): DeckComparisonResult {
    const bounds = resolveDeckComparisonPeriod(params.range, params.rolloverHour);
    const primaryRows = queryComparisonDays(
        params.primaryDeckName,
        bounds.startMs,
        bounds.endMs,
        params.rolloverHour,
        params.primaryScopedCardIds,
    );
    const baselineRows = queryComparisonDays(
        params.baselineDeckName,
        bounds.startMs,
        bounds.endMs,
        params.rolloverHour,
        params.baselineScopedCardIds,
    );
    const primary = summarizeComparisonDays(primaryRows, bounds);
    const baseline = summarizeComparisonDays(baselineRows, bounds);
    return {
        bounds,
        primary,
        baseline,
        delta: compareSeriesMetrics(primary, baseline),
    };
}
