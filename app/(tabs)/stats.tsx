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
import { TUS_SUBJECTS } from '../../lib/data';
import { DEFAULT_SETTINGS, exportAllData, importAllData, loadSessionStats, loadSettings } from '../../lib/storage';
import { aggregateBucketsSql, perSubjectStatsSql } from '../../lib/statsHelpers';
import { getTodayStudyTimeMs } from '../../lib/reviewLogger';
import { confirm, alert } from '../../lib/confirm';
import type { AppSettings, SessionStats } from '../../lib/types';
import { useApp } from './_layout';

export default function StatsScreen() {
    const { dataVersion, bumpDataVersion, refreshData } = useApp();
    const [sessionStats, setSessionStats] = useState<SessionStats>({
        reviewed: 0,
        correct: 0,
        wrong: 0,
        startTime: Date.now(),
        newCardsToday: 0,
    });
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [importData, setImportData] = useState('');
    const [showImport, setShowImport] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            const stats = await loadSessionStats();
            const appSettings = loadSettings();

            if (cancelled) return;

            setSessionStats(stats);
            setSettings(appSettings);
            setLoading(false);
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [dataVersion]);

    const bucketTotals = useMemo(() => aggregateBucketsSql(), [dataVersion]);

    const subjectStats = useMemo(() => {
        const subjectIds = TUS_SUBJECTS.map((s) => s.id);
        const perSubject = perSubjectStatsSql(subjectIds);

        return TUS_SUBJECTS.map((subject) => {
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
                masteredCount: bucket?.masteredCount ?? 0,
                dueCount: 0, // Due count requires date comparison; omitted for now
                pct,
            };
        });
    }, [dataVersion]);

    const accuracy = sessionStats.reviewed > 0
        ? Math.round((sessionStats.correct / sessionStats.reviewed) * 100)
        : 0;
    const studyMinutes = useMemo(() => {
        try {
            return Math.round(getTodayStudyTimeMs(settings.dayRolloverHour) / 60000);
        } catch (e) {
            console.warn('[Stats] studyMinutes calculation failed:', e);
            return 0;
        }
    }, [sessionStats.reviewed, settings.dayRolloverHour]);

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
        });
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
                            <Text style={styles.todayNumber}>{sessionStats.reviewed}</Text>
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
                            <Text style={[styles.todayNumber, { color: Colors.badgeNew }]}>{sessionStats.newCardsToday || 0}</Text>
                            <Text style={styles.todayLabel}>Yeni Kart</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.overviewCard}>
                    <Text style={styles.sectionTitle}>Genel Durum</Text>
                    <View style={styles.overviewBar}>
                        <View style={[styles.overviewSegment, { flex: bucketTotals.newCount || 1, backgroundColor: Colors.badgeNewBg }]} />
                        <View style={[styles.overviewSegment, { flex: bucketTotals.learningCount || 0.1, backgroundColor: Colors.badgeLearnBg }]} />
                        <View style={[styles.overviewSegment, { flex: bucketTotals.reviewCount || 0.1, backgroundColor: Colors.badgeReviewBg }]} />
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
                        📐 Scheduler: <Text style={{ fontWeight: '700', color: Colors.accent }}>{settings.algorithm}</Text>
                    </Text>
                    <Text style={styles.algorithmInfo}>
                        Young: {bucketTotals.youngCount} · Mature: {bucketTotals.matureCount} · Mastered: {bucketTotals.masteredCount}
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
                                Young {subject.youngCount} · Mature {subject.matureCount} · Mastered {subject.masteredCount}
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
