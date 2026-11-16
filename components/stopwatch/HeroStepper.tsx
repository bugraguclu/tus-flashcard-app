import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { FontSize, useThemeColors } from '../../constants/theme';
import { useRepeatPress } from '../../hooks/useRepeatPress';
import { DISABLED_OPACITY, Radius } from '../ui/tokens';
import { MinusIcon, PlusIcon } from './StopwatchIcons';

interface HeroStepperProps {
    value: string;
    onStep: (direction: 1 | -1) => void;
    decreaseLabel: string;
    increaseLabel: string;
    canDecrease?: boolean;
    canIncrease?: boolean;
}

/**
 * The daily goal's − value + on the Kronometre hero: a card-coloured track over the coloured hero
 * that fills the width it is given, the value between its two round buttons. It is part of the
 * hero's own design; every other stepper is `components/ui/Stepper`. Holding a button repeats the
 * step.
 */
export function HeroStepper({ value, onStep, decreaseLabel, increaseLabel, canDecrease = true, canIncrease = true }: HeroStepperProps) {
    const colors = useThemeColors();
    const decrease = useRepeatPress(() => onStep(-1));
    const increase = useRepeatPress(() => onStep(1));

    const button = (direction: 1 | -1) => {
        const enabled = direction > 0 ? canIncrease : canDecrease;
        const handlers = direction > 0 ? increase : decrease;
        return (
            <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.accent }, !enabled && styles.disabled]}
                onPress={handlers.onPress}
                onPressIn={handlers.onPressIn}
                onPressOut={handlers.onPressOut}
                disabled={!enabled}
                hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                accessibilityRole="button"
                accessibilityLabel={direction > 0 ? increaseLabel : decreaseLabel}
                accessibilityState={{ disabled: !enabled }}
                aria-disabled={!enabled}
            >
                {direction > 0
                    ? <PlusIcon color={colors.onAccent} size={20} />
                    : <MinusIcon color={colors.onAccent} size={20} />}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.track, { backgroundColor: colors.bgCard }]}>
            {button(-1)}
            <Text style={[styles.value, { color: colors.accent }]} numberOfLines={1} accessibilityLiveRegion="polite">
                {value}
            </Text>
            {button(1)}
        </View>
    );
}

const styles = StyleSheet.create({
    track: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.pill, padding: 3 },
    button: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    disabled: { opacity: DISABLED_OPACITY },
    value: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: FontSize.lg, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
