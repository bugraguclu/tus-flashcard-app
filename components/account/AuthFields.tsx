import React, { useMemo, useState } from 'react';
import {
    Platform,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View,
    type TextInput as NativeTextInput,
    type TextInputProps,
} from 'react-native';
import { Text, TextInput } from '../AppText';
import {
    CODE_LENGTH,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    normalizeCode,
    passwordStrength,
    type PasswordContext,
} from '../../lib/accountContract';
import { passwordStrengthLabel } from '../../lib/accountMessages';
import { useI18n } from '../../hooks/useI18n';
import { EyeGlyph, EyeOffGlyph } from './AccountGlyphs';
import { useAccountPalette, type AccountPalette } from './accountPalette';

const HIDDEN_FROM_ACCESSIBILITY = Platform.OS === 'web'
    ? ({ 'aria-hidden': true } as const)
    : ({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const);

interface AuthTextFieldProps extends Omit<TextInputProps, 'style'> {
    label: string;
    error?: string | null;
    hint?: string | null;
    /** A control drawn inside the field's right edge (the password's show button). */
    accessory?: React.ReactNode;
    inputRef?: React.Ref<NativeTextInput>;
    /** Replaces the hint line, for content such as the strength meter. */
    footer?: React.ReactNode;
}

/** A labelled field with the label above, a focus ring, and its error or hint underneath. */
export function AuthTextField({ label, error, hint, accessory, inputRef, footer, onFocus, onBlur, ...input }: AuthTextFieldProps) {
    const palette = useAccountPalette();
    const styles = useMemo(() => createFieldStyles(palette), [palette]);
    const [focused, setFocused] = useState(false);
    const ringColor = error ? palette.danger : palette.link;

    return (
        <View style={styles.field}>
            <Text style={styles.label} accessible={false}>{label}</Text>
            <View>
                {focused ? <View style={[styles.ring, { backgroundColor: ringColor }]} pointerEvents="none" /> : null}
                <View style={[styles.box, focused && { borderColor: ringColor }, error ? styles.boxError : null]}>
                    <TextInput
                        ref={inputRef}
                        style={[styles.input, accessory ? styles.inputWithAccessory : null]}
                        placeholderTextColor={palette.placeholder}
                        accessibilityLabel={label}
                        accessibilityHint={error ?? hint ?? undefined}
                        onFocus={(event) => {
                            setFocused(true);
                            onFocus?.(event);
                        }}
                        onBlur={(event) => {
                            setFocused(false);
                            onBlur?.(event);
                        }}
                        {...input}
                    />
                    {accessory}
                </View>
            </View>
            {error ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
            ) : footer ?? (hint ? <Text style={styles.hint}>{hint}</Text> : null)}
        </View>
    );
}

interface PasswordFieldProps {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    error?: string | null;
    /** A password being chosen rather than recalled: new-password autofill and the meter. */
    isNew?: boolean;
    strengthContext?: PasswordContext;
    placeholder?: string;
    inputRef?: React.Ref<NativeTextInput>;
    returnKeyType?: TextInputProps['returnKeyType'];
    onSubmitEditing?: () => void;
    editable?: boolean;
}

export function PasswordField({
    label,
    value,
    onChangeText,
    error,
    isNew = false,
    strengthContext,
    placeholder,
    inputRef,
    returnKeyType = 'done',
    onSubmitEditing,
    editable = true,
}: PasswordFieldProps) {
    const { l } = useI18n();
    const palette = useAccountPalette();
    const styles = useMemo(() => createFieldStyles(palette), [palette]);
    const [visible, setVisible] = useState(false);

    return (
        <AuthTextField
            label={label}
            value={value}
            onChangeText={onChangeText}
            error={error}
            inputRef={inputRef}
            placeholder={placeholder}
            editable={editable}
            secureTextEntry={!visible}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType={isNew ? 'newPassword' : 'password'}
            autoComplete={isNew ? 'new-password' : 'current-password'}
            passwordRules={isNew ? `minlength: ${PASSWORD_MIN_LENGTH}; maxlength: ${PASSWORD_MAX_LENGTH};` : undefined}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            submitBehavior="blurAndSubmit"
            footer={isNew ? <StrengthMeter password={value} context={strengthContext} /> : undefined}
            accessory={(
                <TouchableOpacity
                    style={styles.accessoryButton}
                    onPress={() => setVisible((current) => !current)}
                    accessibilityRole="button"
                    accessibilityLabel={visible ? l('Şifreyi gizle', 'Hide password') : l('Şifreyi göster', 'Show password')}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                    {visible ? <EyeOffGlyph color={palette.inkSecondary} /> : <EyeGlyph color={palette.inkSecondary} />}
                </TouchableOpacity>
            )}
        />
    );
}

/** Four bars and a word; before anything is typed it states the length rule instead. */
export function StrengthMeter({ password, context }: { password: string; context?: PasswordContext }) {
    const { l } = useI18n();
    const palette = useAccountPalette();
    const styles = useMemo(() => createFieldStyles(palette), [palette]);
    const score = passwordStrength(password, context);
    const color = score > 0 ? palette.strength[score - 1] : palette.divider;
    const label = passwordStrengthLabel(score, l);

    return (
        <View
            style={styles.strength}
            accessible
            accessibilityLabel={score > 0 ? l(`Şifre gücü: ${label}`, `Password strength: ${label}`) : label}
        >
            <View style={styles.strengthBars} {...HIDDEN_FROM_ACCESSIBILITY}>
                {[1, 2, 3, 4].map((step) => (
                    <View key={step} style={[styles.strengthBar, { backgroundColor: step <= score ? color : palette.divider }]} />
                ))}
            </View>
            <Text style={[styles.strengthLabel, score > 0 && score < 2 ? { color: palette.danger } : null]}>{label}</Text>
        </View>
    );
}

interface CodeFieldProps {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    error?: string | null;
    inputRef?: React.RefObject<NativeTextInput | null>;
    /** Runs when the last digit arrives, typed or pasted. */
    onComplete?: (code: string) => void;
    autoFocus?: boolean;
    editable?: boolean;
}

/**
 * Six boxes over one real input: iOS can fill it from Mail or Messages (`oneTimeCode`), a pasted
 * `482 913` lands whole, and VoiceOver reads a single field rather than six.
 */
export function CodeField({ label, value, onChangeText, error, inputRef, onComplete, autoFocus, editable = true }: CodeFieldProps) {
    const palette = useAccountPalette();
    const styles = useMemo(() => createFieldStyles(palette), [palette]);
    const [focused, setFocused] = useState(false);
    const code = normalizeCode(value);
    const activeIndex = Math.min(code.length, CODE_LENGTH - 1);

    return (
        <View style={styles.field}>
            <Text style={styles.label} accessible={false}>{label}</Text>
            <Pressable style={styles.codeRow} onPress={() => inputRef?.current?.focus()} accessible={false}>
                {Array.from({ length: CODE_LENGTH }, (_, index) => {
                    const active = focused && index === activeIndex;
                    return (
                        <View
                            key={index}
                            style={[
                                styles.codeCell,
                                active && { borderColor: palette.link, borderWidth: 2 },
                                error ? styles.boxError : null,
                            ]}
                            {...HIDDEN_FROM_ACCESSIBILITY}
                        >
                            <Text style={styles.codeDigit} allowFontScaling={false}>{code[index] ?? ''}</Text>
                        </View>
                    );
                })}
                <TextInput
                    ref={inputRef}
                    value={code}
                    onChangeText={(text) => {
                        const next = normalizeCode(text);
                        onChangeText(next);
                        if (next.length === CODE_LENGTH && next !== code) onComplete?.(next);
                    }}
                    style={styles.codeInput}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    autoCorrect={false}
                    caretHidden
                    selectionColor="transparent"
                    editable={editable}
                    autoFocus={autoFocus}
                    accessibilityLabel={label}
                    accessibilityHint={error ?? undefined}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                />
            </Pressable>
            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        </View>
    );
}

function createFieldStyles(palette: AccountPalette) {
    return StyleSheet.create({
        field: { gap: 8 },
        label: { fontSize: 14, fontWeight: '600', color: palette.ink },
        ring: {
            position: 'absolute',
            top: -3,
            left: -3,
            right: -3,
            bottom: -3,
            borderRadius: 15,
            opacity: 0.18,
        },
        box: {
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.fieldBorder,
            backgroundColor: palette.field,
        },
        boxError: { borderColor: palette.danger },
        input: {
            flex: 1,
            minHeight: 50,
            paddingHorizontal: 14,
            paddingVertical: Platform.OS === 'ios' ? 14 : 12,
            fontSize: 16,
            color: palette.ink,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null),
        },
        inputWithAccessory: { paddingRight: 4 },
        accessoryButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
        error: { fontSize: 13, lineHeight: 18, color: palette.danger },
        hint: { fontSize: 13, lineHeight: 18, color: palette.inkSecondary },
        strength: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 18 },
        strengthBars: { flex: 1, flexDirection: 'row', gap: 4 },
        strengthBar: { flex: 1, height: 4, borderRadius: 2 },
        strengthLabel: { minWidth: 56, textAlign: 'right', fontSize: 13, fontWeight: '600', color: palette.inkSecondary },
        codeRow: { flexDirection: 'row', gap: 8 },
        codeCell: {
            flex: 1,
            height: 58,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.fieldBorder,
            backgroundColor: palette.field,
            alignItems: 'center',
            justifyContent: 'center',
        },
        codeDigit: {
            fontSize: 24,
            fontWeight: '600',
            color: palette.ink,
            fontVariant: ['tabular-nums'],
        },
        codeInput: {
            ...StyleSheet.absoluteFill,
            color: 'transparent',
            fontSize: 16,
            opacity: 0.02,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never, caretColor: 'transparent' as never } : null),
        },
    });
}
