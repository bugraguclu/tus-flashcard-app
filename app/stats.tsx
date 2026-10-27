import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '../constants/theme';
import { createOrSelectDeck } from '../lib/deckManager';
import { useAppSettings, useCollectionInvalidation, useStudyScope } from '../contexts/AppContext';
import DeckPickerModal from '../components/DeckPickerModal';
import HeaderBackIcon from '../components/HeaderBackIcon';
import { ChartScrollLockProvider } from '../components/stats/ChartScrollLock';
import TodaySection from '../components/stats/TodaySection';
import ReviewsSection from '../components/stats/ReviewsSection';
import FutureDueSection from '../components/stats/FutureDueSection';
import AnswerButtonsSection from '../components/stats/AnswerButtonsSection';
import CardCountsSection from '../components/stats/CardCountsSection';
import IntervalsSection from '../components/stats/IntervalsSection';
import HourlySection from '../components/stats/HourlySection';
import AddedSection from '../components/stats/AddedSection';
import DeckProgressSection from '../components/stats/DeckProgressSection';
import StatsSegmented from '../components/stats/StatsSegmented';
import StatsHelpSheet from '../components/stats/StatsHelpSheet';
import { createStatsScreenStyles } from '../components/stats/statsScreenStyles';
import { useI18n } from '../hooks/useI18n';
import { getAddedCardDeckNames, rangeStudyDays, resolveStatsDateRange, type StatsRangeKey } from '../lib/ankiStats';
import { localDayNumber } from '../lib/ankiState';
import { commonDeckAncestor } from '../lib/deckNavigation';
import { addedSearchForDays } from '../lib/statsSeries';
import { useRouteDeckScope } from '../hooks/useRouteDeckScope';
import { useDeferredScreenSnapshot } from '../hooks/useDeferredScreenSnapshot';
import { getStatsScreenSnapshot } from '../lib/screenSnapshots';

type RangeKey = Exclude<StatsRangeKey, 'custom'>;

export default function StatsScreen() {
    const { t, l, localeTag } = useI18n();
    const { width } = useWindowDimensions();
    const isCompact = width < 600;
    const colors = useThemeColors();
    const styles = useMemo(() => createStatsScreenStyles(colors, isCompact), [colors, isCompact]);
    const router = useRouter();
    const params = useLocalSearchParams();
    const { settings } = useAppSettings();
    const { activeDeckName } = useStudyScope();
    const {
        collectionVersion: dataVersion,
        invalidateCollection: bumpDataVersion,
        getSchedulingRevision,
    } = useCollectionInvalidation();
    const [schedulingRevision, setSchedulingRevision] = useState(() => getSchedulingRevision());
    const [deckPickerVisible, setDeckPickerVisible] = useState(false);
    const [helpVisible, setHelpVisible] = useState(false);
    // Anki's statistics open on a year of history.
    const [rangeKey, setRangeKey] = useState<RangeKey>('year');
    // Scrolling pauses while a finger slides sideways across one of the charts.
    const [scrollLocked, setScrollLocked] = useState(false);
    const scrollRef = useRef<ScrollView>(null);

    useFocusEffect(useCallback(() => {
        setSchedulingRevision(getSchedulingRevision());
    }, [getSchedulingRevision]));

    // The route establishes the entry/deep-link scope. Further deck choices are filters on this
    // screen, so keep them local and preserve the range instead of navigating again.
    const routeDeckScope = typeof params.deck === 'string' && params.deck.length > 0 ? params.deck : null;
    const [deckScope, setDeckScope] = useRouteDeckScope(routeDeckScope);
    const scopeTitle = deckScope
        ? deckScope.replaceAll('::', ' › ')
        : l('Tüm koleksiyon', 'Whole Collection');

    const rangeOptions = [
        { value: 'week' as const, label: l('Hafta', 'Week'), title: l('Son hafta', 'Last week') },
        { value: 'month' as const, label: l('Ay', 'Month'), title: l('Son ay', 'Last month') },
        { value: 'threeMonths' as const, label: l('3 Ay', '3 Mo'), title: l('Son 3 ay', 'Last 3 months') },
        { value: 'year' as const, label: l('Yıl', 'Year'), title: l('Son 1 yıl', 'Last year') },
        { value: 'all' as const, label: l('Tümü', 'All'), title: l('Tüm zamanlar', 'All time') },
    ];
    const rangeTitle = rangeOptions.find((option) => option.value === rangeKey)?.title ?? '';

    // Recomputed with the data version so a range that ends "today" still means today after the
    // screen has been left open across a study session or a rollover.
    const statsRange = useMemo(
        () => resolveStatsDateRange(rangeKey, new Date(), new Date(), settings.dayRolloverHour),
        [rangeKey, settings.dayRolloverHour, dataVersion, schedulingRevision],
    );

    const statsSnapshotKey = useMemo(() => JSON.stringify([
        'stats',
        dataVersion,
        schedulingRevision,
        deckScope,
        statsRange.startMs,
        statsRange.endMs,
        statsRange.spanDays,
        localeTag,
        settings,
    ]), [dataVersion, schedulingRevision, deckScope, statsRange, localeTag, settings]);
    const loadStatsSnapshot = useCallback(() => getStatsScreenSnapshot({
        deckName: deckScope,
        range: statsRange,
        settings,
        localeTag,
    }), [deckScope, statsRange, settings, localeTag]);
    const { snapshot, loading, error } = useDeferredScreenSnapshot(statsSnapshotKey, loadStatsSnapshot);
    const reviewDays = snapshot?.reviewDays ?? [];
    const addedDays = snapshot?.addedDays ?? [];
    const reviewSpan = rangeStudyDays(statsRange, settings.dayRolloverHour, reviewDays[0]?.day ?? null);
    const addedSpan = rangeStudyDays(statsRange, settings.dayRolloverHour, addedDays[0]?.day ?? null);
    const deckPickerItems = useMemo(
        () => deckPickerVisible
            ? [...(snapshot?.decks ?? [])].sort((a, b) => a.name.localeCompare(b.name, localeTag))
            : [],
        [deckPickerVisible, snapshot?.decks, localeTag],
    );

    // The cards fade in once, then dim softly while a new deck or period loads in place of
    // jumping to a spinner, so the page never reflows under the finger.
    const opacity = useRef(new Animated.Value(0)).current;
    const hasSnapshot = snapshot !== null;
    useEffect(() => {
        Animated.timing(opacity, {
            toValue: !hasSnapshot ? 0 : loading ? 0.55 : 1,
            duration: loading ? 120 : 220,
            useNativeDriver: true,
        }).start();
    }, [opacity, hasSnapshot, loading]);

    const handlePickDeck = (name: string | null) => {
        setDeckPickerVisible(false);
        setDeckScope(name);
    };

    const handleBack = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        if (routeDeckScope) {
            router.replace(`/deck-overview?deck=${encodeURIComponent(routeDeckScope)}` as any);
            return;
        }
        router.replace('/decks' as any);
    };

    /**
     * Anki links a bar of the Added graph to a browser search for its cards. The browser opens in
     * the deck those cards went into when they share one, and in this screen's scope otherwise.
     */
    const openAddedCards = (firstDay: number, lastDay: number) => {
        const rolloverHour = settings.dayRolloverHour;
        let deck = deckScope;
        // A filtered deck owns no cards; only its own scope lists exactly the cards counted here.
        if (snapshot?.filteredScopeCardIds === undefined) {
            try {
                deck = commonDeckAncestor(getAddedCardDeckNames(deckScope, firstDay, lastDay, rolloverHour)) ?? deckScope;
            } catch (pickError) {
                console.warn('[Stats] added card decks failed:', pickError);
            }
        }
        const initialSearch = addedSearchForDays(firstDay, lastDay, localDayNumber(Date.now(), rolloverHour));
        router.push({ pathname: '/browser', params: deck ? { deck, initialSearch } : { initialSearch } } as any);
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.screenHeader}>
                <TouchableOpacity
                    style={styles.headerButton}
                    onPress={handleBack}
                    hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={deckScope ? l('Deste genel bakışına dön', 'Back to deck overview') : l('Destelere dön', 'Back to decks')}
                >
                    <HeaderBackIcon color={colors.accent} />
                </TouchableOpacity>
                <Text style={styles.screenTitle} numberOfLines={1} accessibilityRole="header">{t('common.statistics')}</Text>
                <TouchableOpacity
                    style={styles.headerButton}
                    onPress={() => setHelpVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel={l('İstatistikler hakkında', 'About statistics')}
                    accessibilityState={{ expanded: helpVisible }}
                >
                    <View style={styles.infoGlyph}><Text style={styles.infoGlyphText}>i</Text></View>
                </TouchableOpacity>
            </View>
            <ChartScrollLockProvider value={setScrollLocked}>
            <ScrollView
                ref={scrollRef}
                scrollEnabled={!scrollLocked}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                <View style={styles.filters}>
                    <TouchableOpacity
                        style={styles.deckSelector}
                        onPress={() => setDeckPickerVisible(true)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={l(`İstatistik destesi: ${scopeTitle}`, `Statistics deck: ${scopeTitle}`)}
                        accessibilityState={{ expanded: deckPickerVisible }}
                    >
                        <Text style={styles.deckSelectorLabel}>{l('Deste', 'Deck')}</Text>
                        <Text style={styles.deckSelectorText} numberOfLines={1}>{scopeTitle}</Text>
                        <Text style={styles.deckSelectorCaret}>⌄</Text>
                    </TouchableOpacity>
                    <StatsSegmented
                        fill
                        options={rangeOptions.map(({ value, label, title }) => ({ value, label, accessibilityLabel: title }))}
                        value={rangeKey}
                        onChange={setRangeKey}
                        accessibilityLabel={l('Zaman aralığı', 'Time range')}
                    />
                </View>

                {!snapshot ? (
                    <View style={styles.loadState} accessible>
                        {error ? null : <ActivityIndicator color={colors.accent} />}
                        <Text style={styles.loadText}>
                            {error ? l('İstatistikler yüklenemedi.', 'Statistics could not be loaded.') : t('common.loading')}
                        </Text>
                    </View>
                ) : (
                    <Animated.View style={[styles.body, { opacity }]} accessibilityState={{ busy: loading }}>
                        <TodaySection
                            today={snapshot.todayStats}
                            streak={snapshot.streak}
                            rolloverHour={settings.dayRolloverHour}
                            dataVersion={dataVersion + schedulingRevision}
                            currentWeekStudiedDays={snapshot.currentWeekStudiedDays}
                        />
                        <ReviewsSection
                            reviewDays={reviewDays}
                            firstDay={reviewSpan.firstDay}
                            lastDay={reviewSpan.lastDay}
                            rangeTitle={rangeTitle}
                        />
                        <FutureDueSection stats={snapshot.ankiStats} />
                        <AnswerButtonsSection buttons={snapshot.ankiStats.answerButtons} />
                        <CardCountsSection counts={snapshot.ankiStats.cardCounts} />
                        <IntervalsSection stats={snapshot.ankiStats} rangeTitle={rangeTitle} />
                        <HourlySection hours={snapshot.hours} rangeTitle={rangeTitle} />
                        <AddedSection
                            addedDays={addedDays}
                            firstDay={addedSpan.firstDay}
                            lastDay={addedSpan.lastDay}
                            rangeTitle={rangeTitle}
                            onOpenCards={openAddedCards}
                        />
                        <DeckProgressSection
                            title={deckScope ? l('Alt desteler', 'Subdecks') : l('Desteler', 'Decks')}
                            decks={snapshot.deckStats}
                            onSelectDeck={(name) => {
                                // The deck was picked from the foot of the page; its figures start at the top.
                                setDeckScope(name);
                                scrollRef.current?.scrollTo({ y: 0, animated: true });
                            }}
                        />
                    </Animated.View>
                )}
            </ScrollView>
            </ChartScrollLockProvider>

            {deckPickerVisible && <DeckPickerModal
                visible={deckPickerVisible}
                colors={colors}
                decks={deckPickerItems}
                selectedDeckName={deckScope}
                activeDeckName={deckScope || activeDeckName || null}
                title={l('Deste seç', 'Select Deck')}
                allDecksLabel={l('Tüm koleksiyon', 'Whole Collection')}
                searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                emptySearchLabel={l('Aramanızla eşleşen deste yok.', 'No decks match your search.')}
                cancelLabel={t('common.cancel')}
                closeAccessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                searchAccessibilityLabel={l('Deste ara', 'Search decks')}
                createAccessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                onClose={() => setDeckPickerVisible(false)}
                onSelect={handlePickDeck}
                onCreateDeck={(name) => {
                    const created = createOrSelectDeck(name);
                    bumpDataVersion();
                    return created.name;
                }}
            />}

            <StatsHelpSheet visible={helpVisible} onClose={() => setHelpVisible(false)} />
        </SafeAreaView>
    );
}
