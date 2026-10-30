import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Keyboard,
    Modal,
    Platform,
    ScrollView,
    Switch,
    TouchableOpacity,
    View,
} from 'react-native';
import { Text, TextInput } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, useThemeColors } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { alert } from '../lib/confirm';
import { useCollectionInvalidation, useStudyScope } from '../contexts/AppContext';
import {
    createFilteredDeck,
    createOrSelectDeck,
    getAllDecks,
    getAvailableDeckName,
    getDeckByName,
    renameDeck,
    updateFilteredDeck,
} from '../lib/deckManager';
import {
    extractDeckNameFromSearch,
    filteredDeckOrderChoices,
    replaceDeckNameInSearch,
} from '../lib/filteredDeckOptions';
import {
    filteredDeckFormFromDeck,
    filteredDeckFormLimitsValid,
    filteredDeckOptionsFromForm,
    newFilteredDeckForm,
    newFilteredDeckName,
    newFilteredDeckSearch,
    type FilteredDeckFormValues,
} from '../lib/filteredDeckForm';
import { filteredOrderLabel } from '../lib/i18n';
import { getDeckDisplayName, type Deck } from '../lib/models';
import { getFilteredDeckExcludedCount, getFilteredDeckMatchCount } from '../lib/studyRepository';
import { findInvalidFilteredSearch } from '../lib/searchValidation';
import type { AppSettings } from '../lib/types';
import DeckPickerModal from './DeckPickerModal';
import InfoCircleGlyph from './InfoCircleGlyph';
import SwipeDismissSheet from './SwipeDismissSheet';
import FilteredDeckHelpSheet from './filtered-deck/FilteredDeckHelpSheet';
import { createFilteredDeckOptionsStyles } from './filtered-deck/filteredDeckOptionsStyles';
import { userFacingErrorMessage } from '../lib/userFacingError';

interface FilteredDeckOptionsModalProps {
    visible: boolean;
    /** The filtered deck to edit, or null to create a new one. */
    deck: Deck | null;
    /** Create only: the search the new deck starts with instead of the current deck's due cards. */
    initialSearch?: string;
    settings: AppSettings;
    onClose: () => void;
    /** Edit: called with the deck's saved name after Save and Rebuild. */
    onSaved?: (deckName: string) => void;
    /**
     * Create: called with the new deck's name once the form has closed. On iOS that is the
     * modal's onDismiss, so keep this component mounted (hidden) while it closes.
     */
    onCreated?: (deckName: string) => void;
}

/**
 * Anki's filtered deck dialog, full screen: Create Filtered Deck when `deck` is null (the deck
 * list's add menu, Browse), Filtered Deck Options for an existing filtered deck (the deck list,
 * its overview, the study screen).
 */
export default function FilteredDeckOptionsModal({
    visible,
    deck,
    initialSearch,
    settings,
    onClose,
    onSaved,
    onCreated,
}: FilteredDeckOptionsModalProps) {
    const { t, l, locale } = useI18n();
    const { collectionVersion, invalidateCollection } = useCollectionInvalidation();
    const { activeDeckName } = useStudyScope();
    const colors = useThemeColors();
    const styles = useMemo(() => createFilteredDeckOptionsStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
    const creating = deck === null;
    const [form, setForm] = useState<FilteredDeckFormValues>(() => newFilteredDeckForm('', ''));
    const [orderPicker, setOrderPicker] = useState<1 | 2 | null>(null);
    const [helpVisible, setHelpVisible] = useState(false);
    const [showDeckPicker, setShowDeckPicker] = useState(false);
    const [deckPickerTarget, setDeckPickerTarget] = useState<1 | 2>(1);
    // UIKit must finish dismissing this modal before the new deck's overview is pushed.
    const createdDeckNameRef = useRef<string | null>(null);

    // Screens keep the form mounted while it is hidden, so the decks are read only while it shows.
    const regularDecks = useMemo(
        () => (visible ? getAllDecks().filter((d) => !d.isFiltered) : []),
        [visible, collectionVersion],
    );
    const selectedDeckName1 = useMemo(() => extractDeckNameFromSearch(form.search), [form.search]);
    const selectedDeckName2 = useMemo(() => extractDeckNameFromSearch(form.search2), [form.search2]);
    const currentPickerSelectedDeckName = deckPickerTarget === 2 ? selectedDeckName2 : selectedDeckName1;

    useEffect(() => {
        if (!visible) return;
        if (deck) {
            setForm(filteredDeckFormFromDeck(deck, settings.fsrsEnabled === true));
        } else {
            // Anki scopes a new filtered deck to the current deck. Without a regular deck studied
            // last, the first regular deck in the collection stands in for it.
            const activeDeck = activeDeckName ? getDeckByName(activeDeckName) : null;
            const sourceDeck = activeDeck && !activeDeck.isFiltered ? activeDeck : regularDecks[0] ?? null;
            setForm(newFilteredDeckForm(
                newFilteredDeckName(l('Filtrelenmiş Deste', 'Filtered Deck'), new Date(), (name) => Boolean(getDeckByName(name))),
                initialSearch ?? newFilteredDeckSearch(sourceDeck?.name.trim() || null),
            ));
        }
        setOrderPicker(null);
        setHelpVisible(false);
    }, [deck?.id, visible]);

    if (deck && !deck.isFiltered) return null;

    const update = <K extends keyof FilteredDeckFormValues>(key: K, value: FilteredDeckFormValues[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const close = () => {
        Keyboard.dismiss();
        setOrderPicker(null);
        setHelpVisible(false);
        onClose();
    };

    const reportCreated = () => {
        const name = createdDeckNameRef.current;
        createdDeckNameRef.current = null;
        if (name) onCreated?.(name);
    };

    const options = filteredDeckOptionsFromForm(form);
    const saveDisabled = !form.name.trim() || !form.search.trim() || !filteredDeckFormLimitsValid(form);

    // Collection reads treat an unreadable search as matching nothing, so the learner is told here.
    const rejectInvalidSearch = (searches: Array<string | undefined>): boolean => {
        const invalid = findInvalidFilteredSearch(searches);
        if (invalid === null) return false;
        Keyboard.dismiss();
        alert(t('anki.invalidSearchTitle'), t('anki.invalidSearchMessage', { search: invalid.trim() }));
        return true;
    };

    const saveAndBuild = () => {
        const nextName = form.name.trim();
        if (nextName.includes('::')) {
            alert(t('common.error'), l('Filtrelenmiş deste başka bir destenin alt destesi olamaz.', 'A filtered deck cannot be a subdeck.'));
            return;
        }
        if (rejectInvalidSearch([options.searchQuery, options.searchQuery2])) return;

        // Rebuilding first returns this deck's own cards home, so they count as matches.
        const matchCount = getFilteredDeckMatchCount(settings, options, deck?.id);
        if (!form.allowEmpty && matchCount === 0) {
            alert(
                l('Eşleşen kart yok', 'No matching cards'),
                creating
                    ? l(
                        'Bu filtrelerle deste oluşturulamadı. Aramayı değiştirin veya “Boş olsa bile oluştur” seçeneğini açın.',
                        'No deck could be built with these filters. Change the search or enable “Build even if empty”.',
                    )
                    : l(
                        'Bu filtrelerle deste yeniden oluşturulamadı. Aramayı değiştirin veya “Boş olsa bile güncelle” seçeneğini açın.',
                        'The deck could not be rebuilt with these filters. Change the search or enable “Update even if empty”.',
                    ),
            );
            return;
        }

        if (!deck) {
            try {
                // A taken name gets `+` appended, as Anki's ensure_deck_name_unique does.
                const created = createFilteredDeck(getAvailableDeckName(nextName), options.searchQuery, options.searchLimit);
                updateFilteredDeck(created.id, options);
                if (Platform.OS === 'ios') {
                    createdDeckNameRef.current = created.name;
                    close();
                } else {
                    close();
                    onCreated?.(created.name);
                }
            } catch (error) {
                console.warn('[FilteredDeckOptionsModal] create failed:', error);
                alert(t('common.error'), userFacingErrorMessage(
                    error,
                    l('Filtrelenmiş deste oluşturulamadı.', 'Could not create the filtered deck.'),
                ));
            }
            return;
        }

        try {
            if (nextName !== deck.name) renameDeck(deck.id, nextName);
            // updateFilteredDeck is the Anki-style Build/Rebuild transaction: it saves the
            // options and resets the active filtered build in one mutation.
            updateFilteredDeck(deck.id, options);
            close();
            onSaved?.(nextName);
        } catch (error) {
            console.warn('[FilteredDeckOptionsModal] save failed:', error);
            alert(t('common.error'), userFacingErrorMessage(
                error,
                l('Filtre seçenekleri kaydedilemedi. Lütfen tekrar deneyin.', 'Could not save filtered deck options. Please try again.'),
            ));
        }
    };

    const showSearchInfo = (query: string) => {
        Keyboard.dismiss();
        if (rejectInvalidSearch([query])) return;
        const matchCount = getFilteredDeckMatchCount(settings, {
            searchQuery: query.trim(),
            searchLimit: 9999,
            searchOrder: 0,
        }, deck?.id);
        alert(
            l('Arama filtresi', 'Search filter'),
            l(
                `${matchCount} uygun kart bulundu.\n\nSorguları boşlukla birleştirin; dışlamak için “-” kullanın. Örnek:\n\ndeck:"TUS Kartları" is:due -is:suspended`,
                `${matchCount} eligible cards matched.\n\nCombine terms with spaces; use “-” to exclude. Example:\n\ndeck:"TUS Kartları" is:due -is:suspended`,
            ),
        );
    };

    const showExcluded = () => {
        const searches = [form.search, ...(form.secondEnabled ? [form.search2] : [])];
        if (rejectInvalidSearch(searches)) return;
        const count = getFilteredDeckExcludedCount(searches);
        alert(
            l(
                count > 0 ? `${count} kart dahil edilemiyor` : 'Dahil edilmeyen kart yok',
                count > 0 ? `${count} cards are excluded` : 'No excluded cards',
            ),
            l(
                count > 0
                    ? `${count} kart sorguyla eşleşiyor ancak askıya alınmış, gömülmüş veya başka bir filtrelenmiş destede oldukları için desteye dahil edilemiyor.`
                    : 'Bu arama kriterleriyle eşleşen tüm kartlar desteye dahil edilebilir. Askıya alınmış veya gömülmüş kart bulunmuyor.',
                count > 0
                    ? `${count} cards match the query but cannot be gathered because they are suspended, buried, or already in another filtered deck.`
                    : 'All cards matching the search are eligible. No matching cards are suspended, buried, or in another filtered deck.',
            ),
        );
    };

    const selectedOrder = orderPicker === 2 ? form.order2 : form.order;
    const chooseOrder = (value: number) => {
        update(orderPicker === 2 ? 'order2' : 'order', value);
        setOrderPicker(null);
    };

    const allowEmptyLabel = creating
        ? l('Boş olsa bile oluştur', 'Build even if empty')
        : l('Boş olsa bile güncelle', 'Update even if empty');

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={close} onDismiss={reportCreated}>
            <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal>
                <View style={styles.toolbar}>
                    <TouchableOpacity style={styles.iconButton} onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                        <Text style={styles.closeIcon}>×</Text>
                    </TouchableOpacity>
                    <View style={styles.toolbarCopy}>
                        <Text style={styles.toolbarTitle}>
                            {creating ? l('Filtrelenmiş deste oluştur', 'Create Filtered Deck') : l('Filtre seçenekleri', 'Filtered Deck Options')}
                        </Text>
                        <Text style={styles.toolbarSubtitle} numberOfLines={1}>{getDeckDisplayName(creating ? form.name : deck.name)}</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => {
                            Keyboard.dismiss();
                            setHelpVisible(true);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={l('Filtrelenmiş deste yardımı', 'Filtered deck help')}
                    >
                        <View style={styles.helpCircle}><Text style={styles.helpIcon}>?</Text></View>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={[styles.sectionHeader, styles.sectionHeaderFirst]}>{l('Deste adı', 'Deck name')}</Text>
                    <View style={styles.card}>
                        <View style={styles.cardField}>
                            <TextInput
                                style={styles.input}
                                value={form.name}
                                onChangeText={(value) => update('name', value)}
                                placeholder={l('Deste adı girin', 'Enter deck name')}
                                placeholderTextColor={colors.textMuted}
                                accessibilityLabel={l('Deste adı', 'Deck name')}
                            />
                        </View>
                    </View>

                    <Text style={styles.sectionHeader}>{l('1. Filtre', 'Filter 1')}</Text>
                    <View style={styles.card}>
                        <TouchableOpacity
                            style={styles.pickerButton}
                            onPress={() => {
                                Keyboard.dismiss();
                                setDeckPickerTarget(1);
                                setShowDeckPicker(true);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`${l('Deste', 'Deck')}: ${selectedDeckName1 ? selectedDeckName1.replaceAll('::', ' › ') : l('Tüm desteler', 'All decks')}`}
                        >
                            <View style={styles.pickerLabelWrap}>
                                <Text style={styles.pickerLabel}>{l('Deste', 'Deck')}</Text>
                                <Text style={styles.pickerValue} numberOfLines={1}>
                                    {selectedDeckName1 ? selectedDeckName1.replaceAll('::', ' › ') : l('Tüm desteler', 'All decks')}
                                </Text>
                            </View>
                            <Text style={styles.pickerChevron}>⌄</Text>
                        </TouchableOpacity>

                        <View style={styles.divider} />

                        <View style={styles.cardField}>
                            <Text style={styles.fieldLabel}>{t('common.search')}</Text>
                            <View style={styles.searchRow}>
                                <TextInput
                                    style={[styles.input, styles.searchInput]}
                                    value={form.search}
                                    onChangeText={(value) => update('search', value)}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    placeholder='deck:"Deste" is:due'
                                    placeholderTextColor={colors.textMuted}
                                    accessibilityLabel={l('Birinci filtre araması', 'First filter search')}
                                />
                                <TouchableOpacity
                                    style={styles.searchInfoButton}
                                    onPress={() => showSearchInfo(form.search)}
                                    accessibilityRole="button"
                                    accessibilityLabel={l('Arama sorgusunu kontrol et', 'Check search query')}
                                >
                                    <Text style={styles.searchInfoText}>⌕</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.numberRow}>
                            <View style={styles.numberLabelWrap}>
                                <Text style={styles.numberLabel}>{l('Kart limiti', 'Card limit')}</Text>
                                <Text style={styles.numberSublabel}>
                                    {l('Desteye alınacak en fazla kart sayısı', 'Maximum cards to gather into this deck')}
                                </Text>
                            </View>
                            <TextInput
                                style={styles.numberInput}
                                value={form.limit}
                                onChangeText={(value) => update('limit', value.replace(/\D/g, '').slice(0, 5))}
                                keyboardType="number-pad"
                                inputMode="numeric"
                                maxLength={5}
                                accessibilityLabel={l('Birinci filtre kart limiti', 'First filter card limit')}
                            />
                        </View>

                        <View style={styles.divider} />

                        <TouchableOpacity
                            style={styles.pickerButton}
                            onPress={() => setOrderPicker(1)}
                            accessibilityRole="button"
                            accessibilityLabel={`${l('Kartların seçilme sırası', 'Cards selected by')}: ${filteredOrderLabel(locale, form.order)}`}
                        >
                            <View style={styles.pickerLabelWrap}>
                                <Text style={styles.pickerLabel}>{l('Kartların seçilme sırası', 'Cards selected by')}</Text>
                                <Text style={styles.pickerValue}>{filteredOrderLabel(locale, form.order)}</Text>
                            </View>
                            <Text style={styles.pickerChevron}>⌄</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.sectionHeader}>{l('2. Filtre', 'Filter 2')}</Text>
                    <View style={styles.card}>
                        <View style={styles.toggleRow}>
                            <View style={styles.toggleCopy}>
                                <Text style={styles.toggleTitle}>{l('İkinci filtreyi etkinleştir', 'Enable second filter')}</Text>
                                <Text style={styles.toggleSubtitle}>
                                    {l('Farklı arama ve sıralama ile ikinci bir grup ekleyin', 'Combine a second group with separate query and order')}
                                </Text>
                            </View>
                            <Switch
                                value={form.secondEnabled}
                                onValueChange={(value) => update('secondEnabled', value)}
                                trackColor={{ false: colors.border, true: colors.accent }}
                                thumbColor={colors.white}
                                accessibilityLabel={l('İkinci filtreyi etkinleştir', 'Enable second filter')}
                            />
                        </View>

                        {form.secondEnabled && (
                            <>
                                <View style={styles.divider} />

                                <TouchableOpacity
                                    style={styles.pickerButton}
                                    onPress={() => {
                                        Keyboard.dismiss();
                                        setDeckPickerTarget(2);
                                        setShowDeckPicker(true);
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${l('Deste', 'Deck')}: ${selectedDeckName2 ? selectedDeckName2.replaceAll('::', ' › ') : l('Tüm desteler', 'All decks')}`}
                                >
                                    <View style={styles.pickerLabelWrap}>
                                        <Text style={styles.pickerLabel}>{l('Deste', 'Deck')}</Text>
                                        <Text style={styles.pickerValue} numberOfLines={1}>
                                            {selectedDeckName2 ? selectedDeckName2.replaceAll('::', ' › ') : l('Tüm desteler', 'All decks')}
                                        </Text>
                                    </View>
                                    <Text style={styles.pickerChevron}>⌄</Text>
                                </TouchableOpacity>

                                <View style={styles.divider} />

                                <View style={styles.cardField}>
                                    <Text style={styles.fieldLabel}>{t('common.search')}</Text>
                                    <View style={styles.searchRow}>
                                        <TextInput
                                            style={[styles.input, styles.searchInput]}
                                            value={form.search2}
                                            onChangeText={(value) => update('search2', value)}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            placeholder='deck:"Deste" is:new'
                                            placeholderTextColor={colors.textMuted}
                                            accessibilityLabel={l('İkinci filtre araması', 'Second filter search')}
                                        />
                                        <TouchableOpacity
                                            style={styles.searchInfoButton}
                                            onPress={() => showSearchInfo(form.search2)}
                                            accessibilityRole="button"
                                            accessibilityLabel={l('İkinci arama sorgusunu kontrol et', 'Check second search query')}
                                        >
                                            <Text style={styles.searchInfoText}>⌕</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.divider} />

                                <View style={styles.numberRow}>
                                    <View style={styles.numberLabelWrap}>
                                        <Text style={styles.numberLabel}>{l('Kart limiti', 'Card limit')}</Text>
                                        <Text style={styles.numberSublabel}>
                                            {l('İkinci gruptan alınacak en fazla kart sayısı', 'Maximum cards from the second group')}
                                        </Text>
                                    </View>
                                    <TextInput
                                        style={styles.numberInput}
                                        value={form.limit2}
                                        onChangeText={(value) => update('limit2', value.replace(/\D/g, '').slice(0, 5))}
                                        keyboardType="number-pad"
                                        inputMode="numeric"
                                        maxLength={5}
                                        accessibilityLabel={l('İkinci filtre kart limiti', 'Second filter card limit')}
                                    />
                                </View>

                                <View style={styles.divider} />

                                <TouchableOpacity
                                    style={styles.pickerButton}
                                    onPress={() => setOrderPicker(2)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${l('Kartların seçilme sırası', 'Cards selected by')}: ${filteredOrderLabel(locale, form.order2)}`}
                                >
                                    <View style={styles.pickerLabelWrap}>
                                        <Text style={styles.pickerLabel}>{l('Kartların seçilme sırası', 'Cards selected by')}</Text>
                                        <Text style={styles.pickerValue}>{filteredOrderLabel(locale, form.order2)}</Text>
                                    </View>
                                    <Text style={styles.pickerChevron}>⌄</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>

                    <Text style={styles.sectionHeader}>{l('Seçenekler', 'Options')}</Text>
                    <View style={styles.card}>
                        <View style={styles.toggleRow}>
                            <View style={styles.toggleCopy}>
                                <Text style={styles.toggleTitle}>{l('Kartları yeniden zamanla', 'Reschedule cards')}</Text>
                                <Text style={styles.toggleSubtitle}>
                                    {form.reschedule
                                        ? l('Yanıtlar kartların normal programını günceller.', 'Answers update the cards’ normal schedule.')
                                        : l('Önizleme modu; mevcut zamanlama değişmez.', 'Preview mode; existing scheduling is unchanged.')}
                                </Text>
                            </View>
                            <Switch
                                value={form.reschedule}
                                onValueChange={(value) => update('reschedule', value)}
                                trackColor={{ false: colors.border, true: colors.accent }}
                                thumbColor={colors.white}
                                accessibilityLabel={l('Kartları yeniden zamanla', 'Reschedule cards')}
                            />
                        </View>

                        {!form.reschedule && (
                            <>
                                <View style={styles.divider} />
                                <View style={styles.cardField}>
                                    <Text style={styles.fieldLabel}>{l('Önizleme gecikmeleri (saniye)', 'Preview delays (seconds)')}</Text>
                                    <TextInput
                                        style={[styles.input, { marginTop: 4 }]}
                                        value={form.previewDelays}
                                        onChangeText={(value) => update('previewDelays', value)}
                                        placeholder="60 600 0"
                                        placeholderTextColor={colors.textMuted}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        accessibilityLabel={l('Önizleme gecikmeleri (saniye)', 'Preview delays (seconds)')}
                                    />
                                    <Text style={styles.fieldDescription}>
                                        {l(
                                            'Tekrar, Zor ve İyi için saniye cinsinden süreler (0 = kartı oturumdan çıkarır). Kolay kartı her zaman çıkarır. Örnek: 60 600 0',
                                            'Delays in seconds for Again, Hard, and Good (0 = removes the card from the session). Easy always removes the card. Example: 60 600 0',
                                        )}
                                    </Text>
                                </View>
                            </>
                        )}

                        <View style={styles.divider} />

                        <View style={styles.toggleRow}>
                            <View style={styles.toggleCopy}>
                                <Text style={styles.toggleTitle}>{allowEmptyLabel}</Text>
                                <Text style={styles.toggleSubtitle}>
                                    {l('Hiçbir kart eşleşmese de deste ve kuralları korunur.', 'Keep the deck and its rules even when no cards match.')}
                                </Text>
                            </View>
                            <Switch
                                value={form.allowEmpty}
                                onValueChange={(value) => update('allowEmpty', value)}
                                trackColor={{ false: colors.border, true: colors.accent }}
                                thumbColor={colors.white}
                                accessibilityLabel={allowEmptyLabel}
                            />
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.excludedButton}
                        onPress={showExcluded}
                        accessibilityRole="button"
                        activeOpacity={0.6}
                    >
                        <InfoCircleGlyph color={colors.textSecondary} size={15} />
                        <Text style={styles.excludedText}>{l('Dahil edilemeyen kartları göster', 'Show any excluded cards')}</Text>
                    </TouchableOpacity>
                </ScrollView>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.saveButton, saveDisabled && styles.disabled]}
                        onPress={saveAndBuild}
                        disabled={saveDisabled}
                        accessibilityRole="button"
                    >
                        <Text style={styles.saveText}>
                            {creating ? l('Oluştur', 'Build') : l('Kaydet ve yeniden oluştur', 'Save and Rebuild')}
                        </Text>
                    </TouchableOpacity>
                </View>

                {orderPicker !== null && (
                    <View style={styles.overlayLayer}>
                        <TouchableOpacity style={styles.overlayBackdrop} activeOpacity={1} onPress={() => setOrderPicker(null)} />
                        <SwipeDismissSheet
                            style={[styles.pickerCard, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}
                            onDismiss={() => setOrderPicker(null)}
                        >
                            <Text style={styles.pickerTitle}>{l('Kartların seçilme sırası', 'Cards selected by')}</Text>
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {filteredDeckOrderChoices(settings.fsrsEnabled === true).map((value) => (
                                    <TouchableOpacity key={value} style={[styles.pickerOption, selectedOrder === value && styles.pickerOptionSelected]} onPress={() => chooseOrder(value)}>
                                        <Text style={[styles.pickerOptionText, selectedOrder === value && styles.pickerOptionTextSelected]}>{filteredOrderLabel(locale, value)}</Text>
                                        {selectedOrder === value && <Text style={styles.check}>✓</Text>}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </SwipeDismissSheet>
                    </View>
                )}

                {helpVisible && (
                    <FilteredDeckHelpSheet styles={styles} bottomInset={insets.bottom} onClose={() => setHelpVisible(false)} />
                )}

                {showDeckPicker && (
                    <DeckPickerModal
                        visible={showDeckPicker}
                        colors={colors}
                        decks={regularDecks}
                        selectedDeckName={currentPickerSelectedDeckName}
                        activeDeckName={currentPickerSelectedDeckName || activeDeckName || null}
                        title={l('Hedef deste', 'Target Deck')}
                        allDecksLabel={l('Tüm desteler', 'All decks')}
                        searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                        emptySearchLabel={l('Aramanızla eşleşen deste yok.', 'No decks match your search.')}
                        cancelLabel={t('common.cancel')}
                        closeAccessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                        searchAccessibilityLabel={l('Deste ara', 'Search decks')}
                        createAccessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                        onClose={() => setShowDeckPicker(false)}
                        onSelect={(pickedName) => {
                            const key = deckPickerTarget === 2 ? 'search2' : 'search';
                            setForm((current) => ({ ...current, [key]: replaceDeckNameInSearch(current[key], pickedName) }));
                            setShowDeckPicker(false);
                        }}
                        onCreateDeck={(newDeckName) => {
                            try {
                                // Typing an existing deck's name selects it, as in every deck picker.
                                const created = createOrSelectDeck(newDeckName);
                                invalidateCollection();
                                return created.name;
                            } catch (error) {
                                console.warn('[FilteredDeckOptionsModal] create deck from picker failed:', error);
                                return null;
                            }
                        }}
                    />
                )}
            </View>
        </Modal>
    );
}
