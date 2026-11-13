import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import ScreenHeader from '../components/ScreenHeader';
import StudyPlanEditorSheet, { weekdayShortName } from '../components/stopwatch/StudyPlanEditorSheet';
import { studyTypeLabel } from '../components/stopwatch/StudyTypeChips';
import { Button } from '../components/ui/Button';
import { Card, Section, SectionLabel } from '../components/ui/Card';
import { EmptyState, Notice } from '../components/ui/Feedback';
import { ChevronDownIcon, ChevronUpIcon, DragHandleIcon, PlusIcon } from '../components/ui/icons';
import { ListRow } from '../components/ui/Rows';
import { Radius, Type } from '../components/ui/tokens';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../constants/theme';
import { useAppSettings } from '../contexts/AppContext';
import { useI18n } from '../hooks/useI18n';
import { goBackOr } from '../lib/backNavigation';
import { alert, confirm } from '../lib/confirm';
import { formatStudyTotal } from '../lib/stopwatch';
import { recentStudySubjects } from '../lib/stopwatchStore';
import { studyDayYmd } from '../lib/studyAnalysis';
import { studySubjectInitial } from '../lib/studyCalendar';
import { loadStudyPlans, removeStudyPlans, saveStudyPlans } from '../lib/studyPlanStore';
import { WEEKDAYS_MONDAY_FIRST, emptyStudyPlan, formatPlanClock, ymdToLocalDate, type StudyPlanBlock } from '../lib/studyPlans';

/** A simple plan on its own, or every block one detailed plan created. */
type PlanEntry =
    | { type: 'single'; plan: StudyPlanBlock }
    | { type: 'group'; groupId: string; blocks: StudyPlanBlock[] };

/**
 * "Çalışma Planlama": the learner's plans. "Sade Plan" writes one recurring block; "Detaylı Plan"
 * builds a plan from the courses, hours and weekly capacity. A detailed plan is listed as one
 * entry that opens into its days; each block can be edited or removed on its own. Plans show on
 * the Kronometre's today and in the Study Calendar.
 */
export default function StudyPlansScreen() {
    const { l, locale, localeTag } = useI18n();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { settings } = useAppSettings();
    const [plans, setPlans] = useState<StudyPlanBlock[]>([]);
    const [readable, setReadable] = useState(true);
    const [editing, setEditing] = useState<{ plan: StudyPlanBlock; isNew: boolean } | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [recentSubjects, setRecentSubjects] = useState<string[]>([]);

    const reload = useCallback(() => {
        try {
            setPlans(loadStudyPlans());
            setReadable(true);
        } catch (error) {
            console.warn('[StudyPlans] read failed:', error);
            setPlans([]);
            setReadable(false);
        }
        try {
            setRecentSubjects(recentStudySubjects(8));
        } catch {
            setRecentSubjects([]);
        }
    }, []);
    useFocusEffect(reload);

    const entries = useMemo<PlanEntry[]>(() => {
        const groups = new Map<string, StudyPlanBlock[]>();
        const result: PlanEntry[] = [];
        for (const plan of [...plans].sort((a, b) => a.fromYmd.localeCompare(b.fromYmd) || a.startMinute - b.startMinute)) {
            if (!plan.groupId) {
                result.push({ type: 'single', plan });
                continue;
            }
            const blocks = groups.get(plan.groupId);
            if (blocks) blocks.push(plan);
            else {
                const created = [plan];
                groups.set(plan.groupId, created);
                result.push({ type: 'group', groupId: plan.groupId, blocks: created });
            }
        }
        return result;
    }, [plans]);

    const dateLabel = (ymd: string) => ymdToLocalDate(ymd).toLocaleDateString(localeTag, { day: 'numeric', month: 'short', year: 'numeric' });
    const reportFailure = (error: unknown) => {
        console.warn('[StudyPlans] write failed:', error);
        alert(l('Plan kaydedilemedi', 'The plan could not be saved'), l('Planlarınız değiştirilmedi.', 'Your plans were not changed.'));
    };

    const handleSave = (plan: StudyPlanBlock) => {
        try {
            setPlans(saveStudyPlans([plan]));
            setEditing(null);
        } catch (error) {
            reportFailure(error);
        }
    };
    const remove = (ids: string[], title: string) => {
        confirm(title, l('Tamamlanmış çalışma kayıtlarınız korunur.', 'Your finished sessions are kept.'), () => {
            try {
                setPlans(removeStudyPlans(ids));
                setEditing(null);
            } catch (error) {
                reportFailure(error);
            }
        }, { destructive: true });
    };

    const planSummary = (plan: StudyPlanBlock) => (
        <View style={styles.planBody}>
            <View style={styles.tile}><Text style={styles.tileText}>{studySubjectInitial(plan.subject)}</Text></View>
            <View style={styles.planCopy}>
                <Text style={styles.subject} numberOfLines={1}>{plan.subject}</Text>
                <Text style={styles.meta}>
                    {`${studyTypeLabel(l, plan.kind, plan.pass)} · ${formatPlanClock(plan.startMinute)} · ${formatStudyTotal(plan.durationMinutes * 60_000, locale)}`}
                </Text>
                <Text style={styles.muted}>
                    {plan.fromYmd === plan.throughYmd
                        ? dateLabel(plan.fromYmd)
                        : `${dateLabel(plan.fromYmd)} – ${dateLabel(plan.throughYmd)}`}
                </Text>
                {plan.fromYmd !== plan.throughYmd ? (
                    <Text style={styles.muted}>
                        {WEEKDAYS_MONDAY_FIRST.filter((day) => plan.weekdays.includes(day)).map((day) => weekdayShortName(day, locale)).join(' · ')}
                    </Text>
                ) : null}
                {plan.note ? <Text style={styles.note}>{plan.note}</Text> : null}
            </View>
        </View>
    );

    const renderEntry = (entry: PlanEntry) => {
        if (entry.type === 'single') {
            const { plan } = entry;
            return (
                <Card key={plan.id}>
                    <TouchableOpacity
                        style={styles.cardBody}
                        onPress={() => setEditing({ plan, isNew: false })}
                        onLongPress={() => remove([plan.id], l('Bu çalışma planı silinsin mi?', 'Delete this study plan?'))}
                        accessibilityRole="button"
                        accessibilityHint={l('Düzenlemek için dokunun, silmek için basılı tutun.', 'Tap to edit, hold to delete.')}
                    >
                        <Text style={styles.title}>{plan.title}</Text>
                        {planSummary(plan)}
                    </TouchableOpacity>
                </Card>
            );
        }
        const { blocks, groupId } = entry;
        const open = expanded.has(groupId);
        const totalMinutes = blocks.reduce((sum, block) => sum + block.durationMinutes, 0);
        const courses = new Set(blocks.map((block) => block.subject)).size;
        const days = new Set(blocks.map((block) => block.fromYmd)).size;
        const first = blocks[0].fromYmd;
        const last = blocks[blocks.length - 1].fromYmd;
        return (
            <Card key={groupId}>
                <View style={styles.cardBody}>
                    {/* A disclosure header: the kit's rows carry no expanded state. */}
                    <TouchableOpacity
                        onPress={() => setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(groupId)) next.delete(groupId);
                            else next.add(groupId);
                            return next;
                        })}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                    >
                        <View style={styles.groupHeader}>
                            <Text style={styles.title}>{l('Detaylı Plan', 'Detailed Plan')}</Text>
                            {open
                                ? <ChevronUpIcon color={colors.textMuted} />
                                : <ChevronDownIcon color={colors.textMuted} />}
                        </View>
                        <Text style={styles.meta}>
                            {l(
                                `${courses} ders · ${days} gün · ${formatStudyTotal(totalMinutes * 60_000, 'tr')}`,
                                `${courses} courses · ${days} days · ${formatStudyTotal(totalMinutes * 60_000, 'en')}`,
                            )}
                        </Text>
                        <Text style={styles.muted}>{`${dateLabel(first)} – ${dateLabel(last)}`}</Text>
                    </TouchableOpacity>
                    {open ? (
                        <View style={styles.blocks}>
                            {blocks.map((block) => (
                                <TouchableOpacity
                                    key={block.id}
                                    style={styles.block}
                                    onPress={() => setEditing({ plan: block, isNew: false })}
                                    accessibilityRole="button"
                                >
                                    {planSummary(block)}
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : null}
                    <Button
                        variant="plain"
                        tone="danger"
                        size="compact"
                        label={l('Planı Sil', 'Delete Plan')}
                        onPress={() => remove(blocks.map((block) => block.id), l('Detaylı plan silinsin mi?', 'Delete the detailed plan?'))}
                        style={styles.removeGroup}
                    />
                </View>
            </Card>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={l('Çalışma Planlama', 'Study Planning')}
                backAccessibilityLabel={l('Geri dön', 'Go back')}
                onBack={() => goBackOr(router)}
            />
            <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}>
                <Section
                    footnote={l(
                        'Ders, çalışma türü, tarih aralığı, haftanın günleri ve süreyi belirleyin. Planlarınız Kronometre’de ve çalışma takviminizde görünür.',
                        'Set the course, type, dates, weekdays and length. Your plans show in the stopwatch and the study calendar.',
                    )}
                >
                    {[
                        {
                            key: 'simple',
                            icon: <PlusIcon color={colors.accent} />,
                            title: l('Sade Plan', 'Simple Plan'),
                            summary: l('Tek bir dersi belirli günlerde tekrarlayın.', 'Repeat one course on chosen days.'),
                            onPress: () => setEditing({ plan: emptyStudyPlan(studyDayYmd(Date.now(), settings.dayRolloverHour)), isNew: true }),
                        },
                        {
                            key: 'detailed',
                            // Three lines, the list a detailed plan builds.
                            icon: <DragHandleIcon color={colors.accent} size={22} />,
                            title: l('Detaylı Plan', 'Detailed Plan'),
                            summary: l('Derslerinizi, sürelerinizi ve haftalık kapasitenizi girin; takvim hazırlansın.', 'Enter your courses, hours and weekly capacity to build a calendar.'),
                            onPress: () => router.push('/study-plan-wizard' as any),
                        },
                    ].map((action) => (
                        <ListRow
                            key={action.key}
                            icon={action.icon}
                            title={action.title}
                            summary={action.summary}
                            onPress={action.onPress}
                            disabled={!readable}
                            accessibilityLabel={`${action.title}. ${action.summary}`}
                        />
                    ))}
                </Section>

                {!readable ? (
                    <Notice tone="danger">
                        {l('Kaydedilen planlar okunamadı. Üzerlerine yazılmaması için düzenleme kapalı.', 'Saved plans could not be read. Editing is off so they are not overwritten.')}
                    </Notice>
                ) : entries.length === 0 ? (
                    <EmptyState
                        title={l('Çalışma planınız yok', 'No study plans')}
                        body={l('İlk planınızı oluşturup çalışma günlerinizi düzenleyin.', 'Create your first plan to organise your study days.')}
                    />
                ) : (
                    <View style={styles.list}>
                        <SectionLabel>{l('Planlarınız', 'Your Plans')}</SectionLabel>
                        {entries.map(renderEntry)}
                    </View>
                )}
            </ScrollView>

            <StudyPlanEditorSheet
                plan={editing?.plan ?? null}
                isNew={editing?.isNew ?? false}
                recentSubjects={recentSubjects}
                onClose={() => setEditing(null)}
                onSave={handleSave}
                onDelete={(plan) => {
                    // Close the sheet first: a dialog asked from inside it would open behind it on web.
                    setEditing(null);
                    remove([plan.id], l('Bu çalışma planı silinsin mi?', 'Delete this study plan?'));
                }}
            />
        </SafeAreaView>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgCard },
        scroll: { flex: 1, backgroundColor: colors.bgPrimary },
        content: { padding: Spacing.lg, gap: Spacing.lg },
        list: { gap: Spacing.md },
        cardBody: { padding: Spacing.lg, gap: Spacing.sm },
        title: { ...Type.sectionTitle, fontWeight: '800', color: colors.accent },
        groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        planBody: { flexDirection: 'row', gap: Spacing.md },
        tile: { width: 38, height: 38, borderRadius: Radius.inset, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
        tileText: { fontSize: FontSize.md, fontWeight: '800', color: colors.accent },
        planCopy: { flex: 1, gap: 2 },
        subject: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
        meta: { fontSize: FontSize.sm, color: colors.textSecondary },
        muted: { fontSize: FontSize.xs, color: colors.textMuted },
        note: { fontSize: FontSize.sm, color: colors.textPrimary, marginTop: 2 },
        blocks: { gap: Spacing.sm, marginTop: Spacing.xs },
        block: { padding: Spacing.sm, borderRadius: Radius.inset, backgroundColor: colors.bgSecondary },
        removeGroup: { alignSelf: 'flex-start', marginLeft: -Spacing.md },
    });
}
