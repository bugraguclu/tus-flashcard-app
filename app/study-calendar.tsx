import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    SectionList,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import ScreenHeader, { HeaderIconButton } from '../components/ScreenHeader';
import { HeaderBackIcon, HeaderForwardIcon } from '../components/HeaderBackIcon';
import StudyDayBox, { formatWeekRange, mondayIndex, studyWeekdayLabels } from '../components/StudyDayBox';
import SessionActionsMenu, { type SessionMenuItem } from '../components/stopwatch/SessionActionsMenu';
import SessionEditorSheet, { editorInitialFor, type SessionEditorInitial } from '../components/stopwatch/SessionEditorSheet';
import { AnalyticsIcon, StopwatchIcon } from '../components/stopwatch/StopwatchIcons';
import PlannedStudyCard from '../components/stopwatch/PlannedStudyCard';
import StudySessionCard from '../components/stopwatch/StudySessionCard';
import StudyToolsMenu, { STUDY_TOOLS_FAB_SIZE } from '../components/stopwatch/StudyToolsMenu';
import { studyTypeLabel } from '../components/stopwatch/StudyTypeChips';
import { timelineStyles } from '../components/stopwatch/timelineStyles';
import {
    BorderRadius,
    FontSize,
    Shadows,
    Spacing,
    useThemeColors,
    type ColorScheme,
} from '../constants/theme';
import { useAppSettings, useCollectionInvalidation } from '../contexts/AppContext';
import { useDeferredScreenSnapshot } from '../hooks/useDeferredScreenSnapshot';
import { useI18n } from '../hooks/useI18n';
import { useStudySubjects } from '../hooks/useStudySubjects';
import { goBackOr, openOrReturnTo } from '../lib/backNavigation';
import { alert, confirm } from '../lib/confirm';
import { dayNumberToYmd, localDayNumber, ymdToLocalDayNumber } from '../lib/ankiState';
import { getStudiedDaysBetween } from '../lib/reviewLogger';
import type { StudySessionDraft } from '../lib/stopwatch';
import { deleteStudySession, updateStudySession } from '../lib/stopwatchStore';
import { readStudyPlansForDisplay } from '../lib/studyPlanStore';
import { plansOnDay, type StudyPlanBlock } from '../lib/studyPlans';
import {
    buildMonthGrid,
    buildWeekGrid,
    formatClockHhMm,
    formatDayTotalHhMm,
    formatSessionDuration,
    getStudyCalendarSnapshot,
    type CalendarCell,
    type StudyCalendarAggregate,
    type StudySession,
} from '../lib/studyCalendar';

type ViewMode = 'month' | 'week';

interface AnchorDate {
    year: number;
    /** 0-based, as in `Date#getMonth`. */
    month: number;
    day: number;
}

const EMPTY_AGGREGATE: StudyCalendarAggregate = { days: [], totalsByDay: new Map() };
const EMPTY_STUDIED_DAYS: ReadonlySet<string> = new Set();

function anchorFromDate(date: Date): AnchorDate {
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

function anchorFromDayNumber(dayNumber: number): AnchorDate {
    const [year, month, day] = dayNumberToYmd(dayNumber).split('-').map(Number);
    return { year: year ?? 1970, month: (month ?? 1) - 1, day: day ?? 1 };
}

function shiftAnchor(anchor: AnchorDate, mode: ViewMode, direction: 1 | -1): AnchorDate {
    if (mode === 'month') {
        const shifted = new Date(anchor.year, anchor.month + direction, 1);
        // Keep the day inside the new month so October 31 -> November does not roll to December.
        const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
        return {
            year: shifted.getFullYear(),
            month: shifted.getMonth(),
            day: Math.min(anchor.day, lastDay),
        };
    }
    return anchorFromDate(new Date(anchor.year, anchor.month, anchor.day + direction * 7));
}

export default function StudyCalendarScreen() {
    const { l, locale, localeTag } = useI18n();
    const colors = useThemeColors();
    const isCompact = useWindowDimensions().width < 430;
    const styles = useMemo(() => createStyles(colors, isCompact), [colors, isCompact]);
    const router = useRouter();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    // Statistics opens a day of its week strip here (`?day=YYYY-MM-DD`), in the weekly view.
    const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
    const { settings } = useAppSettings();
    const rolloverHour = settings.dayRolloverHour;
    const { collectionVersion, invalidateCollection, getSchedulingRevision } = useCollectionInvalidation();
    const [schedulingRevision, setSchedulingRevision] = useState(() => getSchedulingRevision());
    const listRef = useRef<SectionList<StudySession, StudyDaySection>>(null);

    const todayDayNumber = localDayNumber(Date.now(), rolloverHour);
    const requestedDayNumber = typeof dayParam === 'string' ? ymdToLocalDayNumber(dayParam, -1) : -1;
    const [mode, setMode] = useState<ViewMode>(() => (requestedDayNumber >= 0 ? 'week' : 'month'));
    const [anchor, setAnchor] = useState<AnchorDate>(() => (requestedDayNumber >= 0
        ? anchorFromDayNumber(requestedDayNumber)
        : anchorFromDate(new Date())));
    const [selectedDayNumber, setSelectedDayNumber] = useState(() => (requestedDayNumber >= 0 ? requestedDayNumber : todayDayNumber));

    // Statistics may bring the learner back here with another day; the views after that are local.
    const appliedDayParam = useRef(dayParam);
    useEffect(() => {
        if (dayParam === appliedDayParam.current) return;
        appliedDayParam.current = dayParam;
        if (requestedDayNumber < 0) return;
        setSelectedDayNumber(requestedDayNumber);
        setAnchor(anchorFromDayNumber(requestedDayNumber));
        setMode('week');
    }, [dayParam, requestedDayNumber]);
    const [menuSession, setMenuSession] = useState<StudySession | null>(null);
    const [editing, setEditing] = useState<SessionEditorInitial | null>(null);
    const { recentSubjects, loadRecentSubjects, passOf } = useStudySubjects('StudyCalendar');

    // Plans change on the planning screen, which this one stays under; read them again on return.
    const [plans, setPlans] = useState<StudyPlanBlock[]>(() => readStudyPlansForDisplay());
    useFocusEffect(useCallback(() => {
        setSchedulingRevision(getSchedulingRevision());
        setPlans(readStudyPlansForDisplay());
    }, [getSchedulingRevision]));

    const cells = useMemo<CalendarCell[]>(
        () => (mode === 'month'
            ? buildMonthGrid(anchor.year, anchor.month, rolloverHour)
            : buildWeekGrid(anchor.year, anchor.month, anchor.day, rolloverHour)),
        [mode, anchor, rolloverHour],
    );

    // Only the visible range is queried and aggregated; paging the month bar loads the next one.
    const snapshotKey = useMemo(() => JSON.stringify([
        'study-calendar',
        collectionVersion,
        schedulingRevision,
        rolloverHour,
        cells[0]?.dayNumber ?? 0,
        cells[cells.length - 1]?.dayNumber ?? 0,
    ]), [collectionVersion, schedulingRevision, rolloverHour, cells]);
    const loadSnapshot = useCallback(() => ({
        aggregate: getStudyCalendarSnapshot(cells, rolloverHour),
        // The Statistics week strip's own query, so both calendars mark exactly the same days.
        studiedDays: getStudiedDaysBetween(
            cells[0]?.dayNumber ?? 0,
            cells[cells.length - 1]?.dayNumber ?? -1,
            rolloverHour,
        ),
    }), [cells, rolloverHour]);
    const { snapshot, loading, error } = useDeferredScreenSnapshot(snapshotKey, loadSnapshot);
    const aggregate = snapshot?.aggregate ?? EMPTY_AGGREGATE;
    const studiedDays: ReadonlySet<string> = snapshot?.studiedDays ?? EMPTY_STUDIED_DAYS;

    // The grid always queries whole weeks, so a month view also loads its neighbours' edge days.
    // Those cells are dimmed and carry no total, and their sessions stay out of the timeline.
    const visibleDayNumbers = useMemo(
        () => new Set(cells.filter((cell) => cell.inRange).map((cell) => cell.dayNumber)),
        [cells],
    );

    // Days with sessions, and the visible days a plan falls on, each with its plans after the
    // sessions — as TUSBuddy's calendar lists them.
    const sections = useMemo<StudyDaySection[]>(() => {
        const byDay = new Map(aggregate.days
            .filter((day) => visibleDayNumbers.has(day.dayNumber))
            .map((day) => [day.dayNumber, { ymd: day.ymd, sessions: day.sessions }]));
        const planned = new Map<number, StudyPlanBlock[]>();
        if (plans.length > 0) {
            for (const dayNumber of visibleDayNumbers) {
                const onDay = plansOnDay(plans, dayNumberToYmd(dayNumber));
                if (onDay.length > 0) planned.set(dayNumber, onDay);
            }
        }
        const dayNumbers = [...new Set([...byDay.keys(), ...planned.keys()])].sort((a, b) => a - b);
        return dayNumbers.map((dayNumber) => {
            const ymd = byDay.get(dayNumber)?.ymd ?? dayNumberToYmd(dayNumber);
            return {
                dayNumber,
                title: new Date(`${ymd}T12:00:00`).toLocaleDateString(localeTag, {
                    day: 'numeric',
                    month: 'short',
                }),
                data: byDay.get(dayNumber)?.sessions ?? [],
                plans: planned.get(dayNumber) ?? [],
            };
        });
    }, [aggregate.days, visibleDayNumbers, plans, localeTag]);

    const weekdayLabels = useMemo(() => studyWeekdayLabels(l), [l]);
    const todayColumn = cells.some((cell) => cell.dayNumber === todayDayNumber) ? mondayIndex(todayDayNumber) : -1;

    const rangeTitle = useMemo(() => {
        if (mode === 'month') {
            const label = new Date(anchor.year, anchor.month, 1)
                .toLocaleDateString(localeTag, { month: 'long', year: 'numeric' });
            return label.charAt(0).toLocaleUpperCase(localeTag) + label.slice(1);
        }
        const first = cells[0];
        const last = cells[cells.length - 1];
        if (!first || !last) return '';
        return formatWeekRange(first.dayNumber, last.dayNumber, localeTag);
    }, [mode, anchor, cells, localeTag]);

    const scrollToDay = useCallback((dayNumber: number) => {
        const sectionIndex = sections.findIndex((section) => section.dayNumber === dayNumber);
        if (sectionIndex < 0) return;
        try {
            listRef.current?.scrollToLocation({
                sectionIndex,
                itemIndex: 0,
                viewPosition: 0,
                animated: true,
            });
        } catch {
            // A section that is not laid out yet cannot be scrolled to; the list still shows it.
        }
    }, [sections]);

    const handleSelectDay = useCallback((cell: CalendarCell) => {
        setSelectedDayNumber(cell.dayNumber);
        if (!cell.inRange) {
            // Tapping a neighbouring month's day pages the grid onto that month, as iOS does.
            setAnchor({ year: cell.year, month: cell.month, day: cell.day });
            return;
        }
        scrollToDay(cell.dayNumber);
    }, [scrollToDay]);

    const handleStep = useCallback((direction: 1 | -1) => {
        setAnchor((current) => shiftAnchor(current, mode, direction));
    }, [mode]);

    const handleSwitchMode = useCallback((next: ViewMode) => {
        if (mode === next) return;
        // Keep the user's place: switching views re-anchors on the selected day.
        setAnchor(anchorFromDayNumber(selectedDayNumber));
        setMode(next);
    }, [mode, selectedDayNumber]);

    const handleShowDetails = useCallback((session: StudySession) => {
        const dayLabel = new Date(`${dayNumberToYmd(session.dayNumber)}T12:00:00`)
            .toLocaleDateString(localeTag, { day: 'numeric', month: 'long', year: 'numeric' });
        const counts = session.source === 'cards'
            ? [
                l(`Kart sayısı: ${session.cardCount}`, `Cards: ${session.cardCount}`),
                l(`Yanıt sayısı: ${session.reviewCount}`, `Answers: ${session.reviewCount}`),
            ]
            : [];
        const type = session.source === 'cards' ? null : studyTypeLabel(l, session.kind ?? 'pass', session.pass ?? 1);
        const stopwatchDetails = session.source === 'cards'
            ? []
            : [
                l(`Mola sayısı: ${session.breakCount ?? 0}`, `Breaks: ${session.breakCount ?? 0}`),
                ...(session.note ? [l(`Not: ${session.note}`, `Note: ${session.note}`)] : []),
            ];
        const origin = session.source === 'cards'
            ? l(`Deste: ${session.deckName}`, `Deck: ${session.deckName}`)
            : session.source === 'timer'
                ? l('Kronometre ile ölçüldü', 'Measured by the stopwatch')
                : l('Elle eklendi', 'Added by hand');
        alert(
            session.subject,
            [
                `${dayLabel} · ${formatClockHhMm(session.startMs)} – ${formatClockHhMm(session.endMs)}`,
                ...(type ? [l(`Tür: ${type}`, `Type: ${type}`)] : []),
                ...counts,
                l(
                    `Çalışma: ${formatSessionDuration(session.studyMs, locale)}`,
                    `Study: ${formatSessionDuration(session.studyMs, locale)}`,
                ),
                l(
                    `Mola: ${formatSessionDuration(session.breakMs, locale)}`,
                    `Break: ${formatSessionDuration(session.breakMs, locale)}`,
                ),
                ...stopwatchDetails,
                origin,
            ].join('\n'),
        );
    }, [l, locale, localeTag]);

    // The session is corrected over the calendar, which refreshes in place once it is saved.
    const handleSaveEdit = useCallback((draft: StudySessionDraft, recordId: number | null) => {
        if (recordId === null) return;
        try {
            updateStudySession(recordId, draft);
            setEditing(null);
            invalidateCollection();
        } catch (saveError) {
            console.warn('[StudyCalendar] edit failed:', saveError);
            alert(l('Kaydedilemedi', 'Could not save'), l('Oturum kaydedilemedi. Lütfen yeniden deneyin.', 'The session could not be saved. Please try again.'));
        }
    }, [l, invalidateCollection]);

    const menuItems = useCallback((session: StudySession): SessionMenuItem[] => {
        const close = () => setMenuSession(null);
        const items: SessionMenuItem[] = [];
        const initial = editorInitialFor(session);
        if (initial) {
            items.push({
                key: 'edit',
                label: l('Düzenle', 'Edit'),
                onPress: () => {
                    close();
                    loadRecentSubjects();
                    setEditing(initial);
                },
            });
        }
        if (session.source === 'cards') {
            items.push({
                key: 'deck',
                label: l('Bu oturuma git', 'Go to this session'),
                hint: session.deckName,
                onPress: () => {
                    close();
                    router.push(`/deck-overview?deck=${encodeURIComponent(session.deckName)}` as any);
                },
            });
        }
        items.push(
            {
                key: 'details',
                label: l('Oturum ayrıntıları', 'Session details'),
                hint: session.source === 'cards' ? l(`${session.cardCount} kart`, `${session.cardCount} cards`) : undefined,
                onPress: () => { close(); handleShowDetails(session); },
            },
            {
                key: 'week',
                label: l('Bu günü haftalık görünümde aç', 'Open this day in the weekly view'),
                onPress: () => {
                    close();
                    setSelectedDayNumber(session.dayNumber);
                    setAnchor(anchorFromDayNumber(session.dayNumber));
                    setMode('week');
                },
            },
        );
        const recordId = session.recordId;
        if (recordId !== null) {
            items.push({
                key: 'delete',
                label: l('Oturumu sil', 'Delete session'),
                destructive: true,
                onPress: () => {
                    close();
                    confirm(
                        l('Oturum silinsin mi?', 'Delete this session?'),
                        l(`${session.subject} oturumu kalıcı olarak silinecek.`, `The ${session.subject} session will be deleted for good.`),
                        () => {
                            try {
                                deleteStudySession(recordId);
                                invalidateCollection();
                            } catch (deleteError) {
                                console.warn('[StudyCalendar] delete failed:', deleteError);
                                alert(l('Silinemedi', 'Could not delete'), l('Oturum silinemedi. Lütfen yeniden deneyin.', 'The session could not be deleted. Please try again.'));
                            }
                        },
                        { destructive: true },
                    );
                },
            });
        }
        return items;
    }, [l, router, handleShowDetails, invalidateCollection, loadRecentSubjects]);

    const renderSession = useCallback(({ item }: { item: StudySession }) => (
        <StudySessionCard session={item} onOpenMenu={setMenuSession} />
    ), []);

    const openPlans = useCallback(() => router.push('/study-plans' as any), [router]);
    const renderSectionFooter = useCallback(({ section }: { section: StudyDaySection }) => (
        section.plans.length > 0 ? (
            <View>
                {section.plans.map((plan) => <PlannedStudyCard key={plan.id} plan={plan} onOpen={openPlans} />)}
            </View>
        ) : null
    ), [openPlans]);

    const renderSectionHeader = useCallback(({ section }: { section: StudyDaySection }) => {
        const shared = timelineStyles(colors);
        return (
            <View style={shared.dayHeader}>
                <View style={shared.dayChipSlot}>
                    <View style={shared.dayChip}>
                        <Text style={shared.dayChipText}>{section.title}</Text>
                    </View>
                </View>
            </View>
        );
    }, [colors]);

    const emptyMessage = loading
        ? l('Yükleniyor…', 'Loading…')
        : error
            ? l('Çalışma geçmişi yüklenemedi.', 'Study history could not be loaded.')
            : mode === 'month'
                ? l('Bu ayda kayıtlı çalışma yok.', 'No study recorded this month.')
                : l('Bu haftada kayıtlı çalışma yok.', 'No study recorded this week.');

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={l('Çalışma Takvimi', 'Study Calendar')}
                backAccessibilityLabel={l('Geri dön', 'Go back')}
                onBack={() => goBackOr(router)}
                actions={(
                    <HeaderIconButton
                        accessibilityLabel={l('İstatistikler', 'Statistics')}
                        onPress={() => router.push('/stats' as any)}
                    >
                        <AnalyticsIcon color={colors.accent} size={22} />
                    </HeaderIconButton>
                )}
            />

            <View style={styles.monthBar}>
                <TouchableOpacity
                    style={styles.stepButton}
                    onPress={() => handleStep(-1)}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={mode === 'month'
                        ? l('Önceki ay', 'Previous month')
                        : l('Önceki hafta', 'Previous week')}
                >
                    <HeaderBackIcon color={colors.textSecondary} size={20} />
                </TouchableOpacity>
                <Text style={styles.rangeTitle} numberOfLines={1}>{rangeTitle}</Text>
                <TouchableOpacity
                    style={styles.stepButton}
                    onPress={() => handleStep(1)}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={mode === 'month'
                        ? l('Sonraki ay', 'Next month')
                        : l('Sonraki hafta', 'Next week')}
                >
                    <HeaderForwardIcon color={colors.textSecondary} size={20} />
                </TouchableOpacity>
                <View style={styles.segmentTrack}>
                    {(['week', 'month'] as const).map((option) => {
                        const selected = mode === option;
                        return (
                            <TouchableOpacity
                                key={option}
                                style={[styles.segment, selected && styles.segmentSelected]}
                                onPress={() => handleSwitchMode(option)}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                            >
                                <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                                    {option === 'week' ? l('Haftalık', 'Weekly') : l('Aylık', 'Monthly')}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <View style={styles.weekdayRow}>
                {weekdayLabels.map((label, index) => (
                    <Text key={label} style={[styles.weekdayLabel, index === todayColumn && styles.weekdayLabelToday]}>
                        {label}
                    </Text>
                ))}
            </View>

            <View style={styles.grid}>
                {cells.map((cell) => {
                    const selected = cell.dayNumber === selectedDayNumber;
                    const isToday = cell.dayNumber === todayDayNumber;
                    const studied = studiedDays.has(dayNumberToYmd(cell.dayNumber, rolloverHour));
                    const totalLabel = cell.inRange
                        ? formatDayTotalHhMm(aggregate.totalsByDay.get(cell.dayNumber) ?? 0)
                        : '';
                    return (
                        <TouchableOpacity
                            key={cell.dayNumber}
                            style={styles.cell}
                            onPress={() => handleSelectDay(cell)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={totalLabel
                                ? l(`${cell.day}: ${totalLabel} çalışma`, `${cell.day}: ${totalLabel} studied`)
                                : `${cell.day}, ${studied ? l('çalışıldı', 'studied') : l('çalışılmadı', 'not studied')}`}
                        >
                            <StudyDayBox
                                dateOfMonth={cell.day}
                                studied={studied}
                                isToday={isToday}
                                dimmed={!cell.inRange || cell.dayNumber > todayDayNumber}
                                selected={selected}
                                isCompact={isCompact}
                            />
                            <Text style={styles.dayTotal} numberOfLines={1}>{totalLabel}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <SectionList
                ref={listRef}
                style={styles.timeline}
                contentContainerStyle={[
                    styles.timelineContent,
                    { paddingBottom: insets.bottom + STOPWATCH_BUTTON_CLEARANCE },
                ]}
                sections={sections}
                keyExtractor={(item) => item.key}
                renderItem={renderSession}
                renderSectionHeader={renderSectionHeader}
                renderSectionFooter={renderSectionFooter}
                stickySectionHeadersEnabled={false}
                showsVerticalScrollIndicator={false}
                initialNumToRender={8}
                windowSize={7}
                onScrollToIndexFailed={() => undefined}
                ListEmptyComponent={(
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🗓️</Text>
                        <Text style={styles.emptyText}>{emptyMessage}</Text>
                        {!loading && !error && (
                            <Text style={styles.emptyHint}>
                                {l(
                                    'Kart yanıtladığınızda ya da Kronometre ile çalıştığınızda oturumlarınız burada listelenir.',
                                    'Your sessions appear here once you answer cards or study with the stopwatch.',
                                )}
                            </Text>
                        )}
                    </View>
                )}
            />

            <TouchableOpacity
                style={[styles.stopwatchButton, { bottom: insets.bottom + Spacing.lg }]}
                onPress={() => openOrReturnTo(router, navigation, 'stopwatch', '/stopwatch')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={l('Kronometre', 'Stopwatch')}
            >
                <StopwatchIcon color={colors.white} size={26} />
            </TouchableOpacity>

            <StudyToolsMenu bottom={insets.bottom + Spacing.lg + STOPWATCH_BUTTON_SIZE + Spacing.md} />

            <SessionActionsMenu
                visible={menuSession !== null}
                title={menuSession?.subject ?? ''}
                items={menuSession ? menuItems(menuSession) : []}
                onClose={() => setMenuSession(null)}
            />
            <SessionEditorSheet
                visible={editing !== null}
                initial={editing}
                defaultSubject={null}
                defaultKind="pass"
                defaultPass={1}
                recentSubjects={recentSubjects}
                passOf={passOf}
                onClose={() => setEditing(null)}
                onSave={handleSaveEdit}
            />
        </SafeAreaView>
    );
}

interface StudyDaySection {
    dayNumber: number;
    title: string;
    data: StudySession[];
    plans: StudyPlanBlock[];
}

const STOPWATCH_BUTTON_SIZE = 56;
/** Tail padding that keeps the last card out from under the floating stopwatch and tools buttons. */
const STOPWATCH_BUTTON_CLEARANCE = STOPWATCH_BUTTON_SIZE + STUDY_TOOLS_FAB_SIZE + Spacing.md + 2 * Spacing.lg;

function createStyles(colors: ColorScheme, isCompact: boolean) {
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.bgSecondary },

        monthBar: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            paddingBottom: Spacing.sm,
            gap: Spacing.xs,
        },
        stepButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm },
        rangeTitle: { flexShrink: 1, fontSize: isCompact ? FontSize.sm : FontSize.lg, fontWeight: '700', color: colors.textSecondary },
        segmentTrack: {
            marginLeft: 'auto',
            flexDirection: 'row',
            backgroundColor: colors.bgInput,
            borderRadius: BorderRadius.full,
            padding: 3,
        },
        segment: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full },
        segmentSelected: { backgroundColor: colors.bgCard, ...Shadows.sm },
        segmentText: { fontSize: FontSize.sm, fontWeight: '600', color: colors.textMuted },
        segmentTextSelected: { color: colors.textPrimary },

        weekdayRow: { flexDirection: 'row', paddingHorizontal: Spacing.sm, paddingBottom: Spacing.xs },
        weekdayLabel: {
            flex: 1,
            textAlign: 'center',
            fontSize: FontSize.xs,
            fontWeight: '600',
            color: colors.textMuted,
            textTransform: 'uppercase',
        },
        weekdayLabelToday: { color: colors.streak, fontWeight: '700' },

        grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.sm },
        cell: {
            width: `${100 / 7}%`,
            alignItems: 'center',
            paddingVertical: 3,
        },
        dayTotal: { marginTop: 2, fontSize: FontSize.xs, fontWeight: '600', color: colors.textSecondary, minHeight: 13 },

        timeline: { flex: 1, marginTop: Spacing.sm, backgroundColor: colors.bgPrimary },
        timelineContent: {},

        stopwatchButton: {
            position: 'absolute',
            right: Spacing.lg,
            width: STOPWATCH_BUTTON_SIZE,
            height: STOPWATCH_BUTTON_SIZE,
            borderRadius: STOPWATCH_BUTTON_SIZE / 2,
            backgroundColor: colors.streak,
            alignItems: 'center',
            justifyContent: 'center',
            ...Shadows.md,
        },

        emptyState: { alignItems: 'center', paddingTop: Spacing.xxxl, paddingHorizontal: Spacing.xl, gap: Spacing.sm },
        emptyIcon: { fontSize: 34 },
        emptyText: { fontSize: FontSize.lg, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
        emptyHint: { fontSize: FontSize.md, color: colors.textMuted, textAlign: 'center' },
    });
}
