import { View } from 'react-native';
import { Text } from '../AppText';
import { CheckRow } from '../ui/Choice';
import { TextField } from '../ui/Fields';
import { SelectRow } from '../ui/Rows';
import type { ImportStyles } from './importStyles';

/**
 * The import screen's option rows, for a `Section`'s card: a value that opens a choice
 * (`SelectRow`), a checkbox (`CheckRow`), and a tag field.
 */
export function importRowRenderers(styles: ImportStyles) {
    const renderOptionRow = (label: string, value: string, onPress: () => void) => (
        <SelectRow key={label} label={label} value={value} onPress={onPress} />
    );

    const renderToggleRow = (label: string, hint: string | null, checked: boolean, onToggle: () => void) => (
        <CheckRow key={label} label={label} summary={hint ?? undefined} checked={checked} onChange={onToggle} />
    );

    const renderTagRow = (label: string, hint: string, value: string, onChange: (next: string) => void) => (
        <View key={label} style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextField
                value={value}
                onChangeText={onChange}
                placeholder={hint}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={label}
            />
        </View>
    );

    return { renderOptionRow, renderToggleRow, renderTagRow };
}
