import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { useThemeColors } from '../../constants/theme';
import { CheckRow, SelectedMark } from '../ui/Choice';
import { ChevronDownIcon, ChevronUpIcon } from '../ui/icons';
import type { NoteToolStyles } from './noteToolStyles';

interface ToolCheckboxProps {
    checked: boolean;
    disabled?: boolean;
    label: string;
    onPress: () => void;
}

/** One option of a note tool dialog: the kit's checkbox row, which the whole row ticks. */
export function ToolCheckbox({ checked, disabled = false, label, onPress }: ToolCheckboxProps) {
    return <CheckRow label={label} checked={checked} disabled={disabled} onChange={onPress} />;
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
    toolStyles,
}: ChoiceSelectProps) {
    const colors = useThemeColors();
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
                {expanded ? <ChevronUpIcon color={colors.textMuted} /> : <ChevronDownIcon color={colors.textMuted} />}
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
                                {active && <SelectedMark />}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}
