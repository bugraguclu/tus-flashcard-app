// Anki-style deck overview: shown when a deck is tapped on the deck list. Today's
// counts, the deck description, buried-card count with a manual Unbury, and the
// Study Now button that actually enters the queue.

import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, BorderRadius, FontSize, Shadows, useThemeColors, type ColorScheme } from '../constants/theme';
import { useApp } from '../contexts/AppContext';
import {
    emptyFilteredDeck,
    getBuriedCountForDeck,
    getDeckByName,
    rebuildFilteredDeck,
    unburyDeck,
} from '../lib/deckManager';
import { getDeckDisplayName } from '../lib/models';
import { getStudyQueue } from '../lib/studyRepository';
import { alert, confirm } from '../lib/confirm';
import { useI18n } from '../hooks/useI18n';
import { filteredOrderLabel } from '../lib/i18n';
import CustomStudyModal from '../components/CustomStudyModal';
import FilteredDeckOptionsModal from '../components/FilteredDeckOptionsModal';

export default function DeckOverviewScreen() {
    const { t, l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const params = useLocalSearchParams();
    const { settings, dataVersion, bumpDataVersion } = useApp();
    const [refreshToken, setRefreshToken] = useState(0);
    const [customStudyOpen, setCustomStudyOpen] = useState(false);
    const [filterOptionsOpen, setFilterOptionsOpen] = useState(false);

    const deckName = typeof params.deck === 'string' ? params.deck : '';
    const deck = useMemo(() => (deckName ? getDeckByName(deckName) : null), [deckName, dataVersion, refreshToken]);

    const queue = useMemo(() => {
        if (!deck) return null;
        try {
            return getStudyQueue({ settings, selectedDeckName: deck.name });
        } catch (e) {
            console.warn('[DeckOverview] queue peek failed:', e);
            return null;
        }
    }, [deck, settings, dataVersion, refreshToken]);

    const buriedCount = useMemo(
        () => (deck ? getBuriedCountForDeck(deck.id) : 0),
        [deck, dataVersion, refreshToken],
    );

    if (!deck) {
        return (
            <SafeAreaView style={styles.container}>
                <Text style={styles.missing}>{l('Deste bulunamadı.', 'Deck not found.')}</Text>
            </SafeAreaView>
        );
    }

    const totalReady = queue ? queue.cards.length : 0;

    const handleUnbury = () => {
        const count = unburyDeck(deck.id, settings.dayRolloverHour);
        bumpDataVersion();
        setRefreshToken((value) => value + 1);
        alert(l('Gömülü kartlar açıldı', 'Cards Unburied'), l(`${count} kart yeniden çalışılabilir.`, `${count} ${count === 1 ? 'card is' : 'cards are'} available to study again.`));
    };

    const handleRebuild = () => {
        rebuildFilteredDeck(deck.id);
        bumpDataVersion();
        setRefreshToken((value) => value + 1);
        alert(l('Deste yeniden oluşturuldu', 'Deck Rebuilt'), l('Kartlar kayıtlı filtre kurallarıyla yeniden toplandı.', 'Cards were gathered again using the saved filter rules.'));
    };

    const handleEmpty = () => {
        confirm(
            l('Filtrelenmiş desteyi boşalt', 'Empty Filtered Deck'),
            l('Kartlar silinmez; ait oldukları destelerde kalır. Filtre ve deste daha sonra yeniden oluşturulmak üzere korunur.', 'Cards are not deleted; they remain in their original decks. The deck and filter are kept so you can rebuild them later.'),
            () => {
                emptyFilteredDeck(deck.id);
                bumpDataVersion();
                setRefreshToken((value) => value + 1);
            },
        );
    };

    const studyDisabled = Boolean(deck.isFiltered && deck.filteredDeckEmpty);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.navBar}>
                <TouchableOpacity
                    style={styles.navButton}
                    onPress={() => router.back()}
                    accessibilityRole="button"
                    accessibilityLabel={t('tabs.backToDecks')}
                >
                    <Text style={styles.navButtonText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.navTitle} numberOfLines={1}>{getDeckDisplayName(deck.name)}</Text>
                {!deck.isFiltered ? (
                    <TouchableOpacity
                        style={styles.navButton}
                        onPress={() => router.push(`/deck-options?deckId=${deck.id}` as any)}
                        accessibilityRole="button"
                        accessibilityLabel={l('Deste seçenekleri', 'Deck options')}
                    >
                        <Text style={styles.navMoreText}>•••</Text>
                    </TouchableOpacity>
                ) : <View style={styles.navButton} />}
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.hero}>
                    <View style={[styles.deckIcon, deck.isFiltered && styles.deckIconFiltered]}>
                        <Text style={styles.deckIconText}>{deck.isFiltered ? '⧉' : '▤'}</Text>
                    </View>
                    <View style={styles.heroText}>
                        <Text style={styles.heroEyebrow}>{deck.isFiltered ? t('anki.filteredDeck').toLocaleUpperCase() : l('BUGÜNKÜ ÇALIŞMA', 'TODAY’S STUDY')}</Text>
                        <Text style={styles.deckTitle}>{getDeckDisplayName(deck.name)}</Text>
                        {deck.name.includes('::') && (
                            <Text style={styles.deckPath}>{deck.name.replaceAll('::', ' › ')}</Text>
                        )}
                    </View>
                </View>

                {deck.description ? (
                    <View style={styles.descriptionCard}>
                        <Text style={styles.descriptionLabel}>{l('DESTE AÇIKLAMASI', 'DECK DESCRIPTION')}</Text>
                        <Text style={styles.description}>{deck.description}</Text>
                    </View>
                ) : null}

                <View style={styles.countsCard}>
                    <View style={styles.countBox}>
                        <Text style={[styles.countValue, { color: colors.badgeNew }]}>{queue?.stats.newCount ?? 0}</Text>
                        <Text style={styles.countLabel}>{t('anki.new')}</Text>
                    </View>
                    <View style={styles.countBox}>
                        <Text style={[styles.countValue, { color: colors.badgeLearn }]}>{queue?.stats.learningCount ?? 0}</Text>
                        <Text style={styles.countLabel}>{t('anki.learn')}</Text>
                    </View>
                    <View style={styles.countBox}>
                        <Text style={[styles.countValue, { color: colors.badgeReview }]}>{queue?.stats.reviewCount ?? 0}</Text>
                        <Text style={styles.countLabel}>{t('anki.review')}</Text>
                    </View>
                </View>

                {deck.isFiltered && (
                    <View style={styles.filterCard}>
                        <View style={styles.filterHeadingRow}>
                            <Text style={styles.filterLabel}>{l('KAYITLI ARAMA', 'SAVED SEARCH')}</Text>
                            <View style={styles.filterModePill}>
                                <Text style={styles.filterModeText}>
                                    {deck.reschedule === false ? l('Önizleme', 'Preview') : l('Yeniden zamanla', 'Reschedule')}
                                </Text>
                            </View>
                        </View>
                        <Text style={styles.filterQuery}>{deck.searchQuery || l('(boş arama)', '(empty search)')}</Text>
                        <Text style={styles.filterMeta}>
                            {filteredOrderLabel(locale, deck.searchOrder ?? 0)} · {l(`En fazla ${deck.searchLimit ?? 100} kart`, `Up to ${deck.searchLimit ?? 100} cards`)}
                            {deck.filteredDeckEmpty ? l(' · Şu anda boş', ' · Currently empty') : ''}
                        </Text>
                    </View>
                )}

                {buriedCount > 0 && (
                    <TouchableOpacity style={styles.unburyBtn} onPress={handleUnbury}>
                        <Text style={styles.unburyText}>💤 {l(`${buriedCount} gömülü kartı şimdi aç`, `Unbury ${buriedCount} cards now`)}</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={[styles.studyBtn, totalReady === 0 && styles.studyBtnIdle, studyDisabled && styles.buttonDisabled]}
                    onPress={() => router.push({ pathname: '/', params: { deck: deck.name } } as any)}
                    disabled={studyDisabled}
                    accessibilityRole="button"
                >
                    <Text style={styles.studyBtnText}>
                        {studyDisabled
                            ? l('Deste boş — yeniden oluşturun', 'Deck is empty — rebuild it')
                            : totalReady > 0
                                ? l(`Şimdi çalış · ${totalReady} kart`, `Study Now · ${totalReady} ${totalReady === 1 ? 'card' : 'cards'}`)
                                : l('Çalışma ekranını aç', 'Open Study Screen')}
                    </Text>
                </TouchableOpacity>

                {totalReady === 0 && (
                    <Text style={styles.doneNote}>
                        {deck.filteredDeckEmpty
                            ? l('Filtre korunuyor. Kartları geri getirmek için “Yeniden oluştur”u kullanın.', 'The filter is preserved. Use Rebuild to gather the cards again.')
                            : l('Bugün için hazır kart yok. Sayaç ve limit ayrıntıları çalışma ekranında.', 'No cards are ready today. Open the study screen for timer and limit details.')}
                    </Text>
                )}

                {deck.isFiltered && (
                    <View style={styles.filteredActions}>
                        <TouchableOpacity style={styles.lifecycleBtn} onPress={handleRebuild}>
                            <Text style={styles.lifecycleBtnText}>↻ {l('Yeniden oluştur', 'Rebuild')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.lifecycleBtn, styles.lifecycleBtnDanger, totalReady === 0 && styles.buttonDisabled]}
                            onPress={handleEmpty}
                            disabled={totalReady === 0}
                        >
                            <Text style={styles.lifecycleDangerText}>{l('Boşalt', 'Empty')}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {deck.isFiltered && (
                    <TouchableOpacity
                        style={styles.secondaryBtn}
                        onPress={() => setFilterOptionsOpen(true)}
                    >
                        <Text style={styles.secondaryText}>{l('Filtre seçenekleri', 'Filtered Deck Options')}</Text>
                        <Text style={styles.secondaryCaption}>{l('Arama, limit, sıralama ve önizleme modu', 'Search, limit, order, and preview mode')}</Text>
                    </TouchableOpacity>
                )}

                {!deck.isFiltered && (
                    <>
                        <TouchableOpacity
                            style={styles.secondaryBtn}
                            onPress={() => setCustomStudyOpen(true)}
                        >
                            <Text style={styles.secondaryText}>{t('anki.customStudy')}</Text>
                            <Text style={styles.secondaryCaption}>{l('Limit artırın, unutulanları seçin veya ileriye çalışın', 'Increase limits, review forgotten cards, or study ahead')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.secondaryBtn}
                            onPress={() => router.push(`/deck-options?deckId=${deck.id}` as any)}
                        >
                            <Text style={styles.secondaryText}>{l('Deste seçenekleri', 'Deck Options')}</Text>
                            <Text style={styles.secondaryCaption}>{l('Limitler, sıralama, gömme ve ayar grubu', 'Limits, display order, burying, and preset')}</Text>
                        </TouchableOpacity>
                    </>
                )}

                <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => router.push(`/stats?deck=${encodeURIComponent(deck.name)}` as any)}
                >
                    <Text style={styles.secondaryText}>{l('Deste istatistikleri', 'Deck Statistics')}</Text>
                    <Text style={styles.secondaryCaption}>{l('İlerlemeyi ve tekrar yükünü görüntüleyin', 'View progress and review workload')}</Text>
                </TouchableOpacity>
            </ScrollView>

            <CustomStudyModal
                visible={customStudyOpen}
                deck={deck}
                dayRolloverHour={settings.dayRolloverHour}
                onClose={() => setCustomStudyOpen(false)}
                onChanged={() => {
                    bumpDataVersion();
                    setRefreshToken((value) => value + 1);
                }}
                onStudy={(nextDeckName) => router.push({ pathname: '/', params: { deck: nextDeckName } } as any)}
            />
            <FilteredDeckOptionsModal
                visible={filterOptionsOpen}
                deck={deck}
                settings={settings}
                onClose={() => setFilterOptionsOpen(false)}
                onSaved={(nextDeckName) => {
                    bumpDataVersion();
                    setRefreshToken((value) => value + 1);
                    if (nextDeckName !== deckName) router.setParams({ deck: nextDeckName } as any);
                }}
            />
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgPrimary },
        navBar: {
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Spacing.sm,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
            backgroundColor: colors.bgPrimary,
        },
        navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
        navButtonText: { fontSize: 34, lineHeight: 36, color: colors.accent, fontWeight: '400' },
        navMoreText: { fontSize: 16, color: colors.textMuted, fontWeight: '800', letterSpacing: -1 },
        navTitle: { flex: 1, textAlign: 'center', fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
        content: { padding: Spacing.xl, gap: Spacing.md, alignItems: 'stretch', paddingBottom: Spacing.xxxl },
        missing: { margin: Spacing.xl, color: colors.textMuted, fontSize: FontSize.md },
        hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
        deckIcon: {
            width: 52,
            height: 52,
            borderRadius: BorderRadius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentLight,
            borderWidth: 1,
            borderColor: colors.border,
        },
        deckIconFiltered: { backgroundColor: colors.badgeNewBg, borderColor: colors.badgeNew },
        deckIconText: { fontSize: 24, color: colors.accent, fontWeight: '700' },
        heroText: { flex: 1 },
        heroEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: colors.accent, marginBottom: 3 },
        deckTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: colors.textPrimary },
        deckPath: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: 2 },
        descriptionCard: {
            backgroundColor: colors.bgSecondary,
            borderRadius: BorderRadius.md,
            padding: Spacing.md,
            borderWidth: 1,
            borderColor: colors.borderLight,
        },
        descriptionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.textMuted, marginBottom: 5 },
        description: { fontSize: FontSize.md, color: colors.textSecondary, lineHeight: 21 },
        countsCard: {
            flexDirection: 'row',
            justifyContent: 'space-around',
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            paddingVertical: Spacing.xl,
            ...Shadows.sm,
        },
        countBox: { flex: 1, alignItems: 'center', gap: 2 },
        countValue: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
        countLabel: { fontSize: FontSize.sm, color: colors.textMuted, fontWeight: '600' },
        filterCard: {
            padding: Spacing.md,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            gap: 5,
        },
        filterHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
        filterLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: colors.textMuted },
        filterModePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full, backgroundColor: colors.accentLight },
        filterModeText: { fontSize: 10, fontWeight: '700', color: colors.accent },
        filterQuery: { fontSize: FontSize.sm, lineHeight: 19, color: colors.textPrimary, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
        filterMeta: { fontSize: FontSize.xs, color: colors.textMuted },
        unburyBtn: {
            alignItems: 'center',
            minHeight: 48,
            justifyContent: 'center',
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.btnHard,
            backgroundColor: colors.btnHardBg,
        },
        unburyText: { color: colors.btnHard, fontWeight: '700' },
        studyBtn: {
            minHeight: 56,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: Spacing.md,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.accent,
            ...Shadows.md,
        },
        studyBtnIdle: { opacity: 0.82 },
        buttonDisabled: { opacity: 0.45 },
        studyBtnText: { color: colors.white, fontWeight: '700', fontSize: FontSize.lg },
        doneNote: { fontSize: FontSize.sm, lineHeight: 18, color: colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.sm },
        filteredActions: { flexDirection: 'row', gap: Spacing.sm },
        lifecycleBtn: {
            flex: 1,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: BorderRadius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        lifecycleBtnDanger: { borderColor: colors.btnAgain },
        lifecycleBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.accent },
        lifecycleDangerText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.btnAgain },
        secondaryBtn: {
            minHeight: 58,
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
            borderRadius: BorderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
        },
        secondaryText: { color: colors.textPrimary, fontWeight: '700', fontSize: FontSize.md },
        secondaryCaption: { color: colors.textMuted, fontSize: FontSize.xs, marginTop: 3 },
    });
}
