import type { Dispatch, SetStateAction } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ColorScheme } from '../../constants/theme';
import type { StudyCard, AppSettings } from '../../lib/types';
import type { Note, AnkiCard, Deck, NoteType } from '../../lib/models';
import type { BrowserTableMode, ResetCardOptions } from '../../lib/studyRepository';
import { localizeNoteTypeName, type SupportedLocale } from '../../lib/i18n';
import { changeNotesType } from '../../lib/noteManager';
import CardWebView from '../../components/CardWebView';
import { alert } from '../../lib/confirm';
import {
    gradeSelectedNow,
    parseDueRange,
    repositionSelectedNewCards,
    resetSelectedProgress,
    setSelectedDueDate,
} from '../../lib/browserSelection';
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
    return (
        <Modal visible={showNoteTypePicker} transparent animationType="fade" onRequestClose={() => setShowNoteTypePicker(false)}>
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowNoteTypePicker(false)} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{l('Not türünü değiştir', 'Change Note Type')}</Text>
                    <Text style={styles.modalCaption}>{l('Aynı adlı alanlar eşleştirilir; kartların mevcut zamanlaması korunur.', 'Fields with matching names are mapped; existing card scheduling is preserved.')}</Text>
                    <ScrollView style={styles.pickerList}>
                        {selectableNoteTypes.map((noteType) => (
                            <TouchableOpacity
                                key={noteType.id}
                                style={styles.pickerRow}
                                onPress={() => {
                                    setShowNoteTypePicker(false);
                                    runSelectionAction(() => changeNotesType(selectedNoteIds, noteType.id));
                                }}
                            >
                                <Text style={styles.pickerRowText}>{localizeNoteTypeName(locale, noteType.name)}</Text>
                                <Text style={styles.overflowChevron}>›</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowNoteTypePicker(false)}>
                        <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

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

/** Anki's Reposition for the selected new cards. */
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
    return (
        <Modal visible={showRepositionDialog} transparent animationType="fade" onRequestClose={() => setShowRepositionDialog(false)}>
            <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowRepositionDialog(false)} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{l('Yeniden Konumlandır', 'Reposition')}</Text>
                    <Text style={styles.modalCaption}>{l('Yalnızca seçili yeni kartlar etkilenir.', 'Only selected new cards are affected.')}</Text>
                    <Text style={styles.fieldLabel}>{l('Başlangıç konumu', 'Start position')}</Text>
                    <TextInput style={styles.dialogInput} value={repositionStart} onChangeText={(value) => setRepositionStart(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" inputMode="numeric" />
                    <Text style={styles.fieldLabel}>{l('Adım', 'Step')}</Text>
                    <TextInput style={styles.dialogInput} value={repositionStep} onChangeText={(value) => setRepositionStep(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" inputMode="numeric" />
                    <TouchableOpacity style={styles.checkboxRow} onPress={() => setRepositionShiftExisting((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: repositionShiftExisting }}>
                        <View style={[styles.checkbox, repositionShiftExisting && styles.checkboxChecked]}>{repositionShiftExisting ? <Text style={styles.checkboxTick}>✓</Text> : null}</View>
                        <Text style={styles.checkboxLabel}>{l('Mevcut kartların konumunu kaydır', 'Shift position of existing cards')}</Text>
                    </TouchableOpacity>
                    <View style={styles.dialogActions}>
                        <TouchableOpacity style={styles.dialogButton} onPress={() => setShowRepositionDialog(false)}><Text style={styles.dialogButtonText}>{t('common.cancel')}</Text></TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.dialogButton, styles.dialogButtonPrimary]}
                            onPress={() => {
                                const count = repositionSelectedNewCards(selectedActionCardIds, Number(repositionStart), Number(repositionStep), repositionShiftExisting);
                                setShowRepositionDialog(false);
                                if (count === 0) {
                                    alert(l('Yeni kart yok', 'No new cards'), l('Seçimde yeniden konumlandırılabilecek yeni kart bulunmuyor.', 'The selection contains no new cards that can be repositioned.'));
                                    return;
                                }
                                refreshSelection();
                            }}
                        ><Text style={styles.dialogButtonPrimaryText}>{l('Uygula', 'Apply')}</Text></TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

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
        <Modal visible={options !== null} transparent animationType="fade" onRequestClose={close}>
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={close} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{l('Kartları sıfırla', 'Reset Cards')}</Text>
                    <Text style={styles.modalCaption}>
                        {l(`${selectedActionCardIds.length} kart Yeni durumuna döner. Tekrar geçmişi korunur.`,
                            `${selectedActionCardIds.length} cards go back to New. Their review history is kept.`)}
                    </Text>
                    {rows.map(({ key, label }) => {
                        const checked = options?.[key] ?? false;
                        return (
                            <TouchableOpacity key={key} style={styles.checkboxRow} onPress={() => toggle(key)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
                                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked ? <Text style={styles.checkboxTick}>✓</Text> : null}</View>
                                <Text style={styles.checkboxLabel}>{label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                    <View style={styles.dialogActions}>
                        <TouchableOpacity style={styles.dialogButton} onPress={close}><Text style={styles.dialogButtonText}>{t('common.cancel')}</Text></TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.dialogButton, styles.dialogButtonPrimary]}
                            onPress={() => {
                                if (!options) return;
                                close();
                                runSelectionAction(() => resetSelectedProgress(selectedActionCardIds, options));
                            }}
                        ><Text style={styles.dialogButtonPrimaryText}>{l('Sıfırla', 'Reset')}</Text></TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

interface DueDateModalProps {
    colors: ColorScheme;
    dueInput: string;
    l: BrowserI18n['l'];
    runSelectionAction: (action: () => void) => void;
    selectedActionCardIds: number[];
    setDueInput: Dispatch<SetStateAction<string>>;
    setShowDueDialog: Dispatch<SetStateAction<boolean>>;
    settings: AppSettings;
    showDueDialog: boolean;
    styles: BrowserStyles;
    t: BrowserI18n['t'];
}

/** Anki's Set Due Date for the selected cards. */
export function DueDateModal({
    colors,
    dueInput,
    l,
    runSelectionAction,
    selectedActionCardIds,
    setDueInput,
    setShowDueDialog,
    settings,
    showDueDialog,
    styles,
    t,
}: DueDateModalProps) {
    return (
        <Modal visible={showDueDialog} transparent animationType="fade" onRequestClose={() => setShowDueDialog(false)}>
            <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDueDialog(false)} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{l('Vade tarihini ayarla', 'Set Due Date')}</Text>
                    <Text style={styles.modalCaption}>{l('Örnek: 5, 3-7 veya aralığı da değiştirmek için 3-7!', 'Examples: 5, 3-7, or 3-7! to also change the interval.')}</Text>
                    <TextInput style={styles.dialogInput} value={dueInput} onChangeText={setDueInput} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" placeholder="0" placeholderTextColor={colors.textMuted} />
                    <View style={styles.dialogActions}>
                        <TouchableOpacity style={styles.dialogButton} onPress={() => setShowDueDialog(false)}><Text style={styles.dialogButtonText}>{t('common.cancel')}</Text></TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.dialogButton, styles.dialogButtonPrimary]}
                            onPress={() => {
                                const range = parseDueRange(dueInput);
                                if (!range) {
                                    alert(l('Geçersiz vade', 'Invalid due date'), l('Tek bir gün veya 3-7 biçiminde bir aralık girin.', 'Enter one day or a range such as 3-7.'));
                                    return;
                                }
                                setShowDueDialog(false);
                                runSelectionAction(() => setSelectedDueDate(selectedActionCardIds, range, settings));
                            }}
                        ><Text style={styles.dialogButtonPrimaryText}>{l('Uygula', 'Apply')}</Text></TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
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
    return (
        <Modal visible={showGradePicker} transparent animationType="fade" onRequestClose={() => setShowGradePicker(false)}>
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowGradePicker(false)} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{l('Şimdi derecelendir', 'Grade Now')}</Text>
                    <Text style={styles.modalCaption}>{l('Seçili kartlar normal zamanlayıcı ve inceleme geçmişi kullanılarak derecelendirilir.', 'Selected cards are graded through the normal scheduler and review history.')}</Text>
                    {([
                        { grade: 1 as const, label: l('Tekrar', 'Again'), color: colors.btnAgain },
                        { grade: 2 as const, label: l('Zor', 'Hard'), color: colors.btnHard },
                        { grade: 3 as const, label: l('İyi', 'Good'), color: colors.btnGood },
                        { grade: 4 as const, label: l('Kolay', 'Easy'), color: colors.btnEasy },
                    ]).map((option) => (
                        <TouchableOpacity
                            key={option.grade}
                            style={styles.gradeRow}
                            onPress={() => {
                                setShowGradePicker(false);
                                runSelectionAction(() => gradeSelectedNow(selectedActionCardIds, option.grade, settings));
                            }}
                        >
                            <View style={[styles.gradeDot, { backgroundColor: option.color }]} />
                            <Text style={styles.gradeText}>{option.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </Modal>
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

/** Previews the selected cards one at a time, question and answer. */
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
                    <TouchableOpacity style={styles.previewHeaderButton} onPress={() => setPreviewIndex(null)}><Text style={styles.previewHeaderButtonText}>×</Text></TouchableOpacity>
                    <Text style={styles.previewTitle}>{l('Önizleme', 'Preview')} · {(previewIndex ?? 0) + 1}/{selectedCards.length}</Text>
                    <TouchableOpacity style={styles.previewHeaderButton} onPress={() => setPreviewAnswerVisible((value) => !value)}><Text style={styles.previewFlipText}>{previewAnswerVisible ? l('Soru', 'Question') : l('Cevap', 'Answer')}</Text></TouchableOpacity>
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
                    ) : <Text style={styles.modalCaption}>{tableMode === 'notes' ? l('Notun ilk kartı önizlenemedi.', "The note's first card could not be previewed.") : l('Kart önizlenemedi.', 'The card could not be previewed.')}</Text>}
                </View>
                <View style={styles.previewNavigation}>
                    <TouchableOpacity style={styles.previewNavButton} disabled={(previewIndex ?? 0) <= 0} onPress={() => { setPreviewAnswerVisible(false); setPreviewIndex((index) => Math.max(0, (index ?? 0) - 1)); }}><Text style={styles.previewNavText}>‹ {l('Önceki', 'Previous')}</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.previewNavButton} disabled={(previewIndex ?? 0) >= selectedCards.length - 1} onPress={() => { setPreviewAnswerVisible(false); setPreviewIndex((index) => Math.min(selectedCards.length - 1, (index ?? 0) + 1)); }}><Text style={styles.previewNavText}>{l('Sonraki', 'Next')} ›</Text></TouchableOpacity>
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
    return (
        <Modal visible={showSearchHelp} transparent animationType="fade" onRequestClose={() => setShowSearchHelp(false)}>
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSearchHelp(false)} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{l('Arama nasıl çalışır?', 'How search works')}</Text>
                    <Text style={styles.modalCaption}>
                        {l(
                            'Kelime yazınca kart metni, etiketler ve deste adı taranır. Aşağıdaki terimlerden birine dokunarak aramanıza ekleyebilirsiniz.',
                            'Plain words search the card text, its tags and its deck name. Tap any term below to add it to your search.',
                        )}
                    </Text>
                    <ScrollView style={styles.searchHelpList} showsVerticalScrollIndicator={false}>
                        {searchHelpGroups.map((group) => (
                            <View key={group.title}>
                                <Text style={styles.searchHelpGroupTitle}>{group.title}</Text>
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
                    <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowSearchHelp(false)}>
                        <Text style={styles.modalCloseText}>{t('common.close')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}
