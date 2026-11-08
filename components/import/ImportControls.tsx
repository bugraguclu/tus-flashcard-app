import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { Spacing, useThemeColors } from '../../constants/theme';
import { Button } from '../ui/Button';
import { Divider } from '../ui/Card';
import { SelectedMark } from '../ui/Choice';
import { AppDialog } from '../ui/Dialog';
import { HIT_TARGET, Type } from '../ui/tokens';

export interface ChoiceModalProps {
    visible: boolean;
    title: string;
    cancelLabel: string;
    options: { value: string; label: string; hint?: string; selected: boolean }[];
    onSelect: (value: string) => void;
    onClose: () => void;
}

/** The list Anki's import selects drop down into, reused by every option on this screen. */
export function ChoiceModal({ visible, title, cancelLabel, options, onSelect, onClose }: ChoiceModalProps) {
    const colors = useThemeColors();
    if (!visible) return null;
    return (
        <AppDialog
            visible
            onClose={onClose}
            title={title}
            actions={<Button label={cancelLabel} variant="plain" onPress={onClose} />}
        >
            <ScrollView style={styles.list} bounces={false}>
                {options.map((option, index) => (
                    <React.Fragment key={option.value}>
                        {index > 0 ? <Divider /> : null}
                        {/* A single-choice row: the kit's rows carry no selected state. */}
                        <TouchableOpacity
                            style={styles.option}
                            onPress={() => onSelect(option.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: option.selected }}
                        >
                            <View style={styles.optionCopy}>
                                <Text
                                    style={[
                                        Type.body,
                                        { color: option.selected ? colors.accent : colors.textPrimary },
                                        option.selected && styles.optionSelected,
                                    ]}
                                >
                                    {option.label}
                                </Text>
                                {option.hint ? <Text style={[Type.caption, { color: colors.textMuted }]}>{option.hint}</Text> : null}
                            </View>
                            <SelectedMark visible={option.selected} />
                        </TouchableOpacity>
                    </React.Fragment>
                ))}
            </ScrollView>
        </AppDialog>
    );
}

const styles = StyleSheet.create({
    list: { flexGrow: 0 },
    option: { minHeight: HIT_TARGET + 4, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
    optionCopy: { flex: 1, minWidth: 0, gap: 2 },
    optionSelected: { fontWeight: '700' },
});
