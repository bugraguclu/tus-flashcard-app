import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import Svg, { Line, Polyline, Rect } from 'react-native-svg';
import { FontSize, Spacing, type ColorScheme } from '../constants/theme';
import type { StatsSeriesPoint } from '../lib/ankiStats';

export interface StatsChartSeries {
    label: string;
    color: string;
}

type Props = {
    points: StatsSeriesPoint[];
    series: StatsChartSeries[];
    colors: ColorScheme;
    emptyLabel: string;
    cumulative?: boolean;
    cumulativeIsPercent?: boolean;
    cumulativeLabel?: string;
};

const CHART_HEIGHT = 148;
const TOP_PADDING = 8;
const BOTTOM_PADDING = 10;

export default function StatsBarChart({
    points,
    series,
    colors,
    emptyLabel,
    cumulative = false,
    cumulativeIsPercent = false,
    cumulativeLabel = 'Cumulative',
}: Props) {
    const [width, setWidth] = useState(0);
    const chartHeight = CHART_HEIGHT - TOP_PADDING - BOTTOM_PADDING;
    const maxStack = useMemo(() => Math.max(
        1,
        ...points.map((point) => point.values.reduce((sum, value) => sum + value, 0)),
    ), [points]);
    const maxCumulative = useMemo(() => Math.max(
        cumulativeIsPercent ? 100 : 1,
        ...points.map((point) => point.cumulative ?? 0),
    ), [points, cumulativeIsPercent]);

    const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
    const hasData = points.some((point) => point.values.some((value) => value > 0));
    const step = points.length > 0 ? width / points.length : width;
    const barWidth = Math.max(2, Math.min(18, step * 0.66));
    const labelIndexes = points.length <= 3
        ? points.map((_, index) => index)
        : [0, Math.floor((points.length - 1) / 2), points.length - 1];

    return (
        <View>
            <View style={styles.chart} onLayout={onLayout}>
                {width > 0 && hasData ? (
                    <Svg width={width} height={CHART_HEIGHT}>
                        {[0, 0.5, 1].map((ratio) => (
                            <Line
                                key={ratio}
                                x1={0}
                                x2={width}
                                y1={TOP_PADDING + chartHeight * ratio}
                                y2={TOP_PADDING + chartHeight * ratio}
                                stroke={colors.borderLight}
                                strokeWidth={1}
                            />
                        ))}
                        {points.map((point, pointIndex) => {
                            const x = pointIndex * step + (step - barWidth) / 2;
                            let bottom = TOP_PADDING + chartHeight;
                            return point.values.map((value, seriesIndex) => {
                                const height = value <= 0 ? 0 : Math.max(1.5, (value / maxStack) * chartHeight);
                                bottom -= height;
                                return (
                                    <Rect
                                        key={`${pointIndex}-${seriesIndex}`}
                                        x={x}
                                        y={bottom}
                                        width={barWidth}
                                        height={height}
                                        rx={seriesIndex === point.values.length - 1 ? 2 : 0}
                                        fill={series[seriesIndex]?.color ?? colors.accent}
                                    />
                                );
                            });
                        })}
                        {cumulative && points.length > 1 && (
                            <Polyline
                                points={points.map((point, index) => {
                                    const x = index * step + step / 2;
                                    const y = TOP_PADDING + chartHeight - ((point.cumulative ?? 0) / maxCumulative) * chartHeight;
                                    return `${x},${y}`;
                                }).join(' ')}
                                fill="none"
                                stroke={colors.textMuted}
                                strokeWidth={2}
                            />
                        )}
                    </Svg>
                ) : (
                    <View style={styles.emptyWrap}>
                        <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyLabel}</Text>
                    </View>
                )}
            </View>

            {hasData && (
                <View style={styles.axisLabels}>
                    {labelIndexes.map((index) => (
                        <Text key={index} style={[styles.axisLabel, { color: colors.textMuted }]} numberOfLines={1}>
                            {points[index]?.label}
                        </Text>
                    ))}
                </View>
            )}

            <View style={styles.legend}>
                {series.map((item) => (
                    <View key={item.label} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                        <Text style={[styles.legendText, { color: colors.textSecondary }]}>{item.label}</Text>
                    </View>
                ))}
                {cumulative && (
                    <View style={styles.legendItem}>
                        <View style={[styles.legendLine, { backgroundColor: colors.textMuted }]} />
                        <Text style={[styles.legendText, { color: colors.textSecondary }]}>{cumulativeLabel}</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    chart: { height: CHART_HEIGHT, width: '100%' },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyText: { fontSize: FontSize.sm, fontWeight: '600' },
    axisLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
    axisLabel: { maxWidth: '32%', fontSize: FontSize.xs },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.sm },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 9, height: 9, borderRadius: 2 },
    legendLine: { width: 14, height: 2 },
    legendText: { fontSize: FontSize.xs },
});
