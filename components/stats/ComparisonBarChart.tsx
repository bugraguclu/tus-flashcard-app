import { useMemo, useState } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import {
    axisTicks,
    compactAxisValue,
    indexAtPosition,
    labelIndexes,
    roundedTopBarPath,
} from '../../lib/chartAxis';
import type { ComparisonChartMetric, PairedComparisonBucket } from '../../lib/statsComparison';
import SideDragArea from '../SideDragArea';
import { CHART_AXIS_WIDTH, CHART_RIGHT_GUTTER } from './StatsBarChart';
import { useChartScrub } from './useChartScrub';
import { useStatsFormat } from './useStatsFormat';

const PLOT_TOP = 6;
const AXIS_BAND = 20;
const LABEL_SLOT = 52;
const LABEL_CHAR_WIDTH = 5.6;

interface ComparisonBarChartProps {
    buckets: readonly PairedComparisonBucket[];
    metric: ComparisonChartMetric;
    primaryLabel: string;
    baselineLabel: string;
    primaryColor: string;
    baselineColor: string;
    plotHeight?: number;
    accessibilityLabel: string;
    emptyTitle: string;
}

/**
 * Paired bar chart comparing two series on one shared value axis and unit.
 *
 * Missing accuracy buckets (`null`, i.e. 0 answers) draw no bar instead of a misleading 0% bar,
 * and selecting any slot (tap, horizontal scrub, or VoiceOver adjustable actions) shows both
 * series' exact dates, values and raw denominators in the caption above the plot.
 */
export default function ComparisonBarChart({
    buckets,
    metric,
    primaryLabel,
    baselineLabel,
    primaryColor,
    baselineColor,
    plotHeight = 136,
    accessibilityLabel,
    emptyTitle,
}: ComparisonBarChartProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const f = useStatsFormat();
    const { l } = f;
    const [width, setWidth] = useState(0);
    const [selectedRaw, setSelected] = useState<number | null>(null);
    const selected = selectedRaw !== null && selectedRaw < buckets.length ? selectedRaw : null;

    const hasData = useMemo(
        () => buckets.some((bucket) => bucket.primaryAnswers > 0 || bucket.baselineAnswers > 0),
        [buckets],
    );

    const maxValue = useMemo(() => {
        if (metric === 'accuracy') return 100;
        let max = 0;
        for (const bucket of buckets) {
            if (bucket.primaryValue !== null && bucket.primaryValue > max) max = bucket.primaryValue;
            if (bucket.baselineValue !== null && bucket.baselineValue > max) max = bucket.baselineValue;
        }
        return max;
    }, [buckets, metric]);

    const axis = useMemo(() => {
        if (metric === 'accuracy') return { top: 100, ticks: [0, 25, 50, 75, 100] };
        return axisTicks(maxValue, 4, metric === 'answers');
    }, [maxValue, metric]);

    const plotLeft = CHART_AXIS_WIDTH;
    const plotRight = Math.max(plotLeft + 1, width - CHART_RIGHT_GUTTER);
    const plotWidth = plotRight - plotLeft;
    const plotBottom = PLOT_TOP + plotHeight;
    const svgHeight = plotBottom + AXIS_BAND;
    const step = buckets.length > 0 ? plotWidth / buckets.length : plotWidth;
    const ticks = useMemo(() => labelIndexes(buckets.length, plotWidth, LABEL_SLOT), [buckets.length, plotWidth]);

    const scrubHandlers = useChartScrub({
        enabled: hasData,
        indexAt: (x) => indexAtPosition(x, plotLeft, step, buckets.length),
        selected,
        onSelect: setSelected,
    });

    const formatAxisTick = (value: number) => {
        if (metric === 'accuracy') return f.percent(value, 0);
        if (metric === 'time') return f.minutes(value);
        return compactAxisValue(value);
    };

    const formatBucketSide = (
        answers: number,
        passed: number,
        studyTimeMs: number,
    ): string => {
        if (metric === 'answers') return l(`${f.count(answers)} cevap`, `${f.count(answers)} ${answers === 1 ? 'answer' : 'answers'}`);
        if (metric === 'time') return f.duration(studyTimeMs);
        if (answers === 0) return l('veri yok', 'no data');
        return `${f.ratio(passed, answers)} (${f.count(passed)}/${f.count(answers)})`;
    };

    const activeBucket = selected !== null ? buckets[selected] : null;
    const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
        if (!hasData || buckets.length === 0) return;
        const action = event.nativeEvent.actionName;
        if (action === 'increment') {
            setSelected((prev) => (prev === null ? 0 : Math.min(buckets.length - 1, prev + 1)));
        } else if (action === 'decrement') {
            setSelected((prev) => (prev === null ? buckets.length - 1 : Math.max(0, prev - 1)));
        }
    };

    const spokenValue = activeBucket
        ? `${primaryLabel} (${activeBucket.detailPrimary}): ${formatBucketSide(activeBucket.primaryAnswers, activeBucket.primaryPassed, activeBucket.primaryStudyTimeMs)}; ${baselineLabel} (${activeBucket.detailBaseline}): ${formatBucketSide(activeBucket.baselineAnswers, activeBucket.baselinePassed, activeBucket.baselineStudyTimeMs)}`
        : l('Ayrıntı için bir aralık seçin', 'Select a bucket for details');

    const onLayout = (event: LayoutChangeEvent) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        if (nextWidth > 0 && nextWidth !== width) setWidth(nextWidth);
    };

    if (!hasData) {
        return <Text style={styles.empty}>{emptyTitle}</Text>;
    }

    const innerGap = step >= 18 ? 3 : 1;
    const groupPad = Math.max(2, Math.min(8, step * 0.14));
    const singleBarWidth = Math.max(2, Math.min(18, (step - groupPad * 2 - innerGap) / 2));

    const barRectHeight = (value: number | null): number => {
        if (value === null || !(value > 0) || !(axis.top > 0)) return 0;
        return Math.max(2, Math.min(plotHeight, (value / axis.top) * plotHeight));
    };

    return (
        <View style={styles.container}>
            <View style={styles.caption}>
                {activeBucket ? (
                    <View style={styles.readoutRows}>
                        <View style={styles.readoutRow}>
                            <View style={[styles.swatch, { backgroundColor: primaryColor }]} />
                            <Text style={styles.readoutLabel} numberOfLines={1}>{`${primaryLabel} · ${activeBucket.detailPrimary}`}</Text>
                            <Text style={styles.readoutValue} numberOfLines={1}>
                                {formatBucketSide(activeBucket.primaryAnswers, activeBucket.primaryPassed, activeBucket.primaryStudyTimeMs)}
                            </Text>
                        </View>
                        <View style={styles.readoutRow}>
                            <View style={[styles.swatch, { backgroundColor: baselineColor }]} />
                            <Text style={styles.readoutLabel} numberOfLines={1}>{`${baselineLabel} · ${activeBucket.detailBaseline}`}</Text>
                            <Text style={styles.readoutValue} numberOfLines={1}>
                                {formatBucketSide(activeBucket.baselineAnswers, activeBucket.baselinePassed, activeBucket.baselineStudyTimeMs)}
                            </Text>
                        </View>
                    </View>
                ) : (
                    <Text style={styles.hint} numberOfLines={2}>{f.chartHint}</Text>
                )}
            </View>

            <SideDragArea
                onLayout={onLayout}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={accessibilityLabel}
                accessibilityValue={{ text: spokenValue }}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={handleAccessibilityAction}
                {...scrubHandlers}
            >
                {width > 0 ? (
                    <Svg width={width} height={svgHeight}>
                        {axis.ticks.map((tick) => {
                            const y = plotBottom - (axis.top > 0 ? (tick / axis.top) * plotHeight : 0);
                            return (
                                <G key={tick}>
                                    <Line
                                        x1={plotLeft}
                                        y1={y}
                                        x2={plotRight}
                                        y2={y}
                                        stroke={tick === 0 ? colors.border : colors.borderLight}
                                        strokeWidth={1}
                                    />
                                    <SvgText
                                        x={plotLeft - 6}
                                        y={y + 3}
                                        fill={colors.textSecondary}
                                        fontSize={10}
                                        textAnchor="end"
                                    >
                                        {formatAxisTick(tick)}
                                    </SvgText>
                                </G>
                            );
                        })}

                        {selected !== null ? (
                            <Rect
                                x={plotLeft + selected * step}
                                y={PLOT_TOP}
                                width={step}
                                height={plotHeight}
                                fill={colors.bgInput}
                                opacity={0.75}
                                rx={4}
                            />
                        ) : null}

                        {buckets.map((bucket, index) => {
                            const center = plotLeft + index * step + step / 2;
                            const pairWidth = singleBarWidth * 2 + innerGap;
                            const leftX = center - pairWidth / 2;
                            const rightX = leftX + singleBarWidth + innerGap;
                            const hPrimary = barRectHeight(bucket.primaryValue);
                            const hBaseline = barRectHeight(bucket.baselineValue);
                            const dimmed = selected !== null && selected !== index;
                            const opacity = dimmed ? 0.35 : 1;

                            return (
                                <G key={index} opacity={opacity}>
                                    {hPrimary > 0 ? (
                                        <Path
                                            d={roundedTopBarPath(leftX, plotBottom - hPrimary, singleBarWidth, hPrimary, 3)}
                                            fill={primaryColor}
                                        />
                                    ) : null}
                                    {hBaseline > 0 ? (
                                        <Path
                                            d={roundedTopBarPath(rightX, plotBottom - hBaseline, singleBarWidth, hBaseline, 3)}
                                            fill={baselineColor}
                                        />
                                    ) : null}
                                </G>
                            );
                        })}

                        {ticks.map((index) => {
                            const bucket = buckets[index];
                            if (!bucket) return null;
                            const center = plotLeft + index * step + step / 2;
                            const half = (bucket.label.length * LABEL_CHAR_WIDTH) / 2;
                            const x = Math.max(plotLeft + half, Math.min(plotRight - half, center));
                            return (
                                <SvgText
                                    key={index}
                                    x={x}
                                    y={plotBottom + 14}
                                    fill={selected === index ? colors.textPrimary : colors.textSecondary}
                                    fontSize={10}
                                    fontWeight={selected === index ? '600' : '400'}
                                    textAnchor="middle"
                                >
                                    {bucket.label}
                                </SvgText>
                            );
                        })}
                    </Svg>
                ) : (
                    <View style={{ height: svgHeight }} />
                )}
            </SideDragArea>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { gap: Spacing.xs },
        caption: { minHeight: 36, justifyContent: 'center' },
        hint: { color: colors.textSecondary, fontSize: FontSize.xs },
        readoutRows: { gap: 4 },
        readoutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
        swatch: { width: 8, height: 8, borderRadius: 2 },
        readoutLabel: { flex: 1, minWidth: 0, color: colors.textSecondary, fontSize: FontSize.xs },
        readoutValue: {
            color: colors.textPrimary,
            fontSize: FontSize.xs,
            fontWeight: '600',
            fontVariant: ['tabular-nums'],
        },
        empty: {
            color: colors.textSecondary,
            fontSize: FontSize.sm,
            textAlign: 'center',
            paddingVertical: Spacing.lg,
        },
    });
}
