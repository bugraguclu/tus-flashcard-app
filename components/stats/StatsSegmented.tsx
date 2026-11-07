import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, type LayoutRectangle } from 'react-native';
import { Text } from '../AppText';
import { BorderRadius, FontSize, dropShadow, useIsDarkTheme, useThemeColors, type ColorScheme } from '../../constants/theme';
import { MotionDuration, MotionEasing } from '../../constants/motion';
import { useReduceMotion } from '../../hooks/useReduceMotion';

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

/**
 * An iOS-style segmented control for switching what a chart shows. The chosen segment's pill slides
 * to a new choice, easing in and out, instead of jumping there; Reduce Motion moves it at once.
 */
export default function StatsSegmented<T extends string>({
    options,
    value,
    onChange,
    accessibilityLabel,
    fill = false,
}: StatsSegmentedProps<T>) {
    const colors = useThemeColors();
    const isDark = useIsDarkTheme();
    const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
    const reduceMotion = useReduceMotion();
    const [layouts, setLayouts] = useState<Partial<Record<T, LayoutRectangle>>>({});
    const pillX = useRef(new Animated.Value(0)).current;
    const pillWidth = useRef(new Animated.Value(0)).current;
    const placedFor = useRef<T | null>(null);
    const chosen = layouts[value];

    useEffect(() => {
        if (!chosen) return undefined;
        // The first placement, a new text size or a narrower screen moves the pill without a slide.
        const slide = placedFor.current !== null && placedFor.current !== value && !reduceMotion;
        placedFor.current = value;
        if (!slide) {
            pillX.setValue(chosen.x);
            pillWidth.setValue(chosen.width);
            return undefined;
        }
        // Left and width are layout, which the native driver cannot animate; the control is small.
        const animation = Animated.parallel([pillX, pillWidth].map((position, index) => Animated.timing(position, {
            toValue: index === 0 ? chosen.x : chosen.width,
            duration: MotionDuration.move,
            easing: MotionEasing.inOut,
            useNativeDriver: false,
            isInteraction: false,
        })));
        animation.start();
        return () => animation.stop();
    }, [chosen?.x, chosen?.width, value, reduceMotion, pillX, pillWidth]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <View style={[styles.track, fill && styles.trackFill]} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
            {chosen ? (
                <Animated.View style={[styles.pill, { left: pillX, width: pillWidth, pointerEvents: 'none' }]} />
            ) : null}
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        onLayout={(event) => {
                            const layout = event.nativeEvent.layout;
                            setLayouts((current) => {
                                const known = current[option.value];
                                if (known && known.x === layout.x && known.width === layout.width) return current;
                                return { ...current, [option.value]: layout };
                            });
                        }}
                        style={({ pressed }) => [
                            styles.segment,
                            fill && styles.segmentFill,
                            // Until the segments are measured the chosen one carries its own pill.
                            selected && !chosen && styles.segmentSelected,
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

function createStyles(colors: ColorScheme, isDark: boolean) {
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
            // On a dark track the card colour is darker than the track itself; the border tone
            // lifts the chosen segment instead of sinking it.
            backgroundColor: isDark ? colors.border : colors.bgCard,
            ...dropShadow({ y: 1, blur: 3, opacity: 0.08, elevation: 1 }),
        },
        // The chosen segment's pill, drawn under the labels once the segments are measured.
        pill: {
            position: 'absolute',
            top: 2,
            bottom: 2,
            borderRadius: BorderRadius.md - 2,
            backgroundColor: isDark ? colors.border : colors.bgCard,
            ...dropShadow({ y: 1, blur: 3, opacity: 0.08, elevation: 1 }),
        },
        segmentPressed: { opacity: 0.6 },
        label: { color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
        labelSelected: { color: colors.textPrimary, fontWeight: '700' },
    });
}
