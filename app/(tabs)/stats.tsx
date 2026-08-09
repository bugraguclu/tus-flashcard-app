import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    SafeAreaView,
    TouchableOpacity,
    TextInput,
    useWindowDimensions,
    Modal,
    Pressable,
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
import { useI18n } from '../../hooks/useI18n';

const EMPTY_TODAY: TodayAnswerStats = {
    reviewed: 0,
    passed: 0,
    failed: 0,
    newCardsIntroduced: 0,
    studyTimeMs: 0,
};

export default function StatsScreen() {
    const { t, l, localeTag } = useI18n();
    const { width } = useWindowDimensions();
    const isCompact = width < 600;
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors, isCompact), [colors, isCompact]);
    const router = useRouter();
    const params = useLocalSearchParams();
    const { dataVersion, bumpDataVersion, refreshData } = useApp();
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [importData, setImportData] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [deckPickerVisible, setDeckPickerVisible] = useState(false);

    // Anki-style scoping: /stats shows the whole collection, /stats?deck=X only that
    // deck's subtree. The deck list and sidebar pick the scope for the user.
    const deckScope = typeof params.deck === 'string' && params.deck.length > 0 ? params.deck : null;
    const scopeTitle = deckScope
        ? deckScope.replaceAll('::', ' › ')
        : l('Tüm Koleksiyon', 'Whole Collection');

    const deckPickerItems = useMemo(() => {
        try {
            return getAllDecks()
                .filter((deck) => !deck.isFiltered)
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

    const handleExport = async () => {
        try {
            const data = await exportAllData();
            await Clipboard.setStringAsync(data);
            alert(t('common.completed'), l('Yedek verisi panoya kopyalandı.', 'Backup data was copied to the clipboard.'));
        } catch (e) {
            console.warn('[Stats] export failed:', e);
            alert(t('common.error'), l('Veriler dışa aktarılamadı.', 'Could not export the data.'));
        }
    };

    const handleImport = async () => {
        if (!importData.trim()) {
            alert(t('common.error'), l('Lütfen içe aktarılacak JSON verisini yapıştırın.', 'Paste the JSON data you want to import.'));
            return;
        }

        confirm(l('Uyarı', 'Warning'), l('Bu işlem mevcut tüm verilerin üzerine yazacak. Devam etmek istiyor musunuz?', 'This will overwrite all existing data. Do you want to continue?'), async () => {
            const success = await importAllData(importData);
            if (success) {
                refreshData();
                bumpDataVersion();
                alert(t('common.completed'), l('Veriler içe aktarıldı.', 'Data imported successfully.'));
                setImportData('');
                setShowImport(false);
            } else {
                alert(t('common.error'), l('Geçersiz veri biçimi.', 'Invalid data format.'));
            }
        }, { destructive: true });
    };

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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <View style={styles.titleRow}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleBack}
                        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={deckScope ? l('Deste genel bakışına dön', 'Back to deck overview') : l('Destelere dön', 'Back to decks')}
                    >
                        <Text style={styles.backButtonText}>‹</Text>
                    </TouchableOpacity>
                    <View style={styles.titleBlock}>
                        <Text style={styles.title} numberOfLines={1}>📊 {t('common.statistics')}</Text>
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
                    </View>
                </View>

                <View style={styles.todayCard}>
                    <Text style={styles.sectionTitle}>{l('Bugünün Özeti', 'Today')}</Text>
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
                        <Text style={styles.sectionTitle}>🔥 {l('Günlük Seri', 'Daily Streak')}</Text>
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

                <View style={styles.overviewCard}>
                    <Text style={styles.sectionTitle}>{l('Genel Durum', 'Card Counts')}</Text>
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
                            <Text style={styles.legendText}>{t('anki.new')}: {bucketTotals.newCount}</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: colors.badgeLearn }]} />
                            <Text style={styles.legendText}>{t('anki.learn')}: {bucketTotals.learningCount}</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: colors.badgeReview }]} />
                            <Text style={styles.legendText}>{t('anki.review')}: {bucketTotals.reviewCount}</Text>
                        </View>
                    </View>

                    <Text style={styles.algorithmInfo}>
                        {l('Genç', 'Young')}: {bucketTotals.youngCount} · {l('Olgun', 'Mature')}: {bucketTotals.matureCount}
                    </Text>
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

                {!deckScope && (<>
                <Text style={[styles.sectionTitle2, { marginTop: Spacing.xl }]}>{l('Veri Yönetimi (Yedekleme)', 'Data Management (Backup)')}</Text>
                <View style={styles.dataCard}>
                    <Text style={styles.dataDesc}>
                        {l('Verilerinizi JSON olarak dışa aktarabilir veya aynı biçimdeki bir yedekten geri yükleyebilirsiniz.', 'Export your data as JSON or restore it from a backup in the same format.')}
                    </Text>

                    <View style={styles.dataButtons}>
                        <TouchableOpacity style={[styles.dataBtn, styles.exportBtn]} onPress={handleExport}>
                            <Text style={styles.dataBtnText}>📤 {l('Dışa Aktar', 'Export')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.dataBtn, styles.importToggleBtn]}
                            onPress={() => setShowImport(!showImport)}
                        >
                            <Text style={[styles.dataBtnText, { color: colors.textPrimary }]}>
                                {showImport ? t('common.cancel') : `📥 ${t('root.import')}`}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {showImport && (
                        <View style={styles.importSection}>
                            <TextInput
                                style={styles.importInput}
                                placeholder={l('JSON verisini buraya yapıştırın…', 'Paste JSON data here…')}
                                placeholderTextColor={colors.textMuted}
                                multiline
                                value={importData}
                                onChangeText={setImportData}
                            />
                            <TouchableOpacity style={styles.confirmImportBtn} onPress={handleImport}>
                                <Text style={styles.confirmImportText}>{l('Verileri Geri Yükle', 'Restore Data')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
                </>)}

                <View style={{ height: 40 }} />
            </ScrollView>

            <Modal
                visible={deckPickerVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setDeckPickerVisible(false)}
            >
                <Pressable style={styles.pickerOverlay} onPress={() => setDeckPickerVisible(false)}>
                    <Pressable style={styles.pickerCard} onPress={() => {}} accessibilityViewIsModal>
                        <View style={styles.pickerHeader}>
                            <View>
                                <Text style={styles.pickerEyebrow}>{t('common.statistics')}</Text>
                                <Text style={styles.pickerTitle}>{l('Deste Seç', 'Select Deck')}</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.pickerClose}
                                onPress={() => setDeckPickerVisible(false)}
                                accessibilityRole="button"
                                accessibilityLabel={l('Deste seçiciyi kapat', 'Close deck picker')}
                            >
                                <Text style={styles.pickerCloseText}>×</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                            <TouchableOpacity
                                style={[styles.pickerRow, !deckScope && styles.pickerRowActive]}
                                onPress={() => handlePickDeck(null)}
                                accessibilityRole="button"
                                accessibilityState={{ selected: !deckScope }}
                            >
                                <Text style={styles.pickerRowIcon}>▦</Text>
                                <Text style={[styles.pickerRowText, !deckScope && styles.pickerRowTextActive]}>
                                    {l('Tüm Koleksiyon', 'Whole Collection')}
                                </Text>
                                {!deckScope && <Text style={styles.pickerCheck}>✓</Text>}
                            </TouchableOpacity>
                            {deckPickerItems.map((deck) => {
                                const depth = deck.name.split('::').length - 1;
                                const active = deckScope === deck.name;
                                return (
                                    <TouchableOpacity
                                        key={deck.id}
                                        style={[
                                            styles.pickerRow,
                                            active && styles.pickerRowActive,
                                            { paddingLeft: Spacing.lg + Math.min(depth, 8) * 18 },
                                        ]}
                                        onPress={() => handlePickDeck(deck.name)}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                    >
                                        <Text style={styles.pickerRowIcon}>{depth > 0 ? '›' : '▤'}</Text>
                                        <Text style={[styles.pickerRowText, active && styles.pickerRowTextActive]} numberOfLines={1}>
                                            {getDeckDisplayName(deck.name)}
                                        </Text>
                                        {active && <Text style={styles.pickerCheck}>✓</Text>}
                                    </TouchableOpacity>
                                );
                            })}
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
    scrollContent: {
        width: '100%',
        maxWidth: 880,
        alignSelf: 'center',
        padding: isCompact ? Spacing.md : Spacing.lg,
        gap: Spacing.md,
    },
    titleRow: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backButtonText: { fontSize: 34, lineHeight: 36, color: colors.accent, fontWeight: '400' },
    titleBlock: { flex: 1, minWidth: 0 },
    title: { fontSize: FontSize.xxl, fontWeight: '800', color: colors.textPrimary },
    scopeSelector: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 36,
        maxWidth: '100%',
        marginTop: 2,
        paddingRight: Spacing.sm,
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

    dataCard: {
        backgroundColor: colors.bgCard,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: BorderRadius.md,
        padding: Spacing.lg,
        ...Shadows.sm,
    },
    dataDesc: { fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.md },
    dataButtons: { flexDirection: isCompact ? 'column' : 'row', gap: Spacing.md },
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
    });
}
