import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import ScreenHeader from '../components/ScreenHeader';
import { HeaderBackIcon, HeaderForwardIcon } from '../components/HeaderBackIcon';
import { Segmented, ToolSection } from '../components/stopwatch/StudyToolControls';
import { studyTypeLabel } from '../components/stopwatch/StudyTypeChips';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { useAppSettings, useCollectionInvalidation } from '../contexts/AppContext';
import { useI18n } from '../hooks/useI18n';
import { goBackOr } from '../lib/backNavigation';
import { TUS_STUDY_SUBJECTS, formatStudyTotal, type StudySessionRecord } from '../lib/stopwatch';
import { fetchStudySessionsBetween } from '../lib/stopwatchStore';
import {
    analyzeStudyPeriod,
    repetitionGroups,
    shiftAnalysisAnchor,
    sharePercent,
    studyDayYmd,
    type StudyAnalysisPeriod,
} from '../lib/studyAnalysis';
import { studySubjectGlyph } from '../lib/studyCalendar';
import { readStudyPlansForDisplay } from '../lib/studyPlanStore';
import { addDaysYmd, ymdToLocalDate, type StudyPlanBlock } from '../lib/studyPlans';

type AnalysisView = 'repetitions' | StudyAnalysisPeriod;

const MINUTE_MS = 60_000;

/**
 * "Çalışma Analiziniz": the Kronometre's sessions by pass and type ("Tekrarlar"), and by week or
 * month — totals, the daily average, active days, the plan's minutes, a bar for each day and the
 * share of each course and of the basic and clinical sciences, for all courses or one.
 */
export default function StudyAnalysisScreen() {
    const { l, locale, localeTag } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { settings } = useAppSettings();
    const rolloverHour = settings.dayRolloverHour;
    const { collectionVersion } = useCollectionInvalidation();
    const todayYmd = studyDayYmd(Date.now(), rolloverHour);
    const [view, setView] = useState<AnalysisView>('repetitions');
    const [anchorYmd, setAnchorYmd] = useState(todayYmd);
    const [subject, setSubject] = useState<string | null>(null);
    const [revision, setRevision] = useState(0);

    useFocusEffect(useCallback(() => setRevision((value) => value + 1), []));

    const data = useMemo<{ sessions: StudySessionRecord[]; plans: StudyPlanBlock[] }>(() => {
        try {
            return { sessions: fetchStudySessionsBetween(0, Number.MAX_SAFE_INTEGER), plans: readStudyPlansForDisplay() };
        } catch (error) {
            console.warn('[StudyAnalysis] read failed:', error);
            return { sessions: [], plans: [] };
        }
        // revision and collectionVersion are the invalidation signals for this read.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revision, collectionVersion]);

    const subjects = useMemo(() => {
        const present = new Set(data.sessions.map((session) => session.subject));
        const known = TUS_STUDY_SUBJECTS.filter((course) => present.has(course));
        const others = [...present].filter((name) => !TUS_STUDY_SUBJECTS.includes(name)).sort((a, b) => a.localeCompare(b, 'tr'));
        return [...known, ...others];
    }, [data.sessions]);

    const formatDay = (ymd: string, options: Intl.DateTimeFormatOptions) => ymdToLocalDate(ymd).toLocaleDateString(localeTag, options);
    const duration = (ms: number) => formatStudyTotal(ms, locale);
    const lastLabel = (atMs: number) => {
        const day = studyDayYmd(atMs, rolloverHour);
        if (day === todayYmd) return l('Bugün', 'Today');
        if (day === addDaysYmd(todayYmd, -1)) return l('Dün', 'Yesterday');
        return formatDay(day, { day: 'numeric', month: 'long' });
    };
    const daysLabel = (count: number) => l(`${count} Gün`, count === 1 ? '1 day' : `${count} days`);

    const renderRepetitions = () => {
        const groups = repetitionGroups(data.sessions, rolloverHour);
        if (groups.length === 0) {
            return (
                <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>{l('Henüz tekrar kaydınız yok', 'No sessions yet')}</Text>
                    <Text style={styles.emptyText}>
                        {l('Kaydettiğiniz çalışmalar ders ve tekrar türüne göre burada görünür.', 'Your sessions appear here by course and type.')}
                    </Text>
                </View>
            );
        }
        return groups.map((group) => (
            <View key={`${group.kind}-${group.pass}`} style={styles.card}>
                <View style={styles.groupHeader}>
                    <Text style={styles.groupTitle}>{studyTypeLabel(l, group.kind, group.pass)}</Text>
                    <Text style={styles.groupMeta}>{`${duration(group.studyMs)} · ${daysLabel(group.days)}`}</Text>
                </View>
                {group.subjects.map((course, index) => (
                    <View
                        key={course.subject}
                        style={[styles.courseRow, index < group.subjects.length - 1 && styles.divider]}
                        accessible
                        accessibilityLabel={`${course.subject}: ${duration(course.studyMs)}, ${daysLabel(course.days)}, ${lastLabel(course.lastStartMs)}`}
                    >
                        <View style={styles.tile}><Text style={styles.tileText}>{studySubjectGlyph(course.subject)}</Text></View>
                        <View style={styles.courseCopy}>
                            <Text style={styles.courseName} numberOfLines={1}>{course.subject}</Text>
                            <Text style={styles.courseMeta}>{lastLabel(course.lastStartMs)}</Text>
                        </View>
                        <View style={styles.courseNumbers}>
                            <Text style={styles.courseTime}>{duration(course.studyMs)}</Text>
                            <Text style={styles.courseMeta}>{daysLabel(course.days)}</Text>
                        </View>
                    </View>
                ))}
            </View>
        ));
    };

    const renderPeriod = (period: StudyAnalysisPeriod) => {
        const analysis = analyzeStudyPeriod(data.sessions, data.plans, { period, anchorYmd, todayYmd, subject, rolloverHour });
        const first = analysis.days[0];
        const last = analysis.days[analysis.days.length - 1];
        const title = period === 'month'
            ? (() => {
                const label = formatDay(first, { month: 'long', year: 'numeric' });
                return label.charAt(0).toLocaleUpperCase(localeTag) + label.slice(1);
            })()
            : `${formatDay(first, { day: 'numeric', month: 'short' })} – ${formatDay(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
        const maxDayMs = Math.max(...analysis.dayStudyMs, 0);
        const includesToday = todayYmd >= first && todayYmd <= last;
        const metrics: [string, string][] = [
            [l('Toplam Çalışma', 'Total Study'), duration(analysis.studyMs)],
            [l('Toplam Mola', 'Total Break'), duration(analysis.breakMs)],
            [l('Günlük Ortalama', 'Daily Average'), duration(analysis.dailyAverageMs)],
            [l('Çalışılan Gün', 'Active Days'), `${analysis.activeDays} / ${analysis.days.length}`],
            [l('Çalışma Sayısı', 'Sessions'), String(analysis.sessions.length)],
            [l('Planlanan Süre', 'Planned'), duration(analysis.plannedMinutes * MINUTE_MS)],
        ];
        const scienceLabel = { basic: l('Temel Bilimler', 'Basic Sciences'), clinical: l('Klinik Bilimler', 'Clinical Sciences'), other: l('Diğer', 'Other') };
        const bar = (label: string, ms: number, key: string) => (
            <View key={key} style={styles.shareRow} accessible accessibilityLabel={`${label}: ${duration(ms)}, %${sharePercent(ms, analysis.studyMs)}`}>
                <View style={styles.shareHeader}>
                    <Text style={styles.shareLabel} numberOfLines={1}>{label}</Text>
                    <Text style={styles.shareValue}>{`${duration(ms)} · %${sharePercent(ms, analysis.studyMs)}`}</Text>
                </View>
                <View style={styles.track}>
                    <View style={[styles.fill, { width: `${analysis.studyMs > 0 ? (ms / analysis.studyMs) * 100 : 0}%` }]} />
                </View>
            </View>
        );

        return (
            <>
                <View style={styles.periodBar}>
                    <TouchableOpacity
                        style={styles.stepButton}
                        onPress={() => setAnchorYmd(shiftAnalysisAnchor(period, anchorYmd, -1))}
                        accessibilityRole="button"
                        accessibilityLabel={l('Önceki dönem', 'Previous period')}
                    >
                        <HeaderBackIcon color={colors.textPrimary} size={18} />
                    </TouchableOpacity>
                    <Text style={styles.periodTitle} numberOfLines={1}>{title}</Text>
                    <TouchableOpacity
                        style={styles.stepButton}
                        onPress={() => setAnchorYmd(shiftAnalysisAnchor(period, anchorYmd, 1))}
                        accessibilityRole="button"
                        accessibilityLabel={l('Sonraki dönem', 'Next period')}
                    >
                        <HeaderForwardIcon color={colors.textPrimary} size={18} />
                    </TouchableOpacity>
                </View>
                {!includesToday ? (
                    <TouchableOpacity onPress={() => setAnchorYmd(todayYmd)} accessibilityRole="button" style={styles.todayLink}>
                        <Text style={styles.todayText}>{l('Bugüne dön', 'Back to today')}</Text>
                    </TouchableOpacity>
                ) : null}

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {[null, ...subjects].map((option) => {
                        const selected = option === subject;
                        return (
                            <TouchableOpacity
                                key={option ?? 'all'}
                                style={[styles.chip, selected && styles.chipSelected]}
                                onPress={() => setSubject(option)}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                            >
                                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option ?? l('Tüm Dersler', 'All Courses')}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <View style={styles.metrics}>
                    {metrics.map(([label, value]) => (
                        <View key={label} style={styles.metric} accessible accessibilityLabel={`${label}: ${value}`}>
                            <Text style={styles.metricValue}>{value}</Text>
                            <Text style={styles.metricLabel}>{label}</Text>
                        </View>
                    ))}
                </View>

                <ToolSection title={l('Günlere Göre Çalışma', 'Study by Day')}>
                    <View style={styles.chart}>
                        {analysis.days.map((day, index) => {
                            const ms = analysis.dayStudyMs[index];
                            const dayNumber = Number(day.slice(8));
                            const showLabel = period === 'week' || dayNumber === 1 || dayNumber % 5 === 0;
                            return (
                                <View
                                    key={day}
                                    style={styles.barSlot}
                                    accessible
                                    accessibilityLabel={`${formatDay(day, { day: 'numeric', month: 'long' })}: ${duration(ms)}`}
                                >
                                    <View style={styles.barArea}>
                                        <View style={[
                                            styles.bar,
                                            day === todayYmd && styles.barToday,
                                            { height: `${maxDayMs > 0 ? Math.max(ms > 0 ? 4 : 0, (ms / maxDayMs) * 100) : 0}%` },
                                        ]} />
                                    </View>
                                    <Text style={styles.barLabel} numberOfLines={1}>
                                        {showLabel ? (period === 'week' ? formatDay(day, { weekday: 'narrow' }) : String(dayNumber)) : ''}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                    {analysis.sessions.length === 0 ? (
                        <Text style={styles.chartEmpty}>{l('Bu dönemde çalışma kaydınız yok.', 'No sessions in this period.')}</Text>
                    ) : null}
                </ToolSection>

                <ToolSection title={l('Temel / Klinik', 'Basic / Clinical')}>
                    <View style={styles.shares}>
                        {analysis.sciences.map((entry) => bar(scienceLabel[entry.group], entry.studyMs, entry.group))}
                    </View>
                </ToolSection>

                <ToolSection title={l('Derslere Göre Çalışma', 'Study by Course')}>
                    <View style={styles.shares}>
                        {analysis.subjects.length === 0
                            ? <Text style={styles.chartEmpty}>{l('Henüz ders yok.', 'No courses yet.')}</Text>
                            : analysis.subjects.map((entry) => bar(entry.subject, entry.studyMs, entry.subject))}
                    </View>
                </ToolSection>

                <Text style={styles.footnote}>
                    {l(
                        'Günlük ortalama, dönemin bugüne kadar geçen günleri üzerinden hesaplanır. Molalar çalışma süresine dahil edilmez. Gece yarısını geçen kayıtlar başladıkları günde gösterilir. Analiz Kronometre kayıtlarını kapsar; kart tekrarlarınız İstatistikler’dedir.',
                        'The daily average divides by the days of the period so far. Breaks are not study time. Sessions past midnight count on the day they started. The analysis covers Kronometre sessions; card reviews are in Statistics.',
                    )}
                </Text>
            </>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={l('Çalışma Analiziniz', 'Your Study Analysis')}
                backAccessibilityLabel={l('Geri dön', 'Go back')}
                onBack={() => goBackOr(router)}
            />
            <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}>
                <Segmented
                    options={[
                        { value: 'repetitions', label: l('Tekrarlar', 'Passes') },
                        { value: 'week', label: l('Haftalık', 'Weekly') },
                        { value: 'month', label: l('Aylık', 'Monthly') },
                    ]}
                    value={view}
                    onChange={setView}
                />
                {view === 'repetitions' ? renderRepetitions() : renderPeriod(view)}
            </ScrollView>
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgCard },
        scroll: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { padding: Spacing.lg, gap: Spacing.lg },
        card: { backgroundColor: colors.bgCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: colors.borderLight, padding: Spacing.md, gap: Spacing.sm },
        groupHeader: {
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: colors.bgInput, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        },
        groupTitle: { fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary },
        groupMeta: { fontSize: FontSize.sm, color: colors.textSecondary },
        courseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
        divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        tile: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
        tileText: { fontSize: FontSize.sm, fontWeight: '800', color: colors.accent },
        courseCopy: { flex: 1, gap: 2 },
        courseName: { fontSize: FontSize.md, fontWeight: '700', color: colors.accent },
        courseMeta: { fontSize: FontSize.xs, color: colors.textMuted },
        courseNumbers: { alignItems: 'flex-end', gap: 2 },
        courseTime: { fontSize: FontSize.sm, fontWeight: '700', color: colors.accent },
        empty: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xxl },
        emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textSecondary },
        emptyText: { fontSize: FontSize.sm, color: colors.textMuted, textAlign: 'center' },
        periodBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        stepButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard },
        periodTitle: { flex: 1, textAlign: 'center', fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
        todayLink: { alignSelf: 'center', marginTop: -Spacing.sm },
        todayText: { fontSize: FontSize.sm, fontWeight: '700', color: colors.accent },
        chips: { gap: Spacing.sm },
        chip: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderLight },
        chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
        chipText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textSecondary },
        chipTextSelected: { color: colors.white },
        metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
        metric: {
            flexBasis: '48%', flexGrow: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 4,
            backgroundColor: colors.bgCard, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: colors.borderLight,
        },
        metricValue: { fontSize: FontSize.lg, fontWeight: '800', color: colors.accent, fontVariant: ['tabular-nums'] },
        metricLabel: { fontSize: FontSize.xs, color: colors.textMuted },
        chart: { flexDirection: 'row', alignItems: 'flex-end', height: 170, paddingHorizontal: Spacing.sm, paddingTop: Spacing.md, gap: 2 },
        barSlot: { flex: 1, height: '100%', alignItems: 'center' },
        barArea: { flex: 1, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
        bar: { width: '70%', maxWidth: 22, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: colors.accent },
        barToday: { backgroundColor: colors.studyTool },
        barLabel: { fontSize: 10, color: colors.textMuted, marginTop: 4, height: 14 },
        chartEmpty: { fontSize: FontSize.sm, color: colors.textMuted, padding: Spacing.md },
        shares: { padding: Spacing.md, gap: Spacing.md },
        shareRow: { gap: 5 },
        shareHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
        shareLabel: { flex: 1, fontSize: FontSize.sm, color: colors.textPrimary },
        shareValue: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
        track: { height: 6, borderRadius: 3, backgroundColor: colors.borderLight, overflow: 'hidden' },
        fill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
        footnote: { fontSize: FontSize.xs, lineHeight: 16, color: colors.textMuted },
    });
}
