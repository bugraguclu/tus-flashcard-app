import { Fragment } from 'react';
import { ScrollView, View } from 'react-native';
import { Divider } from '../ui/Card';
import { CheckRow } from '../ui/Choice';
import { ListRow, SelectRow } from '../ui/Rows';
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
 * A single choice inside a dialog: the kit's select row, which opens its options in place under
 * it. A dialog keeps its other controls where they are instead of covering them with a second popup.
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
    const selected = options.find((option) => option.key === selectedKey) ?? options[0];
    return (
        <View>
            <SelectRow
                label={label}
                value={selected?.label ?? ''}
                onPress={onToggle}
                disabled={disabled}
                expanded={expanded}
                accessibilityLabel={`${label}: ${selected?.label ?? ''}`}
                style={toolStyles.selectRow}
            />
            {expanded && (
                <ScrollView style={toolStyles.selectList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {options.map((option, index) => (
                        <Fragment key={option.key}>
                            {index > 0 ? <Divider /> : null}
                            <ListRow
                                title={option.label}
                                selected={option.key === selected?.key}
                                onPress={() => onSelect(option.key)}
                            />
                        </Fragment>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}
