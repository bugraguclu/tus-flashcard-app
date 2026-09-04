import React, { useEffect, useMemo, useState } from 'react';
import {
    Keyboard,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, FontSize, Shadows, Spacing, type ColorScheme, useThemeColors } from '../constants/theme';
import { useI18n } from '../hooks/useI18n';
import { alert } from '../lib/confirm';
import { createDeck, getAllDecks, getAvailableDeckName, renameDeck, updateFilteredDeck } from '../lib/deckManager';
import {
    DEFAULT_SECOND_SEARCH_LIMIT,
    FILTERED_DECK_ORDER_UI,
    FILTERED_SEARCH_ORDER,
    extractDeckNameFromSearch,
    formatPreviewDelays,
    parsePreviewDelays,
    replaceDeckNameInSearch,
} from '../lib/filteredDeckOptions';
import { filteredOrderLabel } from '../lib/i18n';
import { getDeckDisplayName, type Deck } from '../lib/models';
import { getFilteredDeckExcludedCount, getFilteredDeckMatchCount } from '../lib/studyRepository';
import type { AppSettings } from '../lib/types';
import DeckPickerModal from './DeckPickerModal';
import SwipeDismissSheet from './SwipeDismissSheet';
import { userFacingErrorMessage } from '../lib/userFacingError';

interface FilteredDeckOptionsModalProps {
    visible: boolean;
    deck: Deck | null;
    settings: AppSettings;
    onClose: () => void;
    onSaved: (deckName: string) => void;
}

function parseLimit(value: string): number {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

export default function FilteredDeckOptionsModal({
    visible,
    deck,
    settings,
    onClose,
    onSaved,
}: FilteredDeckOptionsModalProps) {
    const { t, l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
    const [name, setName] = useState('');
    const [search, setSearch] = useState('');
    const [limit, setLimit] = useState('100');
    const [order, setOrder] = useState(0);
    const [secondEnabled, setSecondEnabled] = useState(false);
    const [search2, setSearch2] = useState('');
    const [limit2, setLimit2] = useState(String(DEFAULT_SECOND_SEARCH_LIMIT));
    const [order2, setOrder2] = useState(0);
    const [reschedule, setReschedule] = useState(true);
    const [previewDelays, setPreviewDelays] = useState(formatPreviewDelays(undefined));
    const [allowEmpty, setAllowEmpty] = useState(false);
    const [orderPicker, setOrderPicker] = useState<1 | 2 | null>(null);
    const [helpVisible, setHelpVisible] = useState(false);
    const [showDeckPicker, setShowDeckPicker] = useState(false);
    const [deckPickerTarget, setDeckPickerTarget] = useState<1 | 2>(1);

    const regularDecks = useMemo(() => getAllDecks().filter((d) => !d.isFiltered), [visible]);
    const selectedDeckName1 = useMemo(() => extractDeckNameFromSearch(search), [search]);
    const selectedDeckName2 = useMemo(() => extractDeckNameFromSearch(search2), [search2]);
    const currentPickerSelectedDeckName = deckPickerTarget === 2 ? selectedDeckName2 : selectedDeckName1;

    useEffect(() => {
        if (!visible || !deck) return;
        setName(deck.name);
        setSearch(deck.searchQuery ?? '');
        setLimit(String(deck.searchLimit ?? 100));
        setOrder(deck.searchOrder ?? FILTERED_SEARCH_ORDER.due);
        setSearch2(deck.searchQuery2 ?? '');
        setLimit2(String(deck.searchLimit2 ?? DEFAULT_SECOND_SEARCH_LIMIT));
        setOrder2(deck.searchOrder2 ?? FILTERED_SEARCH_ORDER.due);
        setSecondEnabled(Boolean(deck.searchQuery2?.trim()));
        setReschedule(deck.reschedule ?? true);
        setPreviewDelays(formatPreviewDelays(deck.previewDelays));
        setAllowEmpty(deck.filteredAllowEmpty ?? false);
        setOrderPicker(null);
        setHelpVisible(false);
    }, [deck?.id, visible]);

    if (!deck?.isFiltered) return null;

    const close = () => {
        Keyboard.dismiss();
        setOrderPicker(null);
        setHelpVisible(false);
        onClose();
    };

    const options = {
        searchQuery: search.trim(),
        searchLimit: parseLimit(limit),
        searchOrder: order,
        searchQuery2: secondEnabled ? (search2.trim() || undefined) : undefined,
        searchLimit2: parseLimit(limit2),
        searchOrder2: order2,
        reschedule,
        previewDelays: parsePreviewDelays(previewDelays),
        allowEmpty,
    };

    const validLimits = /^\d{1,5}$/.test(limit) && (!secondEnabled || /^\d{1,5}$/.test(limit2));
    const saveDisabled = !name.trim() || !search.trim() || !validLimits;

    const saveAndRebuild = () => {
        const nextName = name.trim();
        if (nextName.includes('::')) {
            alert(t('common.error'), l('Filtrelenmiş deste başka bir destenin alt destesi olamaz.', 'A filtered deck cannot be a subdeck.'));
            return;
        }

        const matchCount = getFilteredDeckMatchCount(settings, options);
        if (!allowEmpty && matchCount === 0) {
            alert(
                l('Eşleşen kart yok', 'No matching cards'),
                l(
                    'Bu filtrelerle deste yeniden oluşturulamadı. Aramayı değiştirin veya “Boş olsa bile güncelle” seçeneğini açın.',
                    'The deck could not be rebuilt with these filters. Change the search or enable “Update even if empty”.',
                ),
            );
            return;
        }

        try {
            if (nextName !== deck.name) renameDeck(deck.id, nextName);
            // updateFilteredDeck is the Anki-style Build/Rebuild transaction: it saves the
            // options and resets the active filtered build in one mutation.
            updateFilteredDeck(deck.id, options);
            close();
            onSaved(nextName);
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
        const matchCount = getFilteredDeckMatchCount(settings, {
            searchQuery: query.trim(),
            searchLimit: 9999,
            searchOrder: 0,
        });
        alert(
            l('Arama filtresi', 'Search filter'),
            l(
                `${matchCount} uygun kart bulundu.\n\nSorguları boşlukla birleştirin; dışlamak için “-” kullanın. Örnek:\n\ndeck:"TUS Kartları" is:due -is:suspended`,
                `${matchCount} eligible cards matched.\n\nCombine terms with spaces; use “-” to exclude. Example:\n\ndeck:"TUS Kartları" is:due -is:suspended`,
            ),
        );
    };

    const showExcluded = () => {
        const count = getFilteredDeckExcludedCount([search, ...(secondEnabled ? [search2] : [])]);
        alert(
            l(`${count} kart dahil edilemiyor`, `${count} cards are excluded`),
            l(
                'Bu kartlar sorguyla eşleşiyor ancak askıya alınmış, gömülmüş veya başka bir filtrelenmiş destede oldukları için alınamıyor.',
                'These cards match the query but cannot be gathered because they are suspended, buried, or already in another filtered deck.',
            ),
        );
    };

    const selectedOrder = orderPicker === 2 ? order2 : order;
    const chooseOrder = (value: number) => {
        if (orderPicker === 2) setOrder2(value);
        else setOrder(value);
        setOrderPicker(null);
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={close}>
            <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal>
                <View style={styles.toolbar}>
                    <TouchableOpacity style={styles.iconButton} onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                        <Text style={styles.closeIcon}>×</Text>
                    </TouchableOpacity>
                    <View style={styles.toolbarCopy}>
                        <Text style={styles.toolbarTitle}>{l('Filtre seçenekleri', 'Filtered Deck Options')}</Text>
                        <Text style={styles.toolbarSubtitle} numberOfLines={1}>{getDeckDisplayName(deck.name)}</Text>
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
                                value={name}
                                onChangeText={setName}
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
                                    value={search}
                                    onChangeText={setSearch}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    placeholder='deck:"Deste" is:due'
                                    placeholderTextColor={colors.textMuted}
                                    accessibilityLabel={l('Birinci filtre araması', 'First filter search')}
                                />
                                <TouchableOpacity
                                    style={styles.searchInfoButton}
                                    onPress={() => showSearchInfo(search)}
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
                                value={limit}
                                onChangeText={(value) => setLimit(value.replace(/\D/g, '').slice(0, 5))}
                                keyboardType="number-pad"
                                maxLength={5}
                                accessibilityLabel={l('Birinci filtre kart limiti', 'First filter card limit')}
                            />
                        </View>

                        <View style={styles.divider} />

                        <TouchableOpacity
                            style={styles.pickerButton}
                            onPress={() => setOrderPicker(1)}
                            accessibilityRole="button"
                            accessibilityLabel={`${l('Kartların seçilme sırası', 'Cards selected by')}: ${filteredOrderLabel(locale, order)}`}
                        >
                            <View style={styles.pickerLabelWrap}>
                                <Text style={styles.pickerLabel}>{l('Kartların seçilme sırası', 'Cards selected by')}</Text>
                                <Text style={styles.pickerValue}>{filteredOrderLabel(locale, order)}</Text>
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
                                value={secondEnabled}
                                onValueChange={setSecondEnabled}
                                trackColor={{ false: colors.border, true: colors.accent }}
                                thumbColor={colors.white}
                                accessibilityLabel={l('İkinci filtreyi etkinleştir', 'Enable second filter')}
                            />
                        </View>

                        {secondEnabled && (
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
                                            value={search2}
                                            onChangeText={setSearch2}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            placeholder='deck:"Deste" is:new'
                                            placeholderTextColor={colors.textMuted}
                                            accessibilityLabel={l('İkinci filtre araması', 'Second filter search')}
                                        />
                                        <TouchableOpacity
                                            style={styles.searchInfoButton}
                                            onPress={() => showSearchInfo(search2)}
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
                                        value={limit2}
                                        onChangeText={(value) => setLimit2(value.replace(/\D/g, '').slice(0, 5))}
                                        keyboardType="number-pad"
                                        maxLength={5}
                                        accessibilityLabel={l('İkinci filtre kart limiti', 'Second filter card limit')}
                                    />
                                </View>

                                <View style={styles.divider} />

                                <TouchableOpacity
                                    style={styles.pickerButton}
                                    onPress={() => setOrderPicker(2)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${l('Kartların seçilme sırası', 'Cards selected by')}: ${filteredOrderLabel(locale, order2)}`}
                                >
                                    <View style={styles.pickerLabelWrap}>
                                        <Text style={styles.pickerLabel}>{l('Kartların seçilme sırası', 'Cards selected by')}</Text>
                                        <Text style={styles.pickerValue}>{filteredOrderLabel(locale, order2)}</Text>
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
                                    {reschedule
                                        ? l('Yanıtlar kartların normal programını günceller.', 'Answers update the cards’ normal schedule.')
                                        : l('Önizleme modu; mevcut zamanlama değişmez.', 'Preview mode; existing scheduling is unchanged.')}
                                </Text>
                            </View>
                            <Switch
                                value={reschedule}
                                onValueChange={setReschedule}
                                trackColor={{ false: colors.border, true: colors.accent }}
                                thumbColor={colors.white}
                                accessibilityLabel={l('Kartları yeniden zamanla', 'Reschedule cards')}
                            />
                        </View>

                        {!reschedule && (
                            <>
                                <View style={styles.divider} />
                                <View style={styles.cardField}>
                                    <Text style={styles.fieldLabel}>{l('Önizleme gecikmeleri (saniye)', 'Preview delays (seconds)')}</Text>
                                    <TextInput
                                        style={[styles.input, { marginTop: 4 }]}
                                        value={previewDelays}
                                        onChangeText={setPreviewDelays}
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
                                <Text style={styles.toggleTitle}>{l('Boş olsa bile güncelle', 'Update even if empty')}</Text>
                                <Text style={styles.toggleSubtitle}>
                                    {l('Hiçbir kart eşleşmese de deste ve kuralları korunur.', 'Keep the deck and its rules even when no cards match.')}
                                </Text>
                            </View>
                            <Switch
                                value={allowEmpty}
                                onValueChange={setAllowEmpty}
                                trackColor={{ false: colors.border, true: colors.accent }}
                                thumbColor={colors.white}
                                accessibilityLabel={l('Boş olsa bile güncelle', 'Update even if empty')}
                            />
                        </View>
                    </View>

                    <TouchableOpacity style={styles.excludedButton} onPress={showExcluded} accessibilityRole="button">
                        <Text style={styles.excludedIcon}>ℹ</Text>
                        <Text style={styles.excludedText}>{l('Dahil edilemeyen kartları göster', 'Show any excluded cards')}</Text>
                    </TouchableOpacity>
                </ScrollView>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.saveButton, saveDisabled && styles.disabled]}
                        onPress={saveAndRebuild}
                        disabled={saveDisabled}
                        accessibilityRole="button"
                    >
                        <Text style={styles.saveText}>{l('Kaydet ve yeniden oluştur', 'Save and Rebuild')}</Text>
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
                                {FILTERED_DECK_ORDER_UI.map((value) => (
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
                    <View style={styles.overlayLayer}>
                        <TouchableOpacity style={styles.overlayBackdrop} activeOpacity={1} onPress={() => setHelpVisible(false)} />
                        <SwipeDismissSheet
                            style={[styles.helpCard, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}
                            onDismiss={() => setHelpVisible(false)}
                        >
                            <View style={styles.helpHeader}>
                                <View style={styles.helpHeaderCopy}>
                                    <Text style={styles.helpTitle}>{l('Filtrelenmiş deste nasıl çalışır?', 'How does a filtered deck work?')}</Text>
                                    <Text style={styles.helpLead}>{l('Kartlar silinmez; bu deste yalnızca seçtiğiniz kartları geçici bir çalışma oturumunda toplar.', 'Cards are never deleted; this deck gathers selected cards into a temporary study session.')}</Text>
                                </View>
                                <TouchableOpacity style={styles.iconButton} onPress={() => setHelpVisible(false)}><Text style={styles.closeIcon}>×</Text></TouchableOpacity>
                            </View>
                            <ScrollView contentContainerStyle={styles.helpContent}>
                                <HelpStep number="1" title={l('Kartları sorguyla seçin', 'Select cards with a query')} body={l('Deste, etiket ve kart durumlarını birlikte kullanabilirsiniz. Örnek: deck:"TUS Kartları" is:due -is:suspended', 'Combine deck, tag, and card-state terms. Example: deck:"TUS Kartları" is:due -is:suspended')} styles={styles} />
                                <HelpStep number="2" title={l('Limit ve sırayı belirleyin', 'Set the limit and order')} body={l('Limit kaç kart alınacağını; sıralama ise limite hangi kartların önce gireceğini ve çalışma sırasını belirler.', 'The limit controls how many cards are gathered; order controls which cards enter first and their study order.')} styles={styles} />
                                <HelpStep number="3" title={l('Zamanlama davranışını seçin', 'Choose scheduling behavior')} body={l('Yeniden zamanlama açıkken yanıtlar normal programa işler. Kapalıyken deste önizleme modundadır.', 'With rescheduling on, answers affect the normal schedule. With it off, the deck is a preview.')} styles={styles} />
                                <HelpStep number="4" title={l('Kaydedip yeniden oluşturun', 'Save and rebuild')} body={l('Kurallar kaydedilir ve deste aynı anda güncel eşleşmelerle yeniden doldurulur.', 'Rules are saved and the deck is immediately repopulated with current matches.')} styles={styles} />
                            </ScrollView>
                            <TouchableOpacity style={styles.saveButton} onPress={() => setHelpVisible(false)}><Text style={styles.saveText}>{l('Anladım', 'Got it')}</Text></TouchableOpacity>
                        </SwipeDismissSheet>
                    </View>
                )}

                {showDeckPicker && (
                    <DeckPickerModal
                        visible={showDeckPicker}
                        colors={colors}
                        decks={regularDecks}
                        selectedDeckName={currentPickerSelectedDeckName}
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
                            if (deckPickerTarget === 2) {
                                setSearch2((current) => replaceDeckNameInSearch(current, pickedName));
                            } else {
                                setSearch((current) => replaceDeckNameInSearch(current, pickedName));
                            }
                            setShowDeckPicker(false);
                        }}
                        onCreateDeck={(newDeckName) => {
                            try {
                                const created = createDeck(getAvailableDeckName(newDeckName));
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

function HelpStep({ number, title, body, styles }: { number: string; title: string; body: string; styles: ReturnType<typeof createStyles> }) {
    return (
        <View style={styles.helpStep}>
            <View style={styles.helpNumber}><Text style={styles.helpNumberText}>{number}</Text></View>
            <View style={styles.helpStepCopy}>
                <Text style={styles.helpStepTitle}>{title}</Text>
                <Text style={styles.helpStepBody}>{body}</Text>
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: colors.bgPrimary },
        toolbar: {
            minHeight: 60,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderLight,
            backgroundColor: colors.bgCard,
        },
        iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
        closeIcon: { fontSize: 32, lineHeight: 34, color: colors.textSecondary, fontWeight: '300' },
        toolbarCopy: { flex: 1, paddingHorizontal: Spacing.xs },
        toolbarTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
        toolbarSubtitle: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: 1 },
        helpCircle: {
            width: 25,
            height: 25,
            borderRadius: 13,
            borderWidth: 2,
            borderColor: colors.textSecondary,
            alignItems: 'center',
            justifyContent: 'center',
        },
        helpIcon: { color: colors.textSecondary, fontWeight: '800', fontSize: FontSize.sm },
        scroll: { flex: 1 },
        content: {
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
            padding: Spacing.lg,
            paddingBottom: Spacing.xxl,
        },
        sectionHeader: {
            fontSize: FontSize.xs,
            fontWeight: '700',
            letterSpacing: 0.6,
            color: colors.textSecondary,
            textTransform: 'uppercase',
            marginBottom: Spacing.xs,
            marginLeft: Spacing.xs,
            marginTop: Spacing.lg,
        },
        sectionHeaderFirst: {
            marginTop: 0,
        },
        card: {
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            borderWidth: 1,
            borderColor: colors.borderLight,
            overflow: 'hidden',
            ...Shadows.sm,
        },
        cardField: {
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
        },
        fieldLabel: {
            fontSize: FontSize.xs,
            fontWeight: '600',
            color: colors.textSecondary,
            marginBottom: 4,
        },
        fieldDescription: {
            fontSize: FontSize.xs,
            lineHeight: 16,
            color: colors.textMuted,
            marginTop: 4,
        },
        input: {
            fontSize: FontSize.md,
            color: colors.textPrimary,
            minHeight: 40,
            paddingVertical: 4,
        },
        searchRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
        },
        searchInput: {
            flex: 1,
            fontSize: FontSize.md,
            color: colors.textPrimary,
            minHeight: 40,
            paddingVertical: 4,
        },
        searchInfoButton: {
            width: 38,
            height: 38,
            borderRadius: BorderRadius.full,
            backgroundColor: colors.accentLight,
            alignItems: 'center',
            justifyContent: 'center',
        },
        searchInfoText: {
            color: colors.accent,
            fontSize: 22,
            fontWeight: '600',
            lineHeight: 24,
        },
        numberRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
            minHeight: 52,
        },
        numberLabelWrap: {
            flex: 1,
            marginRight: Spacing.md,
        },
        numberLabel: {
            fontSize: FontSize.md,
            fontWeight: '500',
            color: colors.textPrimary,
        },
        numberSublabel: {
            fontSize: FontSize.xs,
            color: colors.textMuted,
            marginTop: 2,
        },
        numberInput: {
            minWidth: 72,
            height: 40,
            backgroundColor: colors.bgInput,
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: Spacing.md,
            textAlign: 'center',
            fontSize: FontSize.md,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        pickerButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
            minHeight: 56,
        },
        pickerLabelWrap: {
            flex: 1,
            marginRight: Spacing.md,
        },
        pickerLabel: {
            fontSize: FontSize.xs,
            fontWeight: '600',
            color: colors.textSecondary,
            marginBottom: 2,
        },
        pickerValue: {
            fontSize: FontSize.md,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        pickerChevron: {
            fontSize: 18,
            fontWeight: '700',
            color: colors.textSecondary,
        },
        toggleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
            minHeight: 56,
            gap: Spacing.md,
        },
        toggleCopy: {
            flex: 1,
            justifyContent: 'center',
        },
        toggleTitle: {
            fontSize: FontSize.md,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        toggleSubtitle: {
            fontSize: FontSize.xs,
            lineHeight: 16,
            color: colors.textMuted,
            marginTop: 2,
        },
        divider: {
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.borderLight,
            marginLeft: Spacing.lg,
        },
        excludedButton: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 48,
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.lg,
            borderRadius: BorderRadius.lg,
            backgroundColor: colors.bgCard,
            borderWidth: 1,
            borderColor: colors.borderLight,
            marginTop: Spacing.lg,
            marginBottom: Spacing.xl,
            gap: Spacing.xs,
            ...Shadows.sm,
        },
        excludedIcon: {
            fontSize: FontSize.md,
            color: colors.accent,
        },
        excludedText: {
            color: colors.accent,
            fontSize: FontSize.sm,
            fontWeight: '700',
        },
        footer: {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
            backgroundColor: colors.bgCard,
            padding: Spacing.md,
        },
        saveButton: {
            minHeight: 50,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: Spacing.lg,
        },
        saveText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
        disabled: { opacity: 0.45 },
        overlayLayer: { ...StyleSheet.absoluteFill, zIndex: 20, justifyContent: 'flex-end' },
        overlayBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.42)' },
        pickerCard: {
            maxHeight: '70%',
            backgroundColor: colors.bgPrimary,
            borderTopLeftRadius: BorderRadius.xl,
            borderTopRightRadius: BorderRadius.xl,
            padding: Spacing.lg,
            paddingTop: 48,
            ...Shadows.lg,
        },
        pickerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: Spacing.md },
        pickerOption: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm },
        pickerOptionSelected: { backgroundColor: colors.accentLight },
        pickerOptionText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
        pickerOptionTextSelected: { color: colors.accent, fontWeight: '800' },
        check: { color: colors.accent, fontSize: FontSize.lg, fontWeight: '800' },
        helpCard: {
            maxHeight: '88%',
            backgroundColor: colors.bgPrimary,
            borderTopLeftRadius: BorderRadius.xl,
            borderTopRightRadius: BorderRadius.xl,
            padding: Spacing.lg,
            paddingTop: 48,
            ...Shadows.lg,
        },
        helpHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md },
        helpHeaderCopy: { flex: 1, paddingRight: Spacing.sm },
        helpTitle: { fontSize: FontSize.xl, fontWeight: '800', color: colors.textPrimary },
        helpLead: { fontSize: FontSize.sm, lineHeight: 20, color: colors.textMuted, marginTop: 5 },
        helpContent: { gap: Spacing.lg, paddingVertical: Spacing.md },
        helpStep: { flexDirection: 'row', gap: Spacing.md },
        helpNumber: {
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentLight,
        },
        helpNumberText: { color: colors.accent, fontWeight: '900' },
        helpStepCopy: { flex: 1 },
        helpStepTitle: { fontSize: FontSize.sm, fontWeight: '800', color: colors.textPrimary },
        helpStepBody: { fontSize: FontSize.sm, lineHeight: 20, color: colors.textSecondary, marginTop: 3 },
    });
}
