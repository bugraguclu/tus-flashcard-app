import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import type { BrowserStyles } from './browserStyles';
import type { NoteToolStyles } from './noteToolStyles';

interface ToolCheckboxProps {
    checked: boolean;
    disabled?: boolean;
    label: string;
    onPress: () => void;
    styles: BrowserStyles;
    toolStyles: NoteToolStyles;
}

/** One option of a note tool dialog, drawn like the browser's other dialog checkboxes. */
export function ToolCheckbox({ checked, disabled = false, label, onPress, styles, toolStyles }: ToolCheckboxProps) {
    return (
        <TouchableOpacity
            style={[styles.checkboxRow, disabled && toolStyles.disabled]}
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityLabel={label}
            accessibilityState={{ checked, disabled }}
            aria-checked={checked}
        >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked ? <Text style={styles.checkboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.checkboxLabel}>{label}</Text>
        </TouchableOpacity>
    );
}

export interface ChoiceOption {
    key: string;
    label: string;
}

interface ChoiceSelectProps {
    disabled?: boolean;
    expanded: boolean;
    /** What the choice is for, read with the current value: "In: All fields". */
    label: string;
    onSelect: (key: string) => void;
    onToggle: () => void;
    options: ChoiceOption[];
    selectedKey: string;
    styles: BrowserStyles;
    toolStyles: NoteToolStyles;
}

/**
 * A compact single choice: the current value, which opens the options in place. A dialog keeps
 * its other controls where they are instead of covering them with a second popup.
 */
export function ChoiceSelect({
    disabled = false,
    expanded,
    label,
    onSelect,
    onToggle,
    options,
    selectedKey,
    styles,
    toolStyles,
}: ChoiceSelectProps) {
    const selected = options.find((option) => option.key === selectedKey) ?? options[0];
    return (
        <View>
            <TouchableOpacity
                style={[toolStyles.selectButton, disabled && toolStyles.disabled]}
                onPress={onToggle}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${selected?.label ?? ''}`}
                accessibilityState={{ expanded, disabled }}
            >
                <Text style={toolStyles.selectButtonText} numberOfLines={1}>{selected?.label ?? ''}</Text>
                <Text style={toolStyles.selectCaret}>{expanded ? '▴' : '▾'}</Text>
            </TouchableOpacity>
            {expanded && (
                <ScrollView style={toolStyles.selectList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {options.map((option) => {
                        const active = option.key === selected?.key;
                        return (
                            <TouchableOpacity
                                key={option.key}
                                style={[toolStyles.selectRow, active && toolStyles.selectRowActive]}
                                onPress={() => onSelect(option.key)}
                                accessibilityRole="radio"
                                accessibilityLabel={option.label}
                                accessibilityState={{ checked: active }}
                                aria-checked={active}
                            >
                                <Text style={[toolStyles.selectRowText, active && toolStyles.selectRowTextActive]} numberOfLines={2}>
                                    {option.label}
                                </Text>
                                {active && <Text style={styles.pickerCheck}>✓</Text>}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}
