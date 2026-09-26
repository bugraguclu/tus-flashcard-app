import React, { useMemo } from 'react';
import { useThemeColors } from '../../constants/theme';
import type { AddedDay } from '../../lib/ankiStats';
import { bucketHistory, historyPoints, historyUnit } from '../../lib/statsSeries';
import StatsBarChart from './StatsBarChart';
import StatsCard from './StatsCard';
import StatsTiles from './StatsTiles';
import { useStatsFormat } from './useStatsFormat';

interface AddedSectionProps {
    addedDays: readonly AddedDay[];
    firstDay: number;
    lastDay: number;
    rangeTitle: string;
    /** Opens the card browser on the cards added on study days `firstDay`…`lastDay`. */
    onOpenCards: (firstDay: number, lastDay: number) => void;
}

/**
 * Anki's Added graph: new cards created in each part of the period. As in Anki, a bar links to
 * its cards — tapping one opens the browser on the cards added on the days it covers.
 */
export default function AddedSection({ addedDays, firstDay, lastDay, rangeTitle, onOpenCards }: AddedSectionProps) {
    const colors = useThemeColors();
    const f = useStatsFormat();
    const { l, locale } = f;
    const unit = historyUnit(lastDay - firstDay + 1);
    const buckets = useMemo(
        () => bucketHistory(addedDays, firstDay, lastDay, unit, 1, (row) => [row.count]),
        [addedDays, firstDay, lastDay, unit],
    );
    const points = useMemo(() => historyPoints(buckets, unit, locale), [buckets, unit, locale]);
    const running = useMemo(() => {
        let sum = 0;
        return points.map((point) => (sum += point.values[0] ?? 0));
    }, [points]);
    const total = running[running.length - 1] ?? 0;
    const days = Math.max(1, lastDay - firstDay + 1);
    const cards = (value: number) => l(`${f.count(value)} kart`, `${f.count(value)} ${value === 1 ? 'card' : 'cards'}`);

    return (
        <StatsCard
            title={l('Eklenenler', 'Added')}
            subtitle={l('Seçilen dönemde oluşturduğunuz ya da içe aktardığınız yeni kartlar.', 'New cards you created or imported in the selected period.')}
        >
            <StatsBarChart
                points={points}
                series={[{ key: 'added', label: l('Yeni kart', 'New cards'), color: colors.chartNew }]}
                summary={{
                    title: rangeTitle,
                    value: cards(total),
                    note: l('Kartları görmek için bir sütuna dokunun', 'Tap a bar to see its cards'),
                }}
                readout={(index) => ({
                    title: points[index].detail,
                    value: cards(points[index].values[0] ?? 0),
                    note: l(`Birikimli: ${cards(running[index])}`, `Running total: ${cards(running[index])}`),
                })}
                formatValue={f.count}
                plotHeight={130}
                emptyTitle={l('Bu dönemde eklenen kart yok.', 'No cards were added in this period.')}
                accessibilityLabel={l('Eklenenler grafiği', 'Added cards chart')}
                onPressBar={(index) => onOpenCards(buckets[index].firstDay, buckets[index].lastDay)}
                pressHint={l(
                    'Yukarı ya da aşağı kaydırarak bir sütun seçin, o günlerde eklenen kartları Kartlarım’da açmak için iki kez dokunun.',
                    'Swipe up or down to pick a bar, then double-tap to open the cards added then in the Card Browser.',
                )}
            />
            <StatsTiles
                columns={2}
                tiles={[
                    { key: 'total', label: l('Toplam', 'Total'), value: f.count(total) },
                    {
                        key: 'perDay',
                        label: l('Günlük ortalama', 'Daily average'),
                        value: f.decimal(total / days, total / days < 10 ? 1 : 0),
                    },
                ]}
            />
        </StatsCard>
    );
}
