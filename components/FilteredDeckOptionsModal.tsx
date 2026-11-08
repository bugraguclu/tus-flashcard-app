import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Keyboard,
    Modal,
    Platform,
    ScrollView,
    View,
} from 'react-native';
import { Text } from './AppText';
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
    newFilteredDeckSearches,
    replaceDeckNameInSearch,
} from '../lib/filteredDeckOptions';
import {
    filteredDeckFormFromDeck,
    filteredDeckFormLimitsValid,
    filteredDeckOptionsFromForm,
    newFilteredDeckForm,
    newFilteredDeckName,
    type FilteredDeckFormValues,
} from '../lib/filteredDeckForm';
import { filteredOrderLabel } from '../lib/i18n';
import { getDeckDisplayName, type Deck } from '../lib/models';
import { getFilteredDeckExcludedCount, getFilteredDeckMatchCount } from '../lib/studyRepository';
import { findInvalidFilteredSearch } from '../lib/searchValidation';
import type { AppSettings } from '../lib/types';
import DeckPickerModal from './DeckPickerModal';
import InfoCircleGlyph from './InfoCircleGlyph';
import ScreenHeader from './ScreenHeader';
import FilteredDeckHelpSheet from './filtered-deck/FilteredDeckHelpSheet';
import { createFilteredDeckOptionsStyles } from './filtered-deck/filteredDeckOptionsStyles';
import { Button, HelpButton, IconButton } from './ui/Button';
import { Card, Section } from './ui/Card';
import { TextField } from './ui/Fields';
import { SearchIcon } from './ui/icons';
import { MenuItem } from './ui/Menu';
import { SelectRow, SwitchRow, ValueRow } from './ui/Rows';
import { AppSheet } from './ui/Sheet';
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
    // Which filter's order the picker sheet edits; kept while the sheet slides away.
    const [orderTarget, setOrderTarget] = useState<1 | 2>(1);
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
            // Anki scopes a new filtered deck to the current deck: its due cards, and its new cards in
            // the second filter. Without a deck studied last, the first regular deck stands in for
            // it; with a filtered deck current, Anki leaves both searches empty.
            const activeDeck = activeDeckName ? getDeckByName(activeDeckName) : null;
            const sourceDeck = activeDeck ?? regularDecks[0] ?? null;
            const searches = newFilteredDeckSearches(sourceDeck && !sourceDeck.isFiltered ? sourceDeck.name.trim() || null : null);
            setForm(newFilteredDeckForm(
                newFilteredDeckName(l('Filtrelenmiş Deste', 'Filtered Deck'), new Date(), (name) => Boolean(getDeckByName(name))),
                initialSearch ?? searches.search,
                searches.search2,
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
    // An empty search builds from the whole collection, as in Anki.
    const saveDisabled = !form.name.trim() || !filteredDeckFormLimitsValid(form);

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

    const openOrderPicker = (target: 1 | 2) => {
        Keyboard.dismiss();
        setOrderTarget(target);
        setOrderPicker(target);
    };
    const selectedOrder = orderTarget === 2 ? form.order2 : form.order;
    const chooseOrder = (value: number) => {
        update(orderTarget === 2 ? 'order2' : 'order', value);
        setOrderPicker(null);
    };

    const openDeckPicker = (target: 1 | 2) => {
        Keyboard.dismiss();
        setDeckPickerTarget(target);
        setShowDeckPicker(true);
    };
    const deckLabel = (name: string | null) => (name ? name.replaceAll('::', ' › ') : l('Tüm desteler', 'All decks'));

    const allowEmptyLabel = creating
        ? l('Boş olsa bile oluştur', 'Build even if empty')
        : l('Boş olsa bile güncelle', 'Update even if empty');

    // One filter's deck, search, limit and order rows; Card draws the hairlines between them.
    const filterRows = (target: 1 | 2) => {
        const second = target === 2;
        const deckName = second ? selectedDeckName2 : selectedDeckName1;
        const search = second ? form.search2 : form.search;
        const order = second ? form.order2 : form.order;
        return [
            <SelectRow
                key={`deck-${target}`}
                label={l('Deste', 'Deck')}
                value={deckLabel(deckName)}
                onPress={() => openDeckPicker(target)}
            />,
            <View key={`search-${target}`} style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{t('common.search')}</Text>
                <View style={styles.searchRow}>
                    <TextField
                        style={styles.searchInput}
                        value={search}
                        onChangeText={(value) => update(second ? 'search2' : 'search', value)}
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder={second ? 'deck:"Deste" is:new' : 'deck:"Deste" is:due'}
                        accessibilityLabel={second
                            ? l('İkinci filtre araması', 'Second filter search')
                            : l('Birinci filtre araması', 'First filter search')}
                    />
                    <IconButton
                        onPress={() => showSearchInfo(search)}
                        accessibilityLabel={second
                            ? l('İkinci arama sorgusunu kontrol et', 'Check second search query')
                            : l('Arama sorgusunu kontrol et', 'Check search query')}
                    >
                        <SearchIcon color={colors.accent} size={22} />
                    </IconButton>
                </View>
            </View>,
            <ValueRow
                key={`limit-${target}`}
                label={l('Kart limiti', 'Card limit')}
                summary={second
                    ? l('İkinci gruptan alınacak en fazla kart sayısı', 'Maximum cards from the second group')
                    : l('Desteye alınacak en fazla kart sayısı', 'Maximum cards to gather into this deck')}
            >
                <TextField
                    style={styles.numberInput}
                    value={second ? form.limit2 : form.limit}
                    onChangeText={(value) => update(second ? 'limit2' : 'limit', value.replace(/\D/g, '').slice(0, 5))}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    maxLength={5}
                    textAlign="center"
                    accessibilityLabel={second
                        ? l('İkinci filtre kart limiti', 'Second filter card limit')
                        : l('Birinci filtre kart limiti', 'First filter card limit')}
                />
            </ValueRow>,
            <SelectRow
                key={`order-${target}`}
                label={l('Kartların seçilme sırası', 'Cards selected by')}
                value={filteredOrderLabel(locale, order)}
                onPress={() => openOrderPicker(target)}
            />,
        ];
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={close} onDismiss={reportCreated}>
            <View style={[styles.screen, { paddingTop: insets.top }]} accessibilityViewIsModal>
                <ScreenHeader
                    leading="close"
                    backAccessibilityLabel={t('common.close')}
                    onBack={close}
                    title={creating ? l('Filtrelenmiş deste oluştur', 'Create Filtered Deck') : l('Filtre seçenekleri', 'Filtered Deck Options')}
                    subtitle={getDeckDisplayName(creating ? form.name : deck.name)}
                    actions={(
                        <HelpButton
                            accessibilityLabel={l('Filtrelenmiş deste yardımı', 'Filtered deck help')}
                            onPress={() => {
                                Keyboard.dismiss();
                                setHelpVisible(true);
                            }}
                        />
                    )}
                />

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                    showsVerticalScrollIndicator={false}
                >
                    <Section label={l('Deste adı', 'Deck name')}>
                        <View style={styles.fieldRow}>
                            <TextField
                                value={form.name}
                                onChangeText={(value) => update('name', value)}
                                placeholder={l('Deste adı girin', 'Enter deck name')}
                                accessibilityLabel={l('Deste adı', 'Deck name')}
                            />
                        </View>
                    </Section>

                    <Section label={l('1. Filtre', 'Filter 1')}>
                        {filterRows(1)}
                    </Section>

                    <Section label={l('2. Filtre', 'Filter 2')}>
                        <SwitchRow
                            title={l('İkinci filtreyi etkinleştir', 'Enable second filter')}
                            summary={l('Farklı arama ve sıralama ile ikinci bir grup ekleyin', 'Combine a second group with separate query and order')}
                            value={form.secondEnabled}
                            onValueChange={(value) => update('secondEnabled', value)}
                        />
                        {form.secondEnabled ? filterRows(2) : null}
                    </Section>

                    <Section label={l('Seçenekler', 'Options')}>
                        <SwitchRow
                            title={l('Kartları yeniden zamanla', 'Reschedule cards')}
                            summary={form.reschedule
                                ? l('Yanıtlar kartların normal programını günceller.', 'Answers update the cards’ normal schedule.')
                                : l('Önizleme modu; mevcut zamanlama değişmez.', 'Preview mode; existing scheduling is unchanged.')}
                            value={form.reschedule}
                            onValueChange={(value) => update('reschedule', value)}
                        />
                        {!form.reschedule ? (
                            <View style={styles.fieldRow}>
                                <Text style={styles.fieldLabel}>{l('Önizleme gecikmeleri (saniye)', 'Preview delays (seconds)')}</Text>
                                <TextField
                                    value={form.previewDelays}
                                    onChangeText={(value) => update('previewDelays', value)}
                                    placeholder="60 600 0"
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
                        ) : null}
                        <SwitchRow
                            title={allowEmptyLabel}
                            summary={l('Hiçbir kart eşleşmese de deste ve kuralları korunur.', 'Keep the deck and its rules even when no cards match.')}
                            value={form.allowEmpty}
                            onValueChange={(value) => update('allowEmpty', value)}
                        />
                    </Section>

                    <Button
                        label={l('Dahil edilemeyen kartları göster', 'Show any excluded cards')}
                        variant="plain"
                        tone="muted"
                        icon={<InfoCircleGlyph color={colors.textSecondary} size={15} />}
                        onPress={showExcluded}
                        style={styles.excludedButton}
                    />
                </ScrollView>

                <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
                    <Button
                        label={creating ? l('Oluştur', 'Build') : l('Kaydet ve yeniden oluştur', 'Save and Rebuild')}
                        onPress={saveAndBuild}
                        disabled={saveDisabled}
                    />
                </View>

                <AppSheet
                    visible={orderPicker !== null}
                    onClose={() => setOrderPicker(null)}
                    title={l('Kartların seçilme sırası', 'Cards selected by')}
                    maxHeight="70%"
                >
                    <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
                        <Card divided>
                            {filteredDeckOrderChoices(settings.fsrsEnabled === true).map((value) => (
                                <MenuItem
                                    key={value}
                                    label={filteredOrderLabel(locale, value)}
                                    checked={selectedOrder === value}
                                    onPress={() => chooseOrder(value)}
                                />
                            ))}
                        </Card>
                    </ScrollView>
                </AppSheet>

                <FilteredDeckHelpSheet visible={helpVisible} onClose={() => setHelpVisible(false)} />

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
