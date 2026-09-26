import { describe, expect, it } from 'vitest';
import {
    dateForStudyDay,
    formatChartMinutes,
    formatDecimal,
    formatHourRange,
    formatIntervalDays,
    formatPartPercent,
    formatPercent,
    formatRatio,
    formatSeconds,
    formatStudyDayRange,
    formatStudyDuration,
} from './statsPresentation';

const DAY_MS = 86_400_000;
const day = (year: number, month: number, date: number) => Math.floor(Date.UTC(year, month, date) / DAY_MS);

describe('statistics presentation', () => {
    it('writes Turkish figures with a decimal comma and a leading percent sign', () => {
        expect(formatDecimal(1.5, 'tr')).toBe('1,5');
        expect(formatDecimal(1.5, 'en')).toBe('1.5');
        expect(formatDecimal(12345, 'tr')).toBe('12.345');
        expect(formatPercent(85, 'tr')).toBe('%85');
        expect(formatPercent(85, 'en')).toBe('85%');
        expect(formatPercent(91.25, 'tr', 1)).toBe('%91,3');
    });

    it('does not label a real small segment as zero percent', () => {
        expect(formatPartPercent(1, 500, 'tr')).toBe('<%1');
        expect(formatPartPercent(1, 500, 'en')).toBe('<1%');
        expect(formatPartPercent(25, 100, 'en')).toBe('25%');
        expect(formatPartPercent(3, 100, 'tr')).toBe('%3');
        expect(formatPartPercent(0, 100, 'tr')).toBe('%0');
    });

    it('shows a dash for a ratio with nothing behind it', () => {
        expect(formatRatio(0, 0, 'tr')).toBe('—');
        expect(formatRatio(9, 10, 'tr')).toBe('%90');
    });

    it('localizes chart time without losing sub-minute values', () => {
        expect(formatChartMinutes(4 / 60, 'tr')).toBe('4 sn');
        expect(formatChartMinutes(4 / 60, 'en')).toBe('4 s');
        expect(formatChartMinutes(90, 'tr')).toBe('1,5 sa');
        expect(formatChartMinutes(90, 'en')).toBe('1.5 h');
        expect(formatSeconds(10.34, 'tr')).toBe('10 sn');
        expect(formatSeconds(8.25, 'tr')).toBe('8,3 sn');
        expect(formatSeconds(0, 'tr')).toBe('—');
    });

    it('keeps short study sessions visible', () => {
        expect(formatStudyDuration(4_000, 'tr')).toBe('<1 dk');
        expect(formatStudyDuration(4_000, 'en')).toBe('<1 min');
        expect(formatStudyDuration(3_600_000, 'en')).toBe('1 h');
        expect(formatStudyDuration(20 * 60_000, 'tr')).toBe('20 dk');
    });

    it('localizes interval units', () => {
        expect(formatIntervalDays(21, 'tr')).toBe('21 gün');
        expect(formatIntervalDays(45, 'en')).toBe('1.5 months');
        expect(formatIntervalDays(45, 'tr')).toBe('1,5 ay');
        expect(formatIntervalDays(365, 'en')).toBe('1 year');
        expect(formatIntervalDays(0.4, 'tr')).toBe('1 gün');
    });

    it('writes hour ranges on a 24-hour clock', () => {
        expect(formatHourRange(9)).toBe('09:00–10:00');
        expect(formatHourRange(23)).toBe('23:00–00:00');
    });

    it('turns a study-day number back into the calendar date it names', () => {
        const date = dateForStudyDay(day(2026, 8, 22));
        expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 8, 22]);
        expect(formatStudyDayRange(day(2026, 8, 21), day(2026, 8, 27), 'en')).toBe('Sep 21 – Sep 27, 2026');
        expect(formatStudyDayRange(day(2025, 11, 29), day(2026, 0, 4), 'tr')).toBe('29 Ara 2025 – 4 Oca 2026');
    });
});
