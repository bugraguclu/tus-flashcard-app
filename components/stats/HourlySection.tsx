import React, { useMemo, useState } from 'react';
import { useThemeColors } from '../../constants/theme';
import type { HourBucket } from '../../lib/ankiStats';
import { formatHour, formatHourRange } from '../../lib/statsPresentation';
import { hourHighlights, type ChartPoint } from '../../lib/statsSeries';
import StatsBarChart from './StatsBarChart';
import StatsCard from './StatsCard';
import StatsRateStrip from './StatsRateStrip';
import StatsTiles from './StatsTiles';
import { useStatsFormat } from './useStatsFormat';

const HOUR_TICKS = [0, 6, 12, 18, 23];

/**
 * Anki's Hourly Breakdown: answers by the clock hour they were given, with the share passed at
 * each hour drawn as a separate line beneath rather than on a second axis.
 */
export default function HourlySection({ hours, rangeTitle }: { hours: readonly HourBucket[]; rangeTitle: string }) {
    const colors = useThemeColors();
    const f = useStatsFormat();
    const { l } = f;
    const [selected, setSelected] = useState<number | null>(null);

    const points: ChartPoint[] = useMemo(() => hours.map((hour) => ({
        label: String(hour.hour).padStart(2, '0'),
        detail: formatHourRange(hour.hour),
        values: [hour.total],
    })), [hours]);
    const rates = useMemo(
        () => hours.map((hour) => (hour.total > 0 ? (hour.correct / hour.total) * 100 : null)),
        [hours],
    );
    const highlights = useMemo(() => hourHighlights(hours), [hours]);
    const total = hours.reduce((sum, hour) => sum + hour.total, 0);
    const answers = (value: number) => l(`${f.count(value)} cevap`, `${f.count(value)} ${value === 1 ? 'answer' : 'answers'}`);

    return (
        <StatsCard
            title={l('Saatlik dağılım', 'Hourly Breakdown')}
            subtitle={l(
                'Günün hangi saatinde kaç cevap verdiğiniz ve o saatte ne kadarını bildiğiniz.',
                'How many answers you gave at each hour of the day, and how many of them you got right.',
            )}
        >
            <StatsBarChart
                points={points}
                series={[{ key: 'answers', label: l('Cevap', 'Answers'), color: colors.accent }]}
                summary={{ title: rangeTitle, value: answers(total), note: f.chartHint }}
                readout={(index) => ({
                    title: points[index].detail,
                    value: answers(hours[index].total),
                    note: hours[index].total > 0
                        ? l(
                            `Doğru: ${f.ratio(hours[index].correct, hours[index].total)} (${f.count(hours[index].correct)})`,
                            `Correct: ${f.ratio(hours[index].correct, hours[index].total)} (${f.count(hours[index].correct)})`,
                        )
                        : undefined,
                })}
                formatValue={f.count}
                tickIndexes={HOUR_TICKS}
                plotHeight={130}
                emptyTitle={l('Bu dönemde cevap yok.', 'No answers in this period.')}
                accessibilityLabel={l('Saatlik dağılım grafiği', 'Hourly breakdown chart')}
                selectedIndex={selected}
                onSelectedIndexChange={setSelected}
            />
            <StatsRateStrip
                rates={rates}
                color={colors.chartGood}
                title={l('Doğru cevap oranı', 'Share answered correctly')}
                formatRate={(rate) => f.percent(rate)}
                selectedIndex={selected}
                onSelectedIndexChange={setSelected}
            />
            {total > 0 && (
                <StatsTiles
                    columns={2}
                    tiles={[
                        {
                            key: 'busiest',
                            label: l('En yoğun saat', 'Busiest hour'),
                            value: highlights.busiest ? formatHour(highlights.busiest.hour) : '—',
                            detail: highlights.busiest ? answers(highlights.busiest.total) : undefined,
                        },
                        {
                            key: 'strongest',
                            label: l('En başarılı saat', 'Strongest hour'),
                            value: highlights.strongest ? formatHour(highlights.strongest.hour) : '—',
                            detail: highlights.strongest
                                ? l(
                                    `${f.ratio(highlights.strongest.correct, highlights.strongest.total)} doğru`,
                                    `${f.ratio(highlights.strongest.correct, highlights.strongest.total)} correct`,
                                )
                                : l('Yeterli veri yok', 'Not enough data'),
                        },
                    ]}
                />
            )}
        </StatsCard>
    );
}
