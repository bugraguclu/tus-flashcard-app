import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../AppText';
import { useThemeColors } from '../../constants/theme';
import type { FsrsSimulationResult } from '../../lib/fsrsSimulator';
import { simulatorBucketDays, simulatorBuckets, simulatorTotals } from '../../lib/fsrsSimulatorView';
import { formatStudyDay, formatStudyDayRange } from '../../lib/statsPresentation';
import type { ChartPoint } from '../../lib/statsSeries';
import StatsBarChart from '../stats/StatsBarChart';
import { SegmentedControl } from '../ui/Choice';
import StatsTiles, { type StatTile } from '../stats/StatsTiles';
import { useStatsFormat } from '../stats/useStatsFormat';
import type { DeckOptionsStyles } from './deckOptionsStyles';

type Mode = 'count' | 'time' | 'memorized';

/**
 * A finished simulation: reviews (with new cards stacked on top), study time and memorized cards
 * as Anki's simulator graphs them, one bar per day, week or month depending on the span, and the
 * totals underneath.
 */
export default function FsrsSimulatorResults({ result, today, timeAvailable, styles }: {
    result: FsrsSimulationResult;
    /** Study-day number of the first simulated day. */
    today: number;
    /** False when no answer in the history has a usable time: study time would only be a guess. */
    timeAvailable: boolean;
    styles: DeckOptionsStyles;
}) {
    const colors = useThemeColors();
    const f = useStatsFormat();
    const { l, locale } = f;
    const [chosenMode, setMode] = useState<Mode>('count');
    const mode: Mode = chosenMode === 'time' && !timeAvailable ? 'count' : chosenMode;
    const buckets = useMemo(() => simulatorBuckets(result), [result]);
    const totals = useMemo(() => simulatorTotals(result), [result]);
    const days = result.reviews.length;
    const bucketDays = simulatorBucketDays(days);

    const perDay = (value: number) => l(`${f.decimal(value, value < 10 ? 1 : 0)}/gün`, `${f.decimal(value, value < 10 ? 1 : 0)}/day`);
    const cards = (value: number) => l(`${f.count(value)} kart`, `${f.count(value)} ${Math.round(value) === 1 ? 'card' : 'cards'}`);
    const points: ChartPoint[] = useMemo(() => buckets.map((bucket) => ({
        label: formatStudyDay(today + bucket.firstDay, locale, { day: 'numeric', month: 'short' }),
        detail: formatStudyDayRange(today + bucket.firstDay, today + bucket.lastDay, locale),
        values: mode === 'count'
            ? [bucket.reviewsPerDay, bucket.newPerDay]
            : mode === 'time' ? [bucket.minutesPerDay] : [bucket.memorized],
    })), [buckets, mode, today, locale]);

    const unit = bucketDays === 1
        ? ''
        : bucketDays === 7 ? l(' (haftalık ortalama)', ' (weekly average)') : l(' (30 günlük ortalama)', ' (30-day average)');
    const summary = mode === 'count'
        ? { title: l('Günde ortalama kart', 'Cards per day, average'), value: perDay(totals.cardsPerDay), note: f.chartHint }
        : mode === 'time'
            ? { title: l('Günde ortalama süre', 'Study time per day, average'), value: f.minutes(totals.seconds / 60 / days), note: f.chartHint }
            : { title: l('Son gün ezberlenen', 'Memorized on the last day'), value: cards(totals.memorizedEnd), note: f.chartHint };
    const readout = (index: number) => {
        const bucket = buckets[index];
        if (mode === 'count') {
            return {
                title: points[index].detail,
                value: perDay(bucket.reviewsPerDay + bucket.newPerDay),
                note: l(`${f.decimal(bucket.newPerDay, 1)} yeni kart/gün${unit}`, `${f.decimal(bucket.newPerDay, 1)} new cards/day${unit}`),
            };
        }
        if (mode === 'time') return { title: points[index].detail, value: l(`${f.minutes(bucket.minutesPerDay)}/gün`, `${f.minutes(bucket.minutesPerDay)}/day`), note: unit.trim() || undefined };
        return { title: points[index].detail, value: cards(bucket.memorized), note: l('Dönemin son günü', 'On the last day of the period') };
    };

    const tiles: StatTile[] = [
        { key: 'reviews', label: l('Tekrar', 'Reviews'), value: f.count(totals.reviews) },
        { key: 'new', label: l('Yeni kart', 'New cards'), value: f.count(totals.newCards) },
    ];
    if (timeAvailable) tiles.push({ key: 'time', label: l('Toplam süre', 'Total time'), value: f.duration(totals.seconds * 1000) });
    tiles.push({
        key: 'memorized',
        label: l('Ezberlenen', 'Memorized'),
        value: f.count(totals.memorizedEnd),
        detail: l(`başta ${f.count(totals.memorizedStart)}`, `from ${f.count(totals.memorizedStart)}`),
        accessibilityLabel: l(
            `Son gün ezberlenen ${f.count(totals.memorizedEnd)} kart, ilk gün ${f.count(totals.memorizedStart)}`,
            `Memorized on the last day ${f.count(totals.memorizedEnd)} cards, on the first day ${f.count(totals.memorizedStart)}`,
        ),
    });

    return (
        <View style={{ gap: 10 }}>
            <SegmentedControl
                fill
                options={[
                    { value: 'count', label: l('Tekrarlar', 'Reviews') },
                    ...(timeAvailable ? [{ value: 'time' as const, label: l('Süre', 'Time') }] : []),
                    { value: 'memorized', label: l('Ezberlenen', 'Memorized') },
                ]}
                value={mode}
                onChange={setMode}
                accessibilityLabel={l('Simülasyon grafiği', 'Simulation chart')}
            />
            <StatsBarChart
                points={points}
                series={mode === 'count'
                    ? [
                        { key: 'reviews', label: l('Tekrar', 'Reviews'), color: colors.chartMature },
                        { key: 'new', label: l('Yeni', 'New'), color: colors.chartNew },
                    ]
                    : [{ key: mode, label: mode === 'time' ? l('Süre', 'Time') : l('Ezberlenen', 'Memorized'), color: mode === 'time' ? colors.chartLearn : colors.chartYoung }]}
                summary={summary}
                readout={readout}
                formatValue={mode === 'time' ? f.minutes : mode === 'count' ? (value) => f.decimal(value, value < 10 ? 1 : 0) : f.count}
                integerAxis={mode !== 'time'}
                legendTotals={mode === 'count' ? [totals.reviews, totals.newCards] : undefined}
                emptyTitle={l('Bu dönemde çalışılacak kart yok.', 'Nothing to study in this period.')}
                accessibilityLabel={mode === 'count'
                    ? l(`Günlük tekrar ve yeni kart sayısı${unit}`, `Reviews and new cards per day${unit}`)
                    : mode === 'time'
                        ? l(`Günlük çalışma süresi${unit}`, `Study time per day${unit}`)
                        : l('Ezberlenen kart sayısı', 'Memorized cards')}
            />
            <StatsTiles tiles={tiles} title={l(`${f.count(days)} günde`, `Over ${f.count(days)} days`)} />
            {!timeAvailable ? (
                <Text style={styles.fieldHint}>
                    {l(
                        'Geçmişte süresi kaydedilmiş cevap olmadığı için çalışma süresi gösterilmiyor.',
                        'Study time is not shown: no answer in the history has a recorded time.',
                    )}
                </Text>
            ) : null}
        </View>
    );
}
