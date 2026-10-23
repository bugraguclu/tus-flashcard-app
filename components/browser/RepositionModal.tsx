import { useState, type Dispatch, type SetStateAction } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { alert } from '../../lib/confirm';
import { canUndoLastReposition, repositionSelectedNewCards, undoLastReposition } from '../../lib/browserReposition';
import { setDbSetting } from '../../lib/storage';
import { readBrowserBoolean } from './browserHelpers';
import type { BrowserI18n } from './types';
import type { BrowserStyles } from './browserStyles';

/** Anki keeps both choices in the collection config; these are the browser's own keys. */
export const REPOSITION_SHIFT_KEY = 'browser_reposition_shift';
const REPOSITION_RANDOM_KEY = 'browser_reposition_random';

interface RepositionModalProps {
    l: BrowserI18n['l'];
    refreshSelection: () => void;
    repositionShiftExisting: boolean;
    repositionStart: string;
    repositionStep: string;
    selectedActionCardIds: number[];
    setRepositionShiftExisting: Dispatch<SetStateAction<boolean>>;
    setRepositionStart: Dispatch<SetStateAction<string>>;
    setRepositionStep: Dispatch<SetStateAction<string>>;
    setShowRepositionDialog: Dispatch<SetStateAction<boolean>>;
    showRepositionDialog: boolean;
    styles: BrowserStyles;
    t: BrowserI18n['t'];
}

/** Anki's Reposition for the selected new cards: start, step, randomize, shift, and undo. */
export function RepositionModal({
    l,
    refreshSelection,
    repositionShiftExisting,
    repositionStart,
    repositionStep,
    selectedActionCardIds,
    setRepositionShiftExisting,
    setRepositionStart,
    setRepositionStep,
    setShowRepositionDialog,
    showRepositionDialog,
    styles,
    t,
}: RepositionModalProps) {
    const [randomize, setRandomize] = useState(() => readBrowserBoolean(REPOSITION_RANDOM_KEY, false));
    const close = () => setShowRepositionDialog(false);

    const checkbox = (checked: boolean, label: string, onPress: () => void) => (
        <TouchableOpacity style={styles.checkboxRow} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} aria-checked={checked}>
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked ? <Text style={styles.checkboxTick}>✓</Text> : null}</View>
            <Text style={styles.checkboxLabel}>{label}</Text>
        </TouchableOpacity>
    );

    const apply = () => {
        setDbSetting(REPOSITION_SHIFT_KEY, repositionShiftExisting ? '1' : '0');
        setDbSetting(REPOSITION_RANDOM_KEY, randomize ? '1' : '0');
        let count: number;
        try {
            count = repositionSelectedNewCards(selectedActionCardIds, Number(repositionStart), Number(repositionStep), repositionShiftExisting, { randomize });
        } catch (error) {
            console.warn('[Browser] reposition failed:', error);
            close();
            alert(t('common.error'), l('Kartlar yeniden konumlandırılamadı; hiçbir konum değişmedi.', 'Cards could not be repositioned; no position changed.'));
            return;
        }
        close();
        if (count === 0) {
            alert(l('Yeni kart yok', 'No new cards'), l('Seçimde yeniden konumlandırılabilecek yeni kart bulunmuyor.', 'The selection contains no new cards that can be repositioned.'));
            return;
        }
        refreshSelection();
    };

    const undo = () => {
        close();
        const restored = undoLastReposition();
        refreshSelection();
        alert(t('common.completed'), l(`${restored} kartın konumu geri alındı.`, `Positions of ${restored} cards restored.`));
    };

    return (
        <Modal visible={showRepositionDialog} transparent animationType="fade" onRequestClose={close}>
            <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={StyleSheet.absoluteFill} onPress={close} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{l('Yeniden Konumlandır', 'Reposition')}</Text>
                    <Text style={styles.modalCaption}>{l('Yalnızca seçili yeni kartlar etkilenir.', 'Only selected new cards are affected.')}</Text>
                    <Text style={styles.fieldLabel}>{l('Başlangıç konumu', 'Start position')}</Text>
                    <TextInput style={styles.dialogInput} value={repositionStart} onChangeText={(value) => setRepositionStart(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" inputMode="numeric" />
                    <Text style={styles.fieldLabel}>{l('Adım', 'Step')}</Text>
                    <TextInput style={styles.dialogInput} value={repositionStep} onChangeText={(value) => setRepositionStep(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" inputMode="numeric" />
                    {checkbox(randomize, l('Sırayı rastgele yap', 'Randomize order'), () => setRandomize((value) => !value))}
                    {checkbox(repositionShiftExisting, l('Mevcut kartların konumunu kaydır', 'Shift position of existing cards'), () => setRepositionShiftExisting((value) => !value))}
                    <View style={styles.dialogActions}>
                        {canUndoLastReposition() && (
                            <TouchableOpacity style={styles.dialogButton} onPress={undo} accessibilityLabel={l('Son yeniden konumlandırmayı geri al', 'Undo the last reposition')}>
                                <Text style={styles.dialogButtonText}>{l('Geri al', 'Undo')}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.dialogButton} onPress={close}><Text style={styles.dialogButtonText}>{t('common.cancel')}</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.dialogButton, styles.dialogButtonPrimary]} onPress={apply}>
                            <Text style={styles.dialogButtonPrimaryText}>{l('Uygula', 'Apply')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
