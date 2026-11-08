import React, { forwardRef } from 'react';
import { Platform, type StyleProp, StyleSheet, type TextInputProps, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { TextInput } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { CloseIcon, SearchIcon } from './icons';
import { HIT_TARGET, Radius } from './tokens';

type FieldProps = Omit<TextInputProps, 'style'> & {
    /** Layout of the field box (width, flex, margins); its look is fixed. */
    style?: StyleProp<ViewStyle>;
    /** Marks the field as holding a value the form will not accept. */
    invalid?: boolean;
};

/** The one text field: single or multi-line, filled with the input tone and edged by a hairline. */
export const TextField = forwardRef<TextInput, FieldProps>(function TextField({ style, invalid = false, multiline, ...props }, ref) {
    const colors = useThemeColors();
    return (
        <TextInput
            ref={ref}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.accent}
            multiline={multiline}
            {...props}
            style={[
                styles.field,
                multiline && styles.multiline,
                { backgroundColor: colors.bgInput, borderColor: invalid ? colors.danger : colors.border, color: colors.textPrimary },
                style as object,
            ]}
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
        <View style={[styles.search, { backgroundColor: colors.bgInput, borderColor: colors.border }, style]}>
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
                        <CloseIcon color={colors.textSecondary} size={12} />
                    </View>
                </TouchableOpacity>
            ) : null}
        </View>
    );
});

const styles = StyleSheet.create({
    field: {
        minHeight: HIT_TARGET,
        borderRadius: Radius.control,
        borderWidth: 1,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm + 2,
        fontSize: FontSize.md,
    },
    multiline: { minHeight: 120, textAlignVertical: 'top', paddingTop: Spacing.md },
    search: {
        minHeight: HIT_TARGET,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingLeft: Spacing.md,
        borderRadius: Radius.control,
        borderWidth: 1,
    },
    searchInput: { flex: 1, minHeight: HIT_TARGET - 2, paddingVertical: 0, paddingRight: Spacing.md, fontSize: FontSize.md },
    clear: { width: HIT_TARGET, height: HIT_TARGET - 2, alignItems: 'center', justifyContent: 'center' },
    clearCircle: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
