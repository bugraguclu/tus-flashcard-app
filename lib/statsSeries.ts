/**
 * Pure shaping of the statistics read model into what the charts draw: history buckets, the
 * figures under the Reviews and Hourly Breakdown graphs, and the browser search a bar of the
 * Added graph opens. Nothing here touches the database, so a control that only changes how data
 * is shown (the Reviews time switch) re-shapes the snapshot already in memory.
 */

import type { HourBucket, ReviewDay } from './ankiStats';
import type { SupportedLocale } from './i18n';
import { dateForStudyDay, formatStudyDay, formatStudyDayRange } from './statsPresentation';

const DAY_MS = 86_400_000;

/** One bar of a chart: what it is called on the axis, in the readout, and what it holds. */
export interface ChartPoint {
    label: string;
    detail: string;
    values: number[];
}

// Calendar arithmetic on study-day numbers (days since the epoch, read as UTC calendar dates).

/** Monday-based weekday of a study day: 0 = Monday … 6 = Sunday. */
export function weekdayIndex(day: number): number {
    return (new Date(day * DAY_MS).getUTCDay() + 6) % 7;
}

function dayOf(year: number, month: number, date: number): number {
    return Math.floor(Date.UTC(year, month, date) / DAY_MS);
}

function yearOf(day: number): number {
    return new Date(day * DAY_MS).getUTCFullYear();
}

export type HistoryUnit = 'day' | 'week' | 'month' | 'year';

/**
 * Bar width for a span of history, following the phone convention of Apple Health: a week or a
 * month of days, half a year of weeks, a year or three of months, and years beyond that.
 */
export function historyUnit(spanDays: number): HistoryUnit {
    if (spanDays <= 35) return 'day';
    if (spanDays <= 200) return 'week';
    if (spanDays <= 1100) return 'month';
    return 'year';
}

function unitStart(day: number, unit: HistoryUnit): number {
    if (unit === 'day') return day;
    if (unit === 'week') return day - weekdayIndex(day);
    const date = new Date(day * DAY_MS);
    if (unit === 'month') return dayOf(date.getUTCFullYear(), date.getUTCMonth(), 1);
    return dayOf(date.getUTCFullYear(), 0, 1);
}

function nextUnitStart(start: number, unit: HistoryUnit): number {
    if (unit === 'day') return start + 1;
    if (unit === 'week') return start + 7;
    const date = new Date(start * DAY_MS);
    if (unit === 'month') return dayOf(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    return dayOf(date.getUTCFullYear() + 1, 0, 1);
}

export interface DayBucket {
    firstDay: number;
    lastDay: number;
    values: number[];
}

/**
 * Calendar-aligned buckets covering `firstDay`…`lastDay`, empty ones included so the axis always
 * describes the whole period. A week starts on Monday; the first and last bucket are clipped to
 * the period, so a partial month is labelled as the days it actually holds.
 */
export function bucketHistory<T extends { day: number }>(
    rows: readonly T[],
    firstDay: number,
    lastDay: number,
    unit: HistoryUnit,
    seriesCount: number,
    valuesFor: (row: T) => number[],
): DayBucket[] {
    const buckets: DayBucket[] = [];
    if (lastDay < firstDay) return buckets;
    for (let start = unitStart(firstDay, unit); start <= lastDay; start = nextUnitStart(start, unit)) {
        buckets.push({
            firstDay: Math.max(firstDay, start),
            lastDay: Math.min(lastDay, nextUnitStart(start, unit) - 1),
            values: Array(seriesCount).fill(0),
        });
    }
    for (const row of rows) {
        if (row.day < firstDay || row.day > lastDay) continue;
        let low = 0;
        let high = buckets.length - 1;
        while (low < high) {
            const middle = (low + high + 1) >> 1;
            if (buckets[middle].firstDay <= row.day) low = middle;
            else high = middle - 1;
        }
        const target = buckets[low].values;
        valuesFor(row).forEach((value, index) => {
            if (index < seriesCount) target[index] += value;
        });
    }
    return buckets;
}

/** Axis label and readout text for a history bucket. */
export function historyBucketLabels(
    bucket: DayBucket,
    unit: HistoryUnit,
    locale: SupportedLocale,
    spansYears: boolean,
): { label: string; detail: string } {
    const { firstDay, lastDay } = bucket;
    if (unit === 'day') {
        return {
            label: formatStudyDay(firstDay, locale, { day: 'numeric', month: 'short' }),
            detail: formatStudyDay(firstDay, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        };
    }
    if (unit === 'week') {
        return {
            label: formatStudyDay(firstDay, locale, { day: 'numeric', month: 'short' }),
            detail: formatStudyDayRange(firstDay, lastDay, locale),
        };
    }
    const start = dateForStudyDay(firstDay);
    if (unit === 'month') {
        const whole = firstDay === unitStart(firstDay, 'month') && lastDay === nextUnitStart(unitStart(firstDay, 'month'), 'month') - 1;
        return {
            label: formatStudyDay(firstDay, locale, spansYears ? { month: 'short', year: '2-digit' } : { month: 'short' }),
            detail: whole
                ? formatStudyDay(firstDay, locale, { month: 'long', year: 'numeric' })
                : formatStudyDayRange(firstDay, lastDay, locale),
        };
    }
    const whole = firstDay === unitStart(firstDay, 'year') && lastDay === nextUnitStart(unitStart(firstDay, 'year'), 'year') - 1;
    return {
        label: String(start.getFullYear()),
        detail: whole ? String(start.getFullYear()) : formatStudyDayRange(firstDay, lastDay, locale),
    };
}

export function historyPoints(
    buckets: readonly DayBucket[],
    unit: HistoryUnit,
    locale: SupportedLocale,
): ChartPoint[] {
    const spansYears = buckets.length > 0 && yearOf(buckets[0].firstDay) !== yearOf(buckets[buckets.length - 1].lastDay);
    return buckets.map((bucket) => ({
        ...historyBucketLabels(bucket, unit, locale, spansYears),
        values: bucket.values,
    }));
}

/** Stack order of the Reviews graph, bottom to top: the most settled cards form the base. */
export const REVIEW_SERIES = ['mature', 'young', 'relearn', 'learn', 'filtered'] as const;

export function reviewValues(row: ReviewDay, asMinutes: boolean): number[] {
    if (asMinutes) {
        return [row.matureMs, row.youngMs, row.relearnMs, row.learnMs, row.filteredMs].map((ms) => ms / 60_000);
    }
    return [row.mature, row.young, row.relearn, row.learn, row.filtered];
}

export interface ReviewPeriodSummary {
    answers: number;
    timeMs: number;
    studiedDays: number;
    periodDays: number;
    perDay: number;
    perStudiedDay: number;
    minutesPerDay: number;
    minutesPerStudiedDay: number;
    secondsPerAnswer: number;
    cardsPerMinute: number;
}

/** The table under Anki's Reviews graph, for `firstDay`…`lastDay` inclusive. */
export function summarizeReviewPeriod(rows: readonly ReviewDay[], firstDay: number, lastDay: number): ReviewPeriodSummary {
    let answers = 0;
    let timeMs = 0;
    let studiedDays = 0;
    for (const row of rows) {
        if (row.day < firstDay || row.day > lastDay) continue;
        const count = row.learn + row.relearn + row.young + row.mature + row.filtered;
        if (count <= 0) continue;
        answers += count;
        timeMs += row.learnMs + row.relearnMs + row.youngMs + row.matureMs + row.filteredMs;
        studiedDays += 1;
    }
    const periodDays = Math.max(1, lastDay - firstDay + 1);
    const minutes = timeMs / 60_000;
    return {
        answers,
        timeMs,
        studiedDays,
        periodDays,
        perDay: answers / periodDays,
        perStudiedDay: studiedDays > 0 ? answers / studiedDays : 0,
        minutesPerDay: minutes / periodDays,
        minutesPerStudiedDay: studiedDays > 0 ? minutes / studiedDays : 0,
        secondsPerAnswer: answers > 0 ? timeMs / 1000 / answers : 0,
        cardsPerMinute: minutes > 0 ? answers / minutes : 0,
    };
}

export interface HourHighlights {
    busiest: HourBucket | null;
    /** The hour with the best success rate among hours with enough answers to judge. */
    strongest: HourBucket | null;
}

export function hourHighlights(hours: readonly HourBucket[]): HourHighlights {
    const total = hours.reduce((sum, hour) => sum + hour.total, 0);
    if (total === 0) return { busiest: null, strongest: null };
    const busiest = hours.reduce((best, hour) => (hour.total > best.total ? hour : best), hours[0]);
    const threshold = Math.max(10, total * 0.03);
    let strongest: HourBucket | null = null;
    for (const hour of hours) {
        if (hour.total < threshold) continue;
        if (!strongest) {
            strongest = hour;
            continue;
        }
        const rate = hour.correct / hour.total;
        const bestRate = strongest.correct / strongest.total;
        if (rate > bestRate || (rate === bestRate && hour.total > strongest.total)) strongest = hour;
    }
    return { busiest, strongest };
}

/**
 * The browser search for the cards added on study days `firstDay`…`lastDay`, which is how Anki's
 * Added graph links a bar to its cards. `added:N` means added within the last N days, today being
 * 1: the first term reaches back to the bar's first day, and the negated one takes away whatever
 * was added after its last day.
 */
export function addedSearchForDays(firstDay: number, lastDay: number, today: number): string {
    const include = `added:${Math.max(1, today - firstDay + 1)}`;
    return lastDay >= today ? include : `${include} -added:${today - lastDay}`;
}
