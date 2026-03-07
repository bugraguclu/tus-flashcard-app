// ============================================================
// TUS Flashcard - İstatistik Ekranı
// ============================================================

import React, { useState, useEffect } from 'react';
import {
    View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Alert, TextInput
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Colors, Spacing, BorderRadius, FontSize, Shadows } from '../../constants/theme';
import { TUS_SUBJECTS, TUS_CARDS } from '../../lib/data';
import { loadAllCardStates, loadCustomCards, loadSessionStats, loadSettings, exportAllData, importAllData, DEFAULT_SETTINGS } from '../../lib/storage';
import { todayLocalYMD } from '../../lib/scheduler';
import type { CardState, SessionStats, AppSettings } from '../../lib/types';

export default function StatsScreen() {
    const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
    const [sessionStats, setSessionStats] = useState<SessionStats>({
        reviewed: 0, correct: 0, wrong: 0, startTime: Date.now(), newCardsToday: 0,
    });
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [importData, setImportData] = useState('');
    const [showImport, setShowImport] = useState(false);

    useEffect(() => {
        async function load() {
            const [cs, ss, s] = await Promise.all([
                loadAllCardStates(), loadSessionStats(), loadSettings(),
            ]);
            setCardStates(cs); setSessionStats(ss); setSettings(s);
            setLoading(false);
        }
        load();
    }, []);

    const handleExport = async () => {
        try {
            const data = await exportAllData();
            await Clipboard.setStringAsync(data);
            Alert.alert('✅ Başarılı', 'Verileriniz panoya kopyalandı. Güvenli bir yere yapıştırın!');
        } catch (e) {
            Alert.alert('Hata', 'Dışa aktarma başarısız oldu.');
        }
    };

    const handleImport = async () => {
        if (!importData.trim()) {
            Alert.alert('Hata', 'Lütfen içe aktarılacak JSON verisini yapıştırın.');
            return;
        }

        Alert.alert('⚠️ Uyarı', 'Bu işlem mevcut tüm verilerinizin üzerine yazacaktır. Emin misiniz?', [
            { text: 'İptal', style: 'cancel' },
            {
                text: 'İçe Aktar',
                style: 'destructive',
                onPress: async () => {
                    const success = await importAllData(importData);
                    if (success) {
                        Alert.alert('✅ Başarılı', 'Veriler başarıyla içe aktarıldı. Uygulamayı yeniden başlatın.');
                        setImportData('');
                        setShowImport(false);
                    } else {
                        Alert.alert('❌ Hata', 'Geçersiz veri formatı. İçe aktarılamadı.');
                    }
                }
            }
        ]);
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

    const allCards = [...TUS_CARDS];
    const accuracy = sessionStats.reviewed > 0
        ? Math.round((sessionStats.correct / sessionStats.reviewed) * 100)
        : 0;
    const studyMinutes = Math.round((Date.now() - sessionStats.startTime) / 60000);
    const today = todayLocalYMD();

    // Derse göre istatistikler
    const subjectStats = TUS_SUBJECTS.map(sub => {
        const cards = allCards.filter(c => c.subject === sub.id);
        let mastered = 0, learning = 0, newCount = 0, dueCount = 0;
        cards.forEach(c => {
            const cs = cardStates[c.id];
            if (!cs || cs.status === 'new') newCount++;
            else if (cs.status === 'learning') learning++;
            else if (cs.status === 'review') {
                if (cs.interval >= 21) mastered++;
                else mastered++;
                if (cs.dueDate <= today) dueCount++;
            }
        });
        const studied = cards.length - newCount;
        const pct = cards.length > 0 ? Math.round((studied / cards.length) * 100) : 0;
        return { ...sub, total: cards.length, studied, newCount, learning, mastered, dueCount, pct };
    });

    // Genel istatistikler
    let totalNew = 0, totalLearning = 0, totalReview = 0, totalMastered = 0;
    allCards.forEach(c => {
        const cs = cardStates[c.id];
        if (!cs || cs.status === 'new') totalNew++;
        else if (cs.status === 'learning') totalLearning++;
        else if (cs.status === 'review') {
            totalReview++;
            if (cs.interval >= 21) totalMastered++;
        }
    });

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>📊 İstatistikler</Text>

                {/* Bugünün özeti */}
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

                {/* Genel durum */}
                <View style={styles.overviewCard}>
                    <Text style={styles.sectionTitle}>Genel Durum</Text>
                    <View style={styles.overviewBar}>
                        <View style={[styles.overviewSegment, { flex: totalNew || 1, backgroundColor: Colors.badgeNewBg }]} />
                        <View style={[styles.overviewSegment, { flex: totalLearning || 0.1, backgroundColor: Colors.badgeLearnBg }]} />
                        <View style={[styles.overviewSegment, { flex: totalReview || 0.1, backgroundColor: Colors.badgeReviewBg }]} />
                    </View>
                    <View style={styles.overviewLegend}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: Colors.badgeNew }]} />
                            <Text style={styles.legendText}>Yeni: {totalNew}</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: Colors.badgeLearn }]} />
                            <Text style={styles.legendText}>Öğren: {totalLearning}</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: Colors.badgeReview }]} />
                            <Text style={styles.legendText}>Tekrar: {totalReview}</Text>
                        </View>
                    </View>
                    <Text style={styles.algorithmInfo}>
                        📐 Algoritma: <Text style={{ fontWeight: '700', color: Colors.accent }}>{settings.algorithm}</Text>
                        {settings.algorithm === 'FSRS' && (
                            <Text> · Hedef: %{Math.round(settings.desiredRetention * 100)}</Text>
                        )}
                    </Text>
                </View>

                {/* Derse göre */}
                <Text style={styles.sectionTitle2}>Ders Bazlı İlerleme</Text>
                {subjectStats.map(sub => (
                    <View key={sub.id} style={styles.subjectRow}>
                        <View style={styles.subjectHeader}>
                            <Text style={styles.subjectIcon}>{sub.icon}</Text>
                            <Text style={styles.subjectName}>{sub.name}</Text>
                            <Text style={styles.subjectPct}>{sub.pct}%</Text>
                        </View>
                        <View style={styles.subjectProgress}>
                            <View style={[styles.progressSegment, { width: `${sub.pct}%`, backgroundColor: Colors.accent }]} />
                        </View>
                        <View style={styles.subjectDetail}>
                            <Text style={styles.subjectDetailText}>
                                {sub.studied}/{sub.total} çalışıldı
                                {sub.dueCount > 0 && <Text style={{ color: Colors.btnAgain }}> · {sub.dueCount} bekliyor</Text>}
                            </Text>
                        </View>
                    </View>
                ))}

                {/* Veri Yönetimi */}
                <Text style={[styles.sectionTitle2, { marginTop: Spacing.xl }]}>Veri Yönetimi (Yedekleme)</Text>
                <View style={styles.dataCard}>
                    <Text style={styles.dataDesc}>
                        Verilerinizi panoya JSON formatında kopyalayarak yedekleyebilir veya yapıştırarak geri yükleyebilirsiniz.
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
                                <Text style={styles.confirmImportText}>Verileri Kurtar</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Alt Boşluk */}
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
