import React from 'react';
import { type StyleProp, StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useRepeatPress } from '../../hooks/useRepeatPress';
import { MinusIcon, PlusIcon } from './icons';
import { DISABLED_OPACITY, Radius } from './tokens';

interface StepperProps {
    /** The value as shown, e.g. "2:30" or "3. Tekrar"; leave it out when `children` draws an editable value. */
    value?: string;
    onDecrement: () => void;
    onIncrement: () => void;
    decrementLabel: string;
    incrementLabel: string;
    canDecrement?: boolean;
    canIncrement?: boolean;
    /** An editable value (e.g. `BoundedIntegerInput`) in place of the text. */
    children?: React.ReactNode;
    /** The track's fill: the input tone in a card, the card tone on a coloured surface. */
    onSurface?: 'card' | 'tinted';
    style?: StyleProp<ViewStyle>;
}

/** The one − value + control. Holding a button repeats its step. */
export function Stepper({
    value,
    onDecrement,
    onIncrement,
    decrementLabel,
    incrementLabel,
    canDecrement = true,
    canIncrement = true,
    children,
    onSurface = 'card',
    style,
}: StepperProps) {
    const colors = useThemeColors();
    const decrement = useRepeatPress(onDecrement);
    const increment = useRepeatPress(onIncrement);

    const button = (kind: 'decrement' | 'increment') => {
        const enabled = kind === 'increment' ? canIncrement : canDecrement;
        const handlers = kind === 'increment' ? increment : decrement;
        return (
            <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.accent }, !enabled && styles.disabled]}
                onPress={handlers.onPress}
                onPressIn={handlers.onPressIn}
                onPressOut={handlers.onPressOut}
                disabled={!enabled}
                hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                accessibilityRole="button"
                accessibilityLabel={kind === 'increment' ? incrementLabel : decrementLabel}
                accessibilityState={{ disabled: !enabled }}
                aria-disabled={!enabled}
            >
                {kind === 'increment'
                    ? <PlusIcon color={colors.onAccent} size={18} />
                    : <MinusIcon color={colors.onAccent} size={18} />}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.track, { backgroundColor: onSurface === 'tinted' ? colors.bgCard : colors.bgInput }, style]}>
            {button('decrement')}
            {children ?? (
                <Text style={[styles.value, { color: colors.accent }]} accessibilityLiveRegion="polite" numberOfLines={1}>
                    {value}
                </Text>
            )}
            {button('increment')}
        </View>
    );
}

const styles = StyleSheet.create({
    // No alignSelf: in a row it centres with the label; a column that should not stretch it says so.
    track: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        padding: 4,
        borderRadius: Radius.pill,
    },
    button: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    disabled: { opacity: DISABLED_OPACITY },
    value: { minWidth: 58, textAlign: 'center', fontSize: FontSize.lg, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
