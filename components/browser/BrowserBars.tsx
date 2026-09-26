import type { Dispatch, SetStateAction } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import type { ColorScheme } from '../../constants/theme';
import { FLAG_COLORS, type CardFlag } from '../../lib/models';
import type { BrowserTableMode } from '../../lib/studyRepository';
import { cardFlagName, type SupportedLocale } from '../../lib/i18n';
import { alert } from '../../lib/confirm';
import type { BrowserI18n } from './types';
import type { BrowserStyles } from './browserStyles';
import {
    SelectionDeckIcon,
    SelectionFlagIcon,
    SelectionMoreIcon,
    SelectionSuspendIcon,
} from './BrowserIcons';
import { ALL_CARD_FLAGS } from './browserHelpers';

interface FilterChipsProps {
    allFilterActive: boolean;
    clearBrowserFilters: () => void;
    clearColoredFlagFilters: () => void;
    clearNoFlagFilter: () => void;
    coloredFlagFilters: CardFlag[];
    flagFilters: CardFlag[];
    hasNoFlagFilter: boolean;
    l: BrowserI18n['l'];
    locale: SupportedLocale;
    markedOnly: boolean;
    setFlagFilters: Dispatch<SetStateAction<CardFlag[]>>;
    setMarkedOnly: Dispatch<SetStateAction<boolean>>;
    setSuspendedOnly: Dispatch<SetStateAction<boolean>>;
    setTagFilters: Dispatch<SetStateAction<string[]>>;
    styles: BrowserStyles;
    suspendedOnly: boolean;
    t: BrowserI18n['t'];
    tagFilters: string[];
}

/** The active filters as removable chips under the search field. */
export function FilterChips({
    allFilterActive,
    clearBrowserFilters,
    clearColoredFlagFilters,
    clearNoFlagFilter,
    coloredFlagFilters,
    flagFilters,
    hasNoFlagFilter,
    l,
    locale,
    markedOnly,
    setFlagFilters,
    setMarkedOnly,
    setSuspendedOnly,
    setTagFilters,
    styles,
    suspendedOnly,
    t,
    tagFilters,
}: FilterChipsProps) {
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
            <TouchableOpacity
                style={[styles.filterChip, allFilterActive && styles.filterChipActive]}
                onPress={clearBrowserFilters}
            >
                <Text style={[styles.filterChipText, allFilterActive && styles.filterChipTextActive]}>{t('common.all')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.filterChip, markedOnly && styles.filterChipActive]}
                onPress={() => setMarkedOnly((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={l('Yalnızca işaretli notları göster', 'Show marked notes only')}
            >
                <Text style={[styles.filterChipText, markedOnly && styles.filterChipTextActive]}>⭐ {l('İşaretli', 'Marked')}</Text>
            </TouchableOpacity>
            {suspendedOnly && (
                <TouchableOpacity style={[styles.filterChip, styles.filterChipActive]} onPress={() => setSuspendedOnly(false)}>
                    <Text style={[styles.filterChipText, styles.filterChipTextActive]}>⏸ {l('Askıda', 'Suspended')} ×</Text>
                </TouchableOpacity>
            )}
            {tagFilters.length > 0 && (
                <TouchableOpacity style={[styles.filterChip, styles.filterChipActive]} onPress={() => setTagFilters([])}>
                    <Text style={[styles.filterChipText, styles.filterChipTextActive]}>⌗ {l(`${tagFilters.length} etiket`, `${tagFilters.length} tags`)} ×</Text>
                </TouchableOpacity>
            )}
            {flagFilters.length < ALL_CARD_FLAGS.length && (
                <>
                    {flagFilters.length === 0 && (
                        <TouchableOpacity
                            style={[styles.filterChip, styles.filterChipActive]}
                            onPress={() => setFlagFilters([...ALL_CARD_FLAGS])}
                            accessibilityRole="button"
                            accessibilityLabel={l('Bayrak filtresini kaldır', 'Remove flag filter')}
                        >
                            <Text style={[styles.filterChipText, styles.filterChipTextActive]}>
                                {l('Bayrak seçilmedi', 'No flags selected')} ×
                            </Text>
                        </TouchableOpacity>
                    )}
                    {hasNoFlagFilter && (
                        <TouchableOpacity
                            style={[styles.filterChip, styles.filterChipActive]}
                            onPress={clearNoFlagFilter}
                            accessibilityRole="button"
                            accessibilityLabel={l('Bayrak yok filtresini kaldır', 'Remove no flag filter')}
                        >
                            <View style={[styles.filterFlagDot, styles.filterFlagDotEmpty]} />
                            <Text style={[styles.filterChipText, styles.filterChipTextActive]}>
                                {l('Bayrak yok', 'No flag')} ×
                            </Text>
                        </TouchableOpacity>
                    )}
                    {coloredFlagFilters.length > 0 && (
                        <TouchableOpacity
                            style={[styles.filterChip, styles.filterChipActive]}
                            onPress={clearColoredFlagFilters}
                            accessibilityRole="button"
                            accessibilityLabel={
                                coloredFlagFilters.length === 1
                                    ? l(`${cardFlagName(locale, coloredFlagFilters[0])} bayrak filtresini kaldır`, `Remove ${cardFlagName(locale, coloredFlagFilters[0])} flag filter`)
                                    : l('Bayrak filtresini kaldır', 'Remove flag filter')
                            }
                        >
                            {coloredFlagFilters.length === 1 && (
                                <View style={[styles.filterFlagDot, { backgroundColor: FLAG_COLORS[coloredFlagFilters[0]].color }]} />
                            )}
                            <Text style={[styles.filterChipText, styles.filterChipTextActive]}>
                                {coloredFlagFilters.length === 1
                                    ? cardFlagName(locale, coloredFlagFilters[0])
                                    : l(`${coloredFlagFilters.length} bayrak`, `${coloredFlagFilters.length} flags`)} ×
                            </Text>
                        </TouchableOpacity>
                    )}
                </>
            )}
        </ScrollView>
    );
}

interface SelectionBarProps {
    closeSelection: () => void;
    colors: ColorScheme;
    hasCatalogCardsSelected: boolean;
    hasCatalogNotesSelected: boolean;
    l: BrowserI18n['l'];
    selectedCardIds: Set<number>;
    setFlagPickerMode: Dispatch<SetStateAction<"selection" | null>>;
    setShowDeckPicker: Dispatch<SetStateAction<boolean>>;
    setShowSelectionMenu: Dispatch<SetStateAction<boolean>>;
    showSelectionMenu: boolean;
    styles: BrowserStyles;
    tableMode: BrowserTableMode;
    toggleSelectionSuspended: () => void;
}

/** The bar that replaces the list footer while cards are selected. */
export function SelectionBar({
    closeSelection,
    colors,
    hasCatalogCardsSelected,
    hasCatalogNotesSelected,
    l,
    selectedCardIds,
    setFlagPickerMode,
    setShowDeckPicker,
    setShowSelectionMenu,
    showSelectionMenu,
    styles,
    tableMode,
    toggleSelectionSuspended,
}: SelectionBarProps) {
    return (
        <View style={styles.selectionBar}>
            <TouchableOpacity
                style={styles.selectionBarCount}
                onPress={closeSelection}
                accessibilityLabel={l('Seçimi kapat', 'Close selection')}
            >
                <View style={styles.selectionBarCloseBox}>
                    <Text style={styles.selectionBarClose}>×</Text>
                </View>
                <Text style={styles.selectionBarCountText} numberOfLines={1}>
                    {selectedCardIds.size} {tableMode === 'notes' ? l('not seçili', 'notes selected') : l('kart seçili', 'cards selected')}
                </Text>
            </TouchableOpacity>
            <View style={styles.selectionActionsGroup}>
                <TouchableOpacity
                    style={styles.selectionAction}
                    disabled={selectedCardIds.size === 0}
                    onPress={() => {
                        if (hasCatalogCardsSelected || hasCatalogNotesSelected) {
                            alert(
                                l('Katalog Korumalı', 'Catalog Protected'),
                                l('Seçilen kartlar arasında dahili TUS kartları bulunuyor. Dahili TUS kartlarının destesi değiştirilemez.', 'The selection contains built-in TUS cards. Built-in catalog cards cannot be moved to another deck.')
                            );
                            return;
                        }
                        setShowDeckPicker(true);
                    }}
                >
                    <View style={styles.selectionActionIconBox}>
                        <SelectionDeckIcon color={selectedCardIds.size === 0 ? colors.textMuted : colors.accent} />
                    </View>
                    <Text style={[styles.selectionActionText, selectedCardIds.size === 0 && styles.selectionActionTextDisabled]}>
                        {l('Deste', 'Deck')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.selectionAction}
                    disabled={selectedCardIds.size === 0}
                    onPress={toggleSelectionSuspended}
                >
                    <View style={styles.selectionActionIconBox}>
                        <SelectionSuspendIcon color={selectedCardIds.size === 0 ? colors.textMuted : colors.accent} />
                    </View>
                    <Text style={[styles.selectionActionText, selectedCardIds.size === 0 && styles.selectionActionTextDisabled]}>
                        {l('Askı', 'Suspend')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.selectionAction}
                    disabled={selectedCardIds.size === 0}
                    onPress={() => setFlagPickerMode('selection')}
                >
                    <View style={styles.selectionActionIconBox}>
                        <SelectionFlagIcon color={selectedCardIds.size === 0 ? colors.textMuted : colors.accent} />
                    </View>
                    <Text style={[styles.selectionActionText, selectedCardIds.size === 0 && styles.selectionActionTextDisabled]}>
                        {l('Bayrak', 'Flag')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.selectionAction}
                    disabled={selectedCardIds.size === 0}
                    onPress={() => setShowSelectionMenu(true)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Diğer kart işlemleri', 'More card actions')}
                    accessibilityState={{ expanded: showSelectionMenu }}
                >
                    <View style={styles.selectionActionIconBox}>
                        <SelectionMoreIcon color={selectedCardIds.size === 0 ? colors.textMuted : colors.accent} />
                    </View>
                    <Text style={[styles.selectionActionText, selectedCardIds.size === 0 && styles.selectionActionTextDisabled]}>
                        {l('Diğer', 'More')}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
