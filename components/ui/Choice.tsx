import React from 'react';
import { Pressable, type StyleProp, StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Shadows, Spacing, useThemeColors } from '../../constants/theme';
import { CheckIcon, CloseIcon, MinusIcon } from './icons';
import { DISABLED_OPACITY, HIT_TARGET, Radius } from './tokens';

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
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
}

/** A capsule that filters a list or picks one of a few short options. */
export function Chip({ label, selected = false, onPress, onRemove, removeLabel, icon, disabled = false, role = 'button', accessibilityLabel, style }: ChipProps) {
    const colors = useThemeColors();
    const tint = selected ? colors.accent : colors.textSecondary;
    return (
        <View
            style={[
                styles.chip,
                { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentLight : colors.bgCard },
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
                    <CloseIcon color={tint} size={14} />
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
    return (
        <View
            style={[styles.track, { backgroundColor: colors.bgInput }, fill && styles.trackFill, style]}
            accessibilityRole="tablist"
            accessibilityLabel={accessibilityLabel}
        >
            {options.map((option) => {
                const selected = option.value === value;
                return (
                    <Pressable
                        key={option.value}
                        style={({ pressed }) => [
                            styles.segment,
                            fill && styles.segmentFill,
                            selected && [styles.segmentSelected, { backgroundColor: colors.segmentSelected }],
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
    style?: StyleProp<ViewStyle>;
}

/** A row with a checkbox; the whole row ticks it. */
export function CheckRow({ label, summary, checked, mixed = false, onChange, disabled = false, style }: CheckRowProps) {
    const colors = useThemeColors();
    return (
        <TouchableOpacity
            style={[styles.checkRow, disabled && styles.disabled, style]}
            onPress={() => onChange(!checked)}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityLabel={label}
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
    chipTextSelected: { fontWeight: '700' },
    chipRemove: { minHeight: 32, paddingRight: Spacing.sm + 2, paddingLeft: 0, justifyContent: 'center' },
    // A badge mostly sits in a row beside a title, where the row centres it; a column that should
    // not stretch it passes alignSelf.
    badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill },
    badgeText: { fontSize: FontSize.xs + 1, fontWeight: '700' },
    track: { flexDirection: 'row', alignSelf: 'flex-start', padding: 2, borderRadius: Radius.inset },
    trackFill: { alignSelf: 'stretch' },
    segment: { minHeight: 30, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.inset - 2 },
    segmentFill: { flex: 1, paddingHorizontal: 4 },
    segmentSelected: Shadows.sm,
    segmentPressed: { opacity: 0.6 },
    segmentText: { fontSize: FontSize.sm, fontWeight: '600' },
    segmentTextSelected: { fontWeight: '700' },
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
    checkCopy: { flex: 1, minWidth: 0, gap: 2 },
    checkLabel: { fontSize: FontSize.md },
    checkSummary: { fontSize: FontSize.sm, lineHeight: 18 },
    mark: { width: 24, alignItems: 'center', justifyContent: 'center' },
});
