import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { Spacing, useThemeColors } from '../../constants/theme';
import type { StatsDateRange } from '../../lib/ankiStats';
import type { Deck } from '../../lib/models';
import type { AppSettings } from '../../lib/types';
import { getFilteredDeckCardIds } from '../../lib/studyRepository';
import {
    buildPairedComparisonBuckets, getDeckComparison, getPeriodComparison, pickDefaultBaselineDeck,
    type ComparisonChartMetric, type ComparisonMode, type ComparisonPeriodPreset, type ComparisonSeriesMetrics,
} from '../../lib/statsComparison';
import { formatStudyDayRange } from '../../lib/statsPresentation';
import { useDeferredScreenSnapshot } from '../../hooks/useDeferredScreenSnapshot';
import { Card } from '../ui/Card';
import { SegmentedControl } from '../ui/Choice';
import { SelectRow } from '../ui/Rows';
import { LoadingState, Notice } from '../ui/Feedback';
import { Type } from '../ui/tokens';
import { ReadErrorBanner } from '../ReadErrorBanner';
import ComparisonBarChart from './ComparisonBarChart';
import { useStatsFormat } from './useStatsFormat';

interface Props {
    deckScope: string | null; statsRange: StatsDateRange; rangeTitle: string; decks: readonly Deck[];
    settings: AppSettings; dataRevision: number; retryNonce: number; filteredScopeCardIds?: number[];
    comparePrimaryDeck: string | null | undefined; compareBaselineDeck: string | null | undefined;
    onRequestPickDeck: (slot: 'primary' | 'baseline', current: string | null) => void;
}

/** Both series use the same query semantics, axis and denominators. Chart tables are a later step. */
export default function ComparisonSection({ deckScope, statsRange, rangeTitle, decks, settings, dataRevision,
    retryNonce, filteredScopeCardIds, comparePrimaryDeck, compareBaselineDeck, onRequestPickDeck }: Props) {
    const f = useStatsFormat(); const { l, locale } = f; const colors = useThemeColors();
    const [mode, setMode] = useState<ComparisonMode>('period');
    const [preset, setPreset] = useState<ComparisonPeriodPreset>('week');
    const [metric, setMetric] = useState<ComparisonChartMetric>('answers');
    const primaryDeck = comparePrimaryDeck === undefined ? deckScope : comparePrimaryDeck;
    const baselineDeck = compareBaselineDeck === undefined ? pickDefaultBaselineDeck(decks, primaryDeck) : compareBaselineDeck;
    const deckLabel = (name: string | null) => name?.replaceAll('::', ' › ') ?? l('Tüm koleksiyon', 'Whole Collection');
    const key = JSON.stringify([mode, preset, deckScope, primaryDeck, baselineDeck, statsRange, settings.dayRolloverHour, dataRevision, retryNonce, locale]);
    const load = useCallback(() => {
        const rolloverHour = settings.dayRolloverHour;
        const resolveIds = (name: string | null) => {
            if (name === deckScope && filteredScopeCardIds !== undefined) return filteredScopeCardIds;
            return decks.find((deck) => deck.name === name)?.isFiltered ? getFilteredDeckCardIds(name!, settings) : undefined;
        };
        if (mode === 'period') {
            const res = getPeriodComparison({ deckName: deckScope, preset, rolloverHour, scopedCardIds: filteredScopeCardIds });
            const days = preset === 'week' ? 7 : preset === 'month' ? 30 : 90;
            return {
                primary: res.current, baseline: res.previous, delta: res.delta,
                primaryLabel: l(`Son ${days} gün`, `Last ${days} days`), baselineLabel: l(`Önceki ${days} gün`, `Previous ${days} days`),
                primaryPeriod: formatStudyDayRange(res.currentBounds.firstDay, res.currentBounds.lastDay, locale),
                baselinePeriod: formatStudyDayRange(res.previousBounds.firstDay, res.previousBounds.lastDay, locale), sameDays: false,
            };
        }
        const res = getDeckComparison({ primaryDeckName: primaryDeck, baselineDeckName: baselineDeck, range: statsRange,
            rolloverHour, primaryScopedCardIds: resolveIds(primaryDeck), baselineScopedCardIds: resolveIds(baselineDeck) });
        const period = res.bounds.spanDays !== null ? formatStudyDayRange(res.bounds.firstDay, res.bounds.lastDay, locale) : rangeTitle;
        return { primary: res.primary, baseline: res.baseline, delta: res.delta, primaryLabel: deckLabel(primaryDeck),
            baselineLabel: deckLabel(baselineDeck), primaryPeriod: period, baselinePeriod: period, sameDays: true };
    }, [mode, preset, deckScope, primaryDeck, baselineDeck, statsRange, settings, decks, filteredScopeCardIds, locale, rangeTitle, l, dataRevision, retryNonce]);
    const { snapshot, snapshotKey, loading, error, retry } = useDeferredScreenSnapshot(key, load, { showLoadingFirst: true });
    // Never put an old series beneath newly selected deck/period labels.
    const current = snapshotKey === key ? snapshot : null;
    const buckets = useMemo(() => current ? buildPairedComparisonBuckets(current.primary, current.baseline, metric, locale, current.sameDays) : [], [current, metric, locale]);
    const rows = (series: ComparisonSeriesMetrics) => [f.count(series.answers), f.duration(series.studyTimeMs),
        series.accuracyPct === null ? l('Veri yok', 'No data') : `${f.percent(series.accuracyPct, 0)} (${f.count(series.passed)} / ${f.count(series.answers)})`,
        series.periodDays === null ? f.count(series.studiedDays) : `${f.count(series.studiedDays)} / ${f.count(series.periodDays)}`];
    const labels = [l('Cevap', 'Answers'), l('Kart süresi', 'Card time'), l('Doğruluk', 'Accuracy'), l('Aktif gün', 'Active days')];
    const signed = (n: number, format: (value: number) => string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${format(Math.abs(n))}`;
    const differences = current ? [
        signed(current.delta.answersDiff, f.count), signed(current.delta.studyTimeDiffMs, f.duration),
        current.delta.accuracyDiffPts === null ? l('Veri yok', 'No data') : `${signed(current.delta.accuracyDiffPts, (v) => f.decimal(v, 1))} ${l('puan', 'pp')}`,
        signed(current.delta.studiedDaysDiff, f.count),
    ] : [];
    const primaryValues = current ? rows(current.primary) : []; const baselineValues = current ? rows(current.baseline) : [];
    return <Card padded title={l('Karşılaştırma', 'Comparison')} description={l('Kart tekrar kayıtları karşılaştırılır; Kronometre süreleri eklenmez.', 'Compares card review records; stopwatch time is separate.')}>
        <SegmentedControl fill options={[{ value: 'period', label: l('Dönem', 'Periods') }, { value: 'deck', label: l('Deste', 'Decks') }]} value={mode} onChange={setMode} accessibilityLabel={l('Karşılaştırma türü', 'Comparison type')} />
        {mode === 'period' ? <SegmentedControl fill options={[{ value: 'week', label: l('Son 7 gün', 'Last 7 days') }, { value: 'month', label: l('Son 30 gün', 'Last 30 days') }, { value: 'threeMonths', label: l('Son 90 gün', 'Last 90 days') }]} value={preset} onChange={setPreset} accessibilityLabel={l('Karşılaştırma dönemi', 'Comparison period')} /> : <View>
            <SelectRow label={l('Birinci deste', 'First deck')} value={deckLabel(primaryDeck)} onPress={() => onRequestPickDeck('primary', primaryDeck)} />
            <SelectRow label={l('İkinci deste', 'Second deck')} value={deckLabel(baselineDeck)} onPress={() => onRequestPickDeck('baseline', baselineDeck)} />
        </View>}
        {error ? <ReadErrorBanner title={l('Karşılaştırma okunamadı.', 'Comparison could not be read.')} retryLabel={l('Tekrar dene', 'Try again')} onRetry={retry} /> : !current || loading ? <LoadingState delayed label={l('Karşılaştırma yükleniyor…', 'Loading comparison…')} /> : <>
            <View style={styles.series}>
                <Text style={[Type.caption, styles.half, { color: colors.accent }]}>{`${current.primaryLabel}\n${current.primaryPeriod}`}</Text>
                <Text style={[Type.caption, styles.half, { color: colors.streak }]}>{`${current.baselineLabel}\n${current.baselinePeriod}`}</Text>
            </View>
            {labels.map((label, index) => <View key={label} style={styles.metric} accessible accessibilityLabel={`${label}: ${current.primaryLabel} ${primaryValues[index]}, ${current.baselineLabel} ${baselineValues[index]}, ${l('fark', 'difference')} ${differences[index]}`}>
                <Text style={[Type.caption, { color: colors.textMuted }]}>{label}</Text>
                <View style={styles.series}><Text style={[Type.bodyStrong, styles.half, { color: colors.textPrimary }]}>{primaryValues[index]}</Text><Text style={[Type.bodyStrong, styles.half, { color: colors.textPrimary }]}>{baselineValues[index]}</Text></View>
                <Text style={[Type.caption, { color: colors.textSecondary }]}>{l('Fark: ', 'Difference: ')}{differences[index]}</Text>
            </View>)}
            {!current.delta.hasPrimaryData || !current.delta.hasBaselineData ? <Notice>{l('Bir veya iki seride cevap kaydı yok. Doğruluk ve yüzde değişimi veri yoksa hesaplanmaz.', 'One or both series have no answers. Accuracy and percentage change are unavailable without data.')}</Notice> : null}
            <SegmentedControl fill options={[{ value: 'answers', label: l('Cevap', 'Answers') }, { value: 'time', label: l('Süre', 'Time') }, { value: 'accuracy', label: l('Doğruluk', 'Accuracy') }]} value={metric} onChange={setMetric} accessibilityLabel={l('Grafik ölçüsü', 'Chart metric')} />
            <ComparisonBarChart buckets={buckets} metric={metric} primaryLabel={current.primaryLabel} baselineLabel={current.baselineLabel} primaryColor={colors.accent} baselineColor={colors.streak} accessibilityLabel={l('Dönem veya deste karşılaştırması', 'Period or deck comparison')} emptyTitle={l('Bu aralıkta cevap yok', 'No answers in this period')} />
        </>}
    </Card>;
}
const styles = StyleSheet.create({ series: { flexDirection: 'row', gap: Spacing.sm }, half: { flex: 1, minWidth: 0 }, metric: { gap: Spacing.xs } });
