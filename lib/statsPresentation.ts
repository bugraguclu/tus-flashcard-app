import type { SupportedLocale } from './i18n';

export function formatChartMinutes(minutes: number, locale: SupportedLocale): string {
    if (!Number.isFinite(minutes) || minutes <= 0) return '0';
    if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))}${locale === 'tr' ? 'sn' : 's'}`;
    if (minutes < 60) return `${Math.round(minutes)}${locale === 'tr' ? 'dk' : 'm'}`;
    const hours = minutes / 60;
    return `${hours < 10 ? hours.toFixed(1).replace('.0', '') : Math.round(hours)}${locale === 'tr' ? 'sa' : 'h'}`;
}
export function formatStudyDuration(ms: number, locale: SupportedLocale): string {
    if (!Number.isFinite(ms) || ms <= 0) return locale === 'tr' ? '0 dk' : '0 min';
    if (ms < 60_000) return locale === 'tr' ? '<1 dk' : '<1 min';
    const minutes = ms / 60_000;
    if (minutes < 60) return `${Math.round(minutes)} ${locale === 'tr' ? 'dk' : 'min'}`;
    const hours = minutes / 60;
    return `${hours < 10 ? hours.toFixed(1).replace('.0', '') : Math.round(hours)} ${locale === 'tr' ? 'sa' : 'hr'}`;
}

export function formatIntervalDays(days: number, locale: SupportedLocale): string {
    if (!Number.isFinite(days) || days <= 0) return locale === 'tr' ? '0 gün' : '0 days';
    if (days < 30) return `${Math.round(days)} ${locale === 'tr' ? 'gün' : (Math.round(days) === 1 ? 'day' : 'days')}`;
    if (days < 365) {
        const months = days / 30;
        const value = months.toFixed(days < 60 ? 1 : 0).replace('.0', '');
        return `${value} ${locale === 'tr' ? 'ay' : (value === '1' ? 'month' : 'months')}`;
    }
    const years = (days / 365).toFixed(1).replace('.0', '');
    return `${years} ${locale === 'tr' ? 'yıl' : (years === '1' ? 'year' : 'years')}`;
}

/** Percent label that does not round a small non-zero segment down to a misleading 0%. */
export function formatPartPercent(part: number, total: number): string {
    if (!Number.isFinite(part) || !Number.isFinite(total) || part <= 0 || total <= 0) return '0%';
    const percent = (part / total) * 100;
    if (percent < 1) return '<1%';
    if (percent < 10) return `${percent.toFixed(1).replace('.0', '')}%`;
    return `${Math.round(percent)}%`;
}

export function perDayAverage(total: number, spanDays: number): number {
    if (!Number.isFinite(total) || !Number.isFinite(spanDays) || spanDays <= 0) return 0;
    return total / spanDays;
}
