// Anki-style deck overview, opened from a deck's ••• menu (tapping the deck itself starts study,
// as in AnkiMobile), after custom study creates a session, and from the study calendar. Today's
// counts, the deck description, buried-card count with a manual Unbury, and the
// Study Now button that actually enters the queue.

import { useCallback, useMemo, useState } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    Platform,
    Linking,
} from 'react-native';
import { Text } from '../components/AppText';
import { studyDataSettingsKey } from '../lib/studyDataSettings';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';
import { useAppSettings, useCollectionInvalidation } from '../contexts/AppContext';
import {
    emptyFilteredDeck,
    rebuildFilteredDeck,
    filteredDeckBuiltCount,
    unburyDeck,
    getBuriedKindsForDeck,
} from '../lib/deckManager';
import { FILTERED_SEARCH_ORDER } from '../lib/filteredDeckOptions';
import { getDeckDisplayName } from '../lib/models';
import { deckDescriptionHtml, deckDescriptionRuns } from '../lib/deckDescription';
import { alert, confirm } from '../lib/confirm';
import { chooseUnburyKind, type UnburyKind } from '../lib/unburyChoice';
import { goBackOr } from '../lib/backNavigation';
import { useI18n } from '../hooks/useI18n';
import { filteredOrderLabel, formatCount } from '../lib/i18n';
import CustomStudyModal from '../components/CustomStudyModal';
import FilteredDeckOptionsModal from '../components/FilteredDeckOptionsModal';
import DeckOverflowGlyph from '../components/DeckOverflowGlyph';
import ScreenHeader from '../components/ScreenHeader';
import { Button, IconButton } from '../components/ui/Button';
import { Card, Section } from '../components/ui/Card';
import { Badge } from '../components/ui/Choice';
import { EmptyState, LoadingState } from '../components/ui/Feedback';
import { MoreIcon, RefreshIcon } from '../components/ui/icons';
import { ListRow } from '../components/ui/Rows';
import { Type } from '../components/ui/tokens';
import { useDeferredScreenSnapshot } from '../hooks/useDeferredScreenSnapshot';
import { getDeckOverviewSnapshot } from '../lib/screenSnapshots';

export default function DeckOverviewScreen() {
    const { t, l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();
    const { settings } = useAppSettings();
    const dataSettingsKey = studyDataSettingsKey(settings);
    const {
        collectionVersion: dataVersion,
        invalidateCollection: bumpDataVersion,
        getSchedulingRevision,
    } = useCollectionInvalidation();
    const [refreshToken, setRefreshToken] = useState(0);
    const [customStudyOpen, setCustomStudyOpen] = useState(false);
    const [filterOptionsOpen, setFilterOptionsOpen] = useState(false);
    const [schedulingRevision, setSchedulingRevision] = useState(() => getSchedulingRevision());

    useFocusEffect(useCallback(() => {
        setSchedulingRevision(getSchedulingRevision());
    }, [getSchedulingRevision]));

    const deckName = typeof params.deck === 'string' ? params.deck : '';
    const overviewSnapshotKey = useMemo(() => JSON.stringify([
        'deck-overview',
        deckName,
        dataVersion,
        schedulingRevision,
        refreshToken,
        dataSettingsKey,
    ]), [deckName, dataVersion, schedulingRevision, refreshToken, dataSettingsKey]);
    const loadOverviewSnapshot = useCallback(
        () => getDeckOverviewSnapshot(deckName, settings),
        [deckName, settings],
    );
    const {
        snapshot: overviewSnapshot,
        loading,
        error: overviewError,
    } = useDeferredScreenSnapshot(overviewSnapshotKey, loadOverviewSnapshot);
    const deck = overviewSnapshot?.deck ?? null;
    const queue = overviewSnapshot?.queue ?? null;
    const buriedCount = overviewSnapshot?.buriedCount ?? 0;

    if (!deck) {
        return (
            <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
                <ScreenHeader
                    title={deckName ? getDeckDisplayName(deckName) : l('Deste', 'Deck')}
                    backAccessibilityLabel={t('tabs.backToDecks')}
                    onBack={() => goBackOr(router)}
                />
                <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxxl }]}>
                    {loading ? (
                        <LoadingState label={t('common.loading')} />
                    ) : (
                        <EmptyState
                            icon={overviewError ? undefined : <DeckOverflowGlyph kind="deck" color={colors.textMuted} size={32} />}
                            title={overviewError
                                ? l('Deste özeti yüklenemedi.', 'Deck overview could not be loaded.')
                                : l('Deste bulunamadı.', 'Deck not found.')}
                        />
                    )}
                </ScrollView>
            </SafeAreaView>
        );
    }

    const totalReady = queue ? queue.cards.length : 0;

    const unburyKind = (kind: UnburyKind) => {
        const count = unburyDeck(deck.id, settings.dayRolloverHour, kind);
        bumpDataVersion();
        setRefreshToken((value) => value + 1);
        alert(l('Gömülü kartlar açıldı', 'Cards Unburied'), l(`${count} kart yeniden çalışılabilir.`, `${count} ${count === 1 ? 'card is' : 'cards are'} available to study again.`));
    };

    const handleUnbury = async () => {
        unburyKind(await chooseUnburyKind(getBuriedKindsForDeck(deck.id), l));
    };

    const handleRebuild = () => {
        rebuildFilteredDeck(deck.id);
        const gathered = filteredDeckBuiltCount(deck.id);
        bumpDataVersion();
        setRefreshToken((value) => value + 1);
        alert(l('Deste yeniden oluşturuldu', 'Deck rebuilt'), l(
            `Kartlar kayıtlı arama ve sıralama kurallarıyla yeniden toplandı (${formatCount(gathered, locale)} kart).`,
            `Cards were gathered again using the saved search and sort rules (${formatCount(gathered, locale)} ${gathered === 1 ? 'card' : 'cards'}).`,
        ));
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

    // Anki shows the description as HTML (`Overview._desc`), a filtered deck its fixed
    // explanation; formatting and http(s) links are kept as native text.
    const descriptionRuns = deckDescriptionRuns(deckDescriptionHtml(deck, l(
        'Bu, normal programın dışında çalışmak için özel bir destedir. Kartlar tekrar edildikten sonra kendiliğinden asıl destelerine döner. Bu desteyi deste listesinden silmek kalan tüm kartları asıl destelerine döndürür.',
        'This is a special deck for studying outside of the normal schedule. Cards will be automatically returned to their original decks after you review them. Deleting this deck from the deck list will return all remaining cards to their original deck.',
    )));
    const studyDisabled = Boolean(deck.isFiltered && deck.filteredDeckEmpty);

    // This screen sits on the root stack, above the stack that holds the deck list and the
    // reviewer. Pushing '/' from here opened a second copy of that stack, so leaving study landed
    // on the copy and a back swipe brought this overview back. dismissTo closes this screen and
    // everything above that stack, then opens the reviewer on top of the existing deck list; a
    // reviewer already open there (the iPad sidebar's calendar) takes the deck in place instead.
    const handleStudyNow = () => {
        router.dismissTo({ pathname: '/', params: { deck: deck.name } } as any);
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={getDeckDisplayName(deck.name)}
                backAccessibilityLabel={t('tabs.backToDecks')}
                onBack={() => goBackOr(router)}
                actions={!deck.isFiltered ? (
                    <IconButton
                        onPress={() => router.push(`/deck-options?deckId=${deck.id}` as any)}
                        accessibilityLabel={l('Deste seçenekleri', 'Deck options')}
                    >
                        <MoreIcon color={colors.textMuted} />
                    </IconButton>
                ) : undefined}
            />

            <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxxl }]}>
                <View style={styles.hero}>
                    <View style={[styles.deckIcon, deck.isFiltered && styles.deckIconFiltered]}>
                        <DeckOverflowGlyph
                            kind={deck.isFiltered ? 'filteredDeck' : 'deck'}
                            color={deck.isFiltered ? colors.info : colors.accent}
                            size={26}
                        />
                    </View>
                    <View style={styles.heroText}>
                        <Text style={[Type.label, styles.heroEyebrow]}>{deck.isFiltered ? t('anki.filteredDeck').toLocaleUpperCase() : l('BUGÜNKÜ ÇALIŞMA', 'TODAY’S STUDY')}</Text>
                        <Text style={styles.deckTitle}>{getDeckDisplayName(deck.name)}</Text>
                        {deck.name.includes('::') && (
                            <Text style={[Type.caption, styles.deckPath]}>{deck.name.replaceAll('::', ' › ')}</Text>
                        )}
                    </View>
                </View>

                {descriptionRuns.length > 0 ? (
                    <Section label={l('DESTE AÇIKLAMASI', 'DECK DESCRIPTION')} padded>
                        <Text style={styles.description}>
                            {descriptionRuns.map((run, index) => (
                                <Text
                                    key={index}
                                    style={[
                                        run.bold && styles.descriptionBold,
                                        run.italic && styles.descriptionItalic,
                                        (run.underline || run.href) && styles.descriptionUnderline,
                                        run.href && styles.descriptionLink,
                                    ]}
                                    onPress={run.href ? () => { void Linking.openURL(run.href!); } : undefined}
                                    accessibilityRole={run.href ? 'link' : undefined}
                                >
                                    {run.text}
                                </Text>
                            ))}
                        </Text>
                    </Section>
                ) : null}

                <Card>
                    <View style={styles.counts}>
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
                </Card>

                {deck.isFiltered && (
                    <Section label={l('KAYITLI ARAMA', 'SAVED SEARCH')} padded>
                        <Badge
                            label={deck.reschedule === false ? l('Önizleme', 'Preview') : l('Yeniden zamanla', 'Reschedule')}
                            tone="accent"
                        />
                        <View style={styles.filterCopy}>
                            <Text style={styles.filterQuery}>{deck.searchQuery || l('(boş arama)', '(empty search)')}</Text>
                            <Text style={styles.filterMeta}>
                                {filteredOrderLabel(locale, deck.searchOrder ?? FILTERED_SEARCH_ORDER.due)} · {l(`En fazla ${deck.searchLimit ?? 100} kart`, `Up to ${deck.searchLimit ?? 100} cards`)}
                                {deck.filteredDeckEmpty ? l(' · Şu anda boş', ' · Currently empty') : ''}
                            </Text>
                        </View>
                    </Section>
                )}

                {buriedCount > 0 && (
                    <Button
                        label={`💤 ${l(`${buriedCount} gömülü kartı şimdi aç`, `Unbury ${buriedCount} cards now`)}`}
                        variant="secondary"
                        onPress={() => { void handleUnbury(); }}
                    />
                )}

                <Button
                    label={studyDisabled
                        ? l('Deste boş — yeniden oluşturun', 'Deck is empty — rebuild it')
                        : totalReady > 0
                            ? l(`Şimdi çalış · ${totalReady} kart`, `Study Now · ${totalReady} ${totalReady === 1 ? 'card' : 'cards'}`)
                            : l('Çalışma ekranını aç', 'Open Study Screen')}
                    // With nothing due the study screen is still one tap away, but no longer the call to action.
                    variant={totalReady > 0 ? 'primary' : 'secondary'}
                    onPress={handleStudyNow}
                    disabled={studyDisabled}
                    // Study Now sinks under the finger, as the reviewer's grade buttons do.
                    sink
                />

                {totalReady === 0 && (
                    <Text style={[Type.caption, styles.doneNote]}>
                        {deck.filteredDeckEmpty
                            ? l('Filtre korunuyor. Kartları geri getirmek için “Yeniden oluştur”u kullanın.', 'The filter is preserved. Use Rebuild to gather the cards again.')
                            : l('Bugün için hazır kart yok. Sayaç ve limit ayrıntıları çalışma ekranında.', 'No cards are ready today. Open the study screen for timer and limit details.')}
                    </Text>
                )}

                {deck.isFiltered && (
                    <View style={styles.filteredActions}>
                        <Button
                            label={l('Yeniden oluştur', 'Rebuild')}
                            variant="secondary"
                            icon={<RefreshIcon color={colors.textPrimary} size={18} />}
                            onPress={handleRebuild}
                            style={styles.filteredAction}
                        />
                        <Button
                            label={l('Boşalt', 'Empty')}
                            variant="destructive"
                            onPress={handleEmpty}
                            disabled={totalReady === 0}
                            style={styles.filteredAction}
                        />
                    </View>
                )}

                {/* Each workflow is its own card, as the overview has always drawn them. */}
                {deck.isFiltered ? (
                    <Card>
                        <ListRow
                            title={l('Filtre seçenekleri', 'Filtered Deck Options')}
                            summary={l('Arama, limit, sıralama ve önizleme modu', 'Search, limit, order, and preview mode')}
                            accessibilityHint={l('Arama, limit, sıralama ve önizleme modu', 'Search, limit, order, and preview mode')}
                            onPress={() => setFilterOptionsOpen(true)}
                        />
                    </Card>
                ) : null}
                {!deck.isFiltered ? (
                    <Card>
                        <ListRow
                            title={t('anki.customStudy')}
                            summary={l('Limit artırın, unutulanları seçin veya ileriye çalışın', 'Increase limits, review forgotten cards, or study ahead')}
                            accessibilityHint={l('Limit artırın, unutulanları seçin veya ileriye çalışın', 'Increase limits, review forgotten cards, or study ahead')}
                            onPress={() => setCustomStudyOpen(true)}
                        />
                    </Card>
                ) : null}
                {!deck.isFiltered ? (
                    <Card>
                        <ListRow
                            title={l('Deste seçenekleri', 'Deck Options')}
                            summary={l('Limitler, sıralama, gömme ve ayar grubu', 'Limits, display order, burying, and preset')}
                            accessibilityHint={l('Limitler, sıralama, gömme ve ayar grubu', 'Limits, display order, burying, and preset')}
                            onPress={() => router.push(`/deck-options?deckId=${deck.id}` as any)}
                        />
                    </Card>
                ) : null}
                <Card>
                    <ListRow
                        title={l('Deste istatistikleri', 'Deck Statistics')}
                        summary={l('İlerlemeyi ve tekrar yükünü görüntüleyin', 'View progress and review workload')}
                        accessibilityHint={l('İlerlemeyi ve tekrar yükünü görüntüleyin', 'View progress and review workload')}
                        onPress={() => router.push(`/stats?deck=${encodeURIComponent(deck.name)}` as any)}
                    />
                </Card>
            </ScrollView>

            {/* Kept mounted so the sheet can slide away after it closes. */}
            <CustomStudyModal
                visible={customStudyOpen}
                deck={deck}
                settings={settings}
                onClose={() => setCustomStudyOpen(false)}
                onChanged={() => {
                    bumpDataVersion();
                    setRefreshToken((value) => value + 1);
                }}
                // Anki makes the new session the current deck and shows its overview.
                onSessionCreated={(sessionDeckName) => router.replace(
                    `/deck-overview?deck=${encodeURIComponent(sessionDeckName)}` as any,
                )}
            />
            {filterOptionsOpen && <FilteredDeckOptionsModal
                visible={filterOptionsOpen}
                deck={deck}
                settings={settings}
                onClose={() => setFilterOptionsOpen(false)}
                onSaved={(nextDeckName) => {
                    bumpDataVersion();
                    setRefreshToken((value) => value + 1);
                    if (nextDeckName !== deckName) router.setParams({ deck: nextDeckName } as any);
                }}
            />}
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        // The safe area above the header takes the header's colour; the page scrolls below it.
        container: { flex: 1, backgroundColor: colors.bgCard },
        scroll: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: Spacing.xl, gap: Spacing.md, alignItems: 'stretch' },
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
        deckIconFiltered: { backgroundColor: colors.infoBg, borderColor: colors.info },
        heroText: { flex: 1 },
        heroEyebrow: { color: colors.accent, marginBottom: 3 },
        deckTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: colors.textPrimary },
        deckPath: { color: colors.textMuted, marginTop: 2 },
        description: { fontSize: FontSize.md, color: colors.textSecondary, lineHeight: 21 },
        descriptionBold: { fontWeight: '700' },
        descriptionItalic: { fontStyle: 'italic' },
        descriptionUnderline: { textDecorationLine: 'underline' },
        descriptionLink: { color: colors.accent },
        counts: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: Spacing.xl },
        countBox: { flex: 1, alignItems: 'center', gap: 2 },
        countValue: { fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
        countLabel: { fontSize: FontSize.sm, color: colors.textMuted, fontWeight: '600' },
        filterCopy: { gap: 5 },
        filterQuery: { fontSize: FontSize.sm, lineHeight: 19, color: colors.textPrimary, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
        filterMeta: { fontSize: FontSize.xs, color: colors.textMuted },
        doneNote: { color: colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.sm },
        filteredActions: { flexDirection: 'row', gap: Spacing.sm },
        filteredAction: { flex: 1 },
    });
}
