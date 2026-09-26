import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { useI18n } from '../../hooks/useI18n';
import { getAllDeckConfigs, getDecksUsingConfig } from '../../lib/deckManager';
import type { DeckOptionsStyles } from './deckOptionsStyles';

type I18n = Pick<ReturnType<typeof useI18n>, 'l' | 't'>;

/** One row of the preset menu; the screen decides what each row does. */
export interface PresetAction {
    label: string;
    action: () => void;
    destructive?: boolean;
}

/** The actions on the current preset: save, clone, restore, add, rename, apply, delete. */
export function PresetActionsMenu({ actions, onClose, styles }: {
    actions: PresetAction[];
    onClose: () => void;
    styles: DeckOptionsStyles;
}) {
    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.actionMenu}>
                    {actions.map((item) => (
                        <TouchableOpacity
                            key={item.label}
                            style={styles.actionMenuRow}
                            onPress={() => { onClose(); item.action(); }}
                        >
                            <Text style={[styles.actionMenuText, item.destructive && styles.actionMenuDanger]}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </Modal>
    );
}

/** Every preset in the collection, with how many decks use it and one of them by name. */
export function PresetPickerModal({ activePresetId, onPick, onClose, styles, l, t }: I18n & {
    activePresetId: number;
    onPick: (presetId: number) => void;
    onClose: () => void;
    styles: DeckOptionsStyles;
}) {
    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityLabel={l('Ayar grubu seçiciyi kapat', 'Close preset picker')}
                />
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>{l('Ayar grubu seç', 'Choose Preset')}</Text>
                    <ScrollView style={{ maxHeight: 320 }}>
                        {getAllDeckConfigs().map((preset) => {
                            const presetDecks = getDecksUsingConfig(preset.id);
                            const representative = presetDecks[0];
                            return (
                                <TouchableOpacity key={preset.id} style={styles.presetOption} onPress={() => onPick(preset.id)}>
                                    <Text style={[styles.presetOptionText, preset.id === activePresetId && styles.presetOptionActive]}>
                                        {preset.name} · {l(`${presetDecks.length} deste`, `${presetDecks.length} decks`)}
                                    </Text>
                                    {representative ? (
                                        <Text style={styles.presetOptionMeta} numberOfLines={1}>
                                            {representative.name.replaceAll('::', ' › ')}
                                        </Text>
                                    ) : null}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                    <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

export function RenamePresetModal({ value, onChangeValue, onSave, onClose, styles, l, t }: I18n & {
    value: string;
    onChangeValue: (value: string) => void;
    onSave: () => void;
    onClose: () => void;
    styles: DeckOptionsStyles;
}) {
    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onClose}
                    accessibilityLabel={l('Yeniden adlandırma penceresini kapat', 'Close rename dialog')}
                />
                <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>{l('Ayar grubunu yeniden adlandır', 'Rename Preset')}</Text>
                    <TextInput style={styles.input} value={value} onChangeText={onChangeValue} autoFocus />
                    <View style={styles.modalActions}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.saveBtnSmall}
                            onPress={onSave}
                        >
                            <Text style={styles.saveBtnText}>{t('common.save')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
