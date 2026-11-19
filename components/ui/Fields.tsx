import React, { forwardRef, useState } from 'react';
import { Platform, type StyleProp, StyleSheet, type TextInputProps, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Text, TextInput } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { fieldRowProps } from './fieldRow';
import { CloseIcon, EyeIcon, EyeOffIcon, SearchIcon } from './icons';
import { HIT_TARGET, Radius, Type } from './tokens';

type FieldProps = Omit<TextInputProps, 'style'> & {
    /** Layout of the field box (width, flex, margins); its look is fixed. */
    style?: StyleProp<ViewStyle>;
    /** Marks the field as holding a value the form will not accept. */
    invalid?: boolean;
    /** Draws code (a card template, CSS) in a fixed-width face. */
    monospace?: boolean;
    /** A caption above the field naming what goes in it; `style` then lays out the pair. */
    label?: string;
    /** What to fix, under the field in red; it also marks the field invalid. */
    error?: string | null;
    /** A line under the field that helps fill it in, shown while there is no error. */
    hint?: string | null;
    /** A control inside the field's right edge, such as a password's show button. */
    accessory?: React.ReactNode;
};

/** The one text field: single or multi-line, filled with the input tone and edged by a hairline. */
const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const TextField = forwardRef<TextInput, FieldProps>(function TextField(
    { style, invalid = false, monospace = false, label, error, hint, accessory, multiline, ...props },
    ref,
) {
    const colors = useThemeColors();
    const flagged = invalid || Boolean(error);
    const frame = { backgroundColor: colors.bgInput, borderColor: flagged ? colors.danger : colors.border };
    const wrapped = Boolean(label || error || hint);
    const input = (
        <TextInput
            ref={ref}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.accent}
            multiline={multiline}
            accessibilityHint={error ?? hint ?? undefined}
            aria-invalid={flagged || undefined}
            {...props}
            style={[
                styles.field,
                multiline && styles.multiline,
                monospace && { fontFamily: MONOSPACE },
                { color: colors.textPrimary },
                accessory ? styles.inner : frame,
                wrapped || accessory ? null : style as object,
            ]}
            accessibilityLabel={props.accessibilityLabel ?? label}
        />
    );
    const field = accessory ? (
        <View style={[styles.withAccessory, frame, wrapped ? null : style]} {...fieldRowProps}>
            {input}
            {accessory}
        </View>
    ) : input;
    if (!wrapped) return field;
    return (
        <View style={[styles.labelled, style]}>
            {label ? <Text style={[styles.label, { color: colors.textSecondary }]} accessible={false}>{label}</Text> : null}
            {field}
            {error ? (
                <Text style={[Type.caption, { color: colors.danger }]} accessibilityLiveRegion="polite">{error}</Text>
            ) : hint ? (
                <Text style={[Type.caption, { color: colors.textSecondary }]}>{hint}</Text>
            ) : null}
        </View>
    );
});

type PasswordFieldProps = Omit<FieldProps, 'secureTextEntry' | 'accessory' | 'monospace' | 'multiline'> & {
    /** A password being chosen rather than recalled: iOS then offers a strong one. */
    isNew?: boolean;
    /** Spoken for the show and hide button. */
    showLabel: string;
    hideLabel: string;
};

/**
 * A password field with a show/hide button, set up for iOS Password AutoFill: the saved password
 * when signing in, a suggested strong one when a password is chosen. Ask for a password once.
 */
export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(function PasswordField(
    { isNew = false, showLabel, hideLabel, ...props },
    ref,
) {
    const colors = useThemeColors();
    const [visible, setVisible] = useState(false);
    return (
        <TextField
            ref={ref}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType={isNew ? 'newPassword' : 'password'}
            autoComplete={isNew ? 'new-password' : 'current-password'}
            {...props}
            secureTextEntry={!visible}
            accessory={(
                <TouchableOpacity
                    style={styles.accessory}
                    onPress={() => setVisible((current) => !current)}
                    accessibilityRole="button"
                    accessibilityLabel={visible ? hideLabel : showLabel}
                >
                    {visible ? <EyeOffIcon color={colors.textSecondary} /> : <EyeIcon color={colors.textSecondary} />}
                </TouchableOpacity>
            )}
        />
    );
});

type SearchFieldProps = Omit<TextInputProps, 'style'> & {
    value: string;
    onChangeText: (text: string) => void;
    /** Spoken for the clear button drawn where iOS has no built-in one. */
    clearLabel: string;
    style?: StyleProp<ViewStyle>;
};

/** A field that filters what is below it: a magnifier, the query and a way to clear it. */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
    { value, onChangeText, clearLabel, style, ...props },
    ref,
) {
    const colors = useThemeColors();
    // iOS draws its own clear button inside the field; elsewhere the field draws one.
    const ownClear = Platform.OS !== 'ios' && value.length > 0;
    return (
        <View style={[styles.search, { backgroundColor: colors.bgInput, borderColor: colors.border }, style]} {...fieldRowProps}>
            <SearchIcon color={colors.textMuted} />
            <TextInput
                ref={ref}
                value={value}
                onChangeText={onChangeText}
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.accent}
                clearButtonMode="while-editing"
                returnKeyType="search"
                autoCorrect={false}
                {...props}
                style={[styles.searchInput, { color: colors.textPrimary }]}
            />
            {ownClear ? (
                <TouchableOpacity
                    style={styles.clear}
                    onPress={() => onChangeText('')}
                    accessibilityRole="button"
                    accessibilityLabel={clearLabel}
                >
                    <View style={[styles.clearCircle, { backgroundColor: colors.borderLight }]}>
                        <CloseIcon color={colors.textSecondary} size={16} />
                    </View>
                </TouchableOpacity>
            ) : null}
        </View>
    );
});

const styles = StyleSheet.create({
    field: {
        minHeight: HIT_TARGET,
        borderRadius: Radius.button,
        borderWidth: 1,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm + 2,
        fontSize: FontSize.md,
    },
    multiline: { minHeight: 120, textAlignVertical: 'top', paddingTop: Spacing.md },
    withAccessory: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.control, borderWidth: 1 },
    inner: { flex: 1, minWidth: 0, borderWidth: 0, backgroundColor: 'transparent', paddingRight: 0 },
    accessory: { width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' },
    labelled: { gap: Spacing.xs + 2 },
    label: { fontSize: FontSize.sm, fontWeight: '600' },
    search: {
        minHeight: HIT_TARGET,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingLeft: Spacing.md,
        borderRadius: Radius.button,
        borderWidth: 1,
    },
    searchInput: { flex: 1, minHeight: HIT_TARGET - 2, paddingVertical: 0, paddingRight: Spacing.md, fontSize: FontSize.md },
    clear: { width: HIT_TARGET, height: HIT_TARGET - 2, alignItems: 'center', justifyContent: 'center' },
    clearCircle: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
