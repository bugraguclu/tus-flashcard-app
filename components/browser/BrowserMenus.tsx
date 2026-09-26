import type { Dispatch, SetStateAction } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Pressable, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import type { ColorScheme } from '../../constants/theme';
import type { StudyCard, AppSettings } from '../../lib/types';
import { FLAG_COLORS, type CardFlag } from '../../lib/models';
import type { BrowserCardSortKey, BrowserTableMode } from '../../lib/studyRepository';
import { cardFlagName, type SupportedLocale } from '../../lib/i18n';
import { deleteNote, type CardDeckMoveSnapshot } from '../../lib/noteManager';
import { setDbSetting } from '../../lib/storage';
import SwipeDismissSheet from '../../components/SwipeDismissSheet';
import { alert, confirm } from '../../lib/confirm';
import { resetSelectedProgress, toggleSelectedBury, toggleSelectedSuspend } from '../../lib/browserSelection';
import type { BrowserI18n } from './types';
import type { BrowserStyles } from './browserStyles';
import { ALL_CARD_FLAGS, BROWSER_SORT_KEYS } from './browserHelpers';

interface SelectionMenuModalProps {
    closeSelection: () => void;
    hasCatalogCardsSelected: boolean;
    hasCatalogNotesSelected: boolean;
    l: BrowserI18n['l'];
    openSelectionTags: () => void;
    refreshSelection: () => void;
    router: ReturnType<typeof useRouter>;
    runSelectionAction: (action: () => void) => void;
    selectedActionCardIds: number[];
    selectedCardIds: Set<number>;
    selectedNoteIds: number[];
    setDueInput: Dispatch<SetStateAction<string>>;
    setPreviewAnswerVisible: Dispatch<SetStateAction<boolean>>;
    setPreviewIndex: Dispatch<SetStateAction<number | null>>;
    setRepositionShiftExisting: Dispatch<SetStateAction<boolean>>;
    setRepositionStart: Dispatch<SetStateAction<string>>;
    setRepositionStep: Dispatch<SetStateAction<string>>;
    setShowDeckPicker: Dispatch<SetStateAction<boolean>>;
    setShowDueDialog: Dispatch<SetStateAction<boolean>>;
    setShowGradePicker: Dispatch<SetStateAction<boolean>>;
    setShowNoteTypePicker: Dispatch<SetStateAction<boolean>>;
    setShowRepositionDialog: Dispatch<SetStateAction<boolean>>;
    setShowSelectionMenu: Dispatch<SetStateAction<boolean>>;
    settings: AppSettings;
    showSelectionMenu: boolean;
    styles: BrowserStyles;
    t: BrowserI18n['t'];
    tableMode: BrowserTableMode;
}

/** The actions on the selected cards or notes. */
export function SelectionMenuModal({
    closeSelection,
    hasCatalogCardsSelected,
    hasCatalogNotesSelected,
    l,
    openSelectionTags,
    refreshSelection,
    router,
    runSelectionAction,
    selectedActionCardIds,
    selectedCardIds,
    selectedNoteIds,
    setDueInput,
    setPreviewAnswerVisible,
    setPreviewIndex,
    setRepositionShiftExisting,
    setRepositionStart,
    setRepositionStep,
    setShowDeckPicker,
    setShowDueDialog,
    setShowGradePicker,
    setShowNoteTypePicker,
    setShowRepositionDialog,
    setShowSelectionMenu,
    settings,
    showSelectionMenu,
    styles,
    t,
    tableMode,
}: SelectionMenuModalProps) {
    return (
        <Modal visible={showSelectionMenu} transparent animationType="fade" onRequestClose={() => setShowSelectionMenu(false)}>
            <View style={styles.selectionMenuOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSelectionMenu(false)} />
                <SwipeDismissSheet
                    active={showSelectionMenu}
                    style={styles.selectionMenuCard}
                    onDismiss={() => setShowSelectionMenu(false)}
                    accessibilityViewIsModal
                >
                    <View style={styles.selectionMenuHeader}>
                        <Text style={styles.selectionMenuTitle}>
                            {selectedCardIds.size} {tableMode === 'notes' ? l('not seçili', 'notes selected') : l('kart seçili', 'cards selected')}
                        </Text>
                        <TouchableOpacity style={styles.selectionMenuClose} onPress={() => setShowSelectionMenu(false)}>
                            <Text style={styles.selectionMenuCloseText}>×</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <TouchableOpacity style={styles.selectionMenuItem} onPress={() => runSelectionAction(() => toggleSelectedSuspend(selectedActionCardIds, settings.dayRolloverHour))}>
                            <Text style={styles.selectionMenuIcon}>⏸</Text><Text style={styles.selectionMenuText}>{l('Askıya al / askıdan çıkar', 'Toggle suspend')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.selectionMenuItem} onPress={() => runSelectionAction(() => toggleSelectedBury(selectedActionCardIds, settings.dayRolloverHour))}>
                            <Text style={styles.selectionMenuIcon}>💤</Text><Text style={styles.selectionMenuText}>{l('Göm / gömmeden çıkar', 'Toggle bury')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.selectionMenuItem}
                            onPress={() => {
                                if (hasCatalogNotesSelected || hasCatalogCardsSelected) {
                                    alert(
                                        l('Katalog Korumalı', 'Catalog Protected'),
                                        l('Dahili TUS kartlarının not türü değiştirilemez.', 'Built-in TUS cards cannot have their note type changed.')
                                    );
                                    return;
                                }
                                setShowSelectionMenu(false);
                                setShowNoteTypePicker(true);
                            }}
                        >
                            <Text style={styles.selectionMenuIcon}>🗂</Text><Text style={styles.selectionMenuText}>{l('Not türünü değiştir', 'Change note type')}</Text><Text style={styles.overflowChevron}>›</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.selectionMenuItem}
                            onPress={() => {
                                if (hasCatalogCardsSelected || hasCatalogNotesSelected) {
                                    alert(
                                        l('Katalog Korumalı', 'Catalog Protected'),
                                        l('Seçilen kartlar arasında dahili TUS kartları bulunuyor. Dahili TUS kartlarının destesi değiştirilemez.', 'The selection contains built-in TUS cards. Built-in catalog cards cannot be moved to another deck.')
                                    );
                                    return;
                                }
                                setShowSelectionMenu(false);
                                setShowDeckPicker(true);
                            }}
                        >
                            <Text style={styles.selectionMenuIcon}>▤</Text><Text style={styles.selectionMenuText}>{l('Desteyi değiştir', 'Change deck')}</Text><Text style={styles.overflowChevron}>›</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setRepositionStart('1'); setRepositionStep('1'); setRepositionShiftExisting(true); setShowRepositionDialog(true); }}>
                            <Text style={styles.selectionMenuIcon}>↕</Text><Text style={styles.selectionMenuText}>{l('Yeniden konumlandır', 'Reposition')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setDueInput('0'); setShowDueDialog(true); }}>
                            <Text style={styles.selectionMenuIcon}>📅</Text><Text style={styles.selectionMenuText}>{l('Vade tarihini ayarla', 'Set due date')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.selectionMenuItem} onPress={openSelectionTags}>
                            <Text style={styles.selectionMenuIcon}>🏷</Text><Text style={styles.selectionMenuText}>{l('Etiketleri düzenle', 'Edit tags')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setShowGradePicker(true); }}>
                            <Text style={styles.selectionMenuIcon}>✓</Text><Text style={styles.selectionMenuText}>{l('Şimdi derecelendir', 'Grade now')}</Text><Text style={styles.overflowChevron}>›</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.selectionMenuItem}
                            onPress={() => {
                                setShowSelectionMenu(false);
                                confirm(
                                    l('İlerlemeyi sıfırla', 'Reset Progress'),
                                    l(`${selectedActionCardIds.length} kart yeni kuyruğunun sonuna taşınacak. İnceleme geçmişi korunur.`, `${selectedActionCardIds.length} cards will be moved to the end of the new queue. Review history is preserved.`),
                                    () => runSelectionAction(() => resetSelectedProgress(selectedActionCardIds, settings)),
                                    { destructive: true },
                                );
                            }}
                        >
                            <Text style={styles.selectionMenuIcon}>↺</Text><Text style={styles.selectionMenuText}>{l('İlerlemeyi sıfırla', 'Reset progress')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.selectionMenuItem} onPress={() => { setShowSelectionMenu(false); setPreviewAnswerVisible(false); setPreviewIndex(0); }}>
                            <Text style={styles.selectionMenuIcon}>👁</Text><Text style={styles.selectionMenuText}>{l('Önizle', 'Preview')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.selectionMenuItem}
                            onPress={() => {
                                if (hasCatalogCardsSelected || hasCatalogNotesSelected) {
                                    alert(
                                        l('Katalog Korumalı', 'Catalog Protected'),
                                        l('Dahili TUS kartları telif korumalıdır ve dışa aktarılamaz.', 'Built-in TUS cards are protected and cannot be exported.')
                                    );
                                    return;
                                }
                                setDbSetting('browser_export_card_ids', JSON.stringify(selectedActionCardIds));
                                setShowSelectionMenu(false);
                                router.push('/export?selection=browser' as any);
                            }}
                        >
                            <Text style={styles.selectionMenuIcon}>⇧</Text><Text style={styles.selectionMenuText}>{tableMode === 'notes' ? l('Notları dışa aktar', 'Export notes') : l('Kartları dışa aktar', 'Export cards')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.selectionMenuItem}
                            onPress={() => {
                                if (hasCatalogNotesSelected || hasCatalogCardsSelected) {
                                    alert(
                                        l('Katalog Korumalı', 'Catalog Protected'),
                                        l('Dahili TUS kartları silinemez. Kataloğu kaldırmak için Ayarlar ekranını kullanabilirsiniz.', 'Built-in TUS cards cannot be deleted. Use Settings to remove the catalog.')
                                    );
                                    return;
                                }
                                setShowSelectionMenu(false);
                                confirm(
                                    l('Notları sil', 'Delete Notes'),
                                    l(`${selectedNoteIds.length} not ve bu notlara bağlı tüm kartlar kalıcı olarak silinecek.`, `${selectedNoteIds.length} notes and all cards belonging to them will be permanently deleted.`),
                                    () => {
                                        try {
                                            for (const noteId of selectedNoteIds) deleteNote(noteId);
                                            closeSelection();
                                            refreshSelection();
                                        } catch (error) {
                                            console.warn('[Browser] delete selected notes failed:', error);
                                            alert(t('common.error'), l('Notlar silinemedi.', 'The notes could not be deleted.'));
                                        }
                                    },
                                    { destructive: true },
                                );
                            }}
                        >
                            <Text style={[styles.selectionMenuIcon, styles.selectionMenuDanger]}>⌫</Text><Text style={[styles.selectionMenuText, styles.selectionMenuDanger]}>{l('Notları sil', 'Delete notes')}</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </SwipeDismissSheet>
            </View>
        </Modal>
    );
}

interface OverflowMenuModalProps {
    coloredFlagFilters: CardFlag[];
    colors: ColorScheme;
    filteredCards: StudyCard[];
    flagFilters: CardFlag[];
    hasMoreCards: boolean;
    hasNoFlagFilter: boolean;
    l: BrowserI18n['l'];
    lastDeckMove: CardDeckMoveSnapshot[];
    locale: SupportedLocale;
    markedOnly: boolean;
    openFilteredDeckDialog: () => void;
    openFlagFilter: () => void;
    selectAllVisible: () => void;
    setMarkedOnly: Dispatch<SetStateAction<boolean>>;
    setShowOptions: Dispatch<SetStateAction<boolean>>;
    setShowOverflowMenu: Dispatch<SetStateAction<boolean>>;
    setShowSortPicker: Dispatch<SetStateAction<boolean>>;
    setShowTagFilter: Dispatch<SetStateAction<boolean>>;
    setSuspendedOnly: Dispatch<SetStateAction<boolean>>;
    showFlagFilterMenu: boolean;
    showOverflowMenu: boolean;
    styles: BrowserStyles;
    suspendedOnly: boolean;
    tagFilters: string[];
    toggleAllFlagFilters: () => void;
    toggleFlagFilter: (flag: CardFlag) => void;
    undoDeckMove: () => void;
}

/** The header's ••• menu: filters, selection, sorting and browser options. */
export function OverflowMenuModal({
    coloredFlagFilters,
    colors,
    filteredCards,
    flagFilters,
    hasMoreCards,
    hasNoFlagFilter,
    l,
    lastDeckMove,
    locale,
    markedOnly,
    openFilteredDeckDialog,
    openFlagFilter,
    selectAllVisible,
    setMarkedOnly,
    setShowOptions,
    setShowOverflowMenu,
    setShowSortPicker,
    setShowTagFilter,
    setSuspendedOnly,
    showFlagFilterMenu,
    showOverflowMenu,
    styles,
    suspendedOnly,
    tagFilters,
    toggleAllFlagFilters,
    toggleFlagFilter,
    undoDeckMove,
}: OverflowMenuModalProps) {
    return (
        <Modal visible={showOverflowMenu} transparent animationType="fade" onRequestClose={() => setShowOverflowMenu(false)}>
            <View style={styles.overflowOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowOverflowMenu(false)} />
                <View style={styles.overflowMenu} accessibilityViewIsModal>
                    <ScrollView bounces={false} showsVerticalScrollIndicator={showFlagFilterMenu}>
                    <TouchableOpacity style={styles.overflowItem} onPress={() => { setShowOverflowMenu(false); setShowSortPicker(true); }}>
                        <Text style={styles.overflowItemIcon}>↕</Text>
                        <Text style={styles.overflowItemText}>{l('Görüntüleme sırasını değiştir', 'Change display order')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.overflowItem} onPress={() => { setMarkedOnly((value) => !value); setShowOverflowMenu(false); }}>
                        <Text style={styles.overflowItemIcon}>★</Text>
                        <Text style={styles.overflowItemText}>{l('İşaretlileri filtrele', 'Filter marked')}</Text>
                        {markedOnly && <Text style={styles.overflowCheck}>✓</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.overflowItem} onPress={() => { setSuspendedOnly((value) => !value); setShowOverflowMenu(false); }}>
                        <Text style={styles.overflowItemIcon}>⏸</Text>
                        <Text style={styles.overflowItemText}>{l('Askıdakileri filtrele', 'Filter suspended')}</Text>
                        {suspendedOnly && <Text style={styles.overflowCheck}>✓</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.overflowItem} onPress={() => { setShowOverflowMenu(false); setShowTagFilter(true); }}>
                        <Text style={styles.overflowItemIcon}>⌗</Text>
                        <Text style={styles.overflowItemText}>{l('Etikete göre filtrele', 'Filter by tag')}</Text>
                        {tagFilters.length > 0 && <Text style={styles.overflowBadge}>{tagFilters.length}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.overflowItem} onPress={openFlagFilter}>
                        <Text style={styles.overflowItemIcon}>⚑</Text>
                        <Text style={styles.overflowItemText}>{l('Bayrağa göre filtrele', 'Filter by flag')}</Text>
                        {/* Mirrors the chips under the search field: "no flag" is a filter of its
                            own, so it shows its own ring instead of being counted as a colour.
                            Counting it made "no flag + red" read as two flags. */}
                        {flagFilters.length !== ALL_CARD_FLAGS.length && (
                            <>
                                {hasNoFlagFilter && <View style={[styles.menuFlagDot, styles.menuFlagDotEmpty]} />}
                                {coloredFlagFilters.length === 1 && (
                                    <View style={[styles.menuFlagDot, { backgroundColor: FLAG_COLORS[coloredFlagFilters[0]].color }]} />
                                )}
                                {coloredFlagFilters.length > 1 && (
                                    <Text style={styles.overflowBadge}>{coloredFlagFilters.length}</Text>
                                )}
                            </>
                        )}
                        <Text style={styles.overflowChevron}>{showFlagFilterMenu ? '⌄' : '›'}</Text>
                    </TouchableOpacity>
                    {showFlagFilterMenu && (
                        <View style={styles.overflowFlagPanel}>
                            <TouchableOpacity
                                style={[styles.overflowFlagRow, flagFilters.length === ALL_CARD_FLAGS.length && styles.overflowFlagRowActive]}
                                onPress={toggleAllFlagFilters}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: flagFilters.length === ALL_CARD_FLAGS.length }}
                            >
                                <View style={styles.flagDotPlaceholder} />
                                <Text style={[styles.overflowFlagText, flagFilters.length === ALL_CARD_FLAGS.length && styles.overflowFlagTextActive]}>
                                    {l('Tümünü seç', 'Select all')}
                                </Text>
                                <View style={[
                                    styles.checkbox,
                                    flagFilters.length > 0 && styles.checkboxChecked,
                                    flagFilters.length > 0 && flagFilters.length < ALL_CARD_FLAGS.length && styles.checkboxPartial,
                                ]}>
                                    {flagFilters.length > 0 && (
                                        <Text style={styles.checkboxTick}>
                                            {flagFilters.length === ALL_CARD_FLAGS.length ? '✓' : '−'}
                                        </Text>
                                    )}
                                </View>
                            </TouchableOpacity>
                            {ALL_CARD_FLAGS.map((flag) => {
                                const selected = flagFilters.includes(flag);
                                return (
                                    <TouchableOpacity
                                        key={flag}
                                        style={[styles.overflowFlagRow, selected && styles.overflowFlagRowActive]}
                                        onPress={() => toggleFlagFilter(flag)}
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked: selected }}
                                        accessibilityLabel={flag === 0 ? l('Bayrak yok', 'No flag') : cardFlagName(locale, flag)}
                                    >
                                        <View style={[styles.flagDot, { backgroundColor: flag === 0 ? colors.bgCard : FLAG_COLORS[flag].color }]} />
                                        <Text style={[styles.overflowFlagText, selected && styles.overflowFlagTextActive]}>
                                            {flag === 0 ? l('Bayrak yok', 'No flag') : cardFlagName(locale, flag)}
                                        </Text>
                                        <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                                            {selected && <Text style={styles.checkboxTick}>✓</Text>}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                            <View style={styles.overflowFlagFooter}>
                                <Text style={styles.overflowFlagCount}>
                                    {l(`${flagFilters.length} seçenek seçili`, `${flagFilters.length} selected`)}
                                </Text>
                            </View>
                        </View>
                    )}
                    <View style={styles.overflowSeparator} />
                    <TouchableOpacity
                        style={[styles.overflowItem, lastDeckMove.length === 0 && styles.overflowItemDisabled]}
                        disabled={lastDeckMove.length === 0}
                        onPress={undoDeckMove}
                    >
                        <Text style={styles.overflowItemIcon}>↶</Text>
                        <Text style={styles.overflowItemText}>{l('Geri al: Deste güncelleme', 'Undo Update Deck')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.overflowItem, filteredCards.length === 0 && styles.overflowItemDisabled]}
                        disabled={filteredCards.length === 0}
                        onPress={() => { setShowOverflowMenu(false); selectAllVisible(); }}
                    >
                        <Text style={styles.overflowItemIcon}>☑</Text>
                        <Text style={styles.overflowItemText}>
                            {hasMoreCards
                                ? l(`Yüklenenleri seç (${filteredCards.length})`, `Select loaded (${filteredCards.length})`)
                                : l('Tümünü seç', 'Select all')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.overflowItem} onPress={() => { setShowOverflowMenu(false); setShowOptions(true); }}>
                        <Text style={styles.overflowItemIcon}>⚙</Text>
                        <Text style={styles.overflowItemText}>{l('Seçenekler', 'Options')}</Text>
                    </TouchableOpacity>
                    <View style={styles.overflowSeparator} />
                    <TouchableOpacity style={styles.overflowItem} onPress={openFilteredDeckDialog}>
                        <Text style={styles.overflowItemIcon}>⧉</Text>
                        <Text style={styles.overflowItemText}>{l('Filtrelenmiş deste oluştur', 'Create filtered deck')}</Text>
                    </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

interface SortPickerModalProps {
    l: BrowserI18n['l'];
    setShowSortPicker: Dispatch<SetStateAction<boolean>>;
    showSortPicker: boolean;
    sortDescending: boolean;
    sortKey: BrowserCardSortKey;
    sortLabels: Record<BrowserCardSortKey, string>;
    styles: BrowserStyles;
    t: BrowserI18n['t'];
    updateSort: (nextSortKey: BrowserCardSortKey) => void;
    updateSortDirection: (descending: boolean) => void;
}

/** The sort column and its direction. */
export function SortPickerModal({
    l,
    setShowSortPicker,
    showSortPicker,
    sortDescending,
    sortKey,
    sortLabels,
    styles,
    t,
    updateSort,
    updateSortDirection,
}: SortPickerModalProps) {
    return (
        <Modal visible={showSortPicker} transparent animationType="fade" onRequestClose={() => setShowSortPicker(false)}>
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSortPicker(false)} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{l('Görüntüleme sırası', 'Display Order')}</Text>
                    <View style={styles.directionRow}>
                        <TouchableOpacity
                            style={[styles.directionButton, !sortDescending && styles.directionButtonActive]}
                            onPress={() => updateSortDirection(false)}
                        >
                            <Text style={[styles.directionText, !sortDescending && styles.directionTextActive]}>↑ {l('Artan', 'Ascending')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.directionButton, sortDescending && styles.directionButtonActive]}
                            onPress={() => updateSortDirection(true)}
                        >
                            <Text style={[styles.directionText, sortDescending && styles.directionTextActive]}>↓ {l('Azalan', 'Descending')}</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.pickerList}>
                        {BROWSER_SORT_KEYS.map((key) => (
                            <TouchableOpacity key={key} style={[styles.pickerRow, sortKey === key && styles.pickerRowActive]} onPress={() => updateSort(key)}>
                                <Text style={[styles.pickerRowText, sortKey === key && styles.pickerRowTextActive]}>{sortLabels[key]}</Text>
                                {sortKey === key && <Text style={styles.pickerCheck}>✓</Text>}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowSortPicker(false)}>
                        <Text style={styles.modalCloseText}>{t('common.close')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

interface FlagPickerModalProps {
    applyFlag: (flag: CardFlag) => void;
    colors: ColorScheme;
    flagPickerMode: "selection" | null;
    l: BrowserI18n['l'];
    locale: SupportedLocale;
    setFlagPickerMode: Dispatch<SetStateAction<"selection" | null>>;
    styles: BrowserStyles;
    tableMode: BrowserTableMode;
}

/** Sets a flag on the selected cards. */
export function FlagPickerModal({
    applyFlag,
    colors,
    flagPickerMode,
    l,
    locale,
    setFlagPickerMode,
    styles,
    tableMode,
}: FlagPickerModalProps) {
    return (
        <Modal visible={flagPickerMode !== null} transparent animationType="fade" onRequestClose={() => setFlagPickerMode(null)}>
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setFlagPickerMode(null)} />
                <View style={[styles.modalCard, styles.flagPickerCard]} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{tableMode === 'notes' ? l('Seçili notların kartlarını bayrakla', 'Flag Cards of Selected Notes') : l('Seçili kartları bayrakla', 'Flag Selected Cards')}</Text>
                    {ALL_CARD_FLAGS.map((flag) => (
                        <TouchableOpacity key={flag} style={styles.pickerRow} onPress={() => applyFlag(flag)}>
                            <View style={[styles.flagDot, { backgroundColor: flag === 0 ? colors.bgCard : FLAG_COLORS[flag].color }]} />
                            <Text style={styles.pickerRowText}>
                                {flag === 0 ? l('Bayrak yok', 'No flag') : cardFlagName(locale, flag)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </Modal>
    );
}

interface BrowserOptionsModalProps {
    colors: ColorScheme;
    l: BrowserI18n['l'];
    setShowOptions: Dispatch<SetStateAction<boolean>>;
    showAnswerSnippet: boolean;
    showOptions: boolean;
    showScheduleDetails: boolean;
    styles: BrowserStyles;
    t: BrowserI18n['t'];
    tableMode: BrowserTableMode;
    updateBrowserOption: (key: "answer" | "schedule", value: boolean) => void;
    updateTableMode: (mode: BrowserTableMode) => void;
}

/** Table mode and the optional columns of the card list. */
export function BrowserOptionsModal({
    colors,
    l,
    setShowOptions,
    showAnswerSnippet,
    showOptions,
    showScheduleDetails,
    styles,
    t,
    tableMode,
    updateBrowserOption,
    updateTableMode,
}: BrowserOptionsModalProps) {
    return (
        <Modal visible={showOptions} transparent animationType="fade" onRequestClose={() => setShowOptions(false)}>
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowOptions(false)} />
                <View style={styles.modalCard} accessibilityViewIsModal>
                    <Text style={styles.modalTitle}>{l('Kart tarayıcısı seçenekleri', 'Card Browser Options')}</Text>
                    <Text style={styles.optionTitle}>{l('Görünüm', 'View')}</Text>
                    <Text style={styles.optionCaption}>{l('Listede kartları veya her notu tek satır olarak göster.', 'Show cards, or show each note as a single row.')}</Text>
                    <View style={styles.directionRow}>
                        <TouchableOpacity
                            style={[styles.directionButton, tableMode === 'cards' && styles.directionButtonActive]}
                            onPress={() => updateTableMode('cards')}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: tableMode === 'cards' }}
                        >
                            <Text style={[styles.directionText, tableMode === 'cards' && styles.directionTextActive]}>{l('Kartlar', 'Cards')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.directionButton, tableMode === 'notes' && styles.directionButtonActive]}
                            onPress={() => updateTableMode('notes')}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: tableMode === 'notes' }}
                        >
                            <Text style={[styles.directionText, tableMode === 'notes' && styles.directionTextActive]}>{l('Notlar', 'Notes')}</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.optionRow}>
                        <View style={styles.optionCopy}>
                            <Text style={styles.optionTitle}>{l('Yanıt önizlemesini göster', 'Show answer preview')}</Text>
                            <Text style={styles.optionCaption}>{l('Kart satırında cevabın kısa bir bölümünü gösterir.', 'Shows a short answer excerpt in each row.')}</Text>
                        </View>
                        <Switch value={showAnswerSnippet} onValueChange={(value) => updateBrowserOption('answer', value)} trackColor={{ false: colors.border, true: colors.accentLight }} thumbColor={showAnswerSnippet ? colors.accent : colors.textMuted} />
                    </View>
                    <View style={styles.optionRow}>
                        <View style={styles.optionCopy}>
                            <Text style={styles.optionTitle}>{l('Zamanlama ayrıntıları', 'Scheduling details')}</Text>
                            <Text style={styles.optionCaption}>{l('Son çalışma ve sonraki gösterim bilgisini gösterir.', 'Shows last review and next due information.')}</Text>
                        </View>
                        <Switch value={showScheduleDetails} onValueChange={(value) => updateBrowserOption('schedule', value)} trackColor={{ false: colors.border, true: colors.accentLight }} thumbColor={showScheduleDetails ? colors.accent : colors.textMuted} />
                    </View>
                    <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowOptions(false)}>
                        <Text style={styles.modalCloseText}>{t('common.close')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}
