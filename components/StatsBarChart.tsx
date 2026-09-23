import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { FontSize, Spacing, type ColorScheme } from '../constants/theme';
import type { StatsSeriesPoint } from '../lib/ankiStats';
import { axisTicks, barGeometry, compactAxisValue, labelIndexes, tooltipPlacement } from '../lib/chartAxis';

export interface StatsChartSeries {
    label: string;
    color: string;
}

type Props = {
    points: StatsSeriesPoint[];
    series: StatsChartSeries[];
    colors: ColorScheme;
    emptyLabel: string;
    /** Plot height in points. Taller charts get more y-axis gridlines. */
    height?: number;
    /** Draw Anki's running-total line against its own right-hand axis. */
    cumulative?: boolean;
    cumulativeLabel?: string;
    /** Formats a stacked total for the axis and the readout (defaults to a plain integer). */
    formatValue?: (value: number) => string;
    /** Compact formatter used only on the left axis; exact tooltip values stay unchanged. */
    formatAxisValue?: (value: number) => string;
    /** Right-hand axis formatter when it differs from the bars (e.g. a percentage). */
    formatCumulative?: (value: number) => string;
    /** Marks the boundary between past and future, drawn as a dashed rule (Future Due backlog). */
    todayIndex?: number;
    /** Row label for the stacked total inside the tooltip. */
    totalLabel?: string;
    /**
     * Plot the running total as a share of the whole rather than a raw count. Anki's Intervals
     * graph reads "x% of review cards are at or below this interval", which answers the question
     * the histogram is actually asked.
     */
    cumulativeAsPercent?: boolean;
    /** Short unit labels rendered above the left/right axes. */
    valueAxisLabel?: string;
    cumulativeAxisLabel?: string;
    /** Label attached to the dashed past/future boundary. */
    todayLabel?: string;
    /** A concise VoiceOver summary of what the chart measures. */
    accessibilityLabel?: string;
    /** Visible instruction below non-empty charts. */
    interactionHint?: string;
    /** Secondary guidance shown with an empty state. */
    emptyHint?: string;
};

const PLOT_TOP = 24;
const AXIS_HEIGHT = 18;
const Y_AXIS_WIDTH = 34;
const RIGHT_GUTTER = 10;
const CUMULATIVE_AXIS_WIDTH = 38;
const MIN_BAR_WIDTH = 1;
const MAX_BAR_WIDTH = 26;
/** Roughly the width one date label needs before its neighbour starts to crowd it. */
const LABEL_SLOT = 58;

export default function StatsBarChart({
    points,
    series,
    colors,
    emptyLabel,
    height = 168,
    cumulative = false,
    cumulativeLabel,
    formatValue,
    formatAxisValue,
    formatCumulative,
    todayIndex,
    totalLabel = 'Σ',
    cumulativeAsPercent = false,
    valueAxisLabel,
    cumulativeAxisLabel,
    todayLabel,
    accessibilityLabel,
    interactionHint,
    emptyHint,
}: Props) {
    const [width, setWidth] = useState(0);
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    /** Where the finger is, so the readout can stay clear of it. */
    const [touchY, setTouchY] = useState(0);

    const totals = useMemo(
        () => points.map((point) => point.values.reduce((sum, value) => sum + value, 0)),
        [points],
    );
    const runningTotals = useMemo(() => {
        let running = 0;
        const absolute = totals.map((total) => (running += total));
        if (!cumulativeAsPercent) return absolute;
        const grand = absolute[absolute.length - 1] ?? 0;
        return grand > 0 ? absolute.map((value) => (value / grand) * 100) : absolute.map(() => 0);
    }, [totals, cumulativeAsPercent]);

    const hasData = totals.some((total) => total > 0);
    const format = formatValue ?? ((value: number) => String(Math.round(value)));
    const formatAxis = formatAxisValue ?? compactAxisValue;
    const formatRight = formatCumulative
        ?? (cumulativeAsPercent ? (value: number) => `${Math.round(value)}%` : format);

    const plotLeft = Y_AXIS_WIDTH;
    const plotRight = Math.max(plotLeft + 1, width - (cumulative ? CUMULATIVE_AXIS_WIDTH : RIGHT_GUTTER));
    const plotWidth = plotRight - plotLeft;
    const plotBottom = height - AXIS_HEIGHT;
    const plotHeight = plotBottom - PLOT_TOP;

    const valueAxis = useMemo(
        () => axisTicks(Math.max(...totals, 0), plotHeight >= 150 ? 5 : 4),
        [totals, plotHeight],
    );
    const cumulativeAxis = useMemo(
        () => (cumulativeAsPercent
            ? { top: 100, ticks: [0, 25, 50, 75, 100] }
            : axisTicks(runningTotals[runningTotals.length - 1] ?? 0, 4)),
        [runningTotals, cumulativeAsPercent],
    );

    const { step, barWidth, xForIndex, centreForIndex } = useMemo(
        () => barGeometry(points.length, plotLeft, plotWidth, {
            minWidth: MIN_BAR_WIDTH,
            maxWidth: MAX_BAR_WIDTH,
        }),
        [points.length, plotLeft, plotWidth],
    );
    const yForValue = (value: number) => plotBottom - (value / valueAxis.top) * plotHeight;

    const ticks = useMemo(
        () => labelIndexes(points.length, plotWidth, LABEL_SLOT),
        [points.length, plotWidth],
    );

    const cumulativeLine = useMemo(() => {
        if (!cumulative || points.length === 0) return '';
        return runningTotals
            .map((total, index) => {
                const x = centreForIndex(index);
                const y = plotBottom - (total / cumulativeAxis.top) * plotHeight;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
    }, [cumulative, runningTotals, cumulativeAxis.top, centreForIndex, plotBottom, plotHeight, points.length]);

    const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

    const pickIndex = (event: GestureResponderEvent) => {
        if (points.length === 0 || step <= 0) return;
        const x = event.nativeEvent.locationX - plotLeft;
        const index = Math.floor(x / step);
        setTouchY(event.nativeEvent.locationY);
        if (index < 0 || index >= points.length) {
            setActiveIndex(null);
            return;
        }
        setActiveIndex((current) => current === index ? null : index);
    };

    const active = activeIndex !== null ? points[activeIndex] : null;
    const readout = active
        ? {
            label: active.label,
            total: totals[activeIndex!],
            running: runningTotals[activeIndex!],
            values: active.values,
        }
        : null;

    // The tooltip follows the finger instead of sitting in a fixed slot: it is anchored to the
    // touched bucket, nudged above the top of its stack so the bar stays visible, and clamped to
    // the chart so it never leaves the card. Its real size is measured once and reused, which is
    // why the first frame is rendered transparent rather than in the wrong place.
    const [tooltipSize, setTooltipSize] = useState({ width: 0, height: 0 });
    const { left: tooltipLeft, top: tooltipTop } = tooltipPlacement(
        activeIndex !== null ? centreForIndex(activeIndex) : 0,
        touchY,
        tooltipSize,
        { width, height },
    );

    const seriesTotals = series.map((_item, seriesIndex) => points.reduce(
        (sum, point) => sum + (point.values[seriesIndex] ?? 0),
        0,
    ));
    const cumulativeArea = cumulativeLine
        ? `${plotLeft},${plotBottom} ${cumulativeLine} ${plotRight},${plotBottom}`
        : '';

    return (
        <View>
            <Pressable
                style={[styles.chart, { height }]}
                onLayout={onLayout}
                onPress={hasData ? pickIndex : undefined}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel ?? emptyLabel}
                accessibilityHint={hasData ? interactionHint : emptyHint}
                accessibilityState={{ disabled: !hasData }}
            >
                {width > 0 && hasData ? (
                    <Svg width={width} height={height}>
                        {valueAxisLabel && (
                            <SvgText x={plotLeft} y={11} fill={colors.textMuted} fontSize={9} fontWeight="600">
                                {valueAxisLabel}
                            </SvgText>
                        )}
                        {cumulative && cumulativeAxisLabel && (
                            <SvgText x={plotRight} y={11} fill={colors.textMuted} fontSize={9} fontWeight="600" textAnchor="end">
                                {cumulativeAxisLabel}
                            </SvgText>
                        )}
                        {/* Horizontal gridlines with their values, so a bar can be read without touching it. */}
                        {valueAxis.ticks.map((tick) => {
                            const y = yForValue(tick);
                            return (
                                <G key={`grid-${tick}`}>
                                    <Line
                                        x1={plotLeft}
                                        x2={plotRight}
                                        y1={y}
                                        y2={y}
                                        stroke={tick === 0 ? colors.border : colors.borderLight}
                                        strokeWidth={1}
                                    />
                                    <SvgText
                                        x={plotLeft - 6}
                                        y={y + 3.5}
                                        fill={colors.textMuted}
                                        fontSize={9}
                                        textAnchor="end"
                                    >
                                        {formatAxis(tick)}
                                    </SvgText>
                                </G>
                            );
                        })}

                        {/* The past/future divider on Future Due. */}
                        {todayIndex !== undefined && todayIndex > 0 && todayIndex < points.length && (
                            <G>
                                <Line
                                    x1={plotLeft + todayIndex * step}
                                    x2={plotLeft + todayIndex * step}
                                    y1={PLOT_TOP - 3}
                                    y2={plotBottom}
                                    stroke={colors.textMuted}
                                    strokeWidth={1}
                                    strokeDasharray="3 3"
                                />
                                {todayLabel && (
                                    <SvgText
                                        x={Math.min(plotLeft + todayIndex * step + 4, plotRight - 4)}
                                        y={PLOT_TOP - 8}
                                        fill={colors.textMuted}
                                        fontSize={9}
                                        textAnchor={plotLeft + todayIndex * step > plotRight - 46 ? 'end' : 'start'}
                                    >
                                        {todayLabel}
                                    </SvgText>
                                )}
                            </G>
                        )}

                        {activeIndex !== null && (
                            <G>
                                <Rect
                                    x={plotLeft + activeIndex * step}
                                    y={PLOT_TOP}
                                    width={Math.max(step, 2)}
                                    height={plotHeight}
                                    fill={colors.textPrimary}
                                    opacity={0.07}
                                />
                                {/* A guide line ties the tooltip to the bucket it describes. */}
                                <Line
                                    x1={centreForIndex(activeIndex)}
                                    x2={centreForIndex(activeIndex)}
                                    y1={PLOT_TOP}
                                    y2={plotBottom}
                                    stroke={colors.textSecondary}
                                    strokeWidth={1}
                                    opacity={0.35}
                                />
                            </G>
                        )}

                        {points.map((point, pointIndex) => {
                            const x = xForIndex(pointIndex);
                            let bottom = plotBottom;
                            return point.values.map((value, seriesIndex) => {
                                if (value <= 0) return null;
                                const raw = (value / valueAxis.top) * plotHeight;
                                // Never let a non-zero bucket disappear entirely.
                                const barHeight = Math.max(1, raw);
                                bottom -= barHeight;
                                return (
                                    <Rect
                                        key={`${pointIndex}-${seriesIndex}`}
                                        x={x}
                                        y={bottom}
                                        width={barWidth}
                                        height={barHeight}
                                        fill={series[seriesIndex]?.color ?? colors.accent}
                                        stroke={barWidth >= 4 ? colors.bgCard : undefined}
                                        strokeWidth={barWidth >= 4 ? 0.6 : 0}
                                        rx={barWidth >= 8 ? 1.5 : 0}
                                    />
                                );
                            });
                        })}

                        {cumulative && cumulativeLine !== '' && (
                            <>
                                <Polygon
                                    points={cumulativeArea}
                                    fill={colors.textMuted}
                                    opacity={0.08}
                                />
                                <Polyline
                                    points={cumulativeLine}
                                    fill="none"
                                    stroke={colors.textSecondary}
                                    strokeWidth={1.5}
                                    strokeLinejoin="round"
                                />
                                {cumulativeAxis.ticks.map((tick) => (
                                    <SvgText
                                        key={`cum-${tick}`}
                                        x={plotRight + 6}
                                        y={plotBottom - (tick / cumulativeAxis.top) * plotHeight + 3.5}
                                        fill={colors.textMuted}
                                        fontSize={9}
                                        textAnchor="start"
                                    >
                                        {formatRight(tick)}
                                    </SvgText>
                                ))}
                                {activeIndex !== null && (
                                    <Circle
                                        cx={centreForIndex(activeIndex)}
                                        cy={plotBottom - (runningTotals[activeIndex] / cumulativeAxis.top) * plotHeight}
                                        r={3}
                                        fill={colors.textSecondary}
                                    />
                                )}
                            </>
                        )}

                        {/* Date labels sit under the bucket they describe rather than being spread
                            across the row, which is what made the axis disagree with the bars. */}
                        {ticks.map((index) => {
                            const centre = centreForIndex(index);
                            const clamped = Math.min(Math.max(centre, plotLeft + 12), plotRight - 12);
                            return (
                                <G key={`tick-${index}`}>
                                    <Line
                                        x1={centre}
                                        x2={centre}
                                        y1={plotBottom}
                                        y2={plotBottom + 3}
                                        stroke={colors.borderLight}
                                        strokeWidth={1}
                                    />
                                    <SvgText
                                        x={clamped}
                                        y={plotBottom + 13}
                                        fill={colors.textMuted}
                                        fontSize={9}
                                        textAnchor="middle"
                                    >
                                        {points[index]?.label ?? ''}
                                    </SvgText>
                                </G>
                            );
                        })}
                    </Svg>
                ) : (
                    <View style={styles.emptyWrap}>
                        <View style={[styles.emptyGlyph, { borderColor: colors.borderLight }]}>
                            <View style={[styles.emptyBar, { backgroundColor: colors.borderLight, height: 12 }]} />
                            <View style={[styles.emptyBar, { backgroundColor: colors.borderLight, height: 24 }]} />
                            <View style={[styles.emptyBar, { backgroundColor: colors.borderLight, height: 17 }]} />
                        </View>
                        <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyLabel}</Text>
                        {emptyHint && <Text style={[styles.emptyHint, { color: colors.textMuted }]}>{emptyHint}</Text>}
                    </View>
                )}

                {readout && (
                    <View
                        style={[
                            styles.tooltip,
                            {
                                backgroundColor: colors.bgCard,
                                borderColor: colors.border,
                                left: tooltipLeft,
                                top: tooltipTop,
                                opacity: tooltipSize.width > 0 ? 1 : 0,
                            },
                        ]}
                        pointerEvents="none"
                        onLayout={(event) => {
                            const { width: w, height: h } = event.nativeEvent.layout;
                            if (w !== tooltipSize.width || h !== tooltipSize.height) {
                                setTooltipSize({ width: w, height: h });
                            }
                        }}
                    >
                        <Text style={[styles.tooltipLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                            {readout.label}
                        </Text>
                        {series.map((item, index) => (
                            <View key={item.label} style={styles.tooltipRow}>
                                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                                <Text style={[styles.tooltipSeries, { color: colors.textSecondary }]} numberOfLines={1}>
                                    {item.label}
                                </Text>
                                <Text style={[styles.tooltipValue, { color: colors.textPrimary }]}>
                                    {format(readout.values[index] ?? 0)}
                                </Text>
                            </View>
                        ))}
                        {series.length > 1 && (
                            <View style={[styles.tooltipRow, styles.tooltipTotalRow, { borderTopColor: colors.borderLight }]}>
                                <Text style={[styles.tooltipSeries, { color: colors.textSecondary }]}>{totalLabel}</Text>
                                <Text style={[styles.tooltipValue, { color: colors.textPrimary }]}>
                                    {format(readout.total)}
                                </Text>
                            </View>
                        )}
                        {cumulative && (
                            <View style={styles.tooltipRow}>
                                <View style={[styles.legendLine, { backgroundColor: colors.textSecondary }]} />
                                <Text style={[styles.tooltipSeries, { color: colors.textSecondary }]} numberOfLines={1}>
                                    {cumulativeLabel ?? ''}
                                </Text>
                                <Text style={[styles.tooltipValue, { color: colors.textPrimary }]}>
                                    {formatRight(readout.running)}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </Pressable>

            <View style={styles.legend}>
                {series.map((item, index) => (
                    <View key={item.label} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                        <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                            {item.label}{series.length > 1 ? `  ${format(seriesTotals[index])}` : ''}
                        </Text>
                    </View>
                ))}
                {cumulative && cumulativeLabel && (
                    <View style={styles.legendItem}>
                        <View style={[styles.legendLine, { backgroundColor: colors.textSecondary }]} />
                        <Text style={[styles.legendText, { color: colors.textSecondary }]}>{cumulativeLabel}</Text>
                    </View>
                )}
            </View>
            {hasData && interactionHint && (
                <Text style={[styles.interactionHint, { color: colors.textMuted }]}>{interactionHint}</Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    chart: { width: '100%', position: 'relative' },
    tooltip: {
        position: 'absolute',
        minWidth: 116,
        maxWidth: 190,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        gap: 2,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },
    tooltipLabel: { fontSize: FontSize.xs, fontWeight: '700', marginBottom: 2 },
    tooltipRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    tooltipTotalRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2, paddingTop: 3 },
    tooltipSeries: { flex: 1, fontSize: FontSize.xs },
    tooltipValue: { fontSize: FontSize.xs, fontWeight: '700' },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
    emptyGlyph: { height: 34, flexDirection: 'row', alignItems: 'flex-end', gap: 3, padding: 4, borderBottomWidth: 1, marginBottom: Spacing.sm },
    emptyBar: { width: 7, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
    emptyText: { fontSize: FontSize.sm, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
    emptyHint: { fontSize: FontSize.xs, lineHeight: 16, textAlign: 'center', marginTop: 3 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.sm },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 9, height: 9, borderRadius: 2 },
    legendLine: { width: 12, height: 2, borderRadius: 1 },
    legendText: { fontSize: FontSize.xs },
    interactionHint: { fontSize: FontSize.xs, lineHeight: 16, marginTop: Spacing.xs },
});
