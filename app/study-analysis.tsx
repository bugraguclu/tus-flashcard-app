import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import ScreenHeader from '../components/ScreenHeader';
import { studyTypeLabel } from '../components/stopwatch/StudyTypeChips';
import { Button, IconButton } from '../components/ui/Button';
import { Card, Section, SectionFootnote } from '../components/ui/Card';
import { Chip, SegmentedControl } from '../components/ui/Choice';
import { EmptyState, ProgressBar } from '../components/ui/Feedback';
import { BackIcon, ForwardIcon } from '../components/ui/icons';
import { Radius, Type } from '../components/ui/tokens';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
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
import { studySubjectInitial } from '../lib/studyCalendar';
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
                <EmptyState
                    title={l('Henüz tekrar kaydınız yok', 'No sessions yet')}
                    body={l('Kaydettiğiniz çalışmalar ders ve tekrar türüne göre burada görünür.', 'Your sessions appear here by course and type.')}
                />
            );
        }
        return groups.map((group) => (
            <Card
                key={`${group.kind}-${group.pass}`}
                divided
                title={studyTypeLabel(l, group.kind, group.pass)}
                accessory={<Text style={styles.groupMeta}>{`${duration(group.studyMs)} · ${daysLabel(group.days)}`}</Text>}
            >
                {group.subjects.map((course) => (
                    <View
                        key={course.subject}
                        style={styles.courseRow}
                        accessible
                        accessibilityLabel={`${course.subject}: ${duration(course.studyMs)}, ${daysLabel(course.days)}, ${lastLabel(course.lastStartMs)}`}
                    >
                        <View style={styles.tile}><Text style={styles.tileText}>{studySubjectInitial(course.subject)}</Text></View>
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
            </Card>
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
                <ProgressBar value={analysis.studyMs > 0 ? ms / analysis.studyMs : 0} />
            </View>
        );

        return (
            <>
                <View style={styles.periodBar}>
                    <IconButton
                        onPress={() => setAnchorYmd(shiftAnalysisAnchor(period, anchorYmd, -1))}
                        accessibilityLabel={l('Önceki dönem', 'Previous period')}
                    >
                        <BackIcon color={colors.textPrimary} size={18} />
                    </IconButton>
                    <Text style={styles.periodTitle} numberOfLines={1}>{title}</Text>
                    <IconButton
                        onPress={() => setAnchorYmd(shiftAnalysisAnchor(period, anchorYmd, 1))}
                        accessibilityLabel={l('Sonraki dönem', 'Next period')}
                    >
                        <ForwardIcon color={colors.textPrimary} size={18} />
                    </IconButton>
                </View>
                {!includesToday ? (
                    <Button
                        variant="plain"
                        size="compact"
                        label={l('Bugüne dön', 'Back to today')}
                        onPress={() => setAnchorYmd(todayYmd)}
                        style={styles.todayLink}
                    />
                ) : null}

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {[null, ...subjects].map((option) => (
                        <Chip
                            key={option ?? 'all'}
                            label={option ?? l('Tüm Dersler', 'All Courses')}
                            selected={option === subject}
                            onPress={() => setSubject(option)}
                        />
                    ))}
                </ScrollView>

                <View style={styles.metrics}>
                    {metrics.map(([label, value]) => (
                        <Card key={label} padded style={styles.metric}>
                            <View style={styles.metricBody} accessible accessibilityLabel={`${label}: ${value}`}>
                                <Text style={styles.metricValue}>{value}</Text>
                                <Text style={styles.metricLabel}>{label}</Text>
                            </View>
                        </Card>
                    ))}
                </View>

                <Section label={l('Günlere Göre Çalışma', 'Study by Day')} padded>
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
                </Section>

                <Section label={l('Temel / Klinik', 'Basic / Clinical')} padded>
                    {analysis.sciences.map((entry) => bar(scienceLabel[entry.group], entry.studyMs, entry.group))}
                </Section>

                <Section label={l('Derslere Göre Çalışma', 'Study by Course')} padded>
                    {analysis.subjects.length === 0
                        ? <Text style={styles.chartEmpty}>{l('Henüz ders yok.', 'No courses yet.')}</Text>
                        : analysis.subjects.map((entry) => bar(entry.subject, entry.studyMs, entry.subject))}
                </Section>

                <SectionFootnote>
                    {l(
                        'Günlük ortalama, dönemin bugüne kadar geçen günleri üzerinden hesaplanır. Molalar çalışma süresine dahil edilmez. Gece yarısını geçen kayıtlar başladıkları günde gösterilir. Analiz Kronometre kayıtlarını kapsar; kart tekrarlarınız İstatistikler’dedir.',
                        'The daily average divides by the days of the period so far. Breaks are not study time. Sessions past midnight count on the day they started. The analysis covers Kronometre sessions; card reviews are in Statistics.',
                    )}
                </SectionFootnote>
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
                <SegmentedControl
                    options={[
                        { value: 'repetitions', label: l('Tekrarlar', 'Passes') },
                        { value: 'week', label: l('Haftalık', 'Weekly') },
                        { value: 'month', label: l('Aylık', 'Monthly') },
                    ]}
                    value={view}
                    onChange={setView}
                    accessibilityLabel={l('Görünüm', 'View')}
                    fill
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
        groupMeta: { fontSize: FontSize.sm, color: colors.textSecondary },
        courseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
        tile: { width: 36, height: 36, borderRadius: Radius.inset, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
        tileText: { fontSize: FontSize.sm, fontWeight: '800', color: colors.accent },
        courseCopy: { flex: 1, gap: 2 },
        courseName: { fontSize: FontSize.md, fontWeight: '700', color: colors.accent },
        courseMeta: { fontSize: FontSize.xs, color: colors.textMuted },
        courseNumbers: { alignItems: 'flex-end', gap: 2 },
        courseTime: { fontSize: FontSize.sm, fontWeight: '700', color: colors.accent },
        periodBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        periodTitle: { flex: 1, textAlign: 'center', ...Type.bodyStrong, color: colors.textPrimary },
        todayLink: { alignSelf: 'center', marginTop: -Spacing.sm },
        chips: { gap: Spacing.sm },
        metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
        metric: { flexBasis: '48%', flexGrow: 1 },
        metricBody: { alignItems: 'center', justifyContent: 'center', gap: 4 },
        metricValue: { fontSize: FontSize.lg, fontWeight: '800', color: colors.accent, fontVariant: ['tabular-nums'] },
        metricLabel: { fontSize: FontSize.xs, color: colors.textMuted },
        chart: { flexDirection: 'row', alignItems: 'flex-end', height: 170, gap: 2 },
        barSlot: { flex: 1, height: '100%', alignItems: 'center' },
        barArea: { flex: 1, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
        bar: { width: '70%', maxWidth: 22, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: colors.accent },
        barToday: { backgroundColor: colors.studyTool },
        barLabel: { fontSize: 10, color: colors.textMuted, marginTop: 4, height: 14 },
        chartEmpty: { fontSize: FontSize.sm, color: colors.textMuted },
        shareRow: { gap: 5 },
        shareHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
        shareLabel: { flex: 1, fontSize: FontSize.sm, color: colors.textPrimary },
        shareValue: { fontSize: FontSize.sm, fontWeight: '700', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
    });
}
