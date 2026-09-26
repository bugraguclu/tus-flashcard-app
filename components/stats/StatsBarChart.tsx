import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import {
    axisTicks,
    barGeometry,
    compactAxisValue,
    indexAtPosition,
    labelIndexes,
    roundedTopBarPath,
    stackSegments,
} from '../../lib/chartAxis';
import type { ChartPoint } from '../../lib/statsSeries';
import { useChartScrub } from './useChartScrub';

export interface StatsChartSeries {
    key: string;
    label: string;
    color: string;
}

export interface StatsChartReadout {
    /** Left of the caption: what the figure describes. */
    title: string;
    /** Right of the caption: the figure itself. */
    value: string;
    /** Second caption line, e.g. a running total or a hint. */
    note?: string;
}

interface StatsBarChartProps {
    points: readonly ChartPoint[];
    /** Series in stack order, bottom to top. */
    series: readonly StatsChartSeries[];
    /** Caption while nothing is selected. */
    summary: StatsChartReadout;
    /** Caption for a selected bucket; defaults to its detail and total. */
    readout?: (index: number) => StatsChartReadout;
    /** Exact value of one series in the legend. */
    formatValue: (value: number) => string;
    /** Compact axis tick; exact values stay in the caption and legend. */
    formatAxisValue?: (value: number) => string;
    /** Whole-number ticks for counts; minutes may need fractions. */
    integerAxis?: boolean;
    /** Plot height in points, excluding the date axis. */
    plotHeight?: number;
    /** A dashed rule before one bucket, e.g. where the backlog ends and today begins. */
    marker?: { index: number; label: string };
    /** Legend values while nothing is selected; defaults to each series' total. */
    legendTotals?: readonly number[];
    /** Buckets that get an axis label, when evenly thinned labels would land on odd values. */
    tickIndexes?: readonly number[];
    emptyTitle: string;
    emptyHint?: string;
    /** What the chart measures, read first by VoiceOver. */
    accessibilityLabel: string;
    /** Controlled selection, for charts that share it with a companion panel. */
    selectedIndex?: number | null;
    onSelectedIndexChange?: (index: number | null) => void;
    /**
     * Turns a tap on a non-empty bar into an action instead of a selection. Sliding across the
     * plot still selects, and VoiceOver's double tap acts on the bar picked by swiping.
     */
    onPressBar?: (index: number) => void;
    /** VoiceOver hint that says what `onPressBar` does. */
    pressHint?: string;
}

/** Width reserved for the value axis; companion panels align to it. */
export const CHART_AXIS_WIDTH = 34;
export const CHART_RIGHT_GUTTER = 6;
const AXIS_BAND = 20;
const PLOT_TOP = 6;
const LABEL_SLOT = 56;
/** Average advance of one 10pt axis character, for keeping end labels inside the chart. */
const LABEL_CHAR_WIDTH = 5.6;

/**
 * The bar chart behind most statistics sections: one value axis, thin bars with rounded data
 * ends, stacked series separated by a surface gap. Selecting a bucket — by tap, by dragging
 * across the plot, or by swiping up and down with VoiceOver — rewrites the caption above the
 * plot and the legend below it with that bucket's figures, so nothing floats over the bars. A
 * chart given `onPressBar` opens a bar on tap rather than selecting it.
 */
export default function StatsBarChart({
    points,
    series,
    summary,
    readout,
    formatValue,
    formatAxisValue = compactAxisValue,
    integerAxis = true,
    plotHeight = 150,
    marker,
    legendTotals,
    tickIndexes,
    emptyTitle,
    emptyHint,
    accessibilityLabel,
    selectedIndex,
    onSelectedIndexChange,
    onPressBar,
    pressHint,
}: StatsBarChartProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [width, setWidth] = useState(0);
    const [ownSelection, setOwnSelection] = useState<number | null>(null);
    const controlled = selectedIndex !== undefined;
    const rawSelected = controlled ? selectedIndex : ownSelection;
    const selected = rawSelected !== null && rawSelected !== undefined && rawSelected < points.length ? rawSelected : null;
    const select = (index: number | null) => {
        if (!controlled) setOwnSelection(index);
        onSelectedIndexChange?.(index);
    };

    const totals = useMemo(
        () => points.map((point) => point.values.reduce((sum, value) => sum + value, 0)),
        [points],
    );
    const seriesTotals = useMemo(
        () => series.map((_item, index) => points.reduce((sum, point) => sum + (point.values[index] ?? 0), 0)),
        [points, series],
    );
    const hasData = totals.some((total) => total > 0);

    const plotLeft = CHART_AXIS_WIDTH;
    const plotRight = Math.max(plotLeft + 1, width - CHART_RIGHT_GUTTER);
    const plotWidth = plotRight - plotLeft;
    const plotBottom = PLOT_TOP + plotHeight;
    const svgHeight = plotBottom + AXIS_BAND;

    const axis = useMemo(
        () => axisTicks(Math.max(0, ...totals), plotHeight >= 140 ? 4 : 3, integerAxis),
        [totals, plotHeight, integerAxis],
    );
    const geometry = useMemo(
        () => barGeometry(points.length, plotLeft, plotWidth, { minWidth: 1, maxWidth: 24, gap: 2 }),
        [points.length, plotLeft, plotWidth],
    );
    const ticks = useMemo(
        () => tickIndexes ?? labelIndexes(points.length, plotWidth, LABEL_SLOT),
        [tickIndexes, points.length, plotWidth],
    );

    const pressBar = (index: number) => {
        select(null);
        onPressBar?.(index);
    };
    const scrubHandlers = useChartScrub({
        enabled: hasData,
        indexAt: (x) => indexAtPosition(x, plotLeft, geometry.step, points.length),
        selected,
        onSelect: select,
        // An empty bar has nothing to open, so a tap on it still just shows its figures.
        onTap: onPressBar
            ? (index) => (index !== null && totals[index] > 0
                ? pressBar(index)
                : select(index === null || index === selected ? null : index))
            : undefined,
    });

    const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));

    const caption: StatsChartReadout = selected === null
        ? summary
        : readout?.(selected) ?? { title: points[selected].detail, value: formatValue(totals[selected]) };
    const legendValues = selected !== null
        ? series.map((_item, index) => points[selected].values[index] ?? 0)
        : legendTotals ?? seriesTotals;

    const stepBy = (delta: number) => {
        if (!hasData) return;
        const start = selected ?? (delta > 0 ? -1 : points.length);
        select(Math.min(points.length - 1, Math.max(0, start + delta)));
    };
    const onAccessibilityAction = (event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === 'increment') stepBy(1);
        if (event.nativeEvent.actionName === 'decrement') stepBy(-1);
        if (event.nativeEvent.actionName === 'activate' && onPressBar && selected !== null && totals[selected] > 0) {
            pressBar(selected);
        }
    };
    const spokenSelection = selected === null
        ? undefined
        : [
            `${caption.title}: ${caption.value}`,
            ...(series.length > 1
                ? series.map((item, index) => `${item.label} ${formatValue(points[selected].values[index] ?? 0)}`)
                : []),
            caption.note ?? '',
        ].filter(Boolean).join(', ');

    return (
        <View>
            <View style={styles.caption}>
                <View style={styles.captionRow}>
                    <Text style={[styles.captionTitle, selected !== null && styles.captionTitleActive]} numberOfLines={1}>
                        {caption.title}
                    </Text>
                    <Text style={styles.captionValue} numberOfLines={1} maxFontSizeMultiplier={1.3}>{caption.value}</Text>
                </View>
                <Text style={styles.captionNote} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {(hasData && caption.note) || ' '}
                </Text>
            </View>

            <View
                style={{ height: svgHeight }}
                onLayout={onLayout}
                {...scrubHandlers}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={accessibilityLabel}
                accessibilityHint={onPressBar && hasData ? pressHint : undefined}
                accessibilityValue={{ text: spokenSelection ?? (hasData ? summary.value : emptyTitle) }}
                accessibilityActions={hasData
                    ? [{ name: 'increment' }, { name: 'decrement' }, ...(onPressBar ? [{ name: 'activate' }] : [])]
                    : []}
                onAccessibilityAction={onAccessibilityAction}
            >
                {width > 0 && hasData ? (
                    <View style={{ pointerEvents: 'none' }}>
                        <Svg width={width} height={svgHeight}>
                            {axis.ticks.map((tick) => {
                                const y = plotBottom - (tick / axis.top) * plotHeight;
                                return (
                                    <G key={`grid-${tick}`}>
                                        <Line
                                            x1={plotLeft}
                                            x2={plotRight}
                                            y1={y}
                                            y2={y}
                                            stroke={tick === 0 ? colors.border : colors.borderLight}
                                            strokeWidth={tick === 0 ? 1 : 0.75}
                                        />
                                        <SvgText
                                            x={plotLeft - 6}
                                            y={y + 3.5}
                                            fill={colors.textMuted}
                                            fontSize={10}
                                            textAnchor="end"
                                        >
                                            {formatAxisValue(tick)}
                                        </SvgText>
                                    </G>
                                );
                            })}

                            {selected !== null && (
                                <Rect
                                    x={plotLeft + selected * geometry.step}
                                    y={PLOT_TOP}
                                    width={Math.max(geometry.step, 2)}
                                    height={plotHeight}
                                    fill={colors.textPrimary}
                                    opacity={0.06}
                                />
                            )}

                            {marker && marker.index > 0 && marker.index < points.length && (
                                <G>
                                    <Line
                                        x1={plotLeft + marker.index * geometry.step}
                                        x2={plotLeft + marker.index * geometry.step}
                                        y1={PLOT_TOP}
                                        y2={plotBottom}
                                        stroke={colors.textMuted}
                                        strokeWidth={1}
                                        strokeDasharray="3 3"
                                    />
                                    <SvgText
                                        x={plotLeft + marker.index * geometry.step + 4}
                                        y={PLOT_TOP + 9}
                                        fill={colors.textMuted}
                                        fontSize={10}
                                        fontWeight="600"
                                    >
                                        {marker.label}
                                    </SvgText>
                                </G>
                            )}

                            {points.map((point, pointIndex) => {
                                const segments = stackSegments(point.values, axis.top, plotBottom, plotHeight, 2);
                                if (segments.length === 0) return null;
                                const x = geometry.xForIndex(pointIndex);
                                const dimmed = selected !== null && selected !== pointIndex;
                                return (
                                    <G key={`bar-${pointIndex}`} opacity={dimmed ? 0.35 : 1}>
                                        {segments.map((segment) => {
                                            const fill = series[segment.series]?.color ?? colors.accent;
                                            return segment.top && geometry.barWidth >= 3 ? (
                                                <Path
                                                    key={segment.series}
                                                    d={roundedTopBarPath(x, segment.y, geometry.barWidth, segment.height, 4)}
                                                    fill={fill}
                                                />
                                            ) : (
                                                <Rect
                                                    key={segment.series}
                                                    x={x}
                                                    y={segment.y}
                                                    width={geometry.barWidth}
                                                    height={segment.height}
                                                    fill={fill}
                                                />
                                            );
                                        })}
                                    </G>
                                );
                            })}

                            {ticks.map((index) => {
                                const label = points[index]?.label ?? '';
                                // Centred under its bar, and nudged inwards only as far as it takes
                                // to keep an end label from running off the plot.
                                const halfWidth = label.length * LABEL_CHAR_WIDTH / 2;
                                const x = Math.min(
                                    Math.max(geometry.centreForIndex(index), plotLeft + halfWidth),
                                    Math.max(plotLeft + halfWidth, width - halfWidth),
                                );
                                return (
                                    <SvgText
                                        key={`tick-${index}`}
                                        x={x}
                                        y={plotBottom + 14}
                                        fill={selected === index ? colors.textPrimary : colors.textMuted}
                                        fontSize={10}
                                        fontWeight={selected === index ? '700' : '400'}
                                        textAnchor="middle"
                                    >
                                        {label}
                                    </SvgText>
                                );
                            })}
                        </Svg>
                    </View>
                ) : !hasData ? (
                    <View style={styles.empty}>
                        <View style={styles.emptyGlyph}>
                            {[10, 20, 14].map((height, index) => (
                                <View key={index} style={[styles.emptyBar, { height }]} />
                            ))}
                        </View>
                        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                        {emptyHint ? <Text style={styles.emptyHint}>{emptyHint}</Text> : null}
                    </View>
                ) : null}
            </View>

            {series.length > 1 && hasData && (
                <View style={styles.legend}>
                    {series.map((item, index) => seriesTotals[index] > 0 && (
                        <View key={item.key} style={styles.legendItem}>
                            <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
                            <Text style={styles.legendLabel} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                                {item.label}
                            </Text>
                            <Text style={styles.legendValue} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                                {formatValue(legendValues[index] ?? 0)}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        caption: { marginBottom: Spacing.xs },
        captionRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
        captionTitle: { flex: 1, color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
        captionTitleActive: { color: colors.textPrimary, fontWeight: '700' },
        captionValue: { color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
        captionNote: { color: colors.textMuted, fontSize: FontSize.xs, lineHeight: 15, marginTop: 1 },
        empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
        emptyGlyph: {
            height: 30,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 4,
            paddingHorizontal: 6,
            borderBottomWidth: 1,
            borderBottomColor: colors.borderLight,
            marginBottom: Spacing.sm,
        },
        emptyBar: { width: 8, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.borderLight },
        emptyTitle: { color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700', textAlign: 'center' },
        emptyHint: { color: colors.textMuted, fontSize: FontSize.xs, lineHeight: 16, textAlign: 'center', marginTop: 3 },
        legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.md, rowGap: 6, marginTop: Spacing.sm },
        legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
        legendSwatch: { width: 10, height: 10, borderRadius: 3 },
        legendLabel: { color: colors.textSecondary, fontSize: FontSize.xs },
        legendValue: { color: colors.textPrimary, fontSize: FontSize.xs, fontWeight: '700' },
    });
}
