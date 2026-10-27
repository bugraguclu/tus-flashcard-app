import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ChevronDownIcon } from './ImportControls';
import type { ImportStyles } from './importStyles';

/** The import screen's option rows: a value that opens a choice, a checkbox, and a tag input. */
export function importRowRenderers(styles: ImportStyles, mutedColor: string) {
    const renderOptionRow = (
        label: string,
        value: string,
        onPress: () => void,
        accessibilityLabel?: string,
    ) => (
        <TouchableOpacity
            style={styles.optionRow}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
        >
            <Text style={styles.optionLabel} numberOfLines={1}>{label}</Text>
            <Text style={styles.optionValue} numberOfLines={1}>{value}</Text>
            <ChevronDownIcon color={mutedColor} size={18} />
        </TouchableOpacity>
    );

    const renderToggleRow = (label: string, hint: string | null, checked: boolean, onToggle: () => void) => (
        <TouchableOpacity
            style={styles.toggleRow}
            onPress={onToggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            aria-checked={checked}
            accessibilityLabel={label}
        >
            <View style={styles.toggleCopy}>
                <Text style={styles.optionLabel}>{label}</Text>
                {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
            </View>
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
        </TouchableOpacity>
    );

    const renderTagRow = (label: string, hint: string, value: string, onChange: (next: string) => void) => (
        <View style={styles.tagRow}>
            <Text style={styles.optionLabel}>{label}</Text>
            <TextInput
                style={styles.tagInput}
                value={value}
                onChangeText={onChange}
                placeholder={hint}
                placeholderTextColor={mutedColor}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={label}
            />
        </View>
    );

    return { renderOptionRow, renderToggleRow, renderTagRow };
}
