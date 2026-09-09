import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    Modal,
    Pressable,
    SectionList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';
import { useFocusEffect, useRouter } from 'expo-router';
import ScreenHeader from '../components/ScreenHeader';
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
import { alert } from '../lib/confirm';
import { dayNumberToYmd, localDayNumber } from '../lib/ankiState';
import {
    buildMonthGrid,
    buildWeekGrid,
    formatClockHhMm,
    formatDayTotalHhMm,
    formatSessionDuration,
    getStudyCalendarSnapshot,
    studySubjectGlyph,
    type CalendarCell,
    type StudyCalendarAggregate,
    type StudySession,
} from '../lib/studyCalendar';

/** Three ascending bars: the analytics button's glyph. */
function StudyAnalyticsIcon({ color, size = 22 }: { color: string; size?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
            <Rect x="4" y="13" width="4.4" height="8" rx="1.4" fill={color} />
            <Rect x="9.8" y="8" width="4.4" height="13" rx="1.4" fill={color} />
            <Rect x="15.6" y="3.5" width="4.4" height="17.5" rx="1.4" fill={color} />
        </Svg>
    );
}

type ViewMode = 'month' | 'week';

interface AnchorDate {
    year: number;
    /** 0-based, as in `Date#getMonth`. */
    month: number;
    day: number;
}

const EMPTY_AGGREGATE: StudyCalendarAggregate = { days: [], totalsByDay: new Map() };

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
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { settings } = useAppSettings();
    const rolloverHour = settings.dayRolloverHour;
    const { collectionVersion, getSchedulingRevision } = useCollectionInvalidation();
    const [schedulingRevision, setSchedulingRevision] = useState(() => getSchedulingRevision());
    const listRef = useRef<SectionList<StudySession, StudyDaySection>>(null);

    const todayDayNumber = localDayNumber(Date.now(), rolloverHour);
    const [mode, setMode] = useState<ViewMode>('month');
    const [anchor, setAnchor] = useState<AnchorDate>(() => anchorFromDate(new Date()));
    const [selectedDayNumber, setSelectedDayNumber] = useState(todayDayNumber);
    const [menuSession, setMenuSession] = useState<StudySession | null>(null);

    useFocusEffect(useCallback(() => {
        setSchedulingRevision(getSchedulingRevision());
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
    const loadSnapshot = useCallback(
        () => getStudyCalendarSnapshot(cells, rolloverHour),
        [cells, rolloverHour],
    );
    const { snapshot, loading, error } = useDeferredScreenSnapshot(snapshotKey, loadSnapshot);
    const aggregate = snapshot ?? EMPTY_AGGREGATE;

    // The grid always queries whole weeks, so a month view also loads its neighbours' edge days.
    // Those cells are dimmed and carry no total, and their sessions stay out of the timeline.
    const visibleDayNumbers = useMemo(
        () => new Set(cells.filter((cell) => cell.inRange).map((cell) => cell.dayNumber)),
        [cells],
    );

    const sections = useMemo<StudyDaySection[]>(
        () => aggregate.days
            .filter((day) => visibleDayNumbers.has(day.dayNumber))
            .map((day) => ({
                dayNumber: day.dayNumber,
                title: new Date(`${day.ymd}T12:00:00`).toLocaleDateString(localeTag, {
                    day: 'numeric',
                    month: 'short',
                }),
                data: day.sessions,
            })),
        [aggregate.days, visibleDayNumbers, localeTag],
    );

    const weekdayLetters = useMemo(
        () => (locale === 'tr'
            ? ['P', 'S', 'Ç', 'P', 'C', 'C', 'P']
            : ['M', 'T', 'W', 'T', 'F', 'S', 'S']),
        [locale],
    );

    const rangeTitle = useMemo(() => {
        if (mode === 'month') {
            const label = new Date(anchor.year, anchor.month, 1)
                .toLocaleDateString(localeTag, { month: 'long', year: 'numeric' });
            return label.charAt(0).toLocaleUpperCase(localeTag) + label.slice(1);
        }
        const first = cells[0];
        const last = cells[cells.length - 1];
        if (!first || !last) return '';
        const startLabel = new Date(first.year, first.month, first.day)
            .toLocaleDateString(localeTag, { day: 'numeric', month: 'short' });
        const endLabel = new Date(last.year, last.month, last.day)
            .toLocaleDateString(localeTag, { day: 'numeric', month: 'short', year: 'numeric' });
        return `${startLabel} – ${endLabel}`;
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

    const handleGoToDeck = useCallback((session: StudySession) => {
        setMenuSession(null);
        router.push(`/deck-overview?deck=${encodeURIComponent(session.deckName)}` as any);
    }, [router]);

    const handleOpenAnalytics = useCallback(() => {
        router.push('/stats' as any);
    }, [router]);

    const handleShowDetails = useCallback((session: StudySession) => {
        setMenuSession(null);
        const dayLabel = new Date(`${dayNumberToYmd(session.dayNumber)}T12:00:00`)
            .toLocaleDateString(localeTag, { day: 'numeric', month: 'long', year: 'numeric' });
        alert(
            session.subject,
            [
                `${dayLabel} · ${formatClockHhMm(session.startMs)} – ${formatClockHhMm(session.endMs)}`,
                l(`Kart sayısı: ${session.cardCount}`, `Cards: ${session.cardCount}`),
                l(`Yanıt sayısı: ${session.reviewCount}`, `Answers: ${session.reviewCount}`),
                l(
                    `Çalışma: ${formatSessionDuration(session.studyMs, locale)}`,
                    `Study: ${formatSessionDuration(session.studyMs, locale)}`,
                ),
                l(
                    `Mola: ${formatSessionDuration(session.breakMs, locale)}`,
                    `Break: ${formatSessionDuration(session.breakMs, locale)}`,
                ),
                l(`Deste: ${session.deckName}`, `Deck: ${session.deckName}`),
            ].join('\n'),
        );
    }, [l, locale, localeTag]);

    const handleOpenWeek = useCallback((session: StudySession) => {
        setMenuSession(null);
        setSelectedDayNumber(session.dayNumber);
        setAnchor(anchorFromDayNumber(session.dayNumber));
        setMode('week');
    }, []);

    const renderSession = useCallback(({ item }: { item: StudySession }) => (
        <View style={styles.timelineRow}>
            <View style={styles.gutter}>
                <View style={styles.connector} />
                <TouchableOpacity
                    style={styles.overflowButton}
                    onPress={() => setMenuSession(item)}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={l(
                        `${item.subject} oturumu için seçenekler`,
                        `Options for the ${item.subject} session`,
                    )}
                >
                    <Text style={styles.overflowButtonText}>•••</Text>
                </TouchableOpacity>
                <View style={styles.node}>
                    <Text style={styles.nodeText}>✓</Text>
                </View>
            </View>
            <View style={styles.sessionColumn}>
                <View style={styles.sessionCard}>
                    <View style={styles.subjectTile}>
                        <Text style={styles.subjectTileText}>
                            {studySubjectGlyph(item.subject)}
                        </Text>
                    </View>
                    <View style={styles.sessionBody}>
                        <View style={styles.sessionTitleRow}>
                            <Text style={styles.subjectName} numberOfLines={1}>{item.subject}</Text>
                            <View style={styles.repeatChip}>
                                <Text style={styles.repeatChipText}>
                                    {l(`${item.repeatIndex}. Tekrar`, `Session ${item.repeatIndex}`)}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.metricsRow}>
                            <View style={styles.metric}>
                                <Text style={styles.metricLabel}>{l('Çalışma', 'Study')}</Text>
                                <Text style={styles.metricValue}>
                                    {formatSessionDuration(item.studyMs, locale)}
                                </Text>
                            </View>
                            <View style={styles.metric}>
                                <Text style={styles.metricLabelBreak}>{l('Mola', 'Break')}</Text>
                                <Text style={styles.metricValue}>
                                    {formatSessionDuration(item.breakMs, locale)}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>
                <Text style={styles.timeRange}>
                    {l('Zaman aralığı', 'Time range')} : {formatClockHhMm(item.startMs)} - {formatClockHhMm(item.endMs)}
                </Text>
            </View>
        </View>
    ), [styles, l, locale]);

    const renderSectionHeader = useCallback(({ section }: { section: StudyDaySection }) => (
        <View style={styles.sectionHeader}>
            <View style={styles.dayChip}>
                <Text style={styles.dayChipText}>{section.title}</Text>
            </View>
        </View>
    ), [styles]);

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
                onBack={() => {
                    if (router.canGoBack()) router.back();
                    else router.replace('/decks' as any);
                }}
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
                    <Text style={styles.stepButtonText}>‹</Text>
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
                    <Text style={styles.stepButtonText}>›</Text>
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
                {weekdayLetters.map((letter, index) => (
                    <Text key={`${letter}-${index}`} style={styles.weekdayLetter}>{letter}</Text>
                ))}
            </View>

            <View style={styles.grid}>
                {cells.map((cell) => {
                    const selected = cell.dayNumber === selectedDayNumber;
                    const isToday = cell.dayNumber === todayDayNumber;
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
                                : String(cell.day)}
                        >
                            <View style={[
                                styles.dayBox,
                                isToday && !selected && styles.dayBoxToday,
                                selected && styles.dayBoxSelected,
                            ]}>
                                <Text style={[
                                    styles.dayNumber,
                                    !cell.inRange && styles.dayNumberDim,
                                    selected && styles.dayNumberSelected,
                                ]}>
                                    {cell.day}
                                </Text>
                            </View>
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
                    { paddingBottom: insets.bottom + ANALYTICS_BUTTON_CLEARANCE },
                ]}
                sections={sections}
                keyExtractor={(item) => item.key}
                renderItem={renderSession}
                renderSectionHeader={renderSectionHeader}
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
                                    'Kart yanıtladığınızda oturumlarınız burada listelenir.',
                                    'Your sessions appear here once you answer cards.',
                                )}
                            </Text>
                        )}
                    </View>
                )}
            />

            <TouchableOpacity
                style={[styles.analyticsButton, { bottom: insets.bottom + Spacing.lg }]}
                onPress={handleOpenAnalytics}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={l('Çalışma analizleri', 'Study analytics')}
            >
                <StudyAnalyticsIcon color={colors.white} />
            </TouchableOpacity>

            <Modal
                visible={menuSession !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuSession(null)}
            >
                <Pressable style={styles.menuBackdrop} onPress={() => setMenuSession(null)}>
                    <Pressable style={styles.menuCard} onPress={() => undefined}>
                        <Text style={styles.menuTitle} numberOfLines={1}>
                            {menuSession?.subject ?? ''}
                        </Text>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => menuSession && handleGoToDeck(menuSession)}
                            accessibilityRole="button"
                        >
                            <Text style={styles.menuItemText}>{l('Bu oturuma git', 'Go to this session')}</Text>
                            <Text style={styles.menuItemHint} numberOfLines={1}>{menuSession?.deckName ?? ''}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => menuSession && handleShowDetails(menuSession)}
                            accessibilityRole="button"
                        >
                            <Text style={styles.menuItemText}>{l('Oturum ayrıntıları', 'Session details')}</Text>
                            <Text style={styles.menuItemHint}>
                                {menuSession
                                    ? l(`${menuSession.cardCount} kart`, `${menuSession.cardCount} cards`)
                                    : ''}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => menuSession && handleOpenWeek(menuSession)}
                            accessibilityRole="button"
                        >
                            <Text style={styles.menuItemText}>
                                {l('Bu günü haftalık görünümde aç', 'Open this day in the weekly view')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.menuCancel}
                            onPress={() => setMenuSession(null)}
                            accessibilityRole="button"
                        >
                            <Text style={styles.menuCancelText}>{l('Kapat', 'Close')}</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

interface StudyDaySection {
    dayNumber: number;
    title: string;
    data: StudySession[];
}

const GUTTER_WIDTH = 76;
const ANALYTICS_BUTTON_SIZE = 56;
/** Tail padding that keeps the last session card out from under the floating analytics button. */
const ANALYTICS_BUTTON_CLEARANCE = ANALYTICS_BUTTON_SIZE + 2 * Spacing.lg;

function createStyles(colors: ColorScheme) {
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
        stepButton: { width: 26, alignItems: 'center', justifyContent: 'center' },
        stepButtonText: { fontSize: FontSize.xxl, lineHeight: 26, fontWeight: '600', color: colors.textPrimary },
        rangeTitle: { fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary },
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
        weekdayLetter: {
            flex: 1,
            textAlign: 'center',
            fontSize: FontSize.sm,
            fontWeight: '600',
            color: colors.textMuted,
        },

        grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.sm },
        cell: {
            width: `${100 / 7}%`,
            alignItems: 'center',
            paddingVertical: Spacing.xs,
        },
        dayBox: {
            minWidth: 30,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 8,
            borderWidth: 1.5,
            borderColor: colors.transparent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        dayBoxToday: { borderColor: colors.accent },
        dayBoxSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
        dayNumber: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        dayNumberDim: { color: colors.textMuted, opacity: 0.45 },
        dayNumberSelected: { color: colors.white },
        dayTotal: { marginTop: 1, fontSize: FontSize.sm, fontWeight: '500', color: colors.accent, minHeight: 15 },

        timeline: { flex: 1, marginTop: Spacing.sm, backgroundColor: colors.bgPrimary },
        timelineContent: {},

        sectionHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: Spacing.md,
            paddingRight: Spacing.lg,
            paddingTop: Spacing.md,
        },
        dayChip: {
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.md,
            paddingHorizontal: Spacing.md,
            paddingVertical: 6,
            ...Shadows.sm,
        },
        dayChipText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },

        timelineRow: { flexDirection: 'row', alignItems: 'stretch' },
        gutter: { width: GUTTER_WIDTH, alignItems: 'center', justifyContent: 'center' },
        connector: {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: GUTTER_WIDTH - 26,
            width: 1,
            backgroundColor: colors.border,
        },
        overflowButton: {
            position: 'absolute',
            left: Spacing.sm,
            width: 34,
            height: 26,
            borderRadius: BorderRadius.sm,
            backgroundColor: colors.bgCard,
            alignItems: 'center',
            justifyContent: 'center',
            ...Shadows.sm,
        },
        overflowButtonText: { fontSize: FontSize.sm, lineHeight: 14, color: colors.textSecondary },
        node: {
            position: 'absolute',
            left: GUTTER_WIDTH - 38,
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: colors.btnGood,
            alignItems: 'center',
            justifyContent: 'center',
        },
        nodeText: { color: colors.white, fontSize: FontSize.sm, fontWeight: '800' },

        sessionColumn: { flex: 1, paddingRight: Spacing.lg, paddingVertical: Spacing.sm },
        sessionCard: {
            flexDirection: 'row',
            gap: Spacing.md,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            padding: Spacing.md,
            ...Shadows.sm,
        },
        subjectTile: {
            width: 52,
            height: 52,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.accentLight,
            alignItems: 'center',
            justifyContent: 'center',
        },
        subjectTileText: { fontSize: FontSize.xxl, fontWeight: '800', color: colors.accent },
        sessionBody: { flex: 1, gap: Spacing.sm },
        sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        subjectName: { flex: 1, fontSize: FontSize.lg, fontWeight: '800', color: colors.accent },
        repeatChip: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: BorderRadius.full,
            paddingHorizontal: Spacing.sm,
            paddingVertical: 3,
        },
        repeatChipText: { fontSize: FontSize.xs, fontWeight: '600', color: colors.textSecondary },
        metricsRow: { flexDirection: 'row' },
        metric: { flex: 1, gap: 2 },
        metricLabel: { fontSize: FontSize.md, fontWeight: '500', color: colors.textSecondary },
        metricLabelBreak: { fontSize: FontSize.md, fontWeight: '500', color: colors.streak },
        metricValue: { fontSize: FontSize.lg, fontWeight: '600', color: colors.textPrimary },
        timeRange: {
            marginTop: Spacing.xs,
            textAlign: 'right',
            fontSize: FontSize.sm,
            color: colors.textMuted,
        },

        analyticsButton: {
            position: 'absolute',
            right: Spacing.lg,
            width: ANALYTICS_BUTTON_SIZE,
            height: ANALYTICS_BUTTON_SIZE,
            borderRadius: ANALYTICS_BUTTON_SIZE / 2,
            backgroundColor: colors.streak,
            alignItems: 'center',
            justifyContent: 'center',
            ...Shadows.md,
        },

        emptyState: { alignItems: 'center', paddingTop: Spacing.xxxl, paddingHorizontal: Spacing.xl, gap: Spacing.sm },
        emptyIcon: { fontSize: 34 },
        emptyText: { fontSize: FontSize.lg, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
        emptyHint: { fontSize: FontSize.md, color: colors.textMuted, textAlign: 'center' },

        menuBackdrop: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
        },
        menuCard: {
            width: '100%',
            maxWidth: 380,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            paddingVertical: Spacing.sm,
            ...Shadows.md,
        },
        menuTitle: {
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.sm,
            fontSize: FontSize.sm,
            fontWeight: '700',
            color: colors.textMuted,
        },
        menuItem: {
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
            gap: 2,
        },
        menuItemText: { fontSize: FontSize.lg, fontWeight: '600', color: colors.textPrimary },
        menuItemHint: { fontSize: FontSize.sm, color: colors.textMuted },
        menuCancel: {
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            paddingBottom: Spacing.sm,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
            alignItems: 'center',
        },
        menuCancelText: { fontSize: FontSize.lg, fontWeight: '700', color: colors.accent },
    });
}
