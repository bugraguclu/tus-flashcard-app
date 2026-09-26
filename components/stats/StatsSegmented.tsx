import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontSize, dropShadow, useThemeColors, type ColorScheme } from '../../constants/theme';

export interface SegmentOption<T extends string> {
    value: T;
    label: string;
    /** Spoken instead of `label` when the visible text is an abbreviation such as "%95". */
    accessibilityLabel?: string;
}

interface StatsSegmentedProps<T extends string> {
    options: readonly SegmentOption<T>[];
    value: T;
    onChange: (value: T) => void;
    /** Names the choice for VoiceOver, e.g. "Time range". */
    accessibilityLabel: string;
    /** Stretch across the row instead of hugging the labels. */
    fill?: boolean;
}

/** An iOS-style segmented control for switching what a chart shows. */
export default function StatsSegmented<T extends string>({
    options,
    value,
    onChange,
    accessibilityLabel,
    fill = false,
}: StatsSegmentedProps<T>) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View style={[styles.track, fill && styles.trackFill]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        style={({ pressed }) => [
                            styles.segment,
                            fill && styles.segmentFill,
                            selected && styles.segmentSelected,
                            pressed && !selected && styles.segmentPressed,
                        ]}
                        onPress={() => {
                            if (!selected) onChange(option.value);
                        }}
                        hitSlop={{ top: 6, bottom: 6 }}
                        accessibilityRole="tab"
                        accessibilityLabel={option.accessibilityLabel ?? option.label}
                        accessibilityState={{ selected }}
                    >
                        <Text
                            style={[styles.label, selected && styles.labelSelected]}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.3}
                        >
                            {option.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        track: {
            flexDirection: 'row',
            alignSelf: 'flex-start',
            padding: 2,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgInput,
        },
        trackFill: { alignSelf: 'stretch' },
        segment: {
            minHeight: 30,
            paddingHorizontal: 10,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.md - 2,
        },
        segmentFill: { flex: 1, paddingHorizontal: 4 },
        segmentSelected: {
            backgroundColor: colors.bgCard,
            ...dropShadow({ y: 1, blur: 3, opacity: 0.08, elevation: 1 }),
        },
        segmentPressed: { opacity: 0.6 },
        label: { color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
        labelSelected: { color: colors.textPrimary, fontWeight: '700' },
    });
}
