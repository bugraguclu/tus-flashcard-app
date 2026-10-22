import React, { useMemo, useState } from 'react';
import { useThemeColors } from '../../constants/theme';
import type { AnkiStatsSnapshot } from '../../lib/ankiStats';
import type { ChartPoint } from '../../lib/statsSeries';
import StatsBarChart from './StatsBarChart';
import StatsCard from './StatsCard';
import StatsSegmented from './StatsSegmented';
import StatsTiles, { type StatTile } from './StatsTiles';
import { useStatsFormat } from './useStatsFormat';

/**
 * Anki's Future Due graph: review cards by the day they come due, young and mature stacked, with
 * Anki's backlog switch (on by default there) adding the overdue cards ahead of a "Today" rule.
 */
export default function FutureDueSection({ stats }: { stats: AnkiStatsSnapshot }) {
    const colors = useThemeColors();
    const f = useStatsFormat();
    const { l } = f;
    const [showBacklog, setShowBacklog] = useState(true);

    const source = showBacklog ? stats.futureDueWithBacklog : stats.futureDue;
    const todayIndex = showBacklog ? stats.futureDueWithBacklogTodayIndex : 0;
    const total = showBacklog ? stats.futureDueWithBacklogTotal : stats.futureDueTotal;
    // Mature at the base, as on Reviews: the settled cards form the foundation of each bar.
    const points: ChartPoint[] = useMemo(
        () => source.map((point) => ({ label: point.label, detail: point.detail, values: [point.values[1], point.values[0]] })),
        [source],
    );
    const running = useMemo(() => {
        let sum = 0;
        return points.map((point) => (sum += point.values[0] + point.values[1]));
    }, [points]);
    const cards = (value: number) => l(`${f.count(value)} kart`, `${f.count(value)} ${value === 1 ? 'card' : 'cards'}`);

    const tiles: StatTile[] = [
        { key: 'tomorrow', label: l('Yarın', 'Tomorrow'), value: f.count(stats.dueTomorrow) },
        { key: 'load', label: l('Günlük yük', 'Daily load'), value: f.decimal(stats.dailyLoad, 1) },
    ];
    if (showBacklog) {
        tiles.push({ key: 'backlog', label: l('Geciken', 'Overdue'), value: f.count(stats.futureDueBacklogTotal) });
    }

    return (
        <StatsCard
            title={l('Gelecek vadeler', 'Future Due')}
            controls={(
                <StatsSegmented
                    options={[
                        { value: 'backlog', label: l('Gecikenlerle', 'With backlog') },
                        { value: 'today', label: l('Bugünden', 'From today') },
                    ]}
                    value={showBacklog ? 'backlog' : 'today'}
                    onChange={(value) => setShowBacklog(value === 'backlog')}
                    accessibilityLabel={l('Gecikenler', 'Backlog')}
                />
            )}
        >
            <StatsBarChart
                points={points}
                series={[
                    { key: 'mature', label: l('Olgun', 'Mature'), color: colors.chartMature },
                    { key: 'young', label: l('Genç', 'Young'), color: colors.chartYoung },
                ]}
                summary={{ title: l('Vadesi gelecek', 'Coming due'), value: cards(total), note: f.chartHint }}
                readout={(index) => ({
                    title: points[index].detail,
                    value: cards(points[index].values[0] + points[index].values[1]),
                    note: l(`Birikimli: ${cards(running[index])}`, `Running total: ${cards(running[index])}`),
                })}
                formatValue={f.count}
                marker={todayIndex > 0 ? { index: todayIndex, label: l('Bugün', 'Today') } : undefined}
                emptyTitle={l('Vadesi gelecek kart yok.', 'No cards coming due.')}
                accessibilityLabel={l('Gelecek vadeler grafiği', 'Future due chart')}
            />
            <StatsTiles tiles={tiles} />
        </StatsCard>
    );
}
