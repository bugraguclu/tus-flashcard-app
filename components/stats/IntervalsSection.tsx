import React, { useMemo } from 'react';
import { Text } from 'react-native';
import { FontSize, useThemeColors } from '../../constants/theme';
import type { AnkiStatsSnapshot } from '../../lib/ankiStats';
import { formatIntervalDays } from '../../lib/statsPresentation';
import type { ChartPoint } from '../../lib/statsSeries';
import StatsBarChart from './StatsBarChart';
import StatsCard from './StatsCard';
import StatsTiles from './StatsTiles';
import { useStatsFormat } from './useStatsFormat';

/** Anki's Review Intervals: review cards by their current interval, on a continuous day axis. */
export default function IntervalsSection({ stats, rangeTitle }: { stats: AnkiStatsSnapshot; rangeTitle: string }) {
    const colors = useThemeColors();
    const f = useStatsFormat();
    const { l, locale } = f;
    const unit = l('g', 'd');

    const points: ChartPoint[] = useMemo(() => stats.intervals.map((bucket) => {
        const single = bucket.firstIvl === bucket.lastIvl;
        return {
            label: single ? `${bucket.firstIvl}${unit}` : `${bucket.firstIvl}–${bucket.lastIvl}${unit}`,
            detail: single
                ? formatIntervalDays(bucket.firstIvl, locale)
                : l(`${bucket.firstIvl}–${bucket.lastIvl} gün`, `${bucket.firstIvl}–${bucket.lastIvl} days`),
            values: [bucket.count],
        };
    }), [stats.intervals, unit, locale, l]);
    const shown = points.reduce((sum, point) => sum + point.values[0], 0);
    const cards = (value: number) => l(`${f.count(value)} kart`, `${f.count(value)} ${value === 1 ? 'card' : 'cards'}`);

    return (
        <StatsCard title={l('Tekrar aralıkları', 'Review Intervals')}>
            <StatsBarChart
                points={points}
                series={[{ key: 'cards', label: l('Kart', 'Cards'), color: colors.accent }]}
                summary={{ title: rangeTitle, value: cards(shown), note: f.chartHint }}
                readout={(index) => ({ title: points[index].detail, value: cards(points[index].values[0]) })}
                formatValue={f.count}
                plotHeight={130}
                emptyTitle={l('Bu aralıkta tekrar kartı yok.', 'No review cards in this range.')}
                accessibilityLabel={l('Tekrar aralıkları grafiği', 'Review intervals chart')}
            />
            {stats.intervalsBeyondRange > 0 && (
                <Text style={{ color: colors.textSecondary, fontSize: FontSize.sm }}>
                    {l(
                        `${cards(stats.intervalsBeyondRange)} daha uzun aralıkta; tümünü görmek için “Tümü”nü seçin.`,
                        `${cards(stats.intervalsBeyondRange)} have a longer interval; choose “All” to see them.`,
                    )}
                </Text>
            )}
            <StatsTiles
                columns={2}
                tiles={[
                    { key: 'average', label: l('Ortalama aralık', 'Average interval'), value: formatIntervalDays(stats.averageInterval, locale) },
                    { key: 'longest', label: l('En uzun aralık', 'Longest interval'), value: formatIntervalDays(stats.longestInterval, locale) },
                ]}
            />
        </StatsCard>
    );
}
