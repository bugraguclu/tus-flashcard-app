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
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import { getAllSubjects } from '../../lib/subjects';
import { DEFAULT_SETTINGS, exportAllData, importAllData, loadSettings } from '../../lib/storage';
import { aggregateBucketsSql, perSubjectStatsSql } from '../../lib/statsHelpers';
import {
    getDailyReviewCounts,
    getStudyStreak,
    getTodayAnswerStats,
    type StudyStreak,
    type TodayAnswerStats,
} from '../../lib/reviewLogger';
import { confirm, alert } from '../../lib/confirm';
import type { AppSettings } from '../../lib/types';
import { useApp } from './_layout';

const EMPTY_TODAY: TodayAnswerStats = {
    reviewed: 0,
    passed: 0,
    failed: 0,
    newCardsIntroduced: 0,
    studyTimeMs: 0,
};

export default function StatsScreen() {
    const { dataVersion, bumpDataVersion, refreshData } = useApp();
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [importData, setImportData] = useState('');
    const [showImport, setShowImport] = useState(false);

    useEffect(() => {
        setSettings(loadSettings());
        setLoading(false);
    }, [dataVersion]);

    // All "today" numbers come from the review log — the durable source that survives
    // restarts, OS sleep and day rollovers (unlike the old cached session blob).
    const todayStats = useMemo(() => {
        try {
            return getTodayAnswerStats(settings.dayRolloverHour);
        } catch (e) {
            console.warn('[Stats] getTodayAnswerStats failed:', e);
            return EMPTY_TODAY;
        }
    }, [dataVersion, settings.dayRolloverHour]);

    const streak = useMemo<StudyStreak>(() => {
        try {
            return getStudyStreak(settings.dayRolloverHour);
        } catch (e) {
            console.warn('[Stats] getStudyStreak failed:', e);
            return { current: 0, studiedToday: false, best: 0 };
        }
    }, [dataVersion, settings.dayRolloverHour]);

    const recentDays = useMemo(() => {
        try {
            return getDailyReviewCounts(14, settings.dayRolloverHour);
        } catch (e) {
            console.warn('[Stats] getDailyReviewCounts failed:', e);
            return [];
        }
    }, [dataVersion, settings.dayRolloverHour]);

    const bucketTotals = useMemo(() => aggregateBucketsSql(), [dataVersion]);

    const subjectStats = useMemo(() => {
        const subjects = getAllSubjects();
        const subjectIds = subjects.map((s) => s.id);
        const perSubject = perSubjectStatsSql(subjectIds);

        return subjects.map((subject) => {
            const bucket = perSubject.get(subject.id);
            const total = bucket?.total ?? 0;
            const newCount = bucket?.newCount ?? 0;
            const studied = total - newCount;
            const pct = total > 0 ? Math.round((studied / total) * 100) : 0;

            return {
                ...subject,
                total,
                studied,
                newCount,
                learningCount: bucket?.learningCount ?? 0,
                reviewCount: bucket?.reviewCount ?? 0,
                youngCount: bucket?.youngCount ?? 0,
                matureCount: bucket?.matureCount ?? 0,
                dueCount: 0, // Due count requires date comparison; omitted for now
                pct,
            };
        });
    }, [dataVersion]);

    const accuracy = todayStats.reviewed > 0
        ? Math.round((todayStats.passed / todayStats.reviewed) * 100)
        : 0;
    const studyMinutes = Math.round(todayStats.studyTimeMs / 60000);
    const maxRecentCount = Math.max(1, ...recentDays.map((day) => day.count));

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
                    <Text style={{ color: Colors.textMuted }}>Yükleniyor...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>📊 İstatistikler</Text>

                <View style={styles.todayCard}>
                    <Text style={styles.sectionTitle}>Bugünün Özeti</Text>
                    <View style={styles.todayGrid}>
                        <View style={styles.todayStat}>
                            <Text style={styles.todayNumber}>{todayStats.reviewed}</Text>
                            <Text style={styles.todayLabel}>Tekrar</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={[styles.todayNumber, { color: Colors.btnGood }]}>{accuracy}%</Text>
                            <Text style={styles.todayLabel}>Doğruluk</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={styles.todayNumber}>{studyMinutes}</Text>
                            <Text style={styles.todayLabel}>Dakika</Text>
                        </View>
                        <View style={styles.todayStat}>
                            <Text style={[styles.todayNumber, { color: Colors.badgeNew }]}>{todayStats.newCardsIntroduced}</Text>
                            <Text style={styles.todayLabel}>Yeni Kart</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.streakCard}>
                    <View style={styles.streakHeader}>
                        <Text style={styles.sectionTitle}>🔥 Günlük Seri</Text>
                        <Text style={styles.streakBest}>En uzun: {streak.best} gün</Text>
                    </View>
                    <View style={styles.streakRow}>
                        <Text style={styles.streakNumber}>{streak.current}</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.streakUnit}>gün üst üste çalıştın</Text>
                            <Text style={styles.streakHint}>
                                {streak.studiedToday
                                    ? 'Bugünü tamamladın — böyle devam! 💪'
                                    : streak.current > 0
                                        ? 'Bugün henüz çalışmadın; seriyi korumak için birkaç kart çöz.'
                                        : 'Bugün birkaç kart çözerek yeni bir seri başlat.'}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.historyRow}>
                        {recentDays.map((day) => {
                            const intensity = day.count === 0 ? 0 : Math.max(0.25, day.count / maxRecentCount);
                            return (
                                <View key={day.date} style={styles.historyCol}>
                                    <View
                                        style={[
                                            styles.historyCell,
                                            day.count > 0
                                                ? { backgroundColor: Colors.accent, opacity: intensity }
                                                : { backgroundColor: Colors.borderLight },
                                        ]}
                                        accessibilityLabel={`${day.date}: ${day.count} tekrar`}
                                    />
                                </View>
                            );
                        })}
                    </View>
                    <View style={styles.historyLabels}>
                        <Text style={styles.historyLabelText}>2 hafta önce</Text>
                        <Text style={styles.historyLabelText}>bugün</Text>
                    </View>
                </View>

                <View style={styles.overviewCard}>
                    <Text style={styles.sectionTitle}>Genel Durum</Text>
                    <View style={styles.overviewBar}>
                        {bucketTotals.newCount + bucketTotals.learningCount + bucketTotals.reviewCount > 0 ? (
                            <>
                                <View style={[styles.overviewSegment, { flex: bucketTotals.newCount, backgroundColor: Colors.badgeNewBg }]} />
                                <View style={[styles.overviewSegment, { flex: bucketTotals.learningCount, backgroundColor: Colors.badgeLearnBg }]} />
                                <View style={[styles.overviewSegment, { flex: bucketTotals.reviewCount, backgroundColor: Colors.badgeReviewBg }]} />
                            </>
                        ) : (
                            <View style={[styles.overviewSegment, { flex: 1, backgroundColor: Colors.borderLight }]} />
                        )}
                    </View>

                    <View style={styles.overviewLegend}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: Colors.badgeNew }]} />
                            <Text style={styles.legendText}>Yeni: {bucketTotals.newCount}</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: Colors.badgeLearn }]} />
                            <Text style={styles.legendText}>Öğren: {bucketTotals.learningCount}</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: Colors.badgeReview }]} />
                            <Text style={styles.legendText}>Tekrar: {bucketTotals.reviewCount}</Text>
                        </View>
                    </View>

                    <Text style={styles.algorithmInfo}>
                        📐 Zamanlayıcı: <Text style={{ fontWeight: '700', color: Colors.accent }}>{settings.algorithm}</Text>
                    </Text>
                    <Text style={styles.algorithmInfo}>
                        Young: {bucketTotals.youngCount} · Mature: {bucketTotals.matureCount}
                    </Text>
                </View>

                <Text style={styles.sectionTitle2}>Ders Bazlı İlerleme</Text>
                {subjectStats.map((subject) => (
                    <View key={subject.id} style={styles.subjectRow}>
                        <View style={styles.subjectHeader}>
                            <Text style={styles.subjectIcon}>{subject.icon}</Text>
                            <Text style={styles.subjectName}>{subject.name}</Text>
                            <Text style={styles.subjectPct}>{subject.pct}%</Text>
                        </View>
                        <View style={styles.subjectProgress}>
                            <View style={[styles.progressSegment, { width: `${subject.pct}%`, backgroundColor: Colors.accent }]} />
                        </View>
                        <View style={styles.subjectDetail}>
                            <Text style={styles.subjectDetailText}>
                                {subject.studied}/{subject.total} çalışıldı
                                {subject.dueCount > 0 && <Text style={{ color: Colors.btnAgain }}> · {subject.dueCount} bekliyor</Text>}
                            </Text>
                            <Text style={styles.subjectDetailText}>
                                Young {subject.youngCount} · Mature {subject.matureCount}
                            </Text>
                        </View>
                    </View>
                ))}

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
                            <Text style={[styles.dataBtnText, { color: Colors.textPrimary }]}>
                                {showImport ? 'İptal' : '📥 İçe Aktar'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {showImport && (
                        <View style={styles.importSection}>
                            <TextInput
                                style={styles.importInput}
                                placeholder="JSON verisini buraya yapıştırın..."
                                placeholderTextColor={Colors.textMuted}
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

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bgPrimary },
    scrollContent: { padding: Spacing.lg, gap: Spacing.md },
    title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },

    todayCard: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
    todayGrid: { flexDirection: 'row', justifyContent: 'space-around' },
    todayStat: { alignItems: 'center' },
    todayNumber: { fontSize: FontSize.xxxl, fontWeight: '700', color: Colors.accent },
    todayLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '500', marginTop: 2 },

    streakCard: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    streakHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    streakBest: { fontSize: FontSize.sm, color: Colors.textMuted },
    streakRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
    streakNumber: { fontSize: 44, fontWeight: '700', color: Colors.btnHard },
    streakUnit: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
    streakHint: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
    historyRow: { flexDirection: 'row', gap: 4 },
    historyCol: { flex: 1 },
    historyCell: { height: 22, borderRadius: 4 },
    historyLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    historyLabelText: { fontSize: FontSize.xs, color: Colors.textMuted },

    overviewCard: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
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
    legendText: { fontSize: FontSize.sm, color: Colors.textSecondary },
    algorithmInfo: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },

    sectionTitle2: {
        fontSize: FontSize.lg,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginTop: Spacing.sm,
    },
    subjectRow: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        ...Shadows.sm,
    },
    subjectHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    subjectIcon: { fontSize: 18 },
    subjectName: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
    subjectPct: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.accent },
    subjectProgress: {
        height: 4,
        backgroundColor: Colors.borderLight,
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 4,
    },
    progressSegment: { height: '100%', borderRadius: 2 },
    subjectDetail: {},
    subjectDetailText: { fontSize: FontSize.xs, color: Colors.textMuted },

    dataCard: {
        backgroundColor: Colors.bgCard,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    dataDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
    dataButtons: { flexDirection: 'row', gap: Spacing.md },
    dataBtn: {
        flex: 1,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
        borderWidth: 1,
    },
    exportBtn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
    importToggleBtn: { backgroundColor: Colors.bgInput, borderColor: Colors.border },
    dataBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.white },
    importSection: { marginTop: Spacing.md },
    importInput: {
        backgroundColor: Colors.bgInput,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: BorderRadius.sm,
        padding: Spacing.md,
        minHeight: 100,
        color: Colors.textPrimary,
        marginBottom: Spacing.md,
    },
    confirmImportBtn: {
        backgroundColor: Colors.badgeNewBg,
        borderColor: Colors.badgeNew,
        borderWidth: 1,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.sm,
        alignItems: 'center',
    },
    confirmImportText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.badgeNew },
});
