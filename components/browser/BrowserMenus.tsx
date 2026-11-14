import { useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Platform, View, ScrollView, TouchableOpacity, type AccessibilityRole, type AccessibilityState } from 'react-native';
import { Text } from '../AppText';
import { useRouter } from 'expo-router';
import { useThemeColors, type ColorScheme } from '../../constants/theme';
import type { StudyCard, AppSettings } from '../../lib/types';
import { getSetDueDateDefault } from '../../lib/setDueDateDefaults';
import { FLAG_COLORS, type CardFlag } from '../../lib/models';
import type { BrowserCardSortKey, BrowserTableMode } from '../../lib/studyRepository';
import { cardFlagName, type SupportedLocale } from '../../lib/i18n';
import { deleteNotes, type CardDeckMoveSnapshot } from '../../lib/noteManager';
import { setDbSetting } from '../../lib/storage';
import GearGlyph from '../../components/GearGlyph';
import FlagGlyph from '../../components/FlagGlyph';
import StarGlyph from '../../components/StarGlyph';
import CalendarGlyph from '../../components/CalendarGlyph';
import CardsGlyph from '../../components/CardsGlyph';
import DeckOverflowGlyph from '../../components/DeckOverflowGlyph';
import { alert, choose, confirm } from '../../lib/confirm';
import { userFacingErrorMessage } from '../../lib/userFacingError';
import { toggleSelectedBury, toggleSelectedSuspend } from '../../lib/browserSelection';
import { AppDialog } from '../ui/Dialog';
import { AppSheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Card, Divider } from '../ui/Card';
import { Badge, Chip, SegmentedControl, SelectedMark } from '../ui/Choice';
import { MenuItem, MenuSeparator, PopoverMenu } from '../ui/Menu';
import { SwitchRow } from '../ui/Rows';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, MinusIcon } from '../ui/icons';
import { EyeIcon } from '../editor/EditorIcons';
import InfoCircleGlyph from '../InfoCircleGlyph';
import { CopyGlyph, SearchGlyph } from '../UiGlyphs';
import type { BrowserI18n } from './types';
import type { BrowserStyles } from './browserStyles';
import type { BrowserNoteTool } from './BrowserNoteTools';
import { ALL_CARD_FLAGS, BROWSER_SORT_KEYS } from './browserHelpers';
import {
    BuryIcon,
    FilteredDeckIcon,
    ResetIcon,
    SelectAllIcon,
    SelectionDeckIcon,
    SelectionSuspendIcon,
    SortIcon,
    TagIcon,
    TrashIcon,
    UndoIcon,
} from './BrowserIcons';

// The ⋮ sits in the scope bar under the 56-point header; the menu hangs from the button's top.
const OVERFLOW_MENU_TOP = 68;
// The selection sheet slides out for 300 ms before its modal goes. iOS presents no second modal,
// and pushes no screen, while one is still up, so what the sheet opens waits until it has gone.
const SHEET_GONE_MS = 450;

interface SelectionMenuModalProps {
    closeSelection: () => void;
    hasCatalogCardsSelected: boolean;
    hasCatalogNotesSelected: boolean;
    l: BrowserI18n['l'];
    /** Opens one of the note tools (Find and Replace…) over the browser. */
    openNoteTool: (tool: BrowserNoteTool) => void;
    openSelectionTags: () => void;
    /** Opens Reset Cards with the options last used in the browser. */
    openResetDialog: () => void;
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
    t: BrowserI18n['t'];
    tableMode: BrowserTableMode;
}

/** The actions on the selected cards or notes. */
export function SelectionMenuModal({
    closeSelection,
    hasCatalogCardsSelected,
    hasCatalogNotesSelected,
    l,
    openNoteTool,
    openSelectionTags,
    openResetDialog,
    refreshSelection,
    router,
    runSelectionAction,
    selectedActionCardIds,
    selectedCardIds,
    selectedNoteIds,
    setDueInput,
    setPreviewAnswerVisible,
    setPreviewIndex,
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
    t,
    tableMode,
}: SelectionMenuModalProps) {
    const colors = useThemeColors();
    const iconColor = colors.textMuted;
    const close = () => setShowSelectionMenu(false);
    const nextStepRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (nextStepRef.current) clearTimeout(nextStepRef.current);
    }, []);
    /** Closes the sheet, then opens what was chosen once the sheet's modal has gone. */
    const closeThen = (next: () => void) => {
        close();
        if (Platform.OS !== 'ios') {
            next();
            return;
        }
        if (nextStepRef.current) clearTimeout(nextStepRef.current);
        nextStepRef.current = setTimeout(() => {
            nextStepRef.current = null;
            next();
        }, SHEET_GONE_MS);
    };
    const catalogProtected = hasCatalogCardsSelected || hasCatalogNotesSelected;
    const deleteSelectedNotes = () => {
        if (catalogProtected) {
            alert(
                l('Katalog Korumalı', 'Catalog Protected'),
                l('TUS Kartları paketindeki notlar silinemez. Çalışmak istemediğiniz kartları askıya alabilirsiniz.', 'Notes in the TUS Kartları pack cannot be deleted. You can suspend cards you don’t want to study.')
            );
            return;
        }
        close();
        confirm(
            l('Notları sil', 'Delete Notes'),
            l(`${selectedNoteIds.length} not ve bu notlara bağlı tüm kartlar silinecek. Silme sonrasında geri alabilirsiniz.`, `${selectedNoteIds.length} notes and all cards belonging to them will be deleted. You can undo after deletion.`),
            () => {
                try {
                    const deletion = deleteNotes(selectedNoteIds);
                    closeSelection();
                    refreshSelection();
                    void choose(
                        l('Silindi', 'Deleted'),
                        l(`${deletion.cardCount} kart silindi.`, `${deletion.cardCount} cards deleted.`),
                        l('Geri al', 'Undo'),
                        l('Bitti', 'Done'),
                    ).then((undo) => {
                        if (!undo) return;
                        try { deletion.undo(); refreshSelection(); }
                        catch (error) { alert(t('common.error'), userFacingErrorMessage(error, l('Silme geri alınamadı.', 'Could not undo deletion.'))); }
                    });
                } catch (error) {
                    console.warn('[Browser] delete selected notes failed:', error);
                    alert(t('common.error'), l('Notlar silinemedi.', 'The notes could not be deleted.'));
                }
            },
            { destructive: true },
        );
    };
    return (
        <AppSheet
            visible={showSelectionMenu}
            onClose={close}
            title={`${selectedCardIds.size} ${tableMode === 'notes' ? l('not seçili', 'notes selected') : l('kart seçili', 'cards selected')}`}
            closeButton
        >
            <ScrollView showsVerticalScrollIndicator={false}>
                <Card divided>
                    <MenuItem
                        icon={<SelectionSuspendIcon color={iconColor} />}
                        label={l('Askıya al / askıdan çıkar', 'Toggle suspend')}
                        onPress={() => runSelectionAction(() => toggleSelectedSuspend(selectedActionCardIds, settings.dayRolloverHour))}
                    />
                    <MenuItem
                        icon={<BuryIcon color={iconColor} />}
                        label={l('Göm / gömmeden çıkar', 'Toggle bury')}
                        onPress={() => runSelectionAction(() => toggleSelectedBury(selectedActionCardIds, settings.dayRolloverHour))}
                    />
                    <MenuItem
                        icon={<CardsGlyph color={iconColor} />}
                        label={l('Not türünü değiştir', 'Change note type')}
                        onPress={() => {
                            if (catalogProtected) {
                                alert(
                                    l('Katalog Korumalı', 'Catalog Protected'),
                                    l('Dahili TUS kartlarının not türü değiştirilemez.', 'Built-in TUS cards cannot have their note type changed.')
                                );
                                return;
                            }
                            closeThen(() => setShowNoteTypePicker(true));
                        }}
                    />
                    <MenuItem
                        icon={<SelectionDeckIcon color={iconColor} />}
                        label={l('Desteyi değiştir', 'Change deck')}
                        onPress={() => {
                            if (catalogProtected) {
                                alert(
                                    l('Katalog Korumalı', 'Catalog Protected'),
                                    l('Seçilen kartlar arasında dahili TUS kartları bulunuyor. Dahili TUS kartlarının destesi değiştirilemez.', 'The selection contains built-in TUS cards. Built-in catalog cards cannot be moved to another deck.')
                                );
                                return;
                            }
                            closeThen(() => setShowDeckPicker(true));
                        }}
                    />
                    <MenuItem
                        icon={<SortIcon color={iconColor} />}
                        label={l('Yeniden konumlandır', 'Reposition')}
                        onPress={() => closeThen(() => { setRepositionStart('0'); setRepositionStep('1'); setShowRepositionDialog(true); })}
                    />
                    <MenuItem
                        icon={<CalendarGlyph color={iconColor} />}
                        label={l('Vade tarihini ayarla', 'Set due date')}
                        onPress={() => closeThen(() => { setDueInput(getSetDueDateDefault('browser')); setShowDueDialog(true); })}
                    />
                    <MenuItem icon={<TagIcon color={iconColor} />} label={l('Etiketleri düzenle', 'Edit tags')} onPress={() => closeThen(openSelectionTags)} />
                    <MenuItem
                        icon={<SearchGlyph color={iconColor} size={20} />}
                        label={l('Bul ve değiştir…', 'Find and replace…')}
                        accessibilityLabel={l('Seçili notlarda bul ve değiştir', 'Find and replace in the selected notes')}
                        onPress={() => closeThen(() => openNoteTool({ kind: 'find-replace' }))}
                    />
                    <MenuItem
                        icon={<CheckIcon color={iconColor} />}
                        label={l('Şimdi derecelendir', 'Grade now')}
                        onPress={() => closeThen(() => setShowGradePicker(true))}
                    />
                    <MenuItem
                        icon={<ResetIcon color={iconColor} />}
                        label={l('Kartları sıfırla…', 'Reset cards…')}
                        onPress={() => closeThen(openResetDialog)}
                    />
                    <MenuItem
                        icon={<EyeIcon color={iconColor} size={20} />}
                        label={l('Önizle', 'Preview')}
                        onPress={() => closeThen(() => { setPreviewAnswerVisible(false); setPreviewIndex(0); })}
                    />
                    {/* Anki's Info is about one card: in Notes mode, the note's first card. */}
                    <MenuItem
                        icon={<InfoCircleGlyph color={iconColor} size={20} />}
                        label={selectedCardIds.size === 1
                            ? l('Kart bilgisi', 'Card info')
                            : tableMode === 'notes' ? l('Kart bilgisi (tek not seçin)', 'Card info (select one note)') : l('Kart bilgisi (tek kart seçin)', 'Card info (select one card)')}
                        accessibilityLabel={tableMode === 'notes' ? l('Notun ilk kartının bilgisi', "Info for the note's first card") : l('Kart bilgisi', 'Card info')}
                        disabled={selectedCardIds.size !== 1}
                        onPress={() => {
                            const [cardId] = [...selectedCardIds];
                            closeThen(() => router.push(`/card-info?cardId=${cardId}` as any));
                        }}
                    />
                    <MenuItem
                        icon={<DeckOverflowGlyph kind="export" color={iconColor} />}
                        label={tableMode === 'notes' ? l('Notları dışa aktar', 'Export notes') : l('Kartları dışa aktar', 'Export cards')}
                        onPress={() => {
                            if (catalogProtected) {
                                alert(
                                    l('Katalog Korumalı', 'Catalog Protected'),
                                    l('Dahili TUS kartları telif korumalıdır ve dışa aktarılamaz.', 'Built-in TUS cards are protected and cannot be exported.')
                                );
                                return;
                            }
                            setDbSetting('browser_export_card_ids', JSON.stringify(selectedActionCardIds));
                            closeThen(() => router.push('/export?selection=browser' as any));
                        }}
                    />
                    <MenuItem
                        icon={<TrashIcon color={colors.danger} />}
                        label={l('Notları sil', 'Delete notes')}
                        destructive
                        onPress={deleteSelectedNotes}
                    />
                </Card>
            </ScrollView>
        </AppSheet>
    );
}

/**
 * A ••• row with something at its end: a count, the flag filter's state and its disclosure
 * chevron, or the mark of a tri-state checkbox. Drawn like the shared `MenuItem`, which has no
 * place for these nor the `expanded` and `mixed` states they report.
 */
function AccessoryMenuItem({ styles, label, icon, accessory, onPress, accessibilityRole = 'menuitem', accessibilityState, ariaChecked }: {
    styles: BrowserStyles;
    label: string;
    icon: ReactNode;
    accessory?: ReactNode;
    onPress: () => void;
    accessibilityRole?: AccessibilityRole;
    accessibilityState?: AccessibilityState;
    ariaChecked?: boolean | 'mixed';
}) {
    return (
        <TouchableOpacity
            style={styles.menuItem}
            onPress={onPress}
            accessibilityRole={accessibilityRole}
            accessibilityState={accessibilityState}
            aria-checked={ariaChecked}
        >
            <View style={styles.menuItemIcon}>{icon}</View>
            <Text style={styles.menuItemLabel}>{label}</Text>
            {accessory}
        </TouchableOpacity>
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
    /** Opens one of the note tools (Find and Replace…) over the browser. */
    openNoteTool: (tool: BrowserNoteTool) => void;
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

/** The scope bar's ⋮ menu: filters, selection, sorting and browser options. */
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
    openNoteTool,
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
    const iconColor = colors.textMuted;
    const close = () => setShowOverflowMenu(false);
    const allFlags = flagFilters.length === ALL_CARD_FLAGS.length;
    const someFlags = flagFilters.length > 0;
    const allFlagsState = allFlags ? true : someFlags ? 'mixed' as const : false;
    return (
        <PopoverMenu
            visible={showOverflowMenu}
            onClose={close}
            anchor={{ top: OVERFLOW_MENU_TOP }}
            accessibilityLabel={l('Diğer seçenekler', 'More options')}
        >
            <MenuItem
                icon={<SortIcon color={iconColor} />}
                label={l('Görüntüleme sırasını değiştir', 'Change display order')}
                onPress={() => { close(); setShowSortPicker(true); }}
            />
            <MenuItem
                icon={<StarGlyph color={iconColor} size={20} filled={false} />}
                label={l('İşaretlileri filtrele', 'Filter marked')}
                checked={markedOnly}
                onPress={() => { setMarkedOnly((value) => !value); close(); }}
            />
            <MenuItem
                icon={<SelectionSuspendIcon color={iconColor} />}
                label={l('Askıdakileri filtrele', 'Filter suspended')}
                checked={suspendedOnly}
                onPress={() => { setSuspendedOnly((value) => !value); close(); }}
            />
            <AccessoryMenuItem
                styles={styles}
                icon={<TagIcon color={iconColor} />}
                label={l('Etikete göre filtrele', 'Filter by tag')}
                accessory={tagFilters.length > 0 ? <Badge label={String(tagFilters.length)} tone="accent" style={styles.menuBadge} /> : null}
                onPress={() => { close(); setShowTagFilter(true); }}
            />
            <AccessoryMenuItem
                styles={styles}
                icon={<FlagGlyph color={iconColor} size={20} filled={false} />}
                label={l('Bayrağa göre filtrele', 'Filter by flag')}
                onPress={openFlagFilter}
                accessibilityState={{ expanded: showFlagFilterMenu }}
                accessory={(
                    <>
                        {/* Mirrors the chips under the search field: "no flag" is a filter of its
                            own, so it shows its own ring instead of being counted as a colour.
                            Counting it made "no flag + red" read as two flags. */}
                        {!allFlags && (
                            <>
                                {hasNoFlagFilter && (
                                    <View style={styles.flagIconContainer}>
                                        <FlagGlyph color={colors.textMuted} size={14} filled={false} />
                                    </View>
                                )}
                                {coloredFlagFilters.length === 1 && (
                                    <View style={styles.flagIconContainer}>
                                        <FlagGlyph color={FLAG_COLORS[coloredFlagFilters[0]].color} size={14} filled />
                                    </View>
                                )}
                                {coloredFlagFilters.length > 1 && (
                                    <Badge label={String(coloredFlagFilters.length)} tone="accent" style={styles.menuBadge} />
                                )}
                            </>
                        )}
                        {showFlagFilterMenu
                            ? <ChevronDownIcon color={colors.textMuted} size={16} />
                            : <ChevronRightIcon color={colors.textMuted} size={16} />}
                    </>
                )}
            />
            {showFlagFilterMenu && (
                <View style={styles.flagFilterPanel}>
                    <AccessoryMenuItem
                        styles={styles}
                        icon={<View style={styles.flagIconContainer} />}
                        label={l('Tümünü seç', 'Select all')}
                        onPress={toggleAllFlagFilters}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: allFlagsState }}
                        ariaChecked={allFlagsState}
                        accessory={allFlags
                            ? <CheckIcon color={colors.accent} size={18} />
                            : someFlags ? <MinusIcon color={colors.accent} size={18} /> : null}
                    />
                    {ALL_CARD_FLAGS.map((flag) => (
                        <MenuItem
                            key={flag}
                            icon={(
                                <FlagGlyph
                                    color={flag === 0 ? colors.textMuted : FLAG_COLORS[flag].color}
                                    size={18}
                                    filled={flag !== 0}
                                />
                            )}
                            label={cardFlagName(locale, flag)}
                            checked={flagFilters.includes(flag)}
                            onPress={() => toggleFlagFilter(flag)}
                        />
                    ))}
                    <Text style={styles.flagFilterCount}>
                        {l(`${flagFilters.length} seçenek seçili`, `${flagFilters.length} selected`)}
                    </Text>
                </View>
            )}
            <MenuSeparator />
            <MenuItem
                icon={<UndoIcon color={iconColor} />}
                label={l('Geri al: Deste güncelleme', 'Undo Update Deck')}
                disabled={lastDeckMove.length === 0}
                onPress={undoDeckMove}
            />
            <MenuItem
                icon={<SelectAllIcon color={iconColor} />}
                label={hasMoreCards
                    ? l(`Yüklenenleri seç (${filteredCards.length})`, `Select loaded (${filteredCards.length})`)
                    : l('Tümünü seç', 'Select all')}
                disabled={filteredCards.length === 0}
                onPress={() => { close(); selectAllVisible(); }}
            />
            <MenuItem
                icon={<GearGlyph color={iconColor} size={20} />}
                label={l('Seçenekler', 'Options')}
                onPress={() => { close(); setShowOptions(true); }}
            />
            <MenuSeparator />
            <MenuItem
                icon={<SearchGlyph color={iconColor} size={20} />}
                label={l('Bul ve değiştir…', 'Find and replace…')}
                accessibilityLabel={l('Notlarda bul ve değiştir', 'Find and replace in notes')}
                onPress={() => { close(); openNoteTool({ kind: 'find-replace' }); }}
            />
            <MenuItem
                icon={<CopyGlyph color={iconColor} size={20} />}
                label={l('Yinelenenleri bul…', 'Find duplicates…')}
                accessibilityLabel={l('Yinelenen notları bul', 'Find duplicate notes')}
                onPress={() => { close(); openNoteTool({ kind: 'find-duplicates' }); }}
            />
            <MenuSeparator />
            <MenuItem
                icon={<FilteredDeckIcon color={iconColor} />}
                label={l('Filtrelenmiş deste oluştur', 'Create filtered deck')}
                onPress={openFilteredDeckDialog}
            />
        </PopoverMenu>
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
    const colors = useThemeColors();
    const close = () => setShowSortPicker(false);
    const direction = (descending: boolean, label: string) => {
        const selected = sortDescending === descending;
        const tint = selected ? colors.accent : colors.textSecondary;
        return (
            <Chip
                label={label}
                icon={descending ? <ArrowDownIcon color={tint} size={14} /> : <ArrowUpIcon color={tint} size={14} />}
                selected={selected}
                onPress={() => updateSortDirection(descending)}
            />
        );
    };
    return (
        <AppDialog
            visible={showSortPicker}
            onClose={close}
            title={l('Görüntüleme sırası', 'Display Order')}
            actions={<Button variant="plain" label={t('common.close')} onPress={close} />}
        >
            <View style={styles.directionRow}>
                {direction(false, l('Artan', 'Ascending'))}
                {direction(true, l('Azalan', 'Descending'))}
            </View>
            <ScrollView style={styles.pickerList}>
                {BROWSER_SORT_KEYS.map((key) => {
                    const selected = sortKey === key;
                    return (
                        <TouchableOpacity
                            key={key}
                            style={[styles.pickerRow, selected && styles.pickerRowActive]}
                            onPress={() => updateSort(key)}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selected }}
                            aria-checked={selected}
                        >
                            <Text style={[styles.pickerRowText, selected && styles.pickerRowTextActive]}>{sortLabels[key]}</Text>
                            <SelectedMark visible={selected} />
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </AppDialog>
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
        <AppDialog
            visible={flagPickerMode !== null}
            onClose={() => setFlagPickerMode(null)}
            title={tableMode === 'notes' ? l('Seçili notların kartlarını bayrakla', 'Flag Cards of Selected Notes') : l('Seçili kartları bayrakla', 'Flag Selected Cards')}
            closeButton
        >
            <View>
                {ALL_CARD_FLAGS.map((flag) => (
                    <TouchableOpacity key={flag} style={styles.pickerRow} onPress={() => applyFlag(flag)} accessibilityRole="button" accessibilityLabel={cardFlagName(locale, flag)}>
                        <View style={styles.flagIconContainer}>
                            <FlagGlyph
                                color={flag === 0 ? colors.textMuted : FLAG_COLORS[flag].color}
                                size={18}
                                filled={flag !== 0}
                            />
                        </View>
                        <Text style={styles.pickerRowText}>
                            {cardFlagName(locale, flag)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </AppDialog>
    );
}

interface BrowserOptionsModalProps {
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
    const close = () => setShowOptions(false);
    return (
        <AppDialog
            visible={showOptions}
            onClose={close}
            title={l('Kartlarım seçenekleri', 'Card Browser Options')}
            actions={<Button variant="plain" label={t('common.close')} onPress={close} />}
        >
            <View style={styles.optionGroup}>
                <Text style={styles.optionTitle}>{l('Görünüm', 'View')}</Text>
                <Text style={styles.optionCaption}>{l('Listede kartları veya her notu tek satır olarak göster.', 'Show cards, or show each note as a single row.')}</Text>
                <SegmentedControl
                    options={[
                        { value: 'cards', label: l('Kartlar', 'Cards') },
                        { value: 'notes', label: l('Notlar', 'Notes') },
                    ]}
                    value={tableMode}
                    onChange={updateTableMode}
                    accessibilityLabel={l('Görünüm', 'View')}
                    fill
                />
            </View>
            <View>
                <Divider />
                <SwitchRow
                    title={l('Yanıt önizlemesini göster', 'Show answer preview')}
                    summary={l('Kart satırında cevabın kısa bir bölümünü gösterir.', 'Shows a short answer excerpt in each row.')}
                    value={showAnswerSnippet}
                    onValueChange={(value) => updateBrowserOption('answer', value)}
                    style={styles.dialogRow}
                />
                <Divider />
                <SwitchRow
                    title={l('Zamanlama ayrıntıları', 'Scheduling details')}
                    summary={l('Son çalışma ve sonraki gösterim bilgisini gösterir.', 'Shows last review and next due information.')}
                    value={showScheduleDetails}
                    onValueChange={(value) => updateBrowserOption('schedule', value)}
                    style={styles.dialogRow}
                />
            </View>
        </AppDialog>
    );
}
