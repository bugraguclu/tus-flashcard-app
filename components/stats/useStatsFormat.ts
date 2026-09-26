import { useMemo } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { formatCount } from '../../lib/i18n';
import {
    formatChartMinutes,
    formatDecimal,
    formatPartPercent,
    formatPercent,
    formatRatio,
    formatSeconds,
    formatStudyDuration,
} from '../../lib/statsPresentation';

/** The locale-bound formatters every statistics section writes its figures with. */
export function useStatsFormat() {
    const { l, locale, localeTag } = useI18n();
    return useMemo(() => ({
        l,
        locale,
        localeTag,
        count: (value: number) => formatCount(Math.round(value), locale),
        decimal: (value: number, digits: number = 1) => formatDecimal(value, locale, digits),
        percent: (value: number, digits: number = 0) => formatPercent(value, locale, digits),
        share: (part: number, total: number) => formatPartPercent(part, total, locale),
        ratio: (passed: number, total: number) => formatRatio(passed, total, locale),
        minutes: (value: number) => formatChartMinutes(value, locale),
        duration: (ms: number) => formatStudyDuration(ms, locale),
        seconds: (value: number) => formatSeconds(value, locale),
        /** The caption line under an idle chart. */
        chartHint: l('Ayrıntı için bir sütuna dokunun ya da parmağınızı kaydırın', 'Tap a bar or slide across the chart for details'),
    }), [l, locale, localeTag]);
}
