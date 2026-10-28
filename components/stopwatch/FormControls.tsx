import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useRepeatPress } from '../../hooks/useRepeatPress';
import { ChevronDownIcon, MinusIcon, PlusIcon } from './StopwatchIcons';

/** Width of the control column in the Kronometre's forms, as TUSBuddy lines its selectors up. */
const CONTROL_WIDTH = 160;
const CONTROL_HEIGHT = 40;

/** A label on the left and its control, a fixed-width box, on the right. */
export function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
    const colors = useThemeColors();
    return (
        <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
            <View style={styles.control}>{children}</View>
        </View>
    );
}

export function FormDivider() {
    const colors = useThemeColors();
    return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

interface FormSelectorProps {
    value: string;
    onPress: () => void;
    accessibilityLabel: string;
    accessibilityHint?: string;
    /** Draws the box in the accent colour, as an open selector. */
    active?: boolean;
}

/** A value in a grey box with a chevron, which opens its picker: "Karışık ⌄", "Bugün 14:05 ⌄". */
export function FormSelector({ value, onPress, accessibilityLabel, accessibilityHint, active = false }: FormSelectorProps) {
    const colors = useThemeColors();
    return (
        <TouchableOpacity
            style={[
                styles.box,
                { backgroundColor: colors.bgInput, borderColor: active ? colors.accent : colors.border },
            ]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint}
            accessibilityState={{ expanded: active }}
        >
            <Text style={[styles.boxValue, { color: colors.textPrimary }]} numberOfLines={1}>{value}</Text>
            <ChevronDownIcon color={colors.textMuted} size={18} />
        </TouchableOpacity>
    );
}

interface CountStepperProps {
    value: string;
    onStep: (direction: 1 | -1) => void;
    decreaseLabel: string;
    increaseLabel: string;
    canDecrease: boolean;
    canIncrease: boolean;
}

/** "− 0 +" in a grey box: the break count and the total break of the hand-entry form. */
export function CountStepper({ value, onStep, decreaseLabel, increaseLabel, canDecrease, canIncrease }: CountStepperProps) {
    const colors = useThemeColors();
    const decrease = useRepeatPress(() => onStep(-1));
    const increase = useRepeatPress(() => onStep(1));

    const button = (direction: 1 | -1) => {
        const enabled = direction > 0 ? canIncrease : canDecrease;
        const handlers = direction > 0 ? increase : decrease;
        return (
            <TouchableOpacity
                style={[styles.stepButton, !enabled && styles.disabled]}
                onPress={handlers.onPress}
                onPressIn={handlers.onPressIn}
                onPressOut={handlers.onPressOut}
                disabled={!enabled}
                hitSlop={{ top: 6, bottom: 6 }}
                accessibilityRole="button"
                accessibilityLabel={direction > 0 ? increaseLabel : decreaseLabel}
                accessibilityState={{ disabled: !enabled }}
            >
                {direction > 0
                    ? <PlusIcon color={colors.accent} size={20} />
                    : <MinusIcon color={colors.textMuted} size={20} />}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.box, styles.stepper, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
            {button(-1)}
            <Text style={[styles.stepValue, { color: colors.textPrimary }]} accessibilityLiveRegion="polite">{value}</Text>
            {button(1)}
        </View>
    );
}

/** The bordered note under the time fields that says how the form counts the session. */
export function FormInfoBox({ lines }: { lines: string[] }) {
    const colors = useThemeColors();
    return (
        <View style={[styles.info, { borderColor: colors.badgeNew }]}>
            {lines.map((line) => (
                <Text key={line} style={[styles.infoText, { color: colors.badgeNew }]}>{`* ${line}`}</Text>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: CONTROL_HEIGHT, paddingVertical: 6 },
    rowLabel: { flex: 1, fontSize: FontSize.lg, fontWeight: '600' },
    control: { width: CONTROL_WIDTH },
    divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.sm, marginHorizontal: Spacing.sm },
    box: {
        height: CONTROL_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: BorderRadius.md,
        borderWidth: StyleSheet.hairlineWidth,
        paddingLeft: Spacing.md,
        paddingRight: Spacing.sm,
        gap: Spacing.xs,
    },
    boxValue: { flex: 1, textAlign: 'center', fontSize: FontSize.md, fontWeight: '600' },
    stepper: { paddingLeft: 0, paddingRight: 0, gap: 0 },
    stepButton: { width: 42, height: CONTROL_HEIGHT, alignItems: 'center', justifyContent: 'center' },
    stepValue: { flex: 1, textAlign: 'center', fontSize: FontSize.md, fontWeight: '600', fontVariant: ['tabular-nums'] },
    disabled: { opacity: 0.35 },
    info: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.sm, gap: 2, marginVertical: Spacing.xs },
    infoText: { fontSize: FontSize.sm, lineHeight: 17 },
});
