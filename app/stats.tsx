import { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '../constants/theme';
import { createDeck, getAvailableDeckName } from '../lib/deckManager';
import { useAppSettings, useCollectionInvalidation, useStudyScope } from '../contexts/AppContext';
import WeekStreakStrip from '../components/WeekStreakStrip';
import ClassicStatsBarChart from '../components/stats/ClassicStatsBarChart';
import DeckPickerModal from '../components/DeckPickerModal';
import { ChartScrollLockProvider } from '../components/stats/ChartScrollLock';
import ReviewsSection from '../components/stats/ReviewsSection';
import HourlySection from '../components/stats/HourlySection';
import AddedSection from '../components/stats/AddedSection';
import DeckProgressSection from '../components/stats/DeckProgressSection';
import { useI18n } from '../hooks/useI18n';
import { formatCount } from '../lib/i18n';
import { getAddedCardDeckNames, rangeStudyDays, resolveStatsDateRange, type StatsRangeKey } from '../lib/ankiStats';
import { localDayNumber } from '../lib/ankiState';
import { commonDeckAncestor } from '../lib/deckNavigation';
import { addedSearchForDays } from '../lib/statsSeries';
import { useRouteDeckScope } from '../hooks/useRouteDeckScope';
import { useDeferredScreenSnapshot } from '../hooks/useDeferredScreenSnapshot';
import {
    EMPTY_ANKI_STATS,
    EMPTY_STUDY_STREAK,
    EMPTY_TODAY_STATS,
    getStatsScreenSnapshot,
} from '../lib/screenSnapshots';
import {
    formatDecimal,
    formatIntervalDays,
    formatPartPercent,
    formatPercent,
    formatStudyDuration,
} from '../lib/statsPresentation';
import { createStatsScreenStyles } from '../components/stats/statsScreenStyles';
import StatsRangePicker from '../components/stats/StatsRangePicker';

export default function StatsScreen() {
    const { t, l, locale, localeTag } = useI18n();
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
    const [rangePickerVisible, setRangePickerVisible] = useState(false);
    const [rangeKey, setRangeKey] = useState<StatsRangeKey>('year');
    // Anki's "backlog" checkbox on Future Due, on by default there (BoolKey::FutureDueShowBacklog).
    const [showBacklog, setShowBacklog] = useState(true);
    // Scrolling pauses while a finger slides sideways across one of the charts that can be scrubbed.
    const [scrollLocked, setScrollLocked] = useState(false);
    const scrollRef = useRef<ScrollView>(null);
    const [customStart, setCustomStart] = useState(() => {
        const date = new Date();
        date.setMonth(date.getMonth() - 1);
        return date;
    });
    const [customEnd, setCustomEnd] = useState(() => new Date());

    useFocusEffect(useCallback(() => {
        setSchedulingRevision(getSchedulingRevision());
    }, [getSchedulingRevision]));

    // The route establishes the entry/deep-link scope. Further deck choices are filters on this
    // screen, so keep them local and preserve range/chart controls instead of navigating again.
    const routeDeckScope = typeof params.deck === 'string' && params.deck.length > 0 ? params.deck : null;
    const [deckScope, setDeckScope] = useRouteDeckScope(routeDeckScope);
    const scopeTitle = deckScope
        ? deckScope.replaceAll('::', ' › ')
        : l('Tüm koleksiyon', 'Whole Collection');

    const handlePickDeck = (name: string | null) => {
        setDeckPickerVisible(false);
        setDeckScope(name);
    };

    const rangeTitle = rangeKey === 'week'
        ? l('Son hafta', 'Last Week')
        : rangeKey === 'month'
            ? l('Son ay', 'Last Month')
            : rangeKey === 'threeMonths'
                ? l('Son 3 ay', 'Last 3 Months')
                : rangeKey === 'year'
                    ? l('Son 1 yıl', 'Last Year')
                    : rangeKey === 'custom'
                        ? `${customStart.toLocaleDateString(localeTag, { day: 'numeric', month: 'short' })} – ${customEnd.toLocaleDateString(localeTag, { day: 'numeric', month: 'short' })}`
                        : l('Tüm zamanlar', 'All Time');

    // Recomputed with the data version so a range that ends "today" still means today after the
    // screen has been left open across a study session or a rollover.
    const statsRange = useMemo(
        () => resolveStatsDateRange(rangeKey, customStart, customEnd, settings.dayRolloverHour),
        [rangeKey, customStart, customEnd, settings.dayRolloverHour, dataVersion, schedulingRevision],
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
    const {
        snapshot: statsSnapshot,
        loading,
        error: statsError,
    } = useDeferredScreenSnapshot(statsSnapshotKey, loadStatsSnapshot);
    const ankiStats = statsSnapshot?.ankiStats ?? EMPTY_ANKI_STATS;
    const todayStats = statsSnapshot?.todayStats ?? EMPTY_TODAY_STATS;
    const streak = statsSnapshot?.streak ?? EMPTY_STUDY_STREAK;
    const deckStats = statsSnapshot?.deckStats ?? [];
    const reviewDays = statsSnapshot?.reviewDays ?? [];
    const addedDays = statsSnapshot?.addedDays ?? [];
    const reviewSpan = rangeStudyDays(statsRange, settings.dayRolloverHour, reviewDays[0]?.day ?? null);
    const addedSpan = rangeStudyDays(statsRange, settings.dayRolloverHour, addedDays[0]?.day ?? null);
    const deckPickerItems = useMemo(
        () => deckPickerVisible
            ? [...(statsSnapshot?.decks ?? [])].sort((a, b) => a.name.localeCompare(b.name, localeTag))
            : [],
        [deckPickerVisible, statsSnapshot?.decks, localeTag],
    );

    /** Share of answers that were not "Again", per card type (Anki's "correct" figure). */
    const correctShares = useMemo(() => {
        const categories = [
            { key: 'learning' as const, label: l('Öğrenme kartlarında doğru', 'Correct on learning cards') },
            { key: 'young' as const, label: l('Genç kartlarda doğru', 'Correct on young cards') },
            { key: 'mature' as const, label: l('Olgun kartlarda doğru', 'Correct on mature cards') },
        ];
        return categories.map(({ key, label }) => {
            const total = ankiStats.answerButtons.reduce((sum, point) => sum + point[key], 0);
            const again = ankiStats.answerButtons.find((point) => point.ease === 1)?.[key] ?? 0;
            return {
                label,
                total,
                percent: total > 0 ? Math.round(((total - again) / total) * 100) : 0,
            };
        });
    }, [ankiStats.answerButtons, l]);

    const answerButtonPoints = useMemo(() => ankiStats.answerButtons.map((point) => ({
        label: point.ease === 1
            ? l('Tekrar', 'Again')
            : point.ease === 2
                ? l('Zor', 'Hard')
                : point.ease === 3
                    ? l('İyi', 'Good')
                    : l('Kolay', 'Easy'),
        values: [point.learning, point.young, point.mature],
    })), [ankiStats.answerButtons, l]);
    const answerTotal = answerButtonPoints.reduce(
        (sum, point) => sum + point.values.reduce((pointSum, value) => pointSum + value, 0),
        0,
    );

    const cardCountRows = useMemo(() => ([
        { key: 'mature', label: l('Olgun', 'Mature'), count: ankiStats.cardCounts.mature, color: colors.badgeReview },
        { key: 'youngLearn', label: l('Genç + Öğrenme', 'Young + Learn'), count: ankiStats.cardCounts.youngLearn, color: colors.badgeLearn },
        { key: 'unseen', label: l('Görülmemiş', 'Unseen'), count: ankiStats.cardCounts.unseen, color: colors.badgeNew },
        { key: 'suspendedBuried', label: l('Askıda + Gömülü', 'Suspended + Buried'), count: ankiStats.cardCounts.suspendedBuried, color: colors.textMuted },
    ]), [ankiStats.cardCounts, colors, l]);

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
        if (statsSnapshot?.filteredScopeCardIds === undefined) {
            try {
                deck = commonDeckAncestor(getAddedCardDeckNames(deckScope, firstDay, lastDay, rolloverHour)) ?? deckScope;
            } catch (error) {
                console.warn('[Stats] added card decks failed:', error);
            }
        }
        const initialSearch = addedSearchForDays(firstDay, lastDay, localDayNumber(Date.now(), rolloverHour));
        router.push({ pathname: '/browser', params: deck ? { deck, initialSearch } : { initialSearch } } as any);
    };

    const accuracy = todayStats.reviewed > 0
        ? Math.round((todayStats.passed / todayStats.reviewed) * 100)
        : 0;
    const countValue = (value: number) => formatCount(Math.round(value), locale);
    const percentValue = (value: number) => formatPercent(value, locale);
    const chartInteractionHint = l(
        'Ayrıntıyı sabitlemek için bir sütuna dokunun; kapatmak için yeniden dokunun.',
        'Tap a bar to pin its details; tap it again to close.',
    );
    const chartEmptyHint = l(
        'Başka bir deste veya zaman aralığı seçerek tekrar deneyin.',
        'Try another deck or time range.',
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.screenHeader}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={handleBack}
                    hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={deckScope ? l('Deste genel bakışına dön', 'Back to deck overview') : l('Destelere dön', 'Back to decks')}
                >
                    <Text style={styles.backButtonText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.screenTitle} numberOfLines={1}>{t('common.statistics')}</Text>
                <View style={styles.headerSpacer} />
            </View>
            <ChartScrollLockProvider value={setScrollLocked}>
            <ScrollView
                ref={scrollRef}
                scrollEnabled={!scrollLocked}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                <View style={styles.selectorsRow}>
                    <TouchableOpacity
                        style={styles.scopeSelector}
                        onPress={() => setDeckPickerVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={l(`İstatistik destesi: ${scopeTitle}`, `Statistics deck: ${scopeTitle}`)}
                        accessibilityState={{ expanded: deckPickerVisible }}
                    >
                        <Text style={styles.scopeSelectorText} numberOfLines={1}>{scopeTitle}</Text>
                        <Text style={styles.scopeSelectorCaret}>▾</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.scopeSelector}
                        onPress={() => setRangePickerVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={l(`İstatistik zaman aralığı: ${rangeTitle}`, `Statistics time range: ${rangeTitle}`)}
                        accessibilityState={{ expanded: rangePickerVisible }}
                    >
                        <Text style={styles.scopeSelectorText} numberOfLines={1}>{rangeTitle}</Text>
                        <Text style={styles.scopeSelectorCaret}>▾</Text>
                    </TouchableOpacity>
                </View>
                {(loading || Boolean(statsError)) && (
                    <View style={[styles.inlineLoadState, { pointerEvents: 'none' }]} accessible>
                        <Text style={styles.inlineLoadIcon}>{statsError ? '!' : '📊'}</Text>
                        <Text style={styles.inlineLoadText}>
                            {statsError
                                ? l('İstatistikler yüklenemedi.', 'Statistics could not be loaded.')
                                : t('common.loading')}
                        </Text>
                    </View>
                )}
                {statsSnapshot && (
                <>
                <View style={styles.todayCard}>
                    <View style={styles.cardHeaderRow}>
                        <View>
                            <Text style={styles.sectionTitle}>{l('Bugünün özeti', 'Today')}</Text>
                            <Text style={styles.cardEyebrow}>{l('Zaman aralığından bağımsız', 'Independent of time range')}</Text>
                        </View>
                        <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveBadgeText}>{l('Bugün', 'Today')}</Text></View>
                    </View>
                    <View style={styles.todayGrid}>
                        <View style={styles.todayStat}>
                            <Text style={styles.todayNumber}>{countValue(todayStats.reviewed)}</Text>
                            <Text style={styles.todayLabel}>{l('Yanıtlanan', 'Reviews')}</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={[styles.todayNumber, { color: colors.btnGood }]}>{todayStats.reviewed > 0 ? percentValue(accuracy) : '—'}</Text>
                            <Text style={styles.todayLabel}>{l('Doğruluk', 'Accuracy')}</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={styles.todayNumberCompact}>{formatStudyDuration(todayStats.studyTimeMs, locale)}</Text>
                            <Text style={styles.todayLabel}>{l('Çalışma süresi', 'Study time')}</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={[styles.todayNumber, { color: colors.badgeNew }]}>{countValue(todayStats.newCardsIntroduced)}</Text>
                            <Text style={styles.todayLabel}>{l('Yeni kart', 'New Cards')}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.streakCard}>
                    <View style={styles.streakHeader}>
                        <View>
                            <Text style={styles.sectionTitle}>🔥 {l('Günlük seri', 'Daily Streak')}</Text>
                            <Text style={styles.cardEyebrow}>{l('Çalışma günlerinizi haftalık görün', 'See your study days by week')}</Text>
                        </View>
                        <View style={styles.bestBadge}>
                            <Text style={styles.bestBadgeLabel}>{l('En uzun', 'Longest')}</Text>
                            <Text style={styles.bestBadgeValue}>{l(`${streak.best} gün`, `${streak.best} days`)}</Text>
                        </View>
                    </View>
                    <View style={styles.streakBody}>
                        <View style={styles.streakInfo}>
                            <View style={styles.streakRow}>
                                <Text style={styles.streakNumber}>{streak.current}</Text>
                                <Text style={styles.streakUnit}>{l('gün üst üste çalışma', streak.current === 1 ? 'consecutive study day' : 'consecutive study days')}</Text>
                            </View>
                        </View>
                        <View style={styles.streakStripWrap}>
                            <WeekStreakStrip
                                rolloverHour={settings.dayRolloverHour}
                                dataVersion={dataVersion + schedulingRevision}
                                initialWeekStudiedDays={statsSnapshot.currentWeekStudiedDays}
                            />
                        </View>
                    </View>
                </View>

                <View style={styles.ankiCard}>
                    <Text style={styles.chartTitle}>{l('Gelecek vadeler', 'Future Due')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Yeni kart öğrenmediğiniz ve kart unutmadığınız varsayımıyla, vade tarihine göre beklenen tekrar kartları.', 'Expected review cards by due date, assuming you learn no new cards and forget none.')}</Text>
                    <View style={styles.chartToggleRow}>
                        {([
                            { key: false, label: l('Bugünden itibaren', 'From today') },
                            { key: true, label: l('Gecikenlerle', 'With backlog') },
                        ] as const).map((option) => (
                            <TouchableOpacity
                                key={String(option.key)}
                                style={[styles.chartToggle, showBacklog === option.key && styles.chartToggleActive]}
                                onPress={() => setShowBacklog(option.key)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: showBacklog === option.key }}
                            >
                                <Text style={[
                                    styles.chartToggleText,
                                    showBacklog === option.key && styles.chartToggleTextActive,
                                ]}>
                                    {option.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <ClassicStatsBarChart
                        points={showBacklog ? ankiStats.futureDueWithBacklog : ankiStats.futureDue}
                        todayIndex={showBacklog ? ankiStats.futureDueWithBacklogTodayIndex : 0}
                        series={[
                            { label: l('Genç', 'Young'), color: colors.badgeNew },
                            { label: l('Olgun', 'Mature'), color: colors.badgeReview },
                        ]}
                        colors={colors}
                        emptyLabel={l('Gelecekte vadesi gelen kart yok.', 'No cards are due in the future.')}
                        emptyHint={chartEmptyHint}
                        height={190}
                        cumulative
                        cumulativeLabel={l('Birikimli', 'Cumulative')}
                        totalLabel={l('Toplam', 'Total')}
                        valueAxisLabel={l('Kart', 'Cards')}
                        cumulativeAxisLabel={l('Birikimli kart', 'Cumulative cards')}
                        todayLabel={l('Bugün', 'Today')}
                        formatValue={countValue}
                        accessibilityLabel={l(
                            `Gelecek vadeler grafiği. Gösterilen toplam ${showBacklog ? ankiStats.futureDueWithBacklogTotal : ankiStats.futureDueTotal} kart; yarın ${ankiStats.dueTomorrow} kart.`,
                            `Future due chart. ${showBacklog ? ankiStats.futureDueWithBacklogTotal : ankiStats.futureDueTotal} cards shown in total; ${ankiStats.dueTomorrow} due tomorrow.`,
                        )}
                        interactionHint={chartInteractionHint}
                    />
                    <View style={styles.metricRow}>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{countValue(showBacklog ? ankiStats.futureDueWithBacklogTotal : ankiStats.futureDueTotal)}</Text><Text style={styles.metricLabel}>{l('Toplam', 'Total')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{formatDecimal(ankiStats.dailyLoad, locale, 1, true)}</Text><Text style={styles.metricLabel}>{l('Günlük yük', 'Daily load')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{countValue(ankiStats.dueTomorrow)}</Text><Text style={styles.metricLabel}>{l('Yarın', 'Tomorrow')}</Text></View>
                        {showBacklog && (
                            <View style={styles.metricItem}>
                                <Text style={[styles.metricValue, { color: colors.btnAgain }]}>{countValue(ankiStats.futureDueBacklogTotal)}</Text>
                                <Text style={styles.metricLabel}>{l('Geciken', 'Backlog')}</Text>
                            </View>
                        )}
                    </View>
                </View>

                <ReviewsSection
                    reviewDays={reviewDays}
                    firstDay={reviewSpan.firstDay}
                    lastDay={reviewSpan.lastDay}
                    rangeTitle={rangeTitle}
                />

                <View style={styles.ankiCard}>
                    <Text style={styles.chartTitle}>{l('Cevap düğmeleri', 'Answer Buttons')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Seçilen dönemde Tekrar, Zor, İyi ve Kolay yanıtlarının kart türlerine göre dağılımı.', 'Again, Hard, Good, and Easy answers in the selected period, split by card type.')}</Text>
                    <ClassicStatsBarChart
                        points={answerButtonPoints}
                        series={[
                            { label: l('Öğrenme', 'Learning'), color: colors.badgeLearn },
                            { label: l('Genç', 'Young'), color: colors.badgeNew },
                            { label: l('Olgun', 'Mature'), color: colors.badgeReview },
                        ]}
                        colors={colors}
                        emptyLabel={l('Bu zaman aralığında cevap yok.', 'No answers in this time range.')}
                        emptyHint={chartEmptyHint}
                        height={150}
                        totalLabel={l('Toplam', 'Total')}
                        valueAxisLabel={l('Yanıt', 'Answers')}
                        formatValue={countValue}
                        accessibilityLabel={l(
                            `Cevap düğmeleri grafiği. Seçilen dönemde toplam ${answerTotal} yanıt.`,
                            `Answer buttons chart. ${answerTotal} answers in the selected period.`,
                        )}
                        interactionHint={chartInteractionHint}
                    />
                    <View style={styles.buttonCountGrid}>
                        {answerButtonPoints.map((point, index) => {
                            const total = point.values.reduce((sum, value) => sum + value, 0);
                            const valueColor = [colors.btnAgain, colors.btnHard, colors.btnGood, colors.btnEasy][index];
                            return (
                                <View key={point.label} style={styles.buttonCountItem}>
                                    <Text style={[styles.buttonCountValue, { color: valueColor }]}>{countValue(total)}</Text>
                                    <Text style={styles.buttonCountLabel}>{point.label}</Text>
                                </View>
                            );
                        })}
                    </View>
                    {/* Anki reports the share of answers that were not "Again", per card type —
                        the number that actually tells you how the deck is going. */}
                    <View style={styles.metricRow}>
                        {correctShares.map((share) => (
                            <View key={share.label} style={styles.metricItem}>
                                <Text style={styles.metricValue}>
                                    {share.total > 0 ? percentValue(share.percent) : '—'}
                                </Text>
                                <Text style={styles.metricLabel}>{share.label}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <HourlySection hours={statsSnapshot.hours} rangeTitle={rangeTitle} />

                <View style={styles.ankiCard}>
                    <Text style={styles.chartTitle}>{l('Tekrar aralıkları', 'Review Intervals')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Tekrar kartlarının mevcut aralık dağılımı. Zaman aralığı, grafikte gösterilecek en uzun aralığı sınırlar.', 'Current interval distribution of review cards. The selected time range limits the longest interval shown.')}</Text>
                    <ClassicStatsBarChart
                        points={ankiStats.intervals}
                        series={[{ label: l('Kartlar', 'Cards'), color: colors.accent }]}
                        colors={colors}
                        emptyLabel={l('Aralık verisi olan tekrar kartı yok.', 'No review cards with interval data.')}
                        emptyHint={chartEmptyHint}
                        height={180}
                        cumulative
                        cumulativeLabel={l('Bu aralığa kadar', 'At or below')}
                        cumulativeAsPercent
                        valueAxisLabel={l('Kart', 'Cards')}
                        cumulativeAxisLabel={l('Kartların yüzdesi', 'Share of cards')}
                        formatValue={countValue}
                        formatCumulative={percentValue}
                        accessibilityLabel={l(
                            `Tekrar aralıkları grafiği. Ortalama aralık ${formatIntervalDays(ankiStats.averageInterval, locale)}, en uzun aralık ${formatIntervalDays(ankiStats.longestInterval, locale)}.`,
                            `Review intervals chart. Average interval ${formatIntervalDays(ankiStats.averageInterval, locale)}; longest interval ${formatIntervalDays(ankiStats.longestInterval, locale)}.`,
                        )}
                        interactionHint={chartInteractionHint}
                    />
                    <View style={styles.metricRow}>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{formatIntervalDays(ankiStats.averageInterval, locale)}</Text><Text style={styles.metricLabel}>{l('Ortalama aralık', 'Average interval')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{formatIntervalDays(ankiStats.longestInterval, locale)}</Text><Text style={styles.metricLabel}>{l('En uzun aralık', 'Longest interval')}</Text></View>
                    </View>
                </View>

                <View style={styles.overviewCard}>
                    <Text style={styles.chartTitle}>{l('Kart sayıları', 'Card Counts')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Seçili deste veya koleksiyonun güncel kart türü dağılımı; zaman aralığı bu grafiği değiştirmez.', 'Current card-type composition of the selected deck or collection; the time range does not affect this chart.')}</Text>
                    <View
                        style={styles.overviewBar}
                        accessible
                        accessibilityRole="summary"
                        accessibilityLabel={l(
                            `Kart sayıları grafiği. Toplam ${ankiStats.cardCounts.totalCards} kart ve ${ankiStats.cardCounts.totalNotes} not.`,
                            `Card counts chart. ${ankiStats.cardCounts.totalCards} cards and ${ankiStats.cardCounts.totalNotes} notes in total.`,
                        )}
                    >
                        {ankiStats.cardCounts.totalCards > 0 ? (
                            cardCountRows.map((item) => item.count > 0 && (
                                <View
                                    key={item.key}
                                    style={[styles.overviewSegment, { flex: item.count, backgroundColor: item.color }]}
                                />
                            ))
                        ) : (
                            <View style={[styles.overviewSegment, { flex: 1, backgroundColor: colors.borderLight }]} />
                        )}
                    </View>

                    <View style={styles.compositionGrid}>
                        {cardCountRows.map((item) => (
                            <View key={item.key} style={styles.compositionItem} accessible accessibilityLabel={`${item.label}: ${item.count}, ${formatPartPercent(item.count, ankiStats.cardCounts.totalCards, locale)}`}>
                                <View style={styles.compositionLabelRow}>
                                    <View style={[styles.compositionSwatch, { backgroundColor: item.color }]} />
                                    <Text style={styles.compositionLabel} numberOfLines={1}>{item.label}</Text>
                                </View>
                                <View style={styles.compositionValueRow}>
                                    <Text style={styles.compositionValue}>{countValue(item.count)}</Text>
                                    <Text style={styles.compositionPercent}>{formatPartPercent(item.count, ankiStats.cardCounts.totalCards, locale)}</Text>
                                </View>
                            </View>
                        ))}
                    </View>

                    <View style={styles.metricRow}>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{countValue(ankiStats.cardCounts.totalCards)}</Text><Text style={styles.metricLabel}>{l('Toplam kart', 'Total cards')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{countValue(ankiStats.cardCounts.totalNotes)}</Text><Text style={styles.metricLabel}>{l('Toplam not', 'Total notes')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{ankiStats.cardCounts.totalNotes > 0 ? formatDecimal(ankiStats.cardCounts.totalCards / ankiStats.cardCounts.totalNotes, locale, 1, true) : '—'}</Text><Text style={styles.metricLabel}>{l('Not başına kart', 'Cards per note')}</Text></View>
                    </View>
                </View>

                <AddedSection
                    addedDays={addedDays}
                    firstDay={addedSpan.firstDay}
                    lastDay={addedSpan.lastDay}
                    rangeTitle={rangeTitle}
                    onOpenCards={openAddedCards}
                />

                <DeckProgressSection
                    title={deckScope ? l('Alt desteler', 'Subdecks') : l('Desteler', 'Decks')}
                    decks={deckStats}
                    onSelectDeck={(name) => {
                        // The deck was picked from the foot of the page; its figures start at the top.
                        setDeckScope(name);
                        scrollRef.current?.scrollTo({ y: 0, animated: true });
                    }}
                />

                <View style={{ height: 40 }} />
                </>
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
                    const created = createDeck(getAvailableDeckName(name));
                    bumpDataVersion();
                    return created.name;
                }}
            />}

            <StatsRangePicker
                rangePickerVisible={rangePickerVisible}
                setRangePickerVisible={setRangePickerVisible}
                rangeKey={rangeKey}
                setRangeKey={setRangeKey}
                customStart={customStart}
                setCustomStart={setCustomStart}
                customEnd={customEnd}
                setCustomEnd={setCustomEnd}
                localeTag={localeTag}
                styles={styles}
                l={l}
            />
        </SafeAreaView>
    );
}
