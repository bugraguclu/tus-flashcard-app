import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    TouchableOpacity,
    TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors, type ColorScheme, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import { DEFAULT_SETTINGS, exportAllData, importAllData, loadSettings } from '../../lib/storage';
import { aggregateBucketsSql, perDeckBucketsSql } from '../../lib/statsHelpers';
import { getAllDecks } from '../../lib/deckManager';
import { getDeckDisplayName } from '../../lib/models';
import {
    getStudyStreak,
    getTodayAnswerStats,
    type StudyStreak,
    type TodayAnswerStats,
} from '../../lib/reviewLogger';
import { confirm, alert } from '../../lib/confirm';
import type { AppSettings } from '../../lib/types';
import { useApp } from './_layout';
import WeekStreakStrip from '../../components/WeekStreakStrip';

const EMPTY_TODAY: TodayAnswerStats = {
    reviewed: 0,
    passed: 0,
    failed: 0,
    newCardsIntroduced: 0,
    studyTimeMs: 0,
};

export default function StatsScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const params = useLocalSearchParams();
    const { dataVersion, bumpDataVersion, refreshData } = useApp();
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [importData, setImportData] = useState('');
    const [showImport, setShowImport] = useState(false);

    // Anki-style scoping: /stats shows the whole collection, /stats?deck=X only that
    // deck's subtree. The deck list and sidebar pick the scope for the user.
    const deckScope = typeof params.deck === 'string' && params.deck.length > 0 ? params.deck : null;

    useEffect(() => {
        setSettings(loadSettings());
        setLoading(false);
    }, [dataVersion]);

    // All "today" numbers come from the review log — the durable source that survives
    // restarts, OS sleep and day rollovers (unlike the old cached session blob).
    const todayStats = useMemo(() => {
        try {
            return getTodayAnswerStats(settings.dayRolloverHour, deckScope ?? undefined);
        } catch (e) {
            console.warn('[Stats] getTodayAnswerStats failed:', e);
            return EMPTY_TODAY;
        }
    }, [dataVersion, settings.dayRolloverHour, deckScope]);

    const streak = useMemo<StudyStreak>(() => {
        try {
            return getStudyStreak(settings.dayRolloverHour);
        } catch (e) {
            console.warn('[Stats] getStudyStreak failed:', e);
            return { current: 0, studiedToday: false, best: 0 };
        }
    }, [dataVersion, settings.dayRolloverHour]);

    const bucketTotals = useMemo(() => aggregateBucketsSql(deckScope ?? undefined), [dataVersion, deckScope]);

    // Per-deck progress, aggregated over each deck's subtree ("Parent::Child" naming).
    // Collection view lists the top-level decks; deck view lists the scope's direct
    // subdecks. Filtered decks own no cards (they gather live), so they are skipped.
    const deckStats = useMemo(() => {
        try {
            const decks = getAllDecks().filter((deck) => !deck.isFiltered);
            const perDeck = perDeckBucketsSql();

            const listed = deckScope
                ? decks.filter((deck) => deck.name.startsWith(`${deckScope}::`)
                    && !deck.name.slice(deckScope.length + 2).includes('::'))
                : decks.filter((deck) => !deck.name.includes('::'));

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
                .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        } catch (e) {
            console.warn('[Stats] deck stats failed:', e);
            return [];
        }
    }, [dataVersion, deckScope]);

    const accuracy = todayStats.reviewed > 0
        ? Math.round((todayStats.passed / todayStats.reviewed) * 100)
        : 0;
    const studyMinutes = Math.round(todayStats.studyTimeMs / 60000);

    const handleExport = async () => {
        try {
            const data = await exportAllData();
            await Clipboard.setStringAsync(data);
            alert('Başarılı', 'Yedek verisi panoya kopyalandı.');
        } catch (e) {
            console.warn('[Stats] export failed:', e);
            alert('Hata', 'Dışa aktarma başarısız oldu.');
        }
    };

    const handleImport = async () => {
        if (!importData.trim()) {
            alert('Hata', 'Lütfen içe aktarılacak JSON verisini yapıştırın.');
            return;
        }

        confirm('Uyarı', 'Bu işlem mevcut tüm verilerin üzerine yazacaktır. Emin misiniz?', async () => {
            const success = await importAllData(importData);
            if (success) {
                refreshData();
                bumpDataVersion();
                alert('Başarılı', 'Veriler içe aktarıldı. Görünüm güncellendi.');
                setImportData('');
                setShowImport(false);
            } else {
                alert('Hata', 'Geçersiz veri formatı.');
            }
        }, { destructive: true });
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 48 }}>📊</Text>
                    <Text style={{ color: colors.textMuted }}>Yükleniyor...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>📊 İstatistikler</Text>

                {deckScope ? (
                    <View style={styles.scopeRow}>
                        <Text style={styles.scopeText} numberOfLines={1}>🗃️ {deckScope}</Text>
                        <TouchableOpacity onPress={() => router.replace('/stats' as any)}>
                            <Text style={styles.scopeLink}>Tüm koleksiyon ›</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <Text style={styles.scopeHint}>Tüm koleksiyon — bir desteye özel istatistik için aşağıdan deste seç.</Text>
                )}

                <View style={styles.todayCard}>
                    <Text style={styles.sectionTitle}>Bugünün Özeti</Text>
                    <View style={styles.todayGrid}>
                        <View style={styles.todayStat}>
                            <Text style={styles.todayNumber}>{todayStats.reviewed}</Text>
                            <Text style={styles.todayLabel}>Tekrar</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={[styles.todayNumber, { color: colors.btnGood }]}>{accuracy}%</Text>
                            <Text style={styles.todayLabel}>Doğruluk</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={styles.todayNumber}>{studyMinutes}</Text>
                            <Text style={styles.todayLabel}>Dakika</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={[styles.todayNumber, { color: colors.badgeNew }]}>{todayStats.newCardsIntroduced}</Text>
                            <Text style={styles.todayLabel}>Yeni Kart</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.streakCard}>
                    <View style={styles.streakHeader}>
                        <Text style={styles.sectionTitle}>🔥 Günlük Seri</Text>
                        <Text style={styles.streakBest}>En uzun: {streak.best} gün</Text>
                    </View>
                    <View style={styles.streakBody}>
                        <View style={styles.streakInfo}>
                            <View style={styles.streakRow}>
                                <Text style={styles.streakNumber}>{streak.current}</Text>
                                <Text style={styles.streakUnit}>gün üst üste çalıştın</Text>
                            </View>
                            <Text style={styles.streakHint}>
                                {streak.studiedToday
                                    ? 'Bugünü tamamladın — böyle devam! 💪'
                                    : streak.current > 0
                                        ? 'Bugün henüz çalışmadın; seriyi korumak için birkaç kart çöz.'
                                        : 'Bugün birkaç kart çözerek yeni bir seri başlat.'}
                            </Text>
                        </View>
                        <View style={styles.streakStripWrap}>
                            <WeekStreakStrip rolloverHour={settings.dayRolloverHour} dataVersion={dataVersion} />
                        </View>
                    </View>
                </View>

                <View style={styles.overviewCard}>
                    <Text style={styles.sectionTitle}>Genel Durum</Text>
                    <View style={styles.overviewBar}>
                        {bucketTotals.newCount + bucketTotals.learningCount + bucketTotals.reviewCount > 0 ? (
                            <>
                                <View style={[styles.overviewSegment, { flex: bucketTotals.newCount, backgroundColor: colors.badgeNewBg }]} />
                                <View style={[styles.overviewSegment, { flex: bucketTotals.learningCount, backgroundColor: colors.badgeLearnBg }]} />
                                <View style={[styles.overviewSegment, { flex: bucketTotals.reviewCount, backgroundColor: colors.badgeReviewBg }]} />
                            </>
                        ) : (
                            <View style={[styles.overviewSegment, { flex: 1, backgroundColor: colors.borderLight }]} />
                        )}
                    </View>

                    <View style={styles.overviewLegend}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: colors.badgeNew }]} />
                            <Text style={styles.legendText}>Yeni: {bucketTotals.newCount}</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: colors.badgeLearn }]} />
                            <Text style={styles.legendText}>Öğren: {bucketTotals.learningCount}</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: colors.badgeReview }]} />
                            <Text style={styles.legendText}>Tekrar: {bucketTotals.reviewCount}</Text>
                        </View>
                    </View>

                    <Text style={styles.algorithmInfo}>
                        📐 Zamanlayıcı: <Text style={{ fontWeight: '700', color: colors.accent }}>{settings.algorithm}</Text>
                    </Text>
                    <Text style={styles.algorithmInfo}>
                        Young: {bucketTotals.youngCount} · Mature: {bucketTotals.matureCount}
                    </Text>
                </View>

                {(deckStats.length > 0 || !deckScope) && (
                    <Text style={styles.sectionTitle2}>
                        {deckScope ? 'Alt Deste İlerlemesi' : 'Deste Bazlı İlerleme'}
                    </Text>
                )}
                {deckStats.map((deck) => (
                    <TouchableOpacity
                        key={deck.name}
                        style={styles.subjectRow}
                        onPress={() => router.push(`/stats?deck=${encodeURIComponent(deck.name)}` as any)}
                        accessibilityRole="button"
                        accessibilityLabel={`${deck.displayName} destesinin istatistiklerini aç`}
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
                                {deck.studied}/{deck.total} çalışıldı · Yeni {deck.newCount} · Öğrenme {deck.learningCount} · Tekrar {deck.reviewCount}
                            </Text>
                            <Text style={styles.subjectDetailText}>
                                Young {deck.youngCount} · Mature {deck.matureCount}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
                {!deckScope && deckStats.length === 0 && (
                    <Text style={styles.scopeHint}>Henüz deste yok — Desteler ekranından bir deste oluştur.</Text>
                )}

                {!deckScope && (<>
                <Text style={[styles.sectionTitle2, { marginTop: Spacing.xl }]}>Veri Yönetimi (Yedekleme)</Text>
                <View style={styles.dataCard}>
                    <Text style={styles.dataDesc}>
                        Verilerinizi JSON olarak dışa aktarabilir veya aynı formatla geri yükleyebilirsiniz.
                    </Text>

                    <View style={styles.dataButtons}>
                        <TouchableOpacity style={[styles.dataBtn, styles.exportBtn]} onPress={handleExport}>
                            <Text style={styles.dataBtnText}>📤 Dışa Aktar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.dataBtn, styles.importToggleBtn]}
                            onPress={() => setShowImport(!showImport)}
                        >
                            <Text style={[styles.dataBtnText, { color: colors.textPrimary }]}>
                                {showImport ? 'İptal' : '📥 İçe Aktar'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {showImport && (
                        <View style={styles.importSection}>
                            <TextInput
                                style={styles.importInput}
                                placeholder="JSON verisini buraya yapıştırın..."
                                placeholderTextColor={colors.textMuted}
                                multiline
                                value={importData}
                                onChangeText={setImportData}
                            />
                            <TouchableOpacity style={styles.confirmImportBtn} onPress={handleImport}>
                                <Text style={styles.confirmImportText}>Verileri Geri Yükle</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
                </>)}

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    scrollContent: { padding: Spacing.lg, gap: Spacing.md },
    title: { fontSize: FontSize.xxl, fontWeight: '700', color: colors.textPrimary, marginBottom: Spacing.sm },
    scopeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.md,
        backgroundColor: colors.accentLight,
        borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
    },
    scopeText: { flexShrink: 1, fontSize: FontSize.md, fontWeight: '700', color: colors.accent },
    scopeLink: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
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
    todayGrid: { flexDirection: 'row', justifyContent: 'space-around' },
    todayStat: { alignItems: 'center' },
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
    streakHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    streakBest: { fontSize: FontSize.sm, color: colors.textMuted },
    streakBody: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.xl,
        flexWrap: 'wrap',
    },
    streakInfo: { flexShrink: 1, minWidth: 180 },
    streakStripWrap: { flexGrow: 1, minWidth: 300 },
    streakRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
    streakNumber: { fontSize: 44, fontWeight: '700', color: colors.btnHard },
    streakUnit: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
    streakHint: { fontSize: FontSize.sm, color: colors.textMuted, marginTop: 2 },

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
    overviewLegend: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.sm },
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

    dataCard: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    dataDesc: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.md },
    dataButtons: { flexDirection: 'row', gap: Spacing.md },
    dataBtn: {
        flex: 1,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
        borderWidth: 1,
    },
    exportBtn: { backgroundColor: colors.accent, borderColor: colors.accent },
    importToggleBtn: { backgroundColor: colors.bgInput, borderColor: colors.border },
    dataBtnText: { fontSize: FontSize.md, fontWeight: '600', color: colors.white },
    importSection: { marginTop: Spacing.md },
    importInput: {
        backgroundColor: colors.bgInput,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        minHeight: 100,
        color: colors.textPrimary,
        marginBottom: Spacing.md,
    },
    confirmImportBtn: {
        backgroundColor: colors.badgeNewBg,
        borderColor: colors.badgeNew,
        borderWidth: 1,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
    },
    confirmImportText: { fontSize: FontSize.md, fontWeight: '700', color: colors.badgeNew },
    });
}
