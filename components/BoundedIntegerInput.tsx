import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../constants/theme';
import {
    commitBoundedInteger,
    sanitizeUnsignedIntegerDraft,
    stepBoundedIntegerDraft,
} from '../lib/boundedNumber';

export type BoundedIntegerInputHandle = {
    stepBy: (delta: number) => void;
};

type Props = {
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    accessibilityLabel: string;
    suffix?: string;
    minimumDigits?: number;
    style?: StyleProp<ViewStyle>;
};

/** A keyboard-editable integer display shared by settings-style screens. */
const BoundedIntegerInput = forwardRef<BoundedIntegerInputHandle, Props>(function BoundedIntegerInput({
    value,
    min,
    max,
    onChange,
    accessibilityLabel,
    suffix,
    minimumDigits = 1,
    style,
}: Props, ref) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const format = (next: number) => String(next).padStart(Math.max(1, minimumDigits), '0');
    const [draft, setDraft] = useState(format(value));
    const [focused, setFocused] = useState(false);
    const maxDigits = Math.max(1, String(Math.max(Math.abs(min), Math.abs(max))).length);

    useEffect(() => {
        if (!focused) setDraft(format(value));
    }, [focused, minimumDigits, value]);

    const commit = () => {
        const next = commitBoundedInteger(draft, value, min, max);
        setFocused(false);
        setDraft(format(next));
        if (next !== value) onChange(next);
    };

    useImperativeHandle(ref, () => ({
        stepBy: (delta: number) => {
            const next = stepBoundedIntegerDraft(draft, value, delta, min, max);
            setDraft(format(next));
            if (next !== value) onChange(next);
        },
    }), [draft, max, min, minimumDigits, onChange, value]);

    return (
        <View style={[styles.container, style]}>
            <TextInput
                style={styles.input}
                value={draft}
                onFocus={() => {
                    setFocused(true);
                    setDraft(String(value));
                }}
                onChangeText={(text) => setDraft(sanitizeUnsignedIntegerDraft(text, maxDigits))}
                onBlur={commit}
                keyboardType="number-pad"
                inputMode="numeric"
                showSoftInputOnFocus
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                selectTextOnFocus
                maxLength={maxDigits}
                accessibilityLabel={accessibilityLabel}
            />
            {suffix ? <Text style={styles.suffix} pointerEvents="none">{suffix}</Text> : null}
        </View>
    );
});

export default BoundedIntegerInput;

function createStyles(colors: ReturnType<typeof useThemeColors>) {
    return StyleSheet.create({
        container: {
            minWidth: 82,
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.bgInput,
            paddingHorizontal: Spacing.sm,
        },
        input: {
            minWidth: 28,
            paddingHorizontal: 0,
            paddingVertical: 0,
            textAlign: 'right',
            fontSize: FontSize.xl,
            fontWeight: '800',
            color: colors.accent,
        },
        suffix: {
            marginLeft: 3,
            fontSize: FontSize.md,
            fontWeight: '700',
            color: colors.accent,
        },
    });
}
