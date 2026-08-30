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
import { renameDeck, updateFilteredDeck } from '../lib/deckManager';
import { FILTERED_DECK_ORDER_UI, FILTERED_SEARCH_ORDER } from '../lib/filteredDeckOptions';
import { filteredOrderLabel } from '../lib/i18n';
import { getDeckDisplayName, type Deck } from '../lib/models';
import { getFilteredDeckExcludedCount, getFilteredDeckMatchCount } from '../lib/studyRepository';
import type { AppSettings } from '../lib/types';
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
    const [limit2, setLimit2] = useState('100');
    const [order2, setOrder2] = useState(0);
    const [reschedule, setReschedule] = useState(true);
    const [allowEmpty, setAllowEmpty] = useState(false);
    const [orderPicker, setOrderPicker] = useState<1 | 2 | null>(null);
    const [helpVisible, setHelpVisible] = useState(false);

    useEffect(() => {
        if (!visible || !deck) return;
        setName(deck.name);
        setSearch(deck.searchQuery ?? '');
        setLimit(String(deck.searchLimit ?? 100));
        setOrder(deck.searchOrder ?? FILTERED_SEARCH_ORDER.due);
        setSearch2(deck.searchQuery2 ?? '');
        setLimit2(String(deck.searchLimit2 ?? 100));
        setOrder2(deck.searchOrder2 ?? FILTERED_SEARCH_ORDER.due);
        setSecondEnabled(Boolean(deck.searchQuery2?.trim()));
        setReschedule(deck.reschedule ?? true);
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
                >
                    <Field label={l('Deste adı', 'Deck name')} styles={styles}>
                        <TextInput style={styles.input} value={name} onChangeText={setName} accessibilityLabel={l('Deste adı', 'Deck name')} />
                    </Field>

                    <Text style={styles.sectionTitle}>{l('Birinci filtre', 'First filter')}</Text>
                    <SearchField value={search} onChangeText={setSearch} onInfo={() => showSearchInfo(search)} styles={styles} colors={colors} label={t('common.search')} />
                    <Field label={l('En fazla kart', 'Card limit')} styles={styles}>
                        <TextInput style={styles.input} value={limit} onChangeText={(value) => setLimit(value.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" maxLength={5} />
                    </Field>
                    <OrderField label={l('Kartların seçilme sırası', 'Cards selected by')} value={filteredOrderLabel(locale, order)} onPress={() => setOrderPicker(1)} styles={styles} />

                    <SwitchRow
                        label={l('İkinci filtreyi etkinleştir', 'Enable second filter')}
                        value={secondEnabled}
                        onValueChange={setSecondEnabled}
                        styles={styles}
                        colors={colors}
                    />

                    {secondEnabled && (
                        <View style={styles.secondFilter}>
                            <Text style={styles.sectionTitle}>{l('İkinci filtre', 'Second filter')}</Text>
                            <SearchField value={search2} onChangeText={setSearch2} onInfo={() => showSearchInfo(search2)} styles={styles} colors={colors} label={t('common.search')} />
                            <Field label={l('En fazla kart', 'Card limit')} styles={styles}>
                                <TextInput style={styles.input} value={limit2} onChangeText={(value) => setLimit2(value.replace(/\D/g, '').slice(0, 5))} keyboardType="number-pad" maxLength={5} />
                            </Field>
                            <OrderField label={l('Kartların seçilme sırası', 'Cards selected by')} value={filteredOrderLabel(locale, order2)} onPress={() => setOrderPicker(2)} styles={styles} />
                        </View>
                    )}

                    <Text style={styles.sectionTitle}>{l('Çalışma davranışı', 'Study behavior')}</Text>
                    <View style={styles.optionsCard}>
                        <SwitchRow
                            label={l('Yanıtlara göre kartları yeniden zamanla', 'Reschedule cards based on answers')}
                            description={reschedule
                                ? l('Yanıtlar kartların normal programını günceller.', 'Answers update the cards’ normal schedule.')
                                : l('Önizleme modu; mevcut zamanlama değişmez.', 'Preview mode; existing scheduling is unchanged.')}
                            value={reschedule}
                            onValueChange={setReschedule}
                            styles={styles}
                            colors={colors}
                            embedded
                        />
                        <View style={styles.divider} />
                        <SwitchRow
                            label={l('Boş olsa bile güncelle', 'Update even if empty')}
                            description={l('Hiçbir kart eşleşmese de deste ve kuralları korunur.', 'Keep the deck and its rules even when no cards match.')}
                            value={allowEmpty}
                            onValueChange={setAllowEmpty}
                            styles={styles}
                            colors={colors}
                            embedded
                        />
                    </View>

                    <TouchableOpacity style={styles.excludedButton} onPress={showExcluded}>
                        <Text style={styles.excludedText}>{l('Dahil edilemeyen kartları göster', 'Show excluded cards')}</Text>
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
            </View>
        </Modal>
    );
}

function Field({ label, children, styles }: { label: string; children: React.ReactNode; styles: ReturnType<typeof createStyles> }) {
    return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>;
}

function SearchField({ value, onChangeText, onInfo, styles, colors, label }: { value: string; onChangeText: (value: string) => void; onInfo: () => void; styles: ReturnType<typeof createStyles>; colors: ColorScheme; label: string }) {
    return (
        <Field label={label} styles={styles}>
            <View style={styles.searchRow}>
                <TextInput style={[styles.input, styles.searchInput]} value={value} onChangeText={onChangeText} autoCapitalize="none" autoCorrect={false} placeholder='deck:"Deste" is:due' placeholderTextColor={colors.textMuted} />
                <TouchableOpacity style={styles.searchInfoButton} onPress={onInfo} accessibilityRole="button"><Text style={styles.searchInfoText}>⌕</Text></TouchableOpacity>
            </View>
        </Field>
    );
}

function OrderField({ label, value, onPress, styles }: { label: string; value: string; onPress: () => void; styles: ReturnType<typeof createStyles> }) {
    return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TouchableOpacity style={styles.orderField} onPress={onPress}><Text style={styles.orderValue}>{value}</Text><Text style={styles.orderChevron}>⌄</Text></TouchableOpacity></View>;
}

function SwitchRow({ label, description, value, onValueChange, styles, colors, embedded = false }: { label: string; description?: string; value: boolean; onValueChange: (value: boolean) => void; styles: ReturnType<typeof createStyles>; colors: ColorScheme; embedded?: boolean }) {
    return (
        <View style={[styles.switchRow, !embedded && styles.switchCard]}>
            <View style={styles.switchCopy}><Text style={styles.switchLabel}>{label}</Text>{description ? <Text style={styles.switchDescription}>{description}</Text> : null}</View>
            <Switch value={value} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.accent }} thumbColor={colors.white} />
        </View>
    );
}

function HelpStep({ number, title, body, styles }: { number: string; title: string; body: string; styles: ReturnType<typeof createStyles> }) {
    return <View style={styles.helpStep}><View style={styles.helpNumber}><Text style={styles.helpNumberText}>{number}</Text></View><View style={styles.helpStepCopy}><Text style={styles.helpStepTitle}>{title}</Text><Text style={styles.helpStepBody}>{body}</Text></View></View>;
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: colors.bgPrimary },
        toolbar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.bgCard },
        iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
        closeIcon: { fontSize: 30, lineHeight: 32, color: colors.textSecondary },
        toolbarCopy: { flex: 1, paddingHorizontal: Spacing.xs },
        toolbarTitle: { fontSize: FontSize.md, fontWeight: '800', color: colors.textPrimary },
        toolbarSubtitle: { fontSize: FontSize.xs, color: colors.textMuted, marginTop: 2 },
        helpCircle: { width: 25, height: 25, borderRadius: 13, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
        helpIcon: { color: colors.accent, fontWeight: '900', fontSize: FontSize.sm },
        scroll: { flex: 1 },
        content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
        sectionTitle: { fontSize: FontSize.sm, fontWeight: '800', color: colors.textSecondary, marginTop: Spacing.sm },
        field: { gap: 6 },
        fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: colors.textMuted },
        input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.sm, backgroundColor: colors.bgInput, paddingHorizontal: Spacing.md, fontSize: FontSize.md, color: colors.textPrimary },
        searchRow: { flexDirection: 'row', gap: Spacing.sm },
        searchInput: { flex: 1, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
        searchInfoButton: { width: 48, minHeight: 48, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
        searchInfoText: { color: colors.accent, fontSize: 24, fontWeight: '700' },
        orderField: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.sm, backgroundColor: colors.bgCard, paddingHorizontal: Spacing.md },
        orderValue: { flex: 1, color: colors.textPrimary, fontSize: FontSize.md },
        orderChevron: { color: colors.textMuted, fontSize: 20 },
        secondFilter: { gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.borderLight },
        switchCard: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.md, padding: Spacing.md },
        switchRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
        switchCopy: { flex: 1 },
        switchLabel: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textPrimary },
        switchDescription: { fontSize: FontSize.xs, lineHeight: 17, color: colors.textMuted, marginTop: 3 },
        optionsCard: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderLight },
        excludedButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
        excludedText: { color: colors.accent, fontSize: FontSize.sm, fontWeight: '700' },
        footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bgCard, padding: Spacing.md },
        saveButton: { minHeight: 50, borderRadius: BorderRadius.sm, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
        saveText: { color: colors.white, fontSize: FontSize.md, fontWeight: '800' },
        disabled: { opacity: 0.45 },
        overlayLayer: { ...StyleSheet.absoluteFillObject, zIndex: 20, justifyContent: 'flex-end' },
        overlayBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
        pickerCard: { maxHeight: '70%', backgroundColor: colors.bgPrimary, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.lg, paddingTop: 48, ...Shadows.lg },
        pickerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: Spacing.md },
        pickerOption: { minHeight: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm },
        pickerOptionSelected: { backgroundColor: colors.accentLight },
        pickerOptionText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
        pickerOptionTextSelected: { color: colors.accent, fontWeight: '800' },
        check: { color: colors.accent, fontSize: FontSize.lg, fontWeight: '800' },
        helpCard: { maxHeight: '88%', backgroundColor: colors.bgPrimary, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.lg, paddingTop: 48, ...Shadows.lg },
        helpHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md },
        helpHeaderCopy: { flex: 1, paddingRight: Spacing.sm },
        helpTitle: { fontSize: FontSize.xl, fontWeight: '800', color: colors.textPrimary },
        helpLead: { fontSize: FontSize.sm, lineHeight: 20, color: colors.textMuted, marginTop: 5 },
        helpContent: { gap: Spacing.lg, paddingVertical: Spacing.md },
        helpStep: { flexDirection: 'row', gap: Spacing.md },
        helpNumber: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
        helpNumberText: { color: colors.accent, fontWeight: '900' },
        helpStepCopy: { flex: 1 },
        helpStepTitle: { fontSize: FontSize.sm, fontWeight: '800', color: colors.textPrimary },
        helpStepBody: { fontSize: FontSize.sm, lineHeight: 20, color: colors.textSecondary, marginTop: 3 },
    });
}
