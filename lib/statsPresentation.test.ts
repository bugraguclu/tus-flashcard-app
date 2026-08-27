import { describe, expect, it } from 'vitest';
import {
    formatChartMinutes,
    formatIntervalDays,
    formatPartPercent,
    formatStudyDuration,
    perDayAverage,
} from './statsPresentation';

describe('statistics presentation', () => {
    it('localizes chart time without losing sub-minute values', () => {
        expect(formatChartMinutes(4 / 60, 'tr')).toBe('4sn');
        expect(formatChartMinutes(4 / 60, 'en')).toBe('4s');
        expect(formatChartMinutes(90, 'tr')).toBe('1.5sa');
        expect(formatChartMinutes(90, 'en')).toBe('1.5h');
    });

    it('keeps short study sessions visible', () => {
        expect(formatStudyDuration(4_000, 'tr')).toBe('<1 dk');
        expect(formatStudyDuration(4_000, 'en')).toBe('<1 min');
        expect(formatStudyDuration(3_600_000, 'en')).toBe('1 hr');
    });

    it('localizes interval units', () => {
        expect(formatIntervalDays(21, 'tr')).toBe('21 gün');
        expect(formatIntervalDays(45, 'en')).toBe('1.5 months');
        expect(formatIntervalDays(365, 'en')).toBe('1 year');
    });

    it('does not label a real small segment as zero percent', () => {
        expect(formatPartPercent(1, 500)).toBe('<1%');
        expect(formatPartPercent(25, 100)).toBe('25%');
        expect(formatPartPercent(0, 100)).toBe('0%');
    });

    it('guards per-day averages against empty spans', () => {
        expect(perDayAverage(14, 7)).toBe(2);
        expect(perDayAverage(14, 0)).toBe(0);
    });
});
