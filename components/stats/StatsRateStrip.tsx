import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { barGeometry, indexAtPosition } from '../../lib/chartAxis';
import { CHART_AXIS_WIDTH, CHART_RIGHT_GUTTER } from './StatsBarChart';
import { useChartScrub } from './useChartScrub';

interface StatsRateStripProps {
    /** A 0–100 rate per bucket, or null where there is nothing to measure. */
    rates: readonly (number | null)[];
    color: string;
    title: string;
    formatRate: (rate: number) => string;
    selectedIndex: number | null;
    onSelectedIndexChange: (index: number | null) => void;
}

const HEIGHT = 74;
const TOP = 8;
const BOTTOM = HEIGHT - 8;

/**
 * A rate drawn under a bar chart on the same buckets — the small multiple that replaces a second
 * value axis. Its scale starts just below the lowest rate, which a line can do honestly and a bar
 * cannot, so the difference between 86% and 93% is visible rather than flattened against 100%.
 */
export default function StatsRateStrip({
    rates,
    color,
    title,
    formatRate,
    selectedIndex,
    onSelectedIndexChange,
}: StatsRateStripProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [width, setWidth] = useState(0);
    const present = rates.filter((rate): rate is number => rate !== null);
    const floor = present.length > 0 ? Math.max(0, Math.floor((Math.min(...present) - 5) / 10) * 10) : 0;
    const plotLeft = CHART_AXIS_WIDTH;
    const plotWidth = Math.max(1, width - CHART_RIGHT_GUTTER - plotLeft);
    const geometry = barGeometry(rates.length, plotLeft, plotWidth, { minWidth: 1, maxWidth: 24, gap: 2 });
    const yFor = (rate: number) => BOTTOM - ((rate - floor) / Math.max(1, 100 - floor)) * (BOTTOM - TOP);

    let path = '';
    let drawing = false;
    rates.forEach((rate, index) => {
        if (rate === null) {
            drawing = false;
            return;
        }
        path += `${drawing ? 'L' : 'M'}${geometry.centreForIndex(index).toFixed(1)},${yFor(rate).toFixed(1)}`;
        drawing = true;
    });

    const scrubHandlers = useChartScrub({
        enabled: present.length > 0,
        indexAt: (x) => indexAtPosition(x, plotLeft, geometry.step, rates.length),
        selected: selectedIndex,
        onSelect: onSelectedIndexChange,
    });

    if (present.length === 0) return null;

    return (
        <View style={styles.wrap}>
            <Text style={styles.title} maxFontSizeMultiplier={1.3}>{title}</Text>
            <View
                style={{ height: HEIGHT }}
                onLayout={(event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width))}
                {...scrubHandlers}
                aria-hidden
            >
                {width > 0 && (
                    <View style={{ pointerEvents: 'none' }}>
                        <Svg width={width} height={HEIGHT}>
                            {[floor, 100].map((tick) => (
                                <G key={tick}>
                                    <Line
                                        x1={plotLeft}
                                        x2={plotLeft + plotWidth}
                                        y1={yFor(tick)}
                                        y2={yFor(tick)}
                                        stroke={colors.borderLight}
                                        strokeWidth={0.75}
                                    />
                                    <SvgText x={plotLeft - 6} y={yFor(tick) + 3.5} fill={colors.textMuted} fontSize={10} textAnchor="end">
                                        {formatRate(tick)}
                                    </SvgText>
                                </G>
                            ))}
                            {selectedIndex !== null && rates[selectedIndex] !== null && rates[selectedIndex] !== undefined && (
                                <Line
                                    x1={geometry.centreForIndex(selectedIndex)}
                                    x2={geometry.centreForIndex(selectedIndex)}
                                    y1={TOP}
                                    y2={BOTTOM}
                                    stroke={colors.textMuted}
                                    strokeWidth={1}
                                    opacity={0.5}
                                />
                            )}
                            <Path d={path} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                            {rates.map((rate, index) => {
                                if (rate === null) return null;
                                const active = index === selectedIndex;
                                return (
                                    <Circle
                                        key={index}
                                        cx={geometry.centreForIndex(index)}
                                        cy={yFor(rate)}
                                        r={active ? 5.5 : 4}
                                        fill={color}
                                        stroke={colors.bgCard}
                                        strokeWidth={2}
                                    />
                                );
                            })}
                        </Svg>
                    </View>
                )}
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        wrap: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
        title: { color: colors.textSecondary, fontSize: FontSize.xs, fontWeight: '700', marginBottom: 2 },
    });
}
