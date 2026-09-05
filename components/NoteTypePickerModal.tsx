import React, { useMemo } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { BorderRadius, FontSize, Spacing, type ColorScheme } from '../constants/theme';
import { getAllNoteTypes, getNoteType } from '../lib/noteManager';
import { BUILTIN_NOTE_TYPES, isLegacyTusNoteType } from '../lib/models';
import { localizeNoteTypeName } from '../lib/i18n';
import { useI18n } from '../hooks/useI18n';

type Props = {
    visible: boolean;
    colors: ColorScheme;
    selectedId: number;
    onSelect: (id: number) => void;
    onClose: () => void;
    title?: string;
    cancelLabel?: string;
};

export default function NoteTypePickerModal({
    visible,
    colors,
    selectedId,
    onSelect,
    onClose,
    title,
    cancelLabel,
}: Props) {
    const { t, l, locale } = useI18n();

    const availableNoteTypes = useMemo(() => {
        const list = getAllNoteTypes().filter((nt) => !isLegacyTusNoteType(nt));
        const selected = getNoteType(selectedId) ?? BUILTIN_NOTE_TYPES.find((entry) => entry.id === selectedId);
        if (selected && !list.some((nt) => nt.id === selected.id)) {
            list.unshift(selected);
        }
        return list;
    }, [visible, selectedId]);

    const styles = useMemo(() => createStyles(colors), [colors]);

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={l('Kapat', 'Close')} />
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>{title ?? l('Not türü', 'Note Type')}</Text>
                    <ScrollView style={styles.optionsList} contentContainerStyle={styles.optionsContent}>
                        {availableNoteTypes.map((noteType) => {
                            const label = localizeNoteTypeName(locale, noteType.name);
                            const selected = selectedId === noteType.id;
                            return (
                                <TouchableOpacity
                                    key={noteType.id}
                                    style={[styles.pickerOption, selected && styles.pickerOptionActive]}
                                    onPress={() => {
                                        onSelect(noteType.id);
                                        onClose();
                                    }}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected }}
                                    accessibilityLabel={label}
                                >
                                    <Text style={[styles.pickerOptionText, selected && styles.pickerOptionTextActive]}>
                                        {label}
                                    </Text>
                                    {selected && <Text style={styles.pickerCheck}>✓</Text>}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                    <TouchableOpacity style={styles.modalClose} onPress={onClose} accessibilityRole="button">
                        <Text style={styles.modalCloseText}>{cancelLabel ?? t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
        },
        modalCard: {
            width: '100%',
            maxWidth: 380,
            maxHeight: '80%',
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: Spacing.lg,
            gap: Spacing.sm,
        },
        modalTitle: {
            fontSize: FontSize.lg,
            fontWeight: '700',
            color: colors.textPrimary,
            marginBottom: Spacing.xs,
        },
        optionsList: {
            maxHeight: 340,
        },
        optionsContent: {
            gap: Spacing.xs,
        },
        pickerOption: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 12,
            paddingHorizontal: Spacing.md,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgPrimary,
        },
        pickerOptionActive: {
            backgroundColor: colors.accentLight,
        },
        pickerOptionText: {
            fontSize: FontSize.md,
            color: colors.textPrimary,
            flex: 1,
        },
        pickerOptionTextActive: {
            color: colors.accent,
            fontWeight: '600',
        },
        pickerCheck: {
            fontSize: FontSize.md,
            color: colors.accent,
            fontWeight: '700',
            marginLeft: Spacing.sm,
        },
        modalClose: {
            alignItems: 'center',
            paddingVertical: Spacing.sm,
            marginTop: Spacing.xs,
        },
        modalCloseText: {
            fontSize: FontSize.md,
            color: colors.textMuted,
        },
    });
}
