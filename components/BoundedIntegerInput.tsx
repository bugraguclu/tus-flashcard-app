import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Text, TextInput, useLayoutTextScale } from './AppText';
import { FontSize, Spacing, useThemeColors } from '../constants/theme';
import { HIT_TARGET, Radius } from './ui/tokens';
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
    /**
     * Drawn without its own box, in the value's place inside a control that frames it (the kit
     * `Stepper`); the value then reads at the stepper's own size.
     */
    bare?: boolean;
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
    bare = false,
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

    const textScale = useLayoutTextScale();
    const charCount = Math.max(draft.length, minimumDigits, 1);
    const inputWidth = Math.ceil(Math.max(20, charCount * (bare ? 10.5 : 13) + 6) * textScale);
    const textInputRef = useRef<TextInput>(null);

    return (
        <Pressable
            onPress={() => textInputRef.current?.focus()}
            style={[styles.container, bare && styles.bareContainer, style]}
            // A bare value is as tall as the stepper's buttons; its slop makes up the touch target.
            hitSlop={bare ? { top: (HIT_TARGET - 32) / 2, bottom: (HIT_TARGET - 32) / 2 } : undefined}
        >
            <TextInput
                ref={textInputRef}
                style={[
                    styles.input,
                    bare && styles.bareInput,
                    {
                        width: inputWidth,
                        textAlign: 'center',
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
            {suffix ? <Text style={[styles.suffix, bare && styles.bareSuffix, { pointerEvents: 'none' }]}>{suffix}</Text> : null}
        </Pressable>
    );
});

export default BoundedIntegerInput;

function createStyles(colors: ReturnType<typeof useThemeColors>) {
    return StyleSheet.create({
        // The same box as the kit's TextField, around a number.
        container: {
            minWidth: 82,
            minHeight: HIT_TARGET,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Radius.control,
            backgroundColor: colors.bgInput,
            paddingHorizontal: Spacing.sm,
        },
        bareContainer: {
            minWidth: 58,
            minHeight: 32,
            borderWidth: 0,
            backgroundColor: 'transparent',
            paddingHorizontal: Spacing.xs,
        },
        input: {
            paddingHorizontal: 0,
            paddingVertical: 0,
            fontSize: FontSize.xl,
            fontWeight: '800',
            fontVariant: ['tabular-nums'] as any,
            color: colors.accent,
            flexShrink: 0,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null),
        },
        // The kit Stepper's value: one size down from the boxed field.
        bareInput: { fontSize: FontSize.lg, fontWeight: '700' },
        suffix: {
            marginLeft: 3,
            fontSize: FontSize.md,
            fontWeight: '700',
            color: colors.accent,
            flexShrink: 0,
        },
        bareSuffix: { fontSize: FontSize.sm },
    });
}
