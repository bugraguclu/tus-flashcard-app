import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { View } from 'react-native';
import { Text } from '../AppText';
import { alert } from '../../lib/confirm';
import { AppDialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { CheckRow } from '../ui/Choice';
import { TextField } from '../ui/Fields';
import { canUndoLastReposition, getNewQueuePositionRange, repositionSelectedNewCards, undoLastReposition } from '../../lib/browserReposition';
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
    // Anki's dialog opens by showing where the new queue starts and ends. Read once on opening and
    // kept while the dialog fades out, so closing it does not flash "0" or a new Undo button.
    const openedStateRef = useRef({ queueRange: { top: 0, bottom: 0 }, canUndo: false });
    const { queueRange, canUndo } = useMemo(() => {
        if (showRepositionDialog) openedStateRef.current = { queueRange: getNewQueuePositionRange(), canUndo: canUndoLastReposition() };
        return openedStateRef.current;
    }, [showRepositionDialog]);

    const checkbox = (checked: boolean, label: string, onPress: () => void) => (
        <CheckRow label={label} checked={checked} onChange={onPress} style={styles.dialogRow} />
    );
    const field = (label: string, value: string, onChange: (value: string) => void) => (
        <View style={styles.dialogField}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextField
                value={value}
                onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                inputMode="numeric"
                accessibilityLabel={label}
            />
        </View>
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
        <AppDialog
            visible={showRepositionDialog}
            onClose={close}
            title={l('Yeniden Konumlandır', 'Reposition')}
            message={l('Yalnızca seçili yeni kartlar etkilenir.', 'Only selected new cards are affected.')}
            actions={(
                <>
                    {canUndo && (
                        <Button
                            variant="plain"
                            label={l('Geri al', 'Undo')}
                            onPress={undo}
                            accessibilityLabel={l('Son yeniden konumlandırmayı geri al', 'Undo the last reposition')}
                        />
                    )}
                    <Button variant="plain" label={t('common.cancel')} onPress={close} />
                    <Button label={l('Uygula', 'Apply')} onPress={apply} />
                </>
            )}
        >
            <Text style={styles.dialogNote}>
                {l(`Kuyruk başı: ${queueRange.top}\nKuyruk sonu: ${queueRange.bottom}`, `Queue top: ${queueRange.top}\nQueue bottom: ${queueRange.bottom}`)}
            </Text>
            {field(l('Başlangıç konumu', 'Start position'), repositionStart, setRepositionStart)}
            {field(l('Adım', 'Step'), repositionStep, setRepositionStep)}
            <View>
                {checkbox(randomize, l('Sırayı rastgele yap', 'Randomize order'), () => setRandomize((value) => !value))}
                {checkbox(repositionShiftExisting, l('Mevcut kartların konumunu kaydır', 'Shift position of existing cards'), () => setRepositionShiftExisting((value) => !value))}
            </View>
        </AppDialog>
    );
}
