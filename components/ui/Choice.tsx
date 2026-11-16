import React, { useEffect, useRef, useState } from 'react';
import {
    type AccessibilityActionEvent,
    type AccessibilityActionInfo,
    Animated,
    type LayoutRectangle,
    Pressable,
    type StyleProp,
    StyleSheet,
    TouchableOpacity,
    View,
    type ViewStyle,
} from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { MotionDuration, MotionEasing, NATIVE_DRIVER } from '../../constants/motion';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { CheckIcon, CloseIcon, MinusIcon } from './icons';
import { DISABLED_OPACITY, HIT_TARGET, Radius, Shadow, Type } from './tokens';

/**
 * Picking among options: chips, the segmented control, checkboxes and the tick that marks the
 * chosen row of a list.
 */

interface ChipProps {
    label: string;
    selected?: boolean;
    onPress?: () => void;
    /** Shows a trailing × that removes the filter the chip stands for. */
    onRemove?: () => void;
    removeLabel?: string;
    /** A small icon before the label, e.g. a flag. */
    icon?: React.ReactNode;
    disabled?: boolean;
    /**
     * How the chip speaks: a `button` that is selected (a filter), a `radio` of a set where one is
     * chosen, or a `checkbox` of a set where any may be.
     */
    role?: 'button' | 'radio' | 'checkbox';
    /**
     * What a selected chip says besides "on": `warning` for a value that is cut back, `danger` for
     * one that is switched off. The accent by default.
     */
    tone?: 'accent' | 'warning' | 'danger';
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
}

/** A capsule that filters a list or picks one of a few short options. */
export function Chip({ label, selected = false, onPress, onRemove, removeLabel, icon, disabled = false, role = 'button', tone = 'accent', accessibilityLabel, style }: ChipProps) {
    const colors = useThemeColors();
    const [ink, fill] = tone === 'warning' ? [colors.warning, colors.warningBg]
        : tone === 'danger' ? [colors.danger, colors.dangerBg]
            : [colors.accent, colors.accentLight];
    const tint = selected ? ink : colors.textSecondary;
    return (
        <View
            style={[
                styles.chip,
                { borderColor: selected ? ink : colors.border, backgroundColor: selected ? fill : colors.bgCard },
                disabled && styles.disabled,
                style,
            ]}
        >
            <TouchableOpacity
                style={styles.chipBody}
                onPress={onPress}
                disabled={disabled || !onPress}
                hitSlop={{ top: 6, bottom: 6 }}
                accessibilityRole={role}
                accessibilityLabel={accessibilityLabel ?? label}
                accessibilityState={role === 'button' ? { selected, disabled } : { checked: selected, disabled }}
                aria-selected={role === 'button' ? selected : undefined}
                aria-checked={role === 'button' ? undefined : selected}
                aria-disabled={disabled}
            >
                {icon}
                <Text style={[styles.chipText, { color: tint }, selected && styles.chipTextSelected]} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
            {onRemove ? (
                <TouchableOpacity
                    style={styles.chipRemove}
                    onPress={onRemove}
                    hitSlop={{ top: 6, right: 6, bottom: 6, left: 2 }}
                    accessibilityRole="button"
                    accessibilityLabel={removeLabel ?? label}
                >
                    <CloseIcon color={tint} size={16} />
                </TouchableOpacity>
            ) : null}
        </View>
    );
}

export type BadgeTone = 'accent' | 'neutral' | 'info' | 'warning' | 'danger' | 'success';

/** A small read-only capsule: a status, a count, a label on a row. */
export function Badge({ label, tone = 'neutral', style }: { label: string; tone?: BadgeTone; style?: StyleProp<ViewStyle> }) {
    const colors = useThemeColors();
    const palette = {
        accent: [colors.accentLight, colors.accent],
        neutral: [colors.bgInput, colors.textSecondary],
        info: [colors.infoBg, colors.info],
        warning: [colors.warningBg, colors.warning],
        danger: [colors.dangerBg, colors.danger],
        success: [colors.successBg, colors.success],
    }[tone];
    return (
        <View style={[styles.badge, { backgroundColor: palette[0] }, style]}>
            <Text style={[styles.badgeText, { color: palette[1] }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>{label}</Text>
        </View>
    );
}

export interface SegmentOption<T extends string> {
    value: T;
    label: string;
    /** Spoken instead of `label` when the visible text is an abbreviation such as "%95". */
    accessibilityLabel?: string;
}

interface SegmentedControlProps<T extends string> {
    options: readonly SegmentOption<T>[];
    value: T;
    onChange: (value: T) => void;
    /** Names the choice for VoiceOver, e.g. "Time range". */
    accessibilityLabel: string;
    /** Stretch across the row instead of hugging the labels. */
    fill?: boolean;
    style?: StyleProp<ViewStyle>;
}

/** The iOS segmented control: a grey track with the chosen segment raised in white. */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel, fill = false, style }: SegmentedControlProps<T>) {
    const colors = useThemeColors();
    // The chosen segment's pill slides to a new choice, easing in and out, instead of jumping
    // there; Reduce Motion, the first placement and a layout change move it at once.
    const reduceMotion = useReduceMotion();
    const [layouts, setLayouts] = useState<Partial<Record<T, LayoutRectangle>>>({});
    const pillX = useRef(new Animated.Value(0)).current;
    const pillWidth = useRef(new Animated.Value(0)).current;
    const placedFor = useRef<T | null>(null);
    const chosen = layouts[value];

    useEffect(() => {
        if (!chosen) return undefined;
        const slide = placedFor.current !== null && placedFor.current !== value && !reduceMotion;
        placedFor.current = value;
        if (!slide) {
            pillX.setValue(chosen.x);
            pillWidth.setValue(chosen.width);
            return undefined;
        }
        // The slide is a transform on the native driver: a choice that starts a long read (the
        // Statistics period) keeps the pill moving while JavaScript is busy. Width is layout, which
        // only JavaScript can animate; it changes only between labels of different lengths.
        const timing = { duration: MotionDuration.move, easing: MotionEasing.inOut, isInteraction: false };
        const animation = Animated.parallel([
            Animated.timing(pillX, { ...timing, toValue: chosen.x, useNativeDriver: NATIVE_DRIVER }),
            Animated.timing(pillWidth, { ...timing, toValue: chosen.width, useNativeDriver: false }),
        ]);
        animation.start();
        return () => animation.stop();
    }, [chosen?.x, chosen?.width, value, reduceMotion, pillX, pillWidth]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <View
            style={[styles.track, { backgroundColor: colors.bgInput }, fill && styles.trackFill, style]}
            accessibilityRole="tablist"
            accessibilityLabel={accessibilityLabel}
        >
            {chosen ? (
                // The slot slides; the pill inside it takes the width. A view's values are driven by
                // one side only, so the native slide and the JavaScript width need a view each.
                <Animated.View style={[styles.segmentPillSlot, { transform: [{ translateX: pillX }], pointerEvents: 'none' }]}>
                    <Animated.View style={[styles.segmentPill, { width: pillWidth, backgroundColor: colors.segmentSelected }]} />
                </Animated.View>
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
                            selected && !chosen && [styles.segmentSelected, { backgroundColor: colors.segmentSelected }],
                            pressed && !selected && styles.segmentPressed,
                        ]}
                        onPress={() => {
                            if (!selected) onChange(option.value);
                        }}
                        hitSlop={{ top: 6, bottom: 6 }}
                        accessibilityRole="tab"
                        accessibilityLabel={option.accessibilityLabel ?? option.label}
                        accessibilityState={{ selected }}
                        aria-selected={selected}
                    >
                        <Text
                            style={[styles.segmentText, { color: selected ? colors.textPrimary : colors.textSecondary }, selected && styles.segmentTextSelected]}
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

interface CheckboxProps {
    checked: boolean;
    /** Some of what the box stands for is ticked (a deck whose subdecks are partly chosen). */
    mixed?: boolean;
    onChange?: (checked: boolean) => void;
    /** Spoken label; leave it out when a surrounding row speaks for the box. */
    accessibilityLabel?: string;
    disabled?: boolean;
}

/** A square box with a tick: one of several independent options. */
export function Checkbox({ checked, mixed = false, onChange, accessibilityLabel, disabled = false }: CheckboxProps) {
    const colors = useThemeColors();
    const filled = checked || mixed;
    const box = (
        <View
            style={[
                styles.box,
                { borderColor: filled ? colors.accent : colors.textMuted, backgroundColor: filled ? colors.accent : 'transparent' },
                disabled && styles.disabled,
            ]}
        >
            {checked ? <CheckIcon color={colors.onAccent} size={16} /> : mixed ? <MinusIcon color={colors.onAccent} size={16} /> : null}
        </View>
    );
    if (!onChange) return box;
    return (
        <TouchableOpacity
            style={styles.boxTarget}
            onPress={() => onChange(!checked)}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ checked: checked ? true : mixed ? 'mixed' : false, disabled }}
            aria-checked={checked ? true : mixed ? 'mixed' : false}
            aria-disabled={disabled}
        >
            {box}
        </TouchableOpacity>
    );
}

interface CheckRowProps {
    label: string;
    summary?: string;
    checked: boolean;
    mixed?: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    /** Spoken instead of the label, e.g. a path read with its separators. */
    accessibilityLabel?: string;
    /** A second action on the row, e.g. renaming what it stands for. */
    onLongPress?: () => void;
    accessibilityActions?: readonly AccessibilityActionInfo[];
    onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
    style?: StyleProp<ViewStyle>;
}

/** A row with a checkbox; the whole row ticks it. */
export function CheckRow({
    label, summary, checked, mixed = false, onChange, disabled = false,
    accessibilityLabel, onLongPress, accessibilityActions, onAccessibilityAction, style,
}: CheckRowProps) {
    const colors = useThemeColors();
    return (
        <TouchableOpacity
            style={[styles.checkRow, disabled && styles.disabled, style]}
            onPress={() => onChange(!checked)}
            onLongPress={onLongPress}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityActions={accessibilityActions}
            onAccessibilityAction={onAccessibilityAction}
            accessibilityState={{ checked: checked ? true : mixed ? 'mixed' : false, disabled }}
            aria-checked={checked ? true : mixed ? 'mixed' : false}
            aria-disabled={disabled}
        >
            <Checkbox checked={checked} mixed={mixed} />
            <View style={styles.checkCopy}>
                <Text style={[styles.checkLabel, { color: colors.textPrimary }]}>{label}</Text>
                {summary ? <Text style={[styles.checkSummary, { color: colors.textMuted }]}>{summary}</Text> : null}
            </View>
        </TouchableOpacity>
    );
}

/** The tick on the chosen row of a single-choice list. */
export function SelectedMark({ visible = true }: { visible?: boolean }) {
    const colors = useThemeColors();
    return <View style={styles.mark}>{visible ? <CheckIcon color={colors.accent} size={20} /> : null}</View>;
}

const styles = StyleSheet.create({
    disabled: { opacity: DISABLED_OPACITY },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 32,
        borderRadius: Radius.pill,
        borderWidth: 1,
    },
    chipBody: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, minHeight: 32, flexShrink: 1 },
    chipText: { fontSize: FontSize.sm, fontWeight: '500' },
    chipTextSelected: { fontWeight: '600' },
    chipRemove: { minHeight: 32, paddingRight: Spacing.sm + 2, paddingLeft: 0, justifyContent: 'center' },
    // A badge mostly sits in a row beside a title, where the row centres it; a column that should
    // not stretch it passes alignSelf.
    badge: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xxs, borderRadius: Radius.pill },
    badgeText: Type.micro,
    track: { flexDirection: 'row', alignSelf: 'flex-start', padding: Spacing.xxs, borderRadius: Radius.inset },
    trackFill: { alignSelf: 'stretch' },
    segment: { minHeight: 30, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.inset - 2 },
    segmentFill: { flex: 1, paddingHorizontal: 4 },
    segmentSelected: Shadow.card,
    // Drawn under the labels once the segments are measured.
    segmentPillSlot: { position: 'absolute', left: 0, top: 2, bottom: 2 },
    segmentPill: { flex: 1, borderRadius: Radius.inset - 2, ...Shadow.card },
    segmentPressed: { opacity: 0.6 },
    segmentText: { fontSize: FontSize.sm, fontWeight: '500' },
    segmentTextSelected: { fontWeight: '600' },
    boxTarget: { minWidth: HIT_TARGET, minHeight: HIT_TARGET, alignItems: 'center', justifyContent: 'center' },
    box: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    checkRow: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm + 2,
    },
    checkCopy: { flex: 1, minWidth: 0, gap: Spacing.xxs },
    checkLabel: { fontSize: FontSize.md },
    checkSummary: { fontSize: FontSize.sm, lineHeight: 18 },
    mark: { width: 24, alignItems: 'center', justifyContent: 'center' },
});
