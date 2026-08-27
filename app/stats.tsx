import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    useWindowDimensions,
    Modal,
    Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize, Shadows } from '../constants/theme';
import { DEFAULT_SETTINGS, loadSettings } from '../lib/storage';
import { perDeckBucketsSql } from '../lib/statsHelpers';
import { createDeck, getAllDecks, getAvailableDeckName, getDeckByName, getDirectDecksForScope } from '../lib/deckManager';
import { getDeckDisplayName } from '../lib/models';
import {
    getStudyStreak,
    getTodayAnswerStats,
    type StudyStreak,
    type TodayAnswerStats,
} from '../lib/reviewLogger';
import type { AppSettings } from '../lib/types';
import { useApp } from '../contexts/AppContext';
import WeekStreakStrip from '../components/WeekStreakStrip';
import StatsBarChart from '../components/StatsBarChart';
import DeckPickerModal from '../components/DeckPickerModal';
import { useI18n } from '../hooks/useI18n';
import { formatCount } from '../lib/i18n';
import {
    getAnkiStatsSnapshot,
    resolveStatsDateRange,
    type AnkiStatsSnapshot,
    type StatsRangeKey,
} from '../lib/ankiStats';
import { getFilteredDeckCardIds } from '../lib/studyRepository';
import { useRouteDeckScope } from '../hooks/useRouteDeckScope';
import {
    formatChartMinutes,
    formatIntervalDays,
    formatPartPercent,
    formatStudyDuration,
    perDayAverage,
} from '../lib/statsPresentation';

const EMPTY_TODAY: TodayAnswerStats = {
    reviewed: 0,
    passed: 0,
    failed: 0,
    newCardsIntroduced: 0,
    studyTimeMs: 0,
};

const EMPTY_ANKI_STATS: AnkiStatsSnapshot = {
    futureDue: [],
    futureDueTotal: 0,
    futureDueTodayIndex: 0,
    backlogTotal: 0,
    dueTomorrow: 0,
    dailyLoad: 0,
    reviews: [],
    reviewMinutes: [],
    reviewTotal: 0,
    reviewTimeMs: 0,
    daysStudied: 0,
    answerButtons: [1, 2, 3, 4].map((ease) => ({
        ease: ease as 1 | 2 | 3 | 4,
        learning: 0,
        young: 0,
        mature: 0,
    })),
    intervals: [],
    averageInterval: 0,
    longestInterval: 0,
    cardCounts: { mature: 0, youngLearn: 0, unseen: 0, suspendedBuried: 0, totalCards: 0, totalNotes: 0 },
    added: [],
    addedTotal: 0,
    addedSpanDays: 0,
};

export default function StatsScreen() {
    const { t, l, locale, localeTag } = useI18n();
    const { width } = useWindowDimensions();
    const isCompact = width < 600;
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors, isCompact), [colors, isCompact]);
    const router = useRouter();
    const params = useLocalSearchParams();
    const { dataVersion, bumpDataVersion } = useApp();
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [deckPickerVisible, setDeckPickerVisible] = useState(false);
    const [rangePickerVisible, setRangePickerVisible] = useState(false);
    const [rangeKey, setRangeKey] = useState<StatsRangeKey>('year');
    // Anki's "Time" checkbox on the Reviews graph: same buckets, minutes instead of card counts.
    const [reviewsAsTime, setReviewsAsTime] = useState(false);
    // Anki's "backlog" checkbox on Future Due, on by default there (BoolKey::FutureDueShowBacklog).
    const [showBacklog, setShowBacklog] = useState(true);
    const [customStart, setCustomStart] = useState(() => {
        const date = new Date();
        date.setMonth(date.getMonth() - 1);
        return date;
    });
    const [customEnd, setCustomEnd] = useState(() => new Date());

    // The route establishes the entry/deep-link scope. Further deck choices are filters on this
    // screen, so keep them local and preserve range/chart controls instead of navigating again.
    const routeDeckScope = typeof params.deck === 'string' && params.deck.length > 0 ? params.deck : null;
    const [deckScope, setDeckScope] = useRouteDeckScope(routeDeckScope);
    const scopeTitle = deckScope
        ? deckScope.replaceAll('::', ' › ')
        : l('Tüm koleksiyon', 'Whole Collection');

    const deckPickerItems = useMemo(() => {
        try {
            return getAllDecks()
                .sort((a, b) => a.name.localeCompare(b.name, localeTag));
        } catch (e) {
            console.warn('[Stats] deck picker list failed:', e);
            return [];
        }
    }, [dataVersion, localeTag]);
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

    const statsRange = useMemo(
        () => resolveStatsDateRange(rangeKey, customStart, customEnd, settings.dayRolloverHour),
        [rangeKey, customStart, customEnd, settings.dayRolloverHour],
    );

    const filteredScopeCardIds = useMemo(() => {
        if (!deckScope || !getDeckByName(deckScope)?.isFiltered) return undefined;
        try {
            return getFilteredDeckCardIds(deckScope, settings);
        } catch (e) {
            console.warn('[Stats] filtered deck membership failed:', e);
            return [];
        }
    }, [deckScope, settings, dataVersion]);

    const ankiStats = useMemo<AnkiStatsSnapshot>(() => {
        try {
            return getAnkiStatsSnapshot(
                deckScope, statsRange, settings.dayRolloverHour, localeTag, filteredScopeCardIds,
                { includeBacklog: showBacklog },
            );
        } catch (e) {
            console.warn('[Stats] Anki graphs failed:', e);
            return EMPTY_ANKI_STATS;
        }
    }, [dataVersion, deckScope, statsRange, settings.dayRolloverHour, localeTag, filteredScopeCardIds, showBacklog]);

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

    useEffect(() => {
        setSettings(loadSettings());
        setLoading(false);
    }, [dataVersion]);

    // All "today" numbers come from the review log — the durable source that survives
    // restarts, OS sleep and day rollovers (unlike the old cached session blob).
    const todayStats = useMemo(() => {
        try {
            return getTodayAnswerStats(settings.dayRolloverHour, deckScope ?? undefined, filteredScopeCardIds);
        } catch (e) {
            console.warn('[Stats] getTodayAnswerStats failed:', e);
            return EMPTY_TODAY;
        }
    }, [dataVersion, settings.dayRolloverHour, deckScope, filteredScopeCardIds]);

    const streak = useMemo<StudyStreak>(() => {
        try {
            return getStudyStreak(settings.dayRolloverHour);
        } catch (e) {
            console.warn('[Stats] getStudyStreak failed:', e);
            return { current: 0, studiedToday: false, best: 0 };
        }
    }, [dataVersion, settings.dayRolloverHour]);

    // Per-deck progress, aggregated over each deck's subtree ("Parent::Child" naming).
    // Collection view lists the top-level decks; deck view lists the scope's direct
    // subdecks. Filtered decks own no cards (they gather live), so they are skipped.
    const deckStats = useMemo(() => {
        try {
            const decks = getAllDecks().filter((deck) => !deck.isFiltered);
            const perDeck = perDeckBucketsSql();

            const listed = getDirectDecksForScope(decks, deckScope);

            return listed
                .map((root) => {
                    const totals = {
                        total: 0, newCount: 0, learningCount: 0,
                        reviewCount: 0, youngCount: 0, matureCount: 0,
                    };
                    for (const deck of decks) {
                        if (deck.name !== root.name && !deck.name.startsWith(`${root.name}::`)) continue;
                        const bucket = perDeck.get(deck.id);
                        if (!bucket) continue;
                        totals.total += bucket.total;
                        totals.newCount += bucket.newCount;
                        totals.learningCount += bucket.learningCount;
                        totals.reviewCount += bucket.reviewCount;
                        totals.youngCount += bucket.youngCount;
                        totals.matureCount += bucket.matureCount;
                    }

                    const studied = totals.total - totals.newCount;
                    const pct = totals.total > 0 ? Math.round((studied / totals.total) * 100) : 0;
                    return {
                        name: root.name,
                        displayName: getDeckDisplayName(root.name),
                        ...totals,
                        studied,
                        pct,
                    };
                })
                .sort((a, b) => a.name.localeCompare(b.name, localeTag));
        } catch (e) {
            console.warn('[Stats] deck stats failed:', e);
            return [];
        }
    }, [dataVersion, deckScope, localeTag]);

    const accuracy = todayStats.reviewed > 0
        ? Math.round((todayStats.passed / todayStats.reviewed) * 100)
        : 0;
    const countValue = (value: number) => formatCount(Math.round(value), locale);
    const timeValue = (value: number) => formatChartMinutes(value, locale);
    const chartInteractionHint = l(
        'Ayrıntıyı sabitlemek için bir sütuna dokunun; kapatmak için yeniden dokunun.',
        'Tap a bar to pin its details; tap it again to close.',
    );
    const chartEmptyHint = l(
        'Başka bir deste veya zaman aralığı seçerek tekrar deneyin.',
        'Try another deck or time range.',
    );
    const reviewAverage = ankiStats.daysStudied > 0 ? ankiStats.reviewTotal / ankiStats.daysStudied : 0;
    const answerSeconds = ankiStats.reviewTotal > 0 ? ankiStats.reviewTimeMs / ankiStats.reviewTotal / 1000 : 0;

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 48 }}>📊</Text>
                    <Text style={{ color: colors.textMuted }}>{t('common.loading')}</Text>
                </View>
            </SafeAreaView>
        );
    }

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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
                            <Text style={styles.todayIcon}>✓</Text>
                            <Text style={styles.todayNumber}>{countValue(todayStats.reviewed)}</Text>
                            <Text style={styles.todayLabel}>{l('Yanıtlanan', 'Reviews')}</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={styles.todayIcon}>◎</Text>
                            <Text style={[styles.todayNumber, { color: colors.btnGood }]}>{todayStats.reviewed > 0 ? `${accuracy}%` : '—'}</Text>
                            <Text style={styles.todayLabel}>{l('Doğruluk', 'Accuracy')}</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={styles.todayIcon}>◷</Text>
                            <Text style={styles.todayNumberCompact}>{formatStudyDuration(todayStats.studyTimeMs, locale)}</Text>
                            <Text style={styles.todayLabel}>{l('Çalışma süresi', 'Study time')}</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={styles.todayIcon}>＋</Text>
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
                            <WeekStreakStrip rolloverHour={settings.dayRolloverHour} dataVersion={dataVersion} />
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
                    <StatsBarChart
                        points={ankiStats.futureDue}
                        todayIndex={ankiStats.futureDueTodayIndex}
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
                            `Gelecek vadeler grafiği. Gösterilen toplam ${ankiStats.futureDueTotal} kart; yarın ${ankiStats.dueTomorrow} kart.`,
                            `Future due chart. ${ankiStats.futureDueTotal} cards shown in total; ${ankiStats.dueTomorrow} due tomorrow.`,
                        )}
                        interactionHint={chartInteractionHint}
                    />
                    <View style={styles.metricRow}>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{countValue(ankiStats.futureDueTotal)}</Text><Text style={styles.metricLabel}>{l('Toplam', 'Total')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{ankiStats.dailyLoad.toFixed(1)}</Text><Text style={styles.metricLabel}>{l('Günlük yük', 'Daily load')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{countValue(ankiStats.dueTomorrow)}</Text><Text style={styles.metricLabel}>{l('Yarın', 'Tomorrow')}</Text></View>
                        {showBacklog && (
                            <View style={styles.metricItem}>
                                <Text style={[styles.metricValue, { color: colors.btnAgain }]}>{countValue(ankiStats.backlogTotal)}</Text>
                                <Text style={styles.metricLabel}>{l('Geciken', 'Backlog')}</Text>
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.ankiCard}>
                    <Text style={styles.chartTitle}>{l('Tekrarlar', 'Reviews')}</Text>
                    <Text style={styles.chartSubtitle}>
                        {reviewsAsTime
                            ? l('Seçilen dönemde, kart türüne göre çalışmaya ayırdığınız süre.', 'Study time in the selected period, split by card type.')
                            : l('Seçilen dönemde, kart türüne göre verdiğiniz yanıtların sayısı.', 'Answers in the selected period, split by card type.')}
                    </Text>
                    <View style={styles.chartToggleRow}>
                        {([
                            { key: false, label: l('Kart sayısı', 'Cards') },
                            { key: true, label: l('Süre', 'Time') },
                        ] as const).map((option) => (
                            <TouchableOpacity
                                key={String(option.key)}
                                style={[styles.chartToggle, reviewsAsTime === option.key && styles.chartToggleActive]}
                                onPress={() => setReviewsAsTime(option.key)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: reviewsAsTime === option.key }}
                            >
                                <Text style={[
                                    styles.chartToggleText,
                                    reviewsAsTime === option.key && styles.chartToggleTextActive,
                                ]}>
                                    {option.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <StatsBarChart
                        points={reviewsAsTime ? ankiStats.reviewMinutes : ankiStats.reviews}
                        series={[
                            { label: l('Öğrenme', 'Learning'), color: colors.badgeLearn },
                            { label: l('Genç', 'Young'), color: colors.badgeNew },
                            { label: l('Olgun', 'Mature'), color: colors.badgeReview },
                            { label: l('Yeniden öğrenme', 'Relearning'), color: colors.btnAgain },
                            { label: l('Filtrelenmiş', 'Filtered'), color: colors.textMuted },
                        ]}
                        colors={colors}
                        emptyLabel={l('Bu zaman aralığında tekrar yok.', 'No reviews in this time range.')}
                        emptyHint={chartEmptyHint}
                        height={190}
                        cumulative
                        cumulativeLabel={l('Birikimli', 'Cumulative')}
                        formatValue={reviewsAsTime ? timeValue : countValue}
                        formatAxisValue={reviewsAsTime ? timeValue : undefined}
                        formatCumulative={reviewsAsTime ? timeValue : countValue}
                        totalLabel={reviewsAsTime ? l('Toplam süre', 'Total time') : l('Toplam', 'Total')}
                        valueAxisLabel={reviewsAsTime ? l('Süre', 'Time') : l('Yanıt', 'Answers')}
                        cumulativeAxisLabel={reviewsAsTime ? l('Birikimli süre', 'Cumulative time') : l('Birikimli yanıt', 'Cumulative answers')}
                        accessibilityLabel={l(
                            `Tekrarlar grafiği. ${ankiStats.reviewTotal} yanıt, ${ankiStats.daysStudied} çalışma günü, toplam ${formatStudyDuration(ankiStats.reviewTimeMs, locale)}.`,
                            `Reviews chart. ${ankiStats.reviewTotal} answers across ${ankiStats.daysStudied} study days, ${formatStudyDuration(ankiStats.reviewTimeMs, locale)} total.`,
                        )}
                        interactionHint={chartInteractionHint}
                    />
                    <View style={styles.metricRow}>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{countValue(ankiStats.reviewTotal)}</Text><Text style={styles.metricLabel}>{l('Yanıt', 'Answers')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{countValue(ankiStats.daysStudied)}</Text><Text style={styles.metricLabel}>{l('Çalışılan gün', 'Days studied')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{formatStudyDuration(ankiStats.reviewTimeMs, locale)}</Text><Text style={styles.metricLabel}>{l('Toplam süre', 'Total time')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{reviewAverage > 0 ? reviewAverage.toFixed(1) : '—'}</Text><Text style={styles.metricLabel}>{l('Günlük yanıt', 'Per study day')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{answerSeconds > 0 ? `${answerSeconds.toFixed(1)} ${locale === 'tr' ? 'sn' : 's'}` : '—'}</Text><Text style={styles.metricLabel}>{l('Yanıt başına', 'Per answer')}</Text></View>
                    </View>
                </View>

                <View style={styles.ankiCard}>
                    <Text style={styles.chartTitle}>{l('Cevap düğmeleri', 'Answer Buttons')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Seçilen dönemde Tekrar, Zor, İyi ve Kolay yanıtlarının kart türlerine göre dağılımı.', 'Again, Hard, Good, and Easy answers in the selected period, split by card type.')}</Text>
                    <StatsBarChart
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
                            `Cevap düğmeleri grafiği. Seçilen dönemde toplam ${ankiStats.reviewTotal} yanıt.`,
                            `Answer buttons chart. ${ankiStats.reviewTotal} answers in the selected period.`,
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
                                    {share.total > 0 ? `${share.percent}%` : '—'}
                                </Text>
                                <Text style={styles.metricLabel}>{share.label}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View style={styles.ankiCard}>
                    <Text style={styles.chartTitle}>{l('Tekrar aralıkları', 'Review Intervals')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Tekrar kartlarının mevcut aralık dağılımı. Zaman aralığı, grafikte gösterilecek en uzun aralığı sınırlar.', 'Current interval distribution of review cards. The selected time range limits the longest interval shown.')}</Text>
                    <StatsBarChart
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
                            <View key={item.key} style={styles.compositionItem} accessible accessibilityLabel={`${item.label}: ${item.count}, ${formatPartPercent(item.count, ankiStats.cardCounts.totalCards)}`}>
                                <View style={styles.compositionLabelRow}>
                                    <View style={[styles.compositionSwatch, { backgroundColor: item.color }]} />
                                    <Text style={styles.compositionLabel} numberOfLines={1}>{item.label}</Text>
                                </View>
                                <View style={styles.compositionValueRow}>
                                    <Text style={styles.compositionValue}>{countValue(item.count)}</Text>
                                    <Text style={styles.compositionPercent}>{formatPartPercent(item.count, ankiStats.cardCounts.totalCards)}</Text>
                                </View>
                            </View>
                        ))}
                    </View>

                    <View style={styles.metricRow}>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{countValue(ankiStats.cardCounts.totalCards)}</Text><Text style={styles.metricLabel}>{l('Toplam kart', 'Total cards')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{countValue(ankiStats.cardCounts.totalNotes)}</Text><Text style={styles.metricLabel}>{l('Toplam not', 'Total notes')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{ankiStats.cardCounts.totalNotes > 0 ? (ankiStats.cardCounts.totalCards / ankiStats.cardCounts.totalNotes).toFixed(1) : '—'}</Text><Text style={styles.metricLabel}>{l('Not başına kart', 'Cards per note')}</Text></View>
                    </View>
                </View>

                <View style={styles.ankiCard}>
                    <Text style={styles.chartTitle}>{l('Eklenenler', 'Added')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Seçilen dönemde oluşturulan yeni kartlar ve zaman içinde biriken toplam.', 'New cards created in the selected period and their running total over time.')}</Text>
                    <StatsBarChart
                        points={ankiStats.added}
                        series={[{ label: l('Yeni kart', 'New cards'), color: colors.badgeNew }]}
                        colors={colors}
                        emptyLabel={l('Bu zaman aralığında eklenen kart yok.', 'No cards were added in this time range.')}
                        emptyHint={chartEmptyHint}
                        height={170}
                        cumulative
                        cumulativeLabel={l('Birikimli', 'Cumulative')}
                        valueAxisLabel={l('Kart', 'Cards')}
                        cumulativeAxisLabel={l('Birikimli kart', 'Cumulative cards')}
                        formatValue={countValue}
                        accessibilityLabel={l(
                            `Eklenenler grafiği. Seçilen dönemde ${ankiStats.addedTotal} kart oluşturuldu.`,
                            `Added chart. ${ankiStats.addedTotal} cards were created in the selected period.`,
                        )}
                        interactionHint={chartInteractionHint}
                    />
                    <View style={styles.metricRow}>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{countValue(ankiStats.addedTotal)}</Text><Text style={styles.metricLabel}>{l('Toplam eklenen', 'Total added')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{ankiStats.addedSpanDays > 0 ? perDayAverage(ankiStats.addedTotal, ankiStats.addedSpanDays).toFixed(1) : '—'}</Text><Text style={styles.metricLabel}>{l('Takvim günü ortalaması', 'Per calendar day')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{countValue(ankiStats.addedSpanDays)}</Text><Text style={styles.metricLabel}>{l('Kapsanan gün', 'Days covered')}</Text></View>
                    </View>
                </View>

                {(deckStats.length > 0 || !deckScope) && (
                    <Text style={styles.sectionTitle2}>
                        {deckScope ? l('Alt deste ilerlemesi', 'Subdeck Progress') : l('Deste bazlı ilerleme', 'Progress by Deck')}
                    </Text>
                )}
                {deckStats.map((deck) => (
                    <TouchableOpacity
                        key={deck.name}
                        style={styles.subjectRow}
                        onPress={() => setDeckScope(deck.name)}
                        accessibilityRole="button"
                        accessibilityLabel={l(`${deck.displayName} destesinin istatistiklerini göster`, `Show statistics for ${deck.displayName}`)}
                        accessibilityValue={{ min: 0, max: 100, now: deck.pct, text: `${deck.pct}%` }}
                    >
                        <View style={styles.subjectHeader}>
                            <Text style={styles.subjectIcon}>🗃️</Text>
                            <Text style={styles.subjectName}>{deck.displayName}</Text>
                            <Text style={styles.subjectPct}>{deck.pct}%</Text>
                            <Text style={styles.subjectChevron}>›</Text>
                        </View>
                        <View style={styles.subjectProgress}>
                            <View style={[styles.progressSegment, { width: `${deck.pct}%`, backgroundColor: colors.accent }]} />
                        </View>
                        <View style={styles.subjectDetail}>
                            <Text style={styles.subjectDetailText}>
                                {l(`${deck.studied}/${deck.total} çalışıldı`, `${deck.studied}/${deck.total} studied`)} · {t('anki.new')} {deck.newCount} · {t('anki.learn')} {deck.learningCount} · {t('anki.review')} {deck.reviewCount}
                            </Text>
                            <Text style={styles.subjectDetailText}>
                                {l('Genç', 'Young')} {deck.youngCount} · {l('Olgun', 'Mature')} {deck.matureCount}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
                {!deckScope && deckStats.length === 0 && (
                    <Text style={styles.scopeHint}>{l('Henüz deste yok — Desteler ekranından bir deste oluşturun.', 'No decks yet — create one from the Decks screen.')}</Text>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            <DeckPickerModal
                visible={deckPickerVisible}
                colors={colors}
                decks={deckPickerItems}
                selectedDeckName={deckScope}
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
            />

            <Modal
                visible={rangePickerVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setRangePickerVisible(false)}
            >
                <Pressable style={styles.pickerOverlay} onPress={() => setRangePickerVisible(false)}>
                    <Pressable style={styles.pickerCard} onPress={() => {}} accessibilityViewIsModal>
                        <View style={styles.pickerHeader}>
                            <View>
                                <Text style={styles.pickerEyebrow}>{t('common.statistics')}</Text>
                                <Text style={styles.pickerTitle}>{l('Zaman aralığı', 'Time Range')}</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.pickerClose}
                                onPress={() => setRangePickerVisible(false)}
                                accessibilityRole="button"
                                accessibilityLabel={l('Zaman seçiciyi kapat', 'Close time range picker')}
                            >
                                <Text style={styles.pickerCloseText}>×</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                            {([
                                ['week', l('Son hafta', 'Last Week')],
                                ['month', l('Son ay', 'Last Month')],
                                ['threeMonths', l('Son 3 ay', 'Last 3 Months')],
                                ['year', l('Son 1 yıl', 'Last Year')],
                                ['all', l('Tüm zamanlar', 'All Time')],
                            ] as [StatsRangeKey, string][]).map(([key, label]) => (
                                <TouchableOpacity
                                    key={key}
                                    style={[styles.pickerRow, rangeKey === key && styles.pickerRowActive]}
                                    onPress={() => {
                                        setRangeKey(key);
                                        setRangePickerVisible(false);
                                    }}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: rangeKey === key }}
                                >
                                    <Text style={styles.pickerRowIcon}>◷</Text>
                                    <Text style={[styles.pickerRowText, rangeKey === key && styles.pickerRowTextActive]}>{label}</Text>
                                    {rangeKey === key && <Text style={styles.pickerCheck}>✓</Text>}
                                </TouchableOpacity>
                            ))}

                            <View style={[styles.customRangeBlock, rangeKey === 'custom' && styles.customRangeBlockActive]}>
                                <View style={styles.customRangeHeading}>
                                    <Text style={styles.customRangeTitle}>{l('Özel tarih aralığı', 'Custom Date Range')}</Text>
                                    {rangeKey === 'custom' && <Text style={styles.pickerCheck}>✓</Text>}
                                </View>
                                <View style={styles.datePickerRow}>
                                    <Text style={styles.datePickerLabel}>{l('Başlangıç', 'Start')}</Text>
                                    <DateTimePicker
                                        value={customStart}
                                        mode="date"
                                        display="compact"
                                        maximumDate={customEnd}
                                        locale={localeTag}
                                        onChange={(_event, value) => value && setCustomStart(value)}
                                    />
                                </View>
                                <View style={styles.datePickerRow}>
                                    <Text style={styles.datePickerLabel}>{l('Bitiş', 'End')}</Text>
                                    <DateTimePicker
                                        value={customEnd}
                                        mode="date"
                                        display="compact"
                                        minimumDate={customStart}
                                        maximumDate={new Date()}
                                        locale={localeTag}
                                        onChange={(_event, value) => value && setCustomEnd(value)}
                                    />
                                </View>
                                <TouchableOpacity
                                    style={styles.applyRangeButton}
                                    onPress={() => {
                                        setRangeKey('custom');
                                        setRangePickerVisible(false);
                                    }}
                                    accessibilityRole="button"
                                >
                                    <Text style={styles.applyRangeButtonText}>{l('Bu aralığı kullan', 'Use This Range')}</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme, isCompact: boolean) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    screenHeader: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        backgroundColor: colors.bgCard,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    screenTitle: { flex: 1, fontSize: FontSize.xl, fontWeight: '800', color: colors.textPrimary },
    headerSpacer: { width: 44 },
    scrollContent: {
        width: '100%',
        maxWidth: 880,
        alignSelf: 'center',
        padding: isCompact ? Spacing.md : Spacing.lg,
        gap: Spacing.md,
    },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backButtonText: { fontSize: 40, lineHeight: 42, color: colors.accent, fontWeight: '300' },
    selectorsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    scopeSelector: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        minHeight: 44,
        paddingHorizontal: Spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.bgCard,
    },
    scopeSelectorText: { flexShrink: 1, fontSize: FontSize.md, fontWeight: '800', color: colors.accent },
    scopeSelectorCaret: { color: colors.accent, fontSize: FontSize.md, fontWeight: '800', marginTop: 2 },
    scopeHint: { fontSize: FontSize.sm, color: colors.textMuted },

    todayCard: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.md, marginBottom: Spacing.lg },
    sectionTitle: { fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary },
    cardEyebrow: { color: colors.textMuted, fontSize: FontSize.xs, lineHeight: 16, marginTop: 2 },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: BorderRadius.full, backgroundColor: colors.accentLight },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
    liveBadgeText: { color: colors.accent, fontSize: FontSize.xs, fontWeight: '800' },
    chartToggleRow: {
        flexDirection: 'row',
        alignSelf: 'flex-start',
        backgroundColor: colors.bgInput,
        borderRadius: BorderRadius.sm,
        padding: 2,
        marginBottom: Spacing.xs,
    },
    chartToggle: { paddingVertical: 4, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm - 2 },
    chartToggleActive: { backgroundColor: colors.bgCard },
    chartToggleText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textMuted },
    chartToggleTextActive: { color: colors.textPrimary },
    todayGrid: { flexDirection: 'row', gap: Spacing.sm, flexWrap: isCompact ? 'wrap' : 'nowrap' },
    todayStat: {
        flexGrow: 1,
        flexBasis: isCompact ? '46%' : 0,
        minHeight: 96,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.xs,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.bgSecondary,
    },
    todayIcon: { position: 'absolute', top: 8, right: 10, color: colors.textMuted, fontSize: FontSize.sm, fontWeight: '800' },
    todayNumber: { fontSize: FontSize.xxxl, fontWeight: '800', color: colors.accent },
    todayNumberCompact: { fontSize: FontSize.xl, lineHeight: 26, fontWeight: '800', color: colors.accent, textAlign: 'center' },
    todayLabel: { fontSize: FontSize.xs, color: colors.textMuted, fontWeight: '500', marginTop: 2 },

    streakCard: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    streakHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: Spacing.xs },
    streakBest: { fontSize: FontSize.sm, color: colors.textMuted },
    bestBadge: { alignItems: 'flex-end', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: colors.streakBg },
    bestBadgeLabel: { color: colors.textMuted, fontSize: FontSize.xs, fontWeight: '700' },
    bestBadgeValue: { color: colors.streak, fontSize: FontSize.md, fontWeight: '900', marginTop: 1 },
    streakBody: {
        flexDirection: isCompact ? 'column' : 'row',
        alignItems: isCompact ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: isCompact ? Spacing.lg : Spacing.xl,
        flexWrap: 'wrap',
    },
    streakInfo: { flexShrink: 1, minWidth: isCompact ? 0 : 180 },
    streakStripWrap: { flexGrow: 1, minWidth: isCompact ? 0 : 300, width: isCompact ? '100%' : undefined },
    streakRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, flexWrap: 'wrap' },
    streakNumber: { fontSize: 44, fontWeight: '700', color: colors.btnHard },
    streakUnit: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
    ankiCard: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    chartTitle: { fontSize: FontSize.xl, lineHeight: 24, fontWeight: '800', color: colors.textPrimary },
    chartSubtitle: { fontSize: FontSize.sm, lineHeight: 19, color: colors.textMuted, marginTop: 4, marginBottom: Spacing.md },
    metricRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        gap: Spacing.sm,
        flexWrap: 'wrap',
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.borderLight,
    },
    metricItem: { flexGrow: 1, flexBasis: isCompact ? '28%' : 0, alignItems: 'center', justifyContent: 'center', minWidth: 82, minHeight: 62, padding: Spacing.sm, borderRadius: BorderRadius.sm, backgroundColor: colors.bgSecondary },
    metricValue: { color: colors.textPrimary, fontSize: FontSize.lg, fontWeight: '800' },
    metricLabel: { color: colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', marginTop: 2 },
    buttonCountGrid: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.md },
    buttonCountItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, backgroundColor: colors.bgSecondary, borderRadius: BorderRadius.sm },
    buttonCountValue: { fontSize: FontSize.lg, fontWeight: '900' },
    buttonCountLabel: { color: colors.textMuted, fontSize: FontSize.xs, marginTop: 1 },
    overviewCard: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    overviewBar: {
        flexDirection: 'row',
        height: 16,
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: Spacing.md,
        backgroundColor: colors.borderLight,
    },
    overviewSegment: { height: '100%' },
    overviewLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg, marginBottom: Spacing.sm },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: FontSize.sm, color: colors.textSecondary },
    algorithmInfo: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: 4 },
    compositionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    compositionItem: { flexGrow: 1, flexBasis: isCompact ? '46%' : '22%', minWidth: 132, padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: colors.bgSecondary },
    compositionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    compositionSwatch: { width: 9, height: 9, borderRadius: 3 },
    compositionLabel: { flex: 1, color: colors.textSecondary, fontSize: FontSize.xs, fontWeight: '700' },
    compositionValueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.sm, marginTop: 5 },
    compositionValue: { color: colors.textPrimary, fontSize: FontSize.xl, fontWeight: '900' },
    compositionPercent: { color: colors.textMuted, fontSize: FontSize.sm, fontWeight: '700' },

    sectionTitle2: {
        fontSize: FontSize.lg,
        fontWeight: '700',
        color: colors.textPrimary,
        marginTop: Spacing.sm,
    },
    subjectRow: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        ...Shadows.sm,
    },
    subjectHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    subjectIcon: { fontSize: 18 },
    subjectName: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
    subjectPct: { fontSize: FontSize.lg, fontWeight: '700', color: colors.accent },
    subjectProgress: {
        height: 8,
        backgroundColor: colors.borderLight,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 7,
    },
    progressSegment: { height: '100%', borderRadius: 4 },
    subjectChevron: { color: colors.textMuted, fontSize: 22, lineHeight: 24, fontWeight: '500' },
    subjectDetail: {},
    subjectDetailText: { fontSize: FontSize.xs, color: colors.textMuted },

    pickerOverlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    pickerCard: {
        width: '100%',
        maxWidth: 420,
        maxHeight: '82%',
        overflow: 'hidden',
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.lg,
        ...Shadows.lg,
    },
    pickerHeader: {
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    pickerEyebrow: { color: colors.textMuted, fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    pickerTitle: { color: colors.textPrimary, fontSize: FontSize.xl, fontWeight: '800', marginTop: 2 },
    pickerClose: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.full },
    pickerCloseText: { color: colors.textMuted, fontSize: 30, lineHeight: 32, fontWeight: '300' },
    pickerScroll: { paddingVertical: Spacing.xs },
    pickerRow: {
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.borderLight,
    },
    pickerRowActive: { backgroundColor: colors.accentLight },
    pickerRowIcon: { width: 22, textAlign: 'center', color: colors.textMuted, fontSize: 18 },
    pickerRowText: { flex: 1, fontSize: FontSize.md, color: colors.textPrimary },
    pickerRowTextActive: { color: colors.accent, fontWeight: '800' },
    pickerCheck: { color: colors.accent, fontSize: 19, fontWeight: '900' },
    customRangeBlock: {
        margin: Spacing.md,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.bgSecondary,
    },
    customRangeBlockActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
    customRangeHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
    customRangeTitle: { color: colors.textPrimary, fontSize: FontSize.md, fontWeight: '800' },
    datePickerRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
    datePickerLabel: { color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '700' },
    applyRangeButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm, borderRadius: BorderRadius.sm, backgroundColor: colors.accent },
    applyRangeButtonText: { color: colors.white, fontSize: FontSize.sm, fontWeight: '800' },
    });
}
