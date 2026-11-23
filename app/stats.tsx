import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Platform, View, ScrollView, useWindowDimensions } from 'react-native';
import { studyDataSettingsKey } from '../lib/studyDataSettings';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';
import { Spacing, useThemeColors } from '../constants/theme';
import { MotionDuration, MotionEasing, NATIVE_DRIVER } from '../constants/motion';
import { createOrSelectDeck } from '../lib/deckManager';
import { useAppSettings, useCollectionInvalidation, useStudyScope } from '../contexts/AppContext';
import DeckPickerModal from '../components/DeckPickerModal';
import ScreenHeader from '../components/ScreenHeader';
import { PullToRefreshIndicator, usePullToRefresh } from '../components/PullToRefresh';
import { Button, HelpButton } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SegmentedControl } from '../components/ui/Choice';
import { LoadingState, Notice } from '../components/ui/Feedback';
import { SelectRow } from '../components/ui/Rows';
import { ChartScrollLockProvider } from '../components/stats/ChartScrollLock';
import TodaySection from '../components/stats/TodaySection';
import ReviewsSection from '../components/stats/ReviewsSection';
import FutureDueSection from '../components/stats/FutureDueSection';
import AnswerButtonsSection from '../components/stats/AnswerButtonsSection';
import CardCountsSection from '../components/stats/CardCountsSection';
import TrueRetentionSection from '../components/stats/TrueRetentionSection';
import IntervalsSection from '../components/stats/IntervalsSection';
import HourlySection from '../components/stats/HourlySection';
import AddedSection from '../components/stats/AddedSection';
import DeckProgressSection from '../components/stats/DeckProgressSection';
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

import { ReadErrorBanner, SectionReadErrorCard } from '../components/ReadErrorBanner';
import { useLiveTodayPlan } from '../hooks/useLiveTodayPlan';
import { describeMissingStatsSections, statsUiGroupFailed, type StatsUiSectionGroup } from '../lib/readErrorState';
import { defaultStatsLayout, getVisibleStatsSections, isStatsLayoutDefault, loadStatsLayout, moveStatsSection, saveStatsLayoutDurably, setStatsLayoutColumns, toggleStatsSectionVisibility } from '../lib/statsLayout';
import { DEFAULT_STATS_SECTION_ORDER } from '../lib/statsLayout';
import { EAGER_STATS_SECTIONS, STATS_SECTION_ESTIMATED_HEIGHTS, type StatsSectionId } from '../lib/statsSectionPriority';
import LazyStatsSection, { StatsSectionPriorityProvider, useStatsSectionPriority } from '../components/stats/LazyStatsSection';
import { StatsEditableCard, StatsLayoutToolbar } from '../components/stats/StatsLayoutEditor';
import ComparisonSection from '../components/stats/ComparisonSection';

type RangeKey = Exclude<StatsRangeKey, 'custom'>;
const RANGE_KEYS: readonly RangeKey[] = ['week', 'month', 'threeMonths', 'year', 'all'];

export default function StatsScreen() {
    const { t, l, locale, localeTag } = useI18n();
    const { width } = useWindowDimensions();
    const isCompact = width < 600;
    const colors = useThemeColors();
    const styles = useMemo(() => createStatsScreenStyles(colors, isCompact), [colors, isCompact]);
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const params = useLocalSearchParams();
    const { settings } = useAppSettings();
    const dataSettingsKey = studyDataSettingsKey(settings);
    const { activeDeckName } = useStudyScope();
    const {
        collectionVersion: dataVersion,
        invalidateCollection: bumpDataVersion,
        getSchedulingRevision,
    } = useCollectionInvalidation();
    const [schedulingRevision, setSchedulingRevision] = useState(() => getSchedulingRevision());
    const [deckPickerVisible, setDeckPickerVisible] = useState(false);
    const [helpVisible, setHelpVisible] = useState(false);
    const [savedLayout, setSavedLayout] = useState(loadStatsLayout);
    const [draftLayout, setDraftLayout] = useState(savedLayout);
    const [editingLayout, setEditingLayout] = useState(false);
    const [layoutSaving, setLayoutSaving] = useState(false);
    const layoutSaveRef = useRef(false);
    const [layoutAnnouncement, setLayoutAnnouncement] = useState('');
    const [comparePrimaryDeck, setComparePrimaryDeck] = useState<string | null | undefined>();
    const [compareBaselineDeck, setCompareBaselineDeck] = useState<string | null | undefined>();
    const [pickerCurrent, setPickerCurrent] = useState<string | null>(null);
    const [pickerSlot, setPickerSlot] = useState<'scope' | 'primary' | 'baseline'>('scope');
    const layout = editingLayout ? draftLayout : savedLayout;
    const visibleSections = useMemo(() => getVisibleStatsSections(layout), [layout]);
    const eagerSections = useMemo(() => new Set<StatsSectionId>(editingLayout ? DEFAULT_STATS_SECTION_ORDER : [...visibleSections.slice(0, 3), ...EAGER_STATS_SECTIONS]), [editingLayout, visibleSections]);
    const priority = useStatsSectionPriority(DEFAULT_STATS_SECTION_ORDER, eagerSections);
    const useTwoColumns = Platform.OS === 'web' && width >= 960 && layout.columns === 2 && !editingLayout;
    const liveTodayPlan = useLiveTodayPlan(settings.dayRolloverHour);
    const saveLayout = async () => {
        if (layoutSaveRef.current) return;
        layoutSaveRef.current = true; setLayoutSaving(true);
        try {
            if (!await saveStatsLayoutDurably(draftLayout)) { setLayoutAnnouncement(l('Düzen kaydedilemedi. Tekrar deneyin.', 'Layout could not be saved. Try again.')); return; }
            setSavedLayout(draftLayout); setEditingLayout(false); setLayoutAnnouncement('');
        } finally { layoutSaveRef.current = false; setLayoutSaving(false); }
    };
    // Anki's statistics open on a year of history; a deck opened from the Decks list below keeps
    // the period the learner was looking at.
    const [rangeKey, setRangeKey] = useState<RangeKey>(() => (
        RANGE_KEYS.find((key) => key === params.range) ?? 'year'
    ));
    // Scrolling pauses while a finger slides sideways across one of the charts.
    const [scrollLocked, setScrollLocked] = useState(false);
    const scrollRef = useRef<ScrollView>(null);
    // Bumped by pull-to-refresh: a new snapshot key reads the statistics from the collection again.
    const [refreshNonce, setRefreshNonce] = useState(0);

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
        [rangeKey, settings.dayRolloverHour, dataVersion, schedulingRevision, refreshNonce],
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
        dataSettingsKey,
        refreshNonce,
    ]), [dataVersion, schedulingRevision, deckScope, statsRange, localeTag, dataSettingsKey, refreshNonce]);
    const loadStatsSnapshot = useCallback(() => ({ data: getStatsScreenSnapshot({
        deckName: deckScope,
        range: statsRange,
        settings,
        localeTag,
    }), scopeTitle, rangeTitle }), [deckScope, statsRange, settings, localeTag, scopeTitle, rangeTitle]);
    // Reading a long review log takes a moment: the screen shows its loading state, or the new
    // period or deck over dimmed cards, before the read starts.
    const { snapshot: loadedSnapshot, loading, error, retry: retrySnapshot } = useDeferredScreenSnapshot(statsSnapshotKey, loadStatsSnapshot, {
        showLoadingFirst: true,
        keepPreviousOnError: true,
        shouldCache: (built) => built.data.failedSections.length === 0,
    });
    const snapshot = loadedSnapshot?.data ?? null;
    const displayedScope = snapshot ? snapshot.scopeDeckName : deckScope;
    const displayedRange = snapshot?.scopeRange ?? statsRange;
    const displayedRangeTitle = loadedSnapshot?.rangeTitle ?? rangeTitle;
    const displayedScopeLabel = `${loadedSnapshot?.scopeTitle ?? scopeTitle} · ${displayedRangeTitle}`;
    const failedSections = snapshot?.failedSections ?? [];
    const isStaleScope = Boolean(loadedSnapshot && (displayedScope !== deckScope || displayedRangeTitle !== rangeTitle));
    const retry = () => { setRefreshNonce((value) => value + 1); retrySnapshot(); };
    const pull = usePullToRefresh({
        scrollRef,
        busy: loading,
        enabled: !scrollLocked,
        onScroll: priority.onScroll,
        labels: {
            refreshing: l('İstatistikleriniz yenileniyor…', 'Refreshing your statistics…'),
            done: l('İstatistikleriniz güncel', 'Your statistics are up to date'),
        },
        onRefresh: () => {
            setSchedulingRevision(getSchedulingRevision());
            setRefreshNonce((value) => value + 1);
        },
    });
    const reviewDays = snapshot?.reviewDays ?? [];
    const addedDays = snapshot?.addedDays ?? [];
    const reviewSpan = rangeStudyDays(displayedRange, settings.dayRolloverHour, reviewDays[0]?.day ?? null);
    const addedSpan = rangeStudyDays(displayedRange, settings.dayRolloverHour, addedDays[0]?.day ?? null);
    const deckPickerItems = useMemo(
        () => deckPickerVisible
            ? [...(snapshot?.decks ?? [])].sort((a, b) => a.name.localeCompare(b.name, localeTag))
            : [],
        [deckPickerVisible, snapshot?.decks, localeTag],
    );

    // The cards fade in once, then dim softly while a new deck or period loads in place of
    // jumping to a spinner, so the page never reflows under the finger. Both ease out: the
    // change shows at once and settles gently.
    const opacity = useRef(new Animated.Value(0)).current;
    const hasSnapshot = snapshot !== null;
    useEffect(() => {
        Animated.timing(opacity, {
            toValue: !hasSnapshot ? 0 : loading ? 0.55 : 1,
            duration: loading ? 120 : MotionDuration.fade,
            easing: MotionEasing.out,
            useNativeDriver: NATIVE_DRIVER,
            isInteraction: false,
        }).start();
    }, [opacity, hasSnapshot, loading]);

    const handlePickDeck = (name: string | null) => {
        setDeckPickerVisible(false);
        if (pickerSlot === 'primary') setComparePrimaryDeck(name);
        else if (pickerSlot === 'baseline') setCompareBaselineDeck(name);
        else { setDeckScope(name); setComparePrimaryDeck(undefined); setCompareBaselineDeck(undefined); }
    };

    // A deck tapped in the Decks list below opens as a page of its own, so the back swipe returns
    // here, to the same place on this page, instead of leaving Statistics.
    const openDeckStats = (name: string) => {
        router.push({ pathname: '/stats', params: { deck: name, range: rangeKey } } as any);
    };
    const backToStats = useNavigationState((state) => state?.routes[state.index - 1]?.name === 'stats');

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
        let deck = displayedScope;
        // A filtered deck owns no cards; only its own scope lists exactly the cards counted here.
        if (snapshot?.filteredScopeCardIds === undefined) {
            try {
                deck = commonDeckAncestor(getAddedCardDeckNames(displayedScope, firstDay, lastDay, rolloverHour)) ?? displayedScope;
            } catch (pickError) {
                console.warn('[Stats] added card decks failed:', pickError);
            }
        }
        const initialSearch = addedSearchForDays(firstDay, lastDay, localDayNumber(Date.now(), rolloverHour));
        router.push({ pathname: '/browser', params: deck ? { deck, initialSearch } : { initialSearch } } as any);
    };

    const sectionTitle = (id: StatsSectionId) => ({ today: l('Bugün', 'Today'), reviews: l('Tekrarlar', 'Reviews'), comparison: l('Karşılaştırma', 'Comparison'), futureDue: l('Gelecek tekrarlar', 'Future reviews'), answerButtons: l('Cevap düğmeleri', 'Answer buttons'), trueRetention: l('Gerçek hatırlama', 'True retention'), cardCounts: l('Kart sayıları', 'Card counts'), intervals: l('Aralıklar', 'Intervals'), hourly: l('Saatlik', 'Hourly'), added: l('Eklenenler', 'Added'), deckProgress: displayedScope ? l('Alt desteler', 'Subdecks') : l('Desteler', 'Decks') })[id];
    const renderSection = (id: StatsSectionId) => {
        if (!snapshot) return null;
        const groups: Partial<Record<StatsSectionId, StatsUiSectionGroup>> = { today: 'today', reviews: 'reviews', futureDue: 'ankiGraphs', answerButtons: 'ankiGraphs', trueRetention: 'ankiGraphs', cardCounts: 'ankiGraphs', intervals: 'ankiGraphs', hourly: 'hours', added: 'added', deckProgress: 'deckProgress' };
        if (groups[id] && statsUiGroupFailed(failedSections, groups[id]!)) return <SectionReadErrorCard title={sectionTitle(id)} message={l('Bu bölüm okunamadı.', 'This section could not be read.')} retryLabel={l('Tekrar dene', 'Try again')} onRetry={retry} />;
        return <LazyStatsSection id={id} title={sectionTitle(id)} estimatedHeight={STATS_SECTION_ESTIMATED_HEIGHTS[id]} eager={eagerSections.has(id)}>{() => {
            switch (id) {
                case 'today': return <TodaySection today={snapshot.todayStats} todayPlan={liveTodayPlan ?? snapshot.todayPlan} todayPlanFailed={!liveTodayPlan && failedSections.includes('todayPlan')} streak={snapshot.streak} rolloverHour={settings.dayRolloverHour} dataVersion={dataVersion + schedulingRevision} currentWeekStudiedDays={snapshot.currentWeekStudiedDays} />;
                case 'reviews': return <ReviewsSection reviewDays={reviewDays} firstDay={reviewSpan.firstDay} lastDay={reviewSpan.lastDay} rangeTitle={displayedRangeTitle} />;
                case 'comparison': return <ComparisonSection deckScope={displayedScope} statsRange={displayedRange} rangeTitle={displayedRangeTitle} decks={snapshot.decks} settings={settings} dataRevision={dataVersion + schedulingRevision} retryNonce={refreshNonce} filteredScopeCardIds={snapshot.filteredScopeCardIds} comparePrimaryDeck={comparePrimaryDeck} compareBaselineDeck={compareBaselineDeck} onRequestPickDeck={(slot, current) => { setPickerCurrent(current); setPickerSlot(slot); setDeckPickerVisible(true); }} />;
                case 'futureDue': return <FutureDueSection stats={snapshot.ankiStats} />;
                case 'answerButtons': return <AnswerButtonsSection buttons={snapshot.ankiStats.answerButtons} />;
                case 'trueRetention': return <TrueRetentionSection table={snapshot.ankiStats.trueRetention} />;
                case 'cardCounts': return <CardCountsSection counts={snapshot.ankiStats.cardCounts} />;
                case 'intervals': return <IntervalsSection stats={snapshot.ankiStats} rangeTitle={displayedRangeTitle} />;
                case 'hourly': return <HourlySection hours={snapshot.hours} rangeTitle={displayedRangeTitle} />;
                case 'added': return <AddedSection addedDays={addedDays} firstDay={addedSpan.firstDay} lastDay={addedSpan.lastDay} rangeTitle={displayedRangeTitle} onOpenCards={openAddedCards} />;
                case 'deckProgress': return <DeckProgressSection title={sectionTitle(id)} decks={snapshot.deckStats} onSelectDeck={openDeckStats} />;
            }
        }}</LazyStatsSection>;
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={t('common.statistics')}
                backAccessibilityLabel={backToStats
                    ? l('İstatistiklere dön', 'Back to statistics')
                    : deckScope ? l('Deste genel bakışına dön', 'Back to deck overview') : l('Destelere dön', 'Back to decks')}
                onBack={handleBack}
                actions={(
                    <>
                    <Button variant="plain" size="compact" label={l('Düzenle', 'Edit')} onPress={() => { if (layoutSaveRef.current) return; setDraftLayout(savedLayout); setEditingLayout((v) => !v); }} />
                    <HelpButton
                        accessibilityLabel={l('İstatistikler hakkında', 'About statistics')}
                        onPress={() => setHelpVisible(true)}
                        expanded={helpVisible}
                    />
                    </>
                )}
            />
            <ChartScrollLockProvider value={setScrollLocked}>
            <StatsSectionPriorityProvider value={priority.contextValue}>
            <View style={styles.scrollFrame}>
            <Animated.ScrollView
                ref={scrollRef}
                {...pull.scrollProps}
                onLayout={priority.onScrollViewLayout}
                scrollEventThrottle={16}
                style={styles.scroll}
                scrollEnabled={!scrollLocked}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, useTwoColumns && { maxWidth: 1200 }, { paddingBottom: insets.bottom + Spacing.xxxl }]}
            >
                <View style={styles.filters}>
                    <Card>
                        <SelectRow
                            label={l('Deste', 'Deck')}
                            value={scopeTitle}
                            onPress={() => { setPickerSlot('scope'); setDeckPickerVisible(true); }}
                            accessibilityLabel={l(`İstatistik destesi: ${scopeTitle}`, `Statistics deck: ${scopeTitle}`)}
                            expanded={deckPickerVisible}
                        />
                    </Card>
                    <SegmentedControl
                        fill
                        options={rangeOptions.map(({ value, label, title }) => ({ value, label, accessibilityLabel: title }))}
                        value={rangeKey}
                        onChange={setRangeKey}
                        accessibilityLabel={l('Zaman aralığı', 'Time range')}
                    />
                </View>

                {error ? <ReadErrorBanner title={l('İstatistikler okunamadı.', 'Statistics could not be read.')} detail={snapshot ? l(`Son geçerli veriler: ${displayedScopeLabel}`, `Last valid data: ${displayedScopeLabel}`) : undefined} retryLabel={l('Tekrar dene', 'Try again')} onRetry={retry} /> : null}
                {isStaleScope ? <ReadErrorBanner tone="info" title={l(`Gösterilen: ${displayedScopeLabel}`, `Showing: ${displayedScopeLabel}`)} /> : null}
                {failedSections.length ? <ReadErrorBanner title={l('Bazı bölümler okunamadı.', 'Some sections could not be read.')} detail={describeMissingStatsSections(failedSections, locale).join(', ')} retryLabel={l('Tekrar dene', 'Try again')} onRetry={retry} /> : null}
                {editingLayout ? <StatsLayoutToolbar canChooseColumns={Platform.OS === 'web' && width >= 960} columns={draftLayout.columns} onChangeColumns={(columns) => { if (!layoutSaveRef.current) setDraftLayout((v) => setStatsLayoutColumns(v, columns)); }} canReset={!isStatsLayoutDefault(draftLayout)} onReset={() => { if (!layoutSaveRef.current) setDraftLayout(defaultStatsLayout()); }} onCancel={() => { if (!layoutSaveRef.current) setEditingLayout(false); }} onSave={saveLayout} announcement={layoutAnnouncement} saving={layoutSaving} /> : null}
                {!snapshot ? (!error ? <LoadingState delayed style={styles.loadState} label={t('common.loading')} /> : null) : <Animated.View onLayout={priority.onBodyLayout} style={[styles.body, { opacity }, useTwoColumns && { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }]} accessibilityState={{ busy: loading }}>
                    {(editingLayout ? layout.order : visibleSections).map((id, index) => <View key={id} style={useTwoColumns ? { width: '48.8%' } : undefined} onLayout={(event) => priority.contextValue.registerSectionY(id, event.nativeEvent.layout.y)}>
                        {editingLayout ? <StatsEditableCard title={sectionTitle(id)} index={index} total={layout.order.length} hidden={layout.hidden.includes(id)} canHide={visibleSections.length > 1} onMoveUp={() => { if (!layoutSaveRef.current) setDraftLayout((v) => moveStatsSection(v, id, -1)); }} onMoveDown={() => { if (!layoutSaveRef.current) setDraftLayout((v) => moveStatsSection(v, id, 1)); }} onToggleVisible={() => { if (!layoutSaveRef.current) setDraftLayout((v) => toggleStatsSectionVisibility(v, id)); }}>{renderSection(id)}</StatsEditableCard> : renderSection(id)}
                    </View>)}
                </Animated.View>}

            </Animated.ScrollView>
            <PullToRefreshIndicator binding={pull} />
            </View>
            </StatsSectionPriorityProvider>
            </ChartScrollLockProvider>

            {deckPickerVisible && <DeckPickerModal
                visible={deckPickerVisible}
                colors={colors}
                decks={deckPickerItems}
                selectedDeckName={pickerSlot === 'scope' ? deckScope : pickerCurrent}
                activeDeckName={deckScope || activeDeckName || null}
                title={l('Deste seç', 'Select Deck')}
                allDecksLabel={l('Tüm koleksiyon', 'Whole Collection')}
                searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                emptySearchLabel={l('Aramanızla eşleşen deste yok. Kelimelerin başını yazın; örneğin “farm”.', 'No decks match your search. Type the start of a word, for example “anat”.')}
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
