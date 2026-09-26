import React, { useMemo, useState } from 'react';
import { useThemeColors } from '../../constants/theme';
import type { ReviewDay } from '../../lib/ankiStats';
import {
    bucketHistory,
    historyPoints,
    historyUnit,
    REVIEW_SERIES,
    reviewValues,
    summarizeReviewPeriod,
} from '../../lib/statsSeries';
import StatsBarChart from './StatsBarChart';
import StatsCard from './StatsCard';
import StatsSegmented from './StatsSegmented';
import StatsTiles, { type StatTile } from './StatsTiles';
import { useStatsFormat } from './useStatsFormat';

interface ReviewsSectionProps {
    reviewDays: readonly ReviewDay[];
    firstDay: number;
    lastDay: number;
    rangeTitle: string;
}

/**
 * Anki's Reviews graph with its Time switch: the same buckets, measured in answers or in minutes,
 * and the table Anki prints under it — days studied, totals and the two averages.
 */
export default function ReviewsSection({ reviewDays, firstDay, lastDay, rangeTitle }: ReviewsSectionProps) {
    const colors = useThemeColors();
    const f = useStatsFormat();
    const { l, locale } = f;
    const [asTime, setAsTime] = useState(false);

    const unit = historyUnit(lastDay - firstDay + 1);
    const points = useMemo(() => historyPoints(
        bucketHistory(reviewDays, firstDay, lastDay, unit, REVIEW_SERIES.length, (row) => reviewValues(row, asTime)),
        unit,
        locale,
    ), [reviewDays, firstDay, lastDay, unit, asTime, locale]);
    const summary = useMemo(() => summarizeReviewPeriod(reviewDays, firstDay, lastDay), [reviewDays, firstDay, lastDay]);
    const running = useMemo(() => {
        let sum = 0;
        return points.map((point) => (sum += point.values.reduce((total, value) => total + value, 0)));
    }, [points]);

    const answers = (value: number) => l(`${f.count(value)} cevap`, `${f.count(value)} ${value === 1 ? 'answer' : 'answers'}`);
    const measure = (value: number) => (asTime ? f.minutes(value) : answers(value));

    const tiles: StatTile[] = [
        {
            key: 'days',
            label: l('Çalışılan gün', 'Days studied'),
            value: `${f.count(summary.studiedDays)} / ${f.count(summary.periodDays)}`,
            detail: f.share(summary.studiedDays, summary.periodDays),
        },
        {
            key: 'perDay',
            label: l('Günlük ortalama', 'Daily average'),
            value: asTime ? f.minutes(summary.minutesPerDay) : f.decimal(summary.perDay, summary.perDay < 10 ? 1 : 0),
        },
    ];
    if (summary.studiedDays < summary.periodDays) {
        tiles.push({
            key: 'perStudiedDay',
            label: l('Çalışılan günlerde', 'On days studied'),
            value: asTime
                ? f.minutes(summary.minutesPerStudiedDay)
                : f.decimal(summary.perStudiedDay, summary.perStudiedDay < 10 ? 1 : 0),
        });
    }
    tiles.push({
        key: 'perAnswer',
        label: l('Cevap başına', 'Per answer'),
        value: f.seconds(summary.secondsPerAnswer),
        detail: summary.cardsPerMinute > 0
            ? l(`${f.decimal(summary.cardsPerMinute)} kart/dk`, `${f.decimal(summary.cardsPerMinute)} cards/min`)
            : undefined,
    });

    return (
        <StatsCard
            title={l('Tekrarlar', 'Reviews')}
            subtitle={asTime
                ? l('Kart türüne göre çalışmaya ayırdığınız süre.', 'Time spent studying, by card type.')
                : l('Kart türüne göre verdiğiniz cevaplar.', 'Answers given, by card type.')}
            controls={(
                <StatsSegmented
                    options={[
                        { value: 'count', label: l('Cevap', 'Answers') },
                        { value: 'time', label: l('Süre', 'Time') },
                    ]}
                    value={asTime ? 'time' : 'count'}
                    onChange={(value) => setAsTime(value === 'time')}
                    accessibilityLabel={l('Ölçü', 'Measure')}
                />
            )}
        >
            <StatsBarChart
                points={points}
                series={[
                    { key: 'mature', label: l('Olgun', 'Mature'), color: colors.chartMature },
                    { key: 'young', label: l('Genç', 'Young'), color: colors.chartYoung },
                    { key: 'relearn', label: l('Yeniden öğrenme', 'Relearning'), color: colors.chartRelearn },
                    { key: 'learn', label: l('Öğrenme', 'Learning'), color: colors.chartLearn },
                    { key: 'filtered', label: l('Filtreli', 'Filtered'), color: colors.chartFiltered },
                ]}
                summary={{
                    title: rangeTitle,
                    value: asTime ? f.duration(summary.timeMs) : answers(summary.answers),
                    note: f.chartHint,
                }}
                readout={(index) => ({
                    title: points[index].detail,
                    value: measure(points[index].values.reduce((sum, value) => sum + value, 0)),
                    note: l(`Birikimli: ${measure(running[index])}`, `Running total: ${measure(running[index])}`),
                })}
                formatValue={asTime ? f.minutes : f.count}
                formatAxisValue={asTime ? f.minutes : undefined}
                integerAxis={!asTime}
                emptyTitle={l('Bu dönemde cevap yok.', 'No answers in this period.')}
                emptyHint={l('Daha uzun bir dönem ya da başka bir deste seçin.', 'Try a longer period or another deck.')}
                accessibilityLabel={l('Tekrarlar grafiği', 'Reviews chart')}
            />
            <StatsTiles tiles={tiles} />
        </StatsCard>
    );
}
