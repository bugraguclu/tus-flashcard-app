import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../constants/theme';
import {
    commitBoundedInteger,
    sanitizeSignedIntegerDraft,
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
    wrap?: boolean;
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
    wrap = false,
    onChange,
    accessibilityLabel,
    suffix,
    minimumDigits = 1,
    style,
}: Props, ref) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const isSigned = min < 0 || max < 0;
    const maxChars = Math.max(1, String(min).length, String(max).length);
    const sanitize = isSigned ? sanitizeSignedIntegerDraft : sanitizeUnsignedIntegerDraft;

    const format = useCallback(
        (next: number) => {
            if (!Number.isFinite(next)) return '0';
            if (next < 0) {
                return `-${String(Math.abs(next)).padStart(Math.max(1, minimumDigits), '0')}`;
            }
            return String(next).padStart(Math.max(1, minimumDigits), '0');
        },
        [minimumDigits],
    );

    const [draft, setDraft] = useState(() => format(value));
    const [focused, setFocused] = useState(false);

    const draftRef = useRef(draft);
    draftRef.current = draft;
    const valueRef = useRef(value);
    valueRef.current = value;
    const steppedTargetRef = useRef<number | null>(null);

    useEffect(() => {
        if (steppedTargetRef.current !== null) {
            if (value === steppedTargetRef.current) {
                steppedTargetRef.current = null;
            } else {
                return;
            }
        }
        if (!focused) {
            const formatted = format(value);
            setDraft(formatted);
            draftRef.current = formatted;
            valueRef.current = value;
        }
    }, [focused, format, value]);

    const commit = useCallback(() => {
        const next = commitBoundedInteger(draftRef.current, valueRef.current, min, max);
        steppedTargetRef.current = next;
        setFocused(false);
        const formatted = format(next);
        draftRef.current = formatted;
        valueRef.current = next;
        setDraft(formatted);
        if (next !== value) onChange(next);
    }, [format, max, min, onChange, value]);

    useImperativeHandle(ref, () => ({
        stepBy: (delta: number) => {
            const next = stepBoundedIntegerDraft(draftRef.current, valueRef.current, delta, min, max, wrap);
            steppedTargetRef.current = next;
            const formatted = format(next);
            draftRef.current = formatted;
            valueRef.current = next;
            setDraft(formatted);
            if (next !== value) onChange(next);
        },
    }), [format, max, min, onChange, value, wrap]);

    const charCount = Math.max(draft.length, maxChars, minimumDigits, 2);
    const inputWidth = Math.max(38, charCount * 16 + 10);
    const textInputRef = useRef<TextInput>(null);

    return (
        <Pressable onPress={() => textInputRef.current?.focus()} style={[styles.container, style]}>
            <TextInput
                ref={textInputRef}
                style={[
                    styles.input,
                    {
                        width: inputWidth,
                        textAlign: suffix ? 'right' : 'center',
                    },
                ]}
                value={draft}
                onFocus={() => {
                    setFocused(true);
                    setDraft(format(valueRef.current));
                }}
                onChangeText={(text) => {
                    const sanitized = sanitize(text, maxChars);
                    draftRef.current = sanitized;
                    setDraft(sanitized);
                }}
                onBlur={commit}
                onSubmitEditing={commit}
                keyboardType={isSigned ? 'numbers-and-punctuation' : 'number-pad'}
                inputMode={isSigned ? 'text' : 'numeric'}
                showSoftInputOnFocus
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                selectTextOnFocus
                maxLength={maxChars}
                accessibilityLabel={accessibilityLabel}
            />
            {suffix ? <Text style={styles.suffix} pointerEvents="none">{suffix}</Text> : null}
        </Pressable>
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
            paddingHorizontal: 0,
            paddingVertical: 0,
            fontSize: FontSize.xl,
            fontWeight: '800',
            fontVariant: ['tabular-nums'] as any,
            color: colors.accent,
            flexShrink: 0,
        },
        suffix: {
            marginLeft: 3,
            fontSize: FontSize.md,
            fontWeight: '700',
            color: colors.accent,
            flexShrink: 0,
        },
    });
}
