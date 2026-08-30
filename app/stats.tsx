import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    useWindowDimensions,
} from 'react-native';
import { Text } from '../components/Typography';
import { TouchableOpacity } from '../components/Touchable';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize, Shadows } from '../constants/theme';
import { DEFAULT_SETTINGS, loadSettings } from '../lib/storage';
import { perDeckBucketsSql } from '../lib/statsHelpers';
import { getAllDecks, getDeckByName, getDirectDecksForScope } from '../lib/deckManager';
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
import SheetModal from '../components/SheetModal';
import {
    getAnkiStatsSnapshot,
    resolveStatsDateRange,
    type AnkiStatsSnapshot,
    type StatsRangeKey,
} from '../lib/ankiStats';
import { getFilteredDeckCardIds } from '../lib/studyRepository';

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
    dueTomorrow: 0,
    dailyLoad: 0,
    reviews: [],
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
};

function formatIntervalDays(days: number, localeTag: string): string {
    if (days < 1) return '0';
    if (days < 30) return `${Math.round(days)}g`;
    if (days < 365) return `${(days / 30).toFixed(days < 60 ? 1 : 0)} ay`;
    return `${(days / 365).toFixed(1)} yıl`;
}

export default function StatsScreen() {
    const { t, l, localeTag } = useI18n();
    const { width } = useWindowDimensions();
    const isCompact = width < 600;
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors, isCompact), [colors, isCompact]);
    const router = useRouter();
    const params = useLocalSearchParams();
    const { dataVersion } = useApp();
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [deckPickerVisible, setDeckPickerVisible] = useState(false);
    const [rangePickerVisible, setRangePickerVisible] = useState(false);
    const [rangeKey, setRangeKey] = useState<StatsRangeKey>('all');
    const [customStart, setCustomStart] = useState(() => {
        const date = new Date();
        date.setMonth(date.getMonth() - 1);
        return date;
    });
    const [customEnd, setCustomEnd] = useState(() => new Date());

    // Anki-style scoping: /stats shows the whole collection, /stats?deck=X only that
    // deck's subtree. The deck list and sidebar pick the scope for the user.
    const deckScope = typeof params.deck === 'string' && params.deck.length > 0 ? params.deck : null;
    const scopeTitle = deckScope
        ? deckScope.replaceAll('::', ' › ')
        : l('Tüm Koleksiyon', 'Whole Collection');

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
        router.replace((name ? `/stats?deck=${encodeURIComponent(name)}` : '/stats') as any);
    };

    const rangeTitle = rangeKey === 'week'
        ? l('Son Hafta', 'Last Week')
        : rangeKey === 'month'
            ? l('Son Ay', 'Last Month')
            : rangeKey === 'threeMonths'
                ? l('Son 3 Ay', 'Last 3 Months')
                : rangeKey === 'year'
                    ? l('Son 1 Yıl', 'Last Year')
                    : rangeKey === 'custom'
                        ? `${customStart.toLocaleDateString(localeTag, { day: 'numeric', month: 'short' })} – ${customEnd.toLocaleDateString(localeTag, { day: 'numeric', month: 'short' })}`
                        : l('Tüm Zamanlar', 'All Time');

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
            return getAnkiStatsSnapshot(deckScope, statsRange, settings.dayRolloverHour, localeTag, filteredScopeCardIds);
        } catch (e) {
            console.warn('[Stats] Anki graphs failed:', e);
            return EMPTY_ANKI_STATS;
        }
    }, [dataVersion, deckScope, statsRange, settings.dayRolloverHour, localeTag, filteredScopeCardIds]);

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

    const handleBack = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        if (deckScope) {
            router.replace(`/deck-overview?deck=${encodeURIComponent(deckScope)}` as any);
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
    const studyMinutes = Math.round(todayStats.studyTimeMs / 60000);

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
                <Text scaleRole="title" style={styles.screenTitle} numberOfLines={1}>{t('common.statistics')}</Text>
                <View style={styles.headerSpacer} />
            </View>
            <ScrollView showsVerticalScrollIndicator contentContainerStyle={styles.scrollContent}>
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
                    <Text scaleRole="title" style={styles.sectionTitle}>{l('Bugünün Özeti', 'Today')}</Text>
                    <View style={styles.todayGrid}>
                        <View style={styles.todayStat}>
                            <Text style={styles.todayNumber}>{todayStats.reviewed}</Text>
                            <Text style={styles.todayLabel}>{l('Yanıtlanan', 'Reviews')}</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={[styles.todayNumber, { color: colors.btnGood }]}>{accuracy}%</Text>
                            <Text style={styles.todayLabel}>{l('Doğruluk', 'Accuracy')}</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={styles.todayNumber}>{studyMinutes}</Text>
                            <Text style={styles.todayLabel}>{l('Dakika', 'Minutes')}</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={[styles.todayNumber, { color: colors.badgeNew }]}>{todayStats.newCardsIntroduced}</Text>
                            <Text style={styles.todayLabel}>{l('Yeni Kart', 'New Cards')}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.streakCard}>
                    <View style={styles.streakHeader}>
                        <Text scaleRole="title" style={styles.sectionTitle}>🔥 {l('Günlük Seri', 'Daily Streak')}</Text>
                        <Text style={styles.streakBest}>{l(`En uzun: ${streak.best} gün`, `Longest: ${streak.best} days`)}</Text>
                    </View>
                    <View style={styles.streakBody}>
                        <View style={styles.streakInfo}>
                            <View style={styles.streakRow}>
                                <Text style={styles.streakNumber}>{streak.current}</Text>
                                <Text style={styles.streakUnit}>{l('gün üst üste çalıştınız', 'day study streak')}</Text>
                            </View>
                        </View>
                        <View style={styles.streakStripWrap}>
                            <WeekStreakStrip rolloverHour={settings.dayRolloverHour} dataVersion={dataVersion} />
                        </View>
                    </View>
                </View>

                <View style={styles.ankiCard}>
                    <Text style={styles.chartTitle}>{l('Gelecek Vadeler', 'Future Due')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Gelecekte vadesi dolacak tekrar kartlarının tahmini.', 'The estimated number of reviews due in the future.')}</Text>
                    <StatsBarChart
                        points={ankiStats.futureDue}
                        series={[
                            { label: l('Genç', 'Young'), color: colors.badgeNew },
                            { label: l('Olgun', 'Mature'), color: colors.badgeReview },
                        ]}
                        colors={colors}
                        emptyLabel={l('Gelecekte vadesi gelen kart yok.', 'No cards are due in the future.')}
                        cumulative
                        cumulativeLabel={l('Kümülatif', 'Cumulative')}
                    />
                    <View style={styles.metricRow}>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{ankiStats.futureDueTotal}</Text><Text style={styles.metricLabel}>{l('Toplam', 'Total')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{ankiStats.dailyLoad.toFixed(1)}</Text><Text style={styles.metricLabel}>{l('Günlük yük', 'Daily load')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{ankiStats.dueTomorrow}</Text><Text style={styles.metricLabel}>{l('Yarın', 'Tomorrow')}</Text></View>
                    </View>
                </View>

                <View style={styles.ankiCard}>
                    <Text style={styles.chartTitle}>{l('Tekrarlar', 'Reviews')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Seçilen dönemde cevapladığınız soru sayısı.', 'The number of questions answered in the selected period.')}</Text>
                    <StatsBarChart
                        points={ankiStats.reviews}
                        series={[
                            { label: l('Öğrenme', 'Learning'), color: colors.badgeLearn },
                            { label: l('Genç', 'Young'), color: colors.badgeNew },
                            { label: l('Olgun', 'Mature'), color: colors.badgeReview },
                            { label: l('Yeniden öğrenme', 'Relearning'), color: colors.btnAgain },
                            { label: l('Filtrelenmiş', 'Filtered'), color: colors.textMuted },
                        ]}
                        colors={colors}
                        emptyLabel={l('Bu zaman aralığında tekrar yok.', 'No reviews in this time range.')}
                        cumulative
                        cumulativeLabel={l('Kümülatif', 'Cumulative')}
                    />
                    <View style={styles.metricRow}>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{ankiStats.reviewTotal}</Text><Text style={styles.metricLabel}>{l('Cevap', 'Answers')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{ankiStats.daysStudied}</Text><Text style={styles.metricLabel}>{l('Çalışılan gün', 'Days studied')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{Math.round(ankiStats.reviewTimeMs / 60000)}</Text><Text style={styles.metricLabel}>{l('Dakika', 'Minutes')}</Text></View>
                    </View>
                </View>

                <View style={styles.ankiCard}>
                    <Text style={styles.chartTitle}>{l('Cevap Düğmeleri', 'Answer Buttons')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Her cevap düğmesine kaç kez bastığınız.', 'The number of times each answer button was pressed.')}</Text>
                    <StatsBarChart
                        points={answerButtonPoints}
                        series={[
                            { label: l('Öğrenme', 'Learning'), color: colors.badgeLearn },
                            { label: l('Genç', 'Young'), color: colors.badgeNew },
                            { label: l('Olgun', 'Mature'), color: colors.badgeReview },
                        ]}
                        colors={colors}
                        emptyLabel={l('Bu zaman aralığında cevap yok.', 'No answers in this time range.')}
                    />
                    <View style={styles.buttonCountGrid}>
                        {answerButtonPoints.map((point, index) => {
                            const total = point.values.reduce((sum, value) => sum + value, 0);
                            const valueColor = [colors.btnAgain, colors.btnHard, colors.btnGood, colors.btnEasy][index];
                            return (
                                <View key={point.label} style={styles.buttonCountItem}>
                                    <Text style={[styles.buttonCountValue, { color: valueColor }]}>{total}</Text>
                                    <Text style={styles.buttonCountLabel}>{point.label}</Text>
                                </View>
                            );
                        })}
                    </View>
                </View>

                <View style={styles.ankiCard}>
                    <Text style={styles.chartTitle}>{l('Tekrar Aralıkları', 'Review Intervals')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Tekrar kartlarının yeniden gösterilmesine kalan aralıkların dağılımı.', 'The distribution of delays until review cards are shown again.')}</Text>
                    <StatsBarChart
                        points={ankiStats.intervals}
                        series={[{ label: l('Kartlar', 'Cards'), color: colors.accent }]}
                        colors={colors}
                        emptyLabel={l('Aralık verisi olan tekrar kartı yok.', 'No review cards with interval data.')}
                        cumulative
                        cumulativeIsPercent
                        cumulativeLabel={l('Kümülatif %', 'Cumulative %')}
                    />
                    <View style={styles.metricRow}>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{formatIntervalDays(ankiStats.averageInterval, localeTag)}</Text><Text style={styles.metricLabel}>{l('Ortalama aralık', 'Average interval')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{formatIntervalDays(ankiStats.longestInterval, localeTag)}</Text><Text style={styles.metricLabel}>{l('En uzun aralık', 'Longest interval')}</Text></View>
                    </View>
                </View>

                <View style={styles.overviewCard}>
                    <Text style={styles.chartTitle}>{l('Kart Sayıları', 'Card Counts')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Deste veya koleksiyonunuzdaki kart türlerinin dağılımı.', 'The division of cards in the selected deck or collection.')}</Text>
                    <View style={styles.overviewBar}>
                        {ankiStats.cardCounts.totalCards > 0 ? (
                            <>
                                <View style={[styles.overviewSegment, { flex: ankiStats.cardCounts.mature, backgroundColor: colors.badgeReview }]} />
                                <View style={[styles.overviewSegment, { flex: ankiStats.cardCounts.youngLearn, backgroundColor: colors.badgeLearn }]} />
                                <View style={[styles.overviewSegment, { flex: ankiStats.cardCounts.unseen, backgroundColor: colors.badgeNew }]} />
                                <View style={[styles.overviewSegment, { flex: ankiStats.cardCounts.suspendedBuried, backgroundColor: colors.textMuted }]} />
                            </>
                        ) : (
                            <View style={[styles.overviewSegment, { flex: 1, backgroundColor: colors.borderLight }]} />
                        )}
                    </View>

                    <View style={styles.overviewLegend}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: colors.badgeReview }]} />
                            <Text style={styles.legendText}>{l('Olgun', 'Mature')}: {ankiStats.cardCounts.mature}</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: colors.badgeLearn }]} />
                            <Text style={styles.legendText}>{l('Genç + Öğrenme', 'Young + Learn')}: {ankiStats.cardCounts.youngLearn}</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: colors.badgeNew }]} />
                            <Text style={styles.legendText}>{l('Görülmemiş', 'Unseen')}: {ankiStats.cardCounts.unseen}</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: colors.textMuted }]} />
                            <Text style={styles.legendText}>{l('Askıda + Gömülü', 'Suspended + Buried')}: {ankiStats.cardCounts.suspendedBuried}</Text>
                        </View>
                    </View>

                    <Text style={styles.algorithmInfo}>
                        {l('Toplam kart', 'Total cards')}: {ankiStats.cardCounts.totalCards} · {l('Toplam not', 'Total notes')}: {ankiStats.cardCounts.totalNotes}
                    </Text>
                </View>

                <View style={styles.ankiCard}>
                    <Text style={styles.chartTitle}>{l('Eklenenler', 'Added')}</Text>
                    <Text style={styles.chartSubtitle}>{l('Seçilen dönemde eklediğiniz yeni kartların sayısı.', 'The number of new cards added in the selected period.')}</Text>
                    <StatsBarChart
                        points={ankiStats.added}
                        series={[{ label: l('Yeni kart', 'New cards'), color: colors.badgeNew }]}
                        colors={colors}
                        emptyLabel={l('Bu zaman aralığında eklenen kart yok.', 'No cards were added in this time range.')}
                        cumulative
                        cumulativeLabel={l('Kümülatif', 'Cumulative')}
                    />
                    <View style={styles.metricRow}>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{ankiStats.addedTotal}</Text><Text style={styles.metricLabel}>{l('Toplam eklenen', 'Total added')}</Text></View>
                        <View style={styles.metricItem}><Text style={styles.metricValue}>{statsRange.spanDays ? (ankiStats.addedTotal / statsRange.spanDays).toFixed(1) : '—'}</Text><Text style={styles.metricLabel}>{l('Günlük ortalama', 'Daily average')}</Text></View>
                    </View>
                </View>

                {(deckStats.length > 0 || !deckScope) && (
                    <Text style={styles.sectionTitle2}>
                        {deckScope ? l('Alt Deste İlerlemesi', 'Subdeck Progress') : l('Deste Bazlı İlerleme', 'Progress by Deck')}
                    </Text>
                )}
                {deckStats.map((deck) => (
                    <TouchableOpacity
                        key={deck.name}
                        style={styles.subjectRow}
                        onPress={() => router.push(`/stats?deck=${encodeURIComponent(deck.name)}` as any)}
                        accessibilityRole="button"
                        accessibilityLabel={l(`${deck.displayName} destesinin istatistiklerini aç`, `Open statistics for ${deck.displayName}`)}
                    >
                        <View style={styles.subjectHeader}>
                            <Text style={styles.subjectIcon}>🗃️</Text>
                            <Text style={styles.subjectName}>{deck.displayName}</Text>
                            <Text style={styles.subjectPct}>{deck.pct}%</Text>
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
                title={l('Deste Seç', 'Select Deck')}
                allDecksLabel={l('Tüm Koleksiyon', 'Whole Collection')}
                searchPlaceholder={l('Desteleri filtrele', 'Filter decks')}
                emptySearchLabel={l('Aramanızla eşleşen deste yok.', 'No decks match your search.')}
                cancelLabel={t('common.cancel')}
                closeAccessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                searchAccessibilityLabel={l('Deste ara', 'Search decks')}
                createAccessibilityLabel={l('Yeni deste oluştur', 'Create new deck')}
                onClose={() => setDeckPickerVisible(false)}
                onSelect={handlePickDeck}
                onCreateDeck={() => router.push(`/decks?create=${Date.now()}` as any)}
            />

            <SheetModal
                visible={rangePickerVisible}
                onClose={() => setRangePickerVisible(false)}
                showGrabber={false}
                cardStyle={styles.pickerSheet}
            >
                <View style={styles.pickerHeader}>
                    <View>
                        <Text style={styles.pickerEyebrow}>{t('common.statistics')}</Text>
                        <Text style={styles.pickerTitle}>{l('Zaman Aralığı', 'Time Range')}</Text>
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
                <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator>
                    {([
                        ['week', l('Son Hafta', 'Last Week')],
                        ['month', l('Son Ay', 'Last Month')],
                        ['threeMonths', l('Son 3 Ay', 'Last 3 Months')],
                        ['year', l('Son 1 Yıl', 'Last Year')],
                        ['all', l('Tüm Zamanlar', 'All Time')],
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
                            <Text style={styles.customRangeTitle}>{l('Özel Tarih Aralığı', 'Custom Date Range')}</Text>
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
                            <Text style={styles.applyRangeButtonText}>{l('Bu Aralığı Kullan', 'Use This Range')}</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SheetModal>
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
        gap: 6,
        minHeight: 36,
    },
    scopeSelectorText: { flexShrink: 1, fontSize: FontSize.lg, fontWeight: '800', color: colors.accent },
    scopeSelectorCaret: { color: colors.accent, fontSize: FontSize.md, fontWeight: '800', marginTop: 2 },
    scopeHint: { fontSize: FontSize.sm, color: colors.textMuted },

    todayCard: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.md },
    todayGrid: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: isCompact ? 'wrap' : 'nowrap' },
    todayStat: { alignItems: 'center', width: isCompact ? '50%' : undefined, paddingVertical: isCompact ? Spacing.sm : 0 },
    todayNumber: { fontSize: FontSize.xxxl, fontWeight: '700', color: colors.accent },
    todayLabel: { fontSize: FontSize.xs, color: colors.textMuted, fontWeight: '500', marginTop: 2 },

    streakCard: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    streakHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: Spacing.xs },
    streakBest: { fontSize: FontSize.sm, color: colors.textMuted },
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
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    chartTitle: { fontSize: FontSize.xl, fontWeight: '800', color: colors.textPrimary },
    chartSubtitle: { fontSize: FontSize.sm, lineHeight: 18, color: colors.textMuted, marginTop: 3, marginBottom: Spacing.sm },
    metricRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        gap: Spacing.sm,
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.borderLight,
    },
    metricItem: { flex: 1, alignItems: 'center', minWidth: 0 },
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
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    overviewBar: {
        flexDirection: 'row',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: Spacing.sm,
    },
    overviewSegment: { height: '100%' },
    overviewLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg, marginBottom: Spacing.sm },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: FontSize.sm, color: colors.textSecondary },
    algorithmInfo: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: 4 },

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
        height: 4,
        backgroundColor: colors.borderLight,
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 4,
    },
    progressSegment: { height: '100%', borderRadius: 2 },
    subjectDetail: {},
    subjectDetailText: { fontSize: FontSize.xs, color: colors.textMuted },

    // Header and rows pad themselves, so the sheet surface stays flush.
    pickerSheet: { paddingHorizontal: 0, paddingTop: 0, maxHeight: '82%' },
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
