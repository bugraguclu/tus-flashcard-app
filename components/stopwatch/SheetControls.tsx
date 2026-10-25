import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useRepeatPress } from '../../hooks/useRepeatPress';
import { MinusIcon, PlusIcon } from './StopwatchIcons';

interface StepperProps {
    value: string;
    onStep: (direction: 1 | -1) => void;
    decreaseLabel: string;
    increaseLabel: string;
    canDecrease?: boolean;
    canIncrease?: boolean;
    /** Larger hero variant (the daily goal) or the compact one used in sheets. */
    size?: 'hero' | 'compact';
}

/**
 * A − value + control. Holding a button repeats the step, as the deck options steppers do.
 */
export function Stepper({
    value,
    onStep,
    decreaseLabel,
    increaseLabel,
    canDecrease = true,
    canIncrease = true,
    size = 'compact',
}: StepperProps) {
    const colors = useThemeColors();
    const decrease = useRepeatPress(() => onStep(-1));
    const increase = useRepeatPress(() => onStep(1));
    const hero = size === 'hero';
    const buttonSize = hero ? 34 : 30;

    const button = (direction: 1 | -1) => {
        const enabled = direction > 0 ? canIncrease : canDecrease;
        const handlers = direction > 0 ? increase : decrease;
        return (
            <TouchableOpacity
                style={[
                    styles.button,
                    { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2, backgroundColor: colors.accent },
                    !enabled && styles.disabled,
                ]}
                onPress={handlers.onPress}
                onPressIn={handlers.onPressIn}
                onPressOut={handlers.onPressOut}
                disabled={!enabled}
                hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                accessibilityRole="button"
                accessibilityLabel={direction > 0 ? increaseLabel : decreaseLabel}
                accessibilityState={{ disabled: !enabled }}
            >
                {direction > 0
                    ? <PlusIcon color={colors.white} size={hero ? 20 : 18} />
                    : <MinusIcon color={colors.white} size={hero ? 20 : 18} />}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.track, { backgroundColor: colors.bgInput }, hero && styles.trackHero]}>
            {button(-1)}
            <Text
                style={[styles.value, { color: colors.accent }, hero && styles.valueHero]}
                accessibilityLiveRegion="polite"
            >
                {value}
            </Text>
            {button(1)}
        </View>
    );
}

interface SettingRowProps {
    label: string;
    hint?: string;
    children: React.ReactNode;
}

/** A label, an optional hint under it, and the control on the right. */
export function SettingRow({ label, hint, children }: SettingRowProps) {
    const colors = useThemeColors();
    return (
        <View style={[styles.row, { borderBottomColor: colors.borderLight }]}>
            <View style={styles.rowCopy}>
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
                {hint ? <Text style={[styles.rowHint, { color: colors.textMuted }]}>{hint}</Text> : null}
            </View>
            {children}
        </View>
    );
}

interface SheetButtonProps {
    label: string;
    onPress: () => void;
    tone?: 'primary' | 'plain' | 'danger';
    disabled?: boolean;
}

export function SheetButton({ label, onPress, tone = 'primary', disabled = false }: SheetButtonProps) {
    const colors = useThemeColors();
    const primary = tone === 'primary';
    return (
        <TouchableOpacity
            style={[
                styles.sheetButton,
                primary ? { backgroundColor: colors.accent } : { backgroundColor: colors.bgInput },
                disabled && styles.disabled,
            ]}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
        >
            <Text
                style={[
                    styles.sheetButtonText,
                    { color: primary ? colors.white : tone === 'danger' ? colors.btnAgain : colors.textPrimary },
                ]}
            >
                {label}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    track: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        borderRadius: BorderRadius.full,
        padding: 4,
    },
    trackHero: { padding: 5, gap: Spacing.md },
    button: { alignItems: 'center', justifyContent: 'center' },
    disabled: { opacity: 0.4 },
    value: { minWidth: 58, textAlign: 'center', fontSize: FontSize.lg, fontWeight: '700', fontVariant: ['tabular-nums'] },
    valueHero: { minWidth: 64, fontSize: FontSize.xl },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingVertical: Spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowCopy: { flex: 1, gap: 2 },
    rowLabel: { fontSize: FontSize.lg, fontWeight: '600' },
    rowHint: { fontSize: FontSize.sm },
    sheetButton: {
        minHeight: 50,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.lg,
    },
    sheetButtonText: { fontSize: FontSize.lg, fontWeight: '700' },
});
