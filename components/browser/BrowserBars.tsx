import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '../AppText';
import { useThemeColors, type ColorScheme } from '../../constants/theme';
import { FLAG_COLORS, type CardFlag } from '../../lib/models';
import type { BrowserTableMode } from '../../lib/studyRepository';
import { cardFlagName, type SupportedLocale } from '../../lib/i18n';
import FlagGlyph from '../../components/FlagGlyph';
import StarGlyph from '../../components/StarGlyph';
import { alert } from '../../lib/confirm';
import { Chip } from '../ui/Choice';
import { CloseIcon, MoreVerticalIcon } from '../ui/icons';
import type { BrowserI18n } from './types';
import type { BrowserStyles } from './browserStyles';
import {
    SelectionDeckIcon,
    SelectionFlagIcon,
    SelectionSuspendIcon,
    TagIcon,
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

/**
 * The active filters as chips under the search field. An applied filter's chip removes it, from
 * its × or from anywhere on the chip, as the whole chip did before it had a ×.
 */
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
    const colors = useThemeColors();
    const removable = (label: string, removeLabel: string, remove: () => void, icon?: ReactNode) => (
        <Chip
            label={label}
            icon={icon}
            selected
            onPress={remove}
            onRemove={remove}
            accessibilityLabel={removeLabel}
            removeLabel={removeLabel}
        />
    );
    const colorFlagLabel = coloredFlagFilters.length === 1
        ? l(`${cardFlagName(locale, coloredFlagFilters[0])} filtresini kaldır`, `Remove ${cardFlagName(locale, coloredFlagFilters[0])} filter`)
        : l('Bayrak filtresini kaldır', 'Remove flag filter');
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
            <Chip
                label={t('common.all')}
                selected={allFilterActive}
                onPress={clearBrowserFilters}
                accessibilityLabel={l('Tüm filtreleri kaldır', 'Clear all filters')}
            />
            <Chip
                label={l('İşaretli', 'Marked')}
                icon={<StarGlyph color={colors.marked} size={14} />}
                selected={markedOnly}
                onPress={() => setMarkedOnly((prev) => !prev)}
                accessibilityLabel={l('Yalnızca işaretli notları göster', 'Show marked notes only')}
            />
            {suspendedOnly && removable(
                l('Askıda', 'Suspended'),
                l('Askıda filtresini kaldır', 'Remove suspended filter'),
                () => setSuspendedOnly(false),
                <SelectionSuspendIcon color={colors.accent} size={14} />,
            )}
            {tagFilters.length > 0 && removable(
                l(`${tagFilters.length} etiket`, `${tagFilters.length} tags`),
                l(`${tagFilters.length} etiketlik filtreyi kaldır`, `Remove the filter for ${tagFilters.length} tags`),
                () => setTagFilters([]),
                <TagIcon color={colors.accent} size={14} />,
            )}
            {flagFilters.length < ALL_CARD_FLAGS.length && (
                <>
                    {flagFilters.length === 0 && removable(
                        l('Bayrak seçilmedi', 'No flags selected'),
                        l('Bayrak filtresini kaldır', 'Remove flag filter'),
                        () => setFlagFilters([...ALL_CARD_FLAGS]),
                    )}
                    {hasNoFlagFilter && removable(
                        l('Bayrak yok', 'No flag'),
                        l('Bayrak yok filtresini kaldır', 'Remove no flag filter'),
                        clearNoFlagFilter,
                        <FlagGlyph color={colors.textMuted} size={14} filled={false} />,
                    )}
                    {coloredFlagFilters.length > 0 && removable(
                        coloredFlagFilters.length === 1
                            ? cardFlagName(locale, coloredFlagFilters[0])
                            : l(`${coloredFlagFilters.length} bayrak`, `${coloredFlagFilters.length} flags`),
                        colorFlagLabel,
                        clearColoredFlagFilters,
                        coloredFlagFilters.length === 1
                            ? <FlagGlyph color={FLAG_COLORS[coloredFlagFilters[0]].color} size={14} filled />
                            : undefined,
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
    const empty = selectedCardIds.size === 0;
    const action = (
        label: string,
        caption: string,
        icon: ReactNode,
        onPress: () => void,
        expanded?: boolean,
    ) => (
        <TouchableOpacity
            style={[styles.selectionAction, empty && styles.selectionActionDisabled]}
            disabled={empty}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={expanded === undefined ? { disabled: empty } : { expanded, disabled: empty }}
        >
            <View style={styles.selectionActionIconBox}>{icon}</View>
            <Text style={styles.selectionActionText}>{caption}</Text>
        </TouchableOpacity>
    );
    return (
        <View style={styles.selectionBar}>
            <TouchableOpacity
                style={styles.selectionBarCount}
                onPress={closeSelection}
                accessibilityRole="button"
                accessibilityLabel={l('Seçimi kapat', 'Close selection')}
            >
                <View style={styles.selectionBarCloseBox}>
                    <CloseIcon color={colors.textSecondary} />
                </View>
                <Text style={styles.selectionBarCountText} numberOfLines={1}>
                    {selectedCardIds.size} {tableMode === 'notes' ? l('not seçili', 'notes selected') : l('kart seçili', 'cards selected')}
                </Text>
            </TouchableOpacity>
            <View style={styles.selectionActionsGroup}>
                {action(l('Desteyi değiştir', 'Change deck'), l('Deste', 'Deck'), <SelectionDeckIcon color={colors.accent} />, () => {
                    if (hasCatalogCardsSelected || hasCatalogNotesSelected) {
                        alert(
                            l('Katalog Korumalı', 'Catalog Protected'),
                            l('Seçilen kartlar arasında dahili TUS kartları bulunuyor. Dahili TUS kartlarının destesi değiştirilemez.', 'The selection contains built-in TUS cards. Built-in catalog cards cannot be moved to another deck.')
                        );
                        return;
                    }
                    setShowDeckPicker(true);
                })}
                {action(l('Askıya al / askıdan çıkar', 'Toggle suspend'), l('Askı', 'Suspend'), <SelectionSuspendIcon color={colors.accent} />, toggleSelectionSuspended)}
                {action(l('Bayrak koy', 'Flag'), l('Bayrak', 'Flag'), <SelectionFlagIcon color={colors.accent} />, () => setFlagPickerMode('selection'))}
                {action(
                    l('Diğer kart işlemleri', 'More card actions'),
                    l('Diğer', 'More'),
                    <MoreVerticalIcon color={colors.accent} size={20} />,
                    () => setShowSelectionMenu(true),
                    showSelectionMenu,
                )}
            </View>
        </View>
    );
}
