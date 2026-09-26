/**
 * Number, time and date formatting for the Statistics screen.
 *
 * Turkish writes a decimal comma and puts the percent sign first (`%85`, `1,5 sa`); formatting
 * every figure through these helpers is what keeps a Turkish screen from mixing in English
 * punctuation.
 */

import { localeTag, type SupportedLocale } from './i18n';

const DAY_MS = 86_400_000;

/**
 * A plain decimal in the locale's own separators, with at most `digits` fraction digits — or
 * exactly that many when `fixed`, so a column of figures lines up.
 */
export function formatDecimal(value: number, locale: SupportedLocale, digits: number = 1, fixed: boolean = false): string {
    if (!Number.isFinite(value)) return '0';
    return value.toLocaleString(localeTag(locale), {
        maximumFractionDigits: digits,
        minimumFractionDigits: fixed ? digits : 0,
    });
}

/** A 0–100 percentage, written the way the locale writes one. */
export function formatPercent(percent: number, locale: SupportedLocale, digits: number = 0, fixed: boolean = false): string {
    const number = formatDecimal(Number.isFinite(percent) ? percent : 0, locale, digits, fixed);
    return locale === 'tr' ? `%${number}` : `${number}%`;
}

/** Percent label that does not round a small non-zero segment down to a misleading 0%. */
export function formatPartPercent(part: number, total: number, locale: SupportedLocale): string {
    if (!Number.isFinite(part) || !Number.isFinite(total) || part <= 0 || total <= 0) return formatPercent(0, locale);
    const percent = (part / total) * 100;
    if (percent < 1) return `<${formatPercent(1, locale)}`;
    return formatPercent(percent, locale, percent < 10 ? 1 : 0);
}

/** `passed / total` as a percentage, or a dash when nothing was answered. */
export function formatRatio(
    passed: number,
    total: number,
    locale: SupportedLocale,
    digits: number = 0,
    fixed: boolean = false,
): string {
    if (!(total > 0)) return '—';
    return formatPercent((passed / total) * 100, locale, digits, fixed);
}

/** Axis and readout text for a duration measured in minutes. */
export function formatChartMinutes(minutes: number, locale: SupportedLocale): string {
    if (!Number.isFinite(minutes) || minutes <= 0) return '0';
    if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} ${locale === 'tr' ? 'sn' : 's'}`;
    if (minutes < 60) return `${Math.round(minutes)} ${locale === 'tr' ? 'dk' : 'min'}`;
    const hours = minutes / 60;
    return `${formatDecimal(hours, locale, hours < 10 ? 1 : 0)} ${locale === 'tr' ? 'sa' : 'h'}`;
}

export function formatStudyDuration(ms: number, locale: SupportedLocale): string {
    if (!Number.isFinite(ms) || ms <= 0) return locale === 'tr' ? '0 dk' : '0 min';
    if (ms < 60_000) return locale === 'tr' ? '<1 dk' : '<1 min';
    return formatChartMinutes(ms / 60_000, locale);
}

/** Seconds per answer, the unit Anki quotes an answer time in. */
export function formatSeconds(seconds: number, locale: SupportedLocale): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    return `${formatDecimal(seconds, locale, seconds < 10 ? 1 : 0)} ${locale === 'tr' ? 'sn' : 's'}`;
}

export function formatIntervalDays(days: number, locale: SupportedLocale): string {
    if (!Number.isFinite(days) || days <= 0) return locale === 'tr' ? '0 gün' : '0 days';
    if (days < 30) {
        const rounded = Math.max(1, Math.round(days));
        return `${rounded} ${locale === 'tr' ? 'gün' : rounded === 1 ? 'day' : 'days'}`;
    }
    if (days < 365) {
        const months = days / 30;
        const rounded = Number(months.toFixed(days < 60 ? 1 : 0));
        return `${formatDecimal(rounded, locale)} ${locale === 'tr' ? 'ay' : rounded === 1 ? 'month' : 'months'}`;
    }
    const years = Number((days / 365).toFixed(1));
    return `${formatDecimal(years, locale)} ${locale === 'tr' ? 'yıl' : years === 1 ? 'year' : 'years'}`;
}

/** A clock hour as `21:00`. */
export function formatHour(hour: number): string {
    return `${String(((hour % 24) + 24) % 24).padStart(2, '0')}:00`;
}

export function formatHourRange(hour: number): string {
    return `${formatHour(hour)}–${formatHour(hour + 1)}`;
}

/**
 * The local calendar date a study-day number stands for, at noon so that no time-zone offset
 * can move it across midnight when it is formatted.
 */
export function dateForStudyDay(day: number): Date {
    const utc = new Date(day * DAY_MS);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 12);
}

export function formatStudyDay(day: number, locale: SupportedLocale, options: Intl.DateTimeFormatOptions): string {
    return dateForStudyDay(day).toLocaleDateString(localeTag(locale), options);
}

/** `22 Eyl 2026`, or `22 Eyl – 28 Eyl 2026` for a span; the year is written once, at the end. */
export function formatStudyDayRange(firstDay: number, lastDay: number, locale: SupportedLocale): string {
    const withYear: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    if (firstDay >= lastDay) return formatStudyDay(firstDay, locale, withYear);
    const sameYear = dateForStudyDay(firstDay).getFullYear() === dateForStudyDay(lastDay).getFullYear();
    const start = formatStudyDay(firstDay, locale, sameYear ? { day: 'numeric', month: 'short' } : withYear);
    return `${start} – ${formatStudyDay(lastDay, locale, withYear)}`;
}
