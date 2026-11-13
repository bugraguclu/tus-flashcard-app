import type { Dispatch, SetStateAction } from 'react';
import { Modal, View, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../AppText';
import { useThemeColors, type ColorScheme } from '../../constants/theme';
import type { StudyCard, AppSettings } from '../../lib/types';
import type { Note, AnkiCard, Deck, NoteType } from '../../lib/models';
import type { BrowserTableMode, ResetCardOptions } from '../../lib/studyRepository';
import { localizeNoteTypeName, type SupportedLocale } from '../../lib/i18n';
import { changeNoteTypeWithConfirmation, noteTypeChangeRemovalPrompt } from '../../lib/noteTypeChangeFlow';
import CardWebView from '../../components/CardWebView';
import { alert, choose, confirm } from '../../lib/confirm';
import { rememberSetDueDateInput } from '../../lib/setDueDateDefaults';
import {
    gradeSelectedNow,
    parseDueRange,
    resetSelectedProgress,
    setSelectedDueDate,
} from '../../lib/browserSelection';
import { AppDialog } from '../ui/Dialog';
import { Button, CloseButton } from '../ui/Button';
import { SectionLabel } from '../ui/Card';
import { CheckRow } from '../ui/Choice';
import { TextField } from '../ui/Fields';
import { BackIcon, ChevronRightIcon, ForwardIcon } from '../ui/icons';
import type { BrowserI18n } from './types';
import type { BrowserStyles } from './browserStyles';

interface ChangeNoteTypeModalProps {
    l: BrowserI18n['l'];
    locale: SupportedLocale;
    runSelectionAction: (action: () => void) => void;
    selectableNoteTypes: NoteType[];
    selectedNoteIds: number[];
    setShowNoteTypePicker: Dispatch<SetStateAction<boolean>>;
    showNoteTypePicker: boolean;
    styles: BrowserStyles;
    t: BrowserI18n['t'];
}

/** Moves the selected notes to another note type. */
export function ChangeNoteTypeModal({
    l,
    locale,
    runSelectionAction,
    selectableNoteTypes,
    selectedNoteIds,
    setShowNoteTypePicker,
    showNoteTypePicker,
    styles,
    t,
}: ChangeNoteTypeModalProps) {
    const colors = useThemeColors();
    const close = () => setShowNoteTypePicker(false);
    return (
        <AppDialog
            visible={showNoteTypePicker}
            onClose={close}
            title={l('Not türünü değiştir', 'Change Note Type')}
            message={l('Alanlar ve şablonlar önce adına, sonra sırasına göre eşleştirilir. Yeni not türünde eşleşen bir şablonu olan kartlar zamanlamasını korur; diğer kartlar silinmeden önce onayınız istenir ve değişikliği sonra geri alabilirsiniz.', 'Fields and templates are matched by name, then by order. Cards with a matching template in the new note type keep their scheduling; you are asked before any other card is removed, and you can undo the change afterwards.')}
            actions={<Button variant="plain" label={t('common.cancel')} onPress={close} />}
        >
            <ScrollView style={styles.pickerList}>
                {selectableNoteTypes.map((noteType) => (
                    <TouchableOpacity
                        key={noteType.id}
                        style={styles.pickerRow}
                        accessibilityRole="button"
                        onPress={() => {
                            close();
                            changeNoteTypeWithConfirmation(selectedNoteIds, noteType.id, {
                                run: runSelectionAction,
                                confirmCardRemoval: (cardCount, onConfirm) => {
                                    const prompt = noteTypeChangeRemovalPrompt(cardCount, l, locale);
                                    confirm(prompt.title, prompt.message, onConfirm, { destructive: true });
                                },
                                offerUndo: (result) => {
                                    void choose(
                                        l('Not türü değiştirildi', 'Note Type Changed'),
                                        l(`${result.changed} not dönüştürüldü.`, result.changed === 1 ? '1 note converted.' : `${result.changed} notes converted.`),
                                        l('Geri al', 'Undo'),
                                        l('Bitti', 'Done'),
                                    ).then((undo) => {
                                        // The selection runner refreshes and reports a refused undo.
                                        if (undo) runSelectionAction(() => result.undo());
                                    });
                                },
                            });
                        }}
                    >
                        <Text style={styles.pickerRowText}>{localizeNoteTypeName(locale, noteType.name)}</Text>
                        <ChevronRightIcon color={colors.textMuted} size={16} />
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </AppDialog>
    );
}

// Reposition lives in its own file (randomize, remembered choices, undo).
export { RepositionModal } from './RepositionModal';

interface ResetCardsModalProps {
    l: BrowserI18n['l'];
    /** The options on screen; null while the dialog is closed. */
    options: ResetCardOptions | null;
    runSelectionAction: (action: () => void) => void;
    selectedActionCardIds: number[];
    setOptions: Dispatch<SetStateAction<ResetCardOptions | null>>;
    styles: BrowserStyles;
    t: BrowserI18n['t'];
}

/** Anki's Reset Card for the selected cards, with its two options. */
export function ResetCardsModal({
    l,
    options,
    runSelectionAction,
    selectedActionCardIds,
    setOptions,
    styles,
    t,
}: ResetCardsModalProps) {
    const close = () => setOptions(null);
    const toggle = (key: keyof ResetCardOptions) => setOptions((current) => (current ? { ...current, [key]: !current[key] } : current));
    const rows: Array<{ key: keyof ResetCardOptions; label: string }> = [
        { key: 'restorePosition', label: l('Mümkünse ilk sırasına geri koy', 'Restore original position where possible') },
        { key: 'resetCounts', label: l('Tekrar ve unutma sayılarını sıfırla', 'Reset repetition and lapse counts') },
    ];
    return (
        <AppDialog
            visible={options !== null}
            onClose={close}
            title={l('Kartları sıfırla', 'Reset Cards')}
            message={l(`${selectedActionCardIds.length} kart Yeni durumuna döner. Tekrar geçmişi korunur.`,
                `${selectedActionCardIds.length} cards go back to New. Their review history is kept.`)}
            actions={(
                <>
                    <Button variant="plain" label={t('common.cancel')} onPress={close} />
                    <Button
                        label={l('Sıfırla', 'Reset')}
                        onPress={() => {
                            if (!options) return;
                            close();
                            runSelectionAction(() => resetSelectedProgress(selectedActionCardIds, options));
                        }}
                    />
                </>
            )}
        >
            <View>
                {rows.map(({ key, label }) => (
                    <CheckRow key={key} label={label} checked={options?.[key] ?? false} onChange={() => toggle(key)} style={styles.dialogRow} />
                ))}
            </View>
        </AppDialog>
    );
}

interface DueDateModalProps {
    dueInput: string;
    l: BrowserI18n['l'];
    runSelectionAction: (action: () => void) => void;
    selectedActionCardIds: number[];
    setDueInput: Dispatch<SetStateAction<string>>;
    setShowDueDialog: Dispatch<SetStateAction<boolean>>;
    settings: AppSettings;
    showDueDialog: boolean;
    t: BrowserI18n['t'];
}

/** Anki's Set Due Date for the selected cards. */
export function DueDateModal({
    dueInput,
    l,
    runSelectionAction,
    selectedActionCardIds,
    setDueInput,
    setShowDueDialog,
    settings,
    showDueDialog,
    t,
}: DueDateModalProps) {
    const close = () => setShowDueDialog(false);
    const apply = () => {
        const range = parseDueRange(dueInput);
        if (!range) {
            alert(l('Geçersiz vade', 'Invalid due date'), l('Tek bir gün veya 3-7 biçiminde bir aralık girin.', 'Enter one day or a range such as 3-7.'));
            return;
        }
        close();
        rememberSetDueDateInput('browser', dueInput);
        runSelectionAction(() => setSelectedDueDate(selectedActionCardIds, range, settings));
    };
    return (
        <AppDialog
            visible={showDueDialog}
            onClose={close}
            title={l('Vade tarihini ayarla', 'Set Due Date')}
            message={l('0 bugün, 1 yarındır. 3-7 her karta bu aralıkta rastgele bir gün verir. Sondaki ! aralığı da değiştirir (FSRS açıkken etkisizdir). Kartlar tekrar kartı olur.', '0 is today, 1 tomorrow. 3-7 gives each card a random day in that range. A trailing ! also changes the interval (no effect with FSRS). The cards become review cards.')}
            actions={(
                <>
                    <Button variant="plain" label={t('common.cancel')} onPress={close} />
                    <Button label={l('Uygula', 'Apply')} onPress={apply} />
                </>
            )}
        >
            <TextField value={dueInput} onChangeText={setDueInput} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" placeholder="0" />
        </AppDialog>
    );
}

interface GradeNowModalProps {
    colors: ColorScheme;
    l: BrowserI18n['l'];
    runSelectionAction: (action: () => void) => void;
    selectedActionCardIds: number[];
    setShowGradePicker: Dispatch<SetStateAction<boolean>>;
    settings: AppSettings;
    showGradePicker: boolean;
    styles: BrowserStyles;
}

/** Grades the selected cards now, as if they had been reviewed. */
export function GradeNowModal({
    colors,
    l,
    runSelectionAction,
    selectedActionCardIds,
    setShowGradePicker,
    settings,
    showGradePicker,
    styles,
}: GradeNowModalProps) {
    const close = () => setShowGradePicker(false);
    return (
        <AppDialog
            visible={showGradePicker}
            onClose={close}
            title={l('Şimdi derecelendir', 'Grade Now')}
            message={l('Seçili kartlar normal zamanlayıcı ve inceleme geçmişi kullanılarak derecelendirilir.', 'Selected cards are graded through the normal scheduler and review history.')}
            closeButton
        >
            <View>
                {([
                    { grade: 1 as const, label: l('Tekrar', 'Again'), color: colors.btnAgain },
                    { grade: 2 as const, label: l('Zor', 'Hard'), color: colors.btnHard },
                    { grade: 3 as const, label: l('İyi', 'Good'), color: colors.btnGood },
                    { grade: 4 as const, label: l('Kolay', 'Easy'), color: colors.btnEasy },
                ]).map((option) => (
                    <TouchableOpacity
                        key={option.grade}
                        style={styles.gradeRow}
                        accessibilityRole="button"
                        onPress={() => {
                            close();
                            runSelectionAction(() => gradeSelectedNow(selectedActionCardIds, option.grade, settings));
                        }}
                    >
                        <View style={[styles.gradeDot, { backgroundColor: option.color }]} />
                        <Text style={styles.gradeText}>{option.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </AppDialog>
    );
}

interface CardPreviewModalProps {
    l: BrowserI18n['l'];
    previewAnswerVisible: boolean;
    previewDeck: Deck | null;
    previewIndex: number | null;
    previewNote: Note | null;
    previewNoteType: NoteType | null;
    previewRawCard: AnkiCard | null;
    selectedCards: StudyCard[];
    setPreviewAnswerVisible: Dispatch<SetStateAction<boolean>>;
    setPreviewIndex: Dispatch<SetStateAction<number | null>>;
    styles: BrowserStyles;
    tableMode: BrowserTableMode;
    windowHeight: number;
}


/**
 * Previews the selected cards one at a time, question and answer. The card's box keeps one height
 * from card to card, so the dialog does not jump as each card reports its own height.
 */
export function CardPreviewModal({
    l,
    previewAnswerVisible,
    previewDeck,
    previewIndex,
    previewNote,
    previewNoteType,
    previewRawCard,
    selectedCards,
    setPreviewAnswerVisible,
    setPreviewIndex,
    styles,
    tableMode,
    windowHeight,
}: CardPreviewModalProps) {
    const colors = useThemeColors();
    const index = previewIndex ?? 0;
    const step = (delta: number) => {
        setPreviewAnswerVisible(false);
        setPreviewIndex((current) => Math.min(selectedCards.length - 1, Math.max(0, (current ?? 0) + delta)));
    };
    // A native page sheet, as every routed utility screen on iPhone: pull it down to close.
    return (
        <Modal
            visible={previewIndex !== null}
            animationType="slide"
            presentationStyle="pageSheet"
            allowSwipeDismissal
            onRequestClose={() => setPreviewIndex(null)}
        >
            <SafeAreaView style={styles.previewContainer}>
                <View style={[styles.previewGrabberArea, { pointerEvents: 'none' }]}>
                    <View style={styles.previewGrabber} />
                </View>
                <View style={styles.previewHeader}>
                    <CloseButton accessibilityLabel={l('Önizlemeyi kapat', 'Close preview')} onPress={() => setPreviewIndex(null)} />
                    <Text style={styles.previewTitle} accessibilityRole="header">{l('Önizleme', 'Preview')} · {index + 1}/{selectedCards.length}</Text>
                    <Button
                        variant="plain"
                        size="compact"
                        label={previewAnswerVisible ? l('Soru', 'Question') : l('Cevap', 'Answer')}
                        accessibilityLabel={previewAnswerVisible ? l('Soruyu göster', 'Show question') : l('Cevabı göster', 'Show answer')}
                        onPress={() => setPreviewAnswerVisible((value) => !value)}
                    />
                </View>
                <View style={styles.previewBody}>
                    {previewNote && previewNoteType && previewRawCard ? (
                        <CardWebView
                            noteType={previewNoteType}
                            note={previewNote}
                            card={previewRawCard}
                            deck={previewDeck}
                            side={previewAnswerVisible ? 'answer' : 'question'}
                            scrollMode="contained"
                            maxHeight={Math.max(260, Math.min(520, windowHeight - 210))}
                        />
                    ) : <Text style={styles.dialogNote}>{tableMode === 'notes' ? l('Notun ilk kartı önizlenemedi.', "The note's first card could not be previewed.") : l('Kart önizlenemedi.', 'The card could not be previewed.')}</Text>}
                </View>
                <View style={styles.previewNavigation}>
                    <Button
                        variant="plain"
                        label={l('Önceki', 'Previous')}
                        icon={<BackIcon color={colors.accent} size={18} />}
                        disabled={index <= 0}
                        onPress={() => step(-1)}
                        accessibilityLabel={l('Önceki kart', 'Previous card')}
                        style={styles.previewNavButton}
                    />
                    <Button
                        variant="plain"
                        label={l('Sonraki', 'Next')}
                        trailingIcon={<ForwardIcon color={colors.accent} size={18} />}
                        disabled={index >= selectedCards.length - 1}
                        onPress={() => step(1)}
                        accessibilityLabel={l('Sonraki kart', 'Next card')}
                        style={styles.previewNavButton}
                    />
                </View>
            </SafeAreaView>
        </Modal>
    );
}

interface SearchHelpModalProps {
    appendSearchTerm: (term: string) => void;
    l: BrowserI18n['l'];
    searchHelpGroups: { title: string; items: { term: string; hint: string; }[]; }[];
    setShowSearchHelp: Dispatch<SetStateAction<boolean>>;
    showSearchHelp: boolean;
    styles: BrowserStyles;
    t: BrowserI18n['t'];
}

/** The search syntax cheat sheet; a row appends its term to the search. */
export function SearchHelpModal({
    appendSearchTerm,
    l,
    searchHelpGroups,
    setShowSearchHelp,
    showSearchHelp,
    styles,
    t,
}: SearchHelpModalProps) {
    const close = () => setShowSearchHelp(false);
    return (
        <AppDialog
            visible={showSearchHelp}
            onClose={close}
            title={l('Arama nasıl çalışır?', 'How search works')}
            message={l(
                'Kelimeler kartın alanlarındaki metinde aranır; etiket ve deste adı aranmaz, onlar için tag: ve deck: kullanın. ç, ğ, ö, ş, ü harflerini karttaki gibi yazın ya da kelimenin başına nc: ekleyin. Bir terime dokunarak aramanıza ekleyebilirsiniz.',
                'Words are searched in the text of the card’s fields; tags and deck names are not, so use tag: and deck: for them. Type ç, ğ, ö, ş, ü as they appear in the card, or put nc: before the word. Tap a term to add it to your search.',
            )}
            actions={<Button variant="plain" label={t('common.close')} onPress={close} />}
        >
            <ScrollView style={styles.searchHelpList} showsVerticalScrollIndicator={false}>
                {searchHelpGroups.map((group) => (
                    <View key={group.title}>
                        <SectionLabel style={styles.searchHelpGroupTitle}>{group.title}</SectionLabel>
                        {group.items.map((item) => (
                            <TouchableOpacity
                                key={item.term}
                                style={styles.searchHelpRow}
                                onPress={() => appendSearchTerm(item.term)}
                                accessibilityRole="button"
                                accessibilityLabel={l(`${item.term} terimini aramaya ekle`, `Add the term ${item.term} to the search`)}
                            >
                                <Text style={styles.searchHelpTerm}>{item.term}</Text>
                                <Text style={styles.searchHelpHint} numberOfLines={2}>{item.hint}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ))}
            </ScrollView>
        </AppDialog>
    );
}
