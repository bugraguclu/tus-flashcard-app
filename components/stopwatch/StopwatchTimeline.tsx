import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { dayNumberToYmd } from '../../lib/ankiState';
import { studySubjectKey } from '../../lib/stopwatch';
import type { StudySession } from '../../lib/studyCalendar';
import type { StudyPlanBlock } from '../../lib/studyPlans';
import LiveSessionCard, { type LiveSession } from './LiveSessionCard';
import NoStudyPlanCard from './NoStudyPlanCard';
import PlannedStudyCard from './PlannedStudyCard';
import SleepingPanda from './SleepingPanda';
import StudySessionCard from './StudySessionCard';
import { CalendarIcon, HourglassIcon, MinusIcon } from './StopwatchIcons';
import { TIMELINE_LINE_X, timelineStyles } from './timelineStyles';

export interface TimelineDay {
    dayNumber: number;
    studyMs: number;
    /** Latest first. */
    sessions: StudySession[];
}

interface StopwatchTimelineProps {
    /** Today first, then the days before it. */
    days: TimelineDay[];
    examDaysLeft: number | null;
    live: LiveSession | null;
    /** Length of a study block and of a break, which the running session's card counts against. */
    focusMinutes: number;
    breakMinutes: number;
    onOpenExamSettings: () => void;
    onSessionMenu: (session: StudySession) => void;
    onEditLiveNote: () => void;
    onOpenCalendar: () => void;
    /** Today's blocks from "Çalışma Planlama". */
    todayPlans: StudyPlanBlock[];
    /** Time still to study in each of today's blocks, by block id. */
    planLeftMs: ReadonlyMap<string, number>;
    /** Whether "Çalışma Planlama" holds any plan; without one, today offers to create it. */
    hasStudyPlans: boolean;
    onOpenPlans: () => void;
    onCreatePlan: () => void;
    onStartPlanned: (plan: StudyPlanBlock) => void;
}

/**
 * "Son Çalışmalarınız": today and yesterday as a vertical timeline, as TUSBuddy's stopwatch shows
 * them. Today lists the running session, the day's sessions latest first and its plans with the
 * time still to study; yesterday says so when it had no study, which is what makes a broken streak
 * visible. Every earlier day is in the Study Calendar, at the bottom.
 */
export default function StopwatchTimeline({
    days,
    examDaysLeft,
    live,
    focusMinutes,
    breakMinutes,
    onOpenExamSettings,
    onSessionMenu,
    onEditLiveNote,
    onOpenCalendar,
    todayPlans,
    planLeftMs,
    hasStudyPlans,
    onOpenPlans,
    onCreatePlan,
    onStartPlanned,
}: StopwatchTimelineProps) {
    const { l, localeTag } = useI18n();
    const colors = useThemeColors();
    const shared = timelineStyles(colors);
    const styles = useMemo(() => createStyles(colors), [colors]);
    const liveKey = live ? studySubjectKey(live.subject) : null;

    const dayLabel = (dayNumber: number, index: number) => {
        if (index === 0) return l('Bugün', 'Today');
        if (index === 1) return l('Dün', 'Yesterday');
        return new Date(`${dayNumberToYmd(dayNumber)}T12:00:00`)
            .toLocaleDateString(localeTag, { day: 'numeric', month: 'long' });
    };

    const examLabel = examDaysLeft === null || examDaysLeft < 0
        ? l('Sınav tarihi ekle', 'Add exam date')
        : examDaysLeft === 0
            ? l('Sınav bugün', 'Exam day')
            : l(`${examDaysLeft} gün kaldı`, examDaysLeft === 1 ? '1 day left' : `${examDaysLeft} days left`);

    const examChip = (
        <TouchableOpacity
            style={styles.examChip}
            onPress={onOpenExamSettings}
            accessibilityRole="button"
            accessibilityLabel={examDaysLeft !== null && examDaysLeft >= 0
                ? l(`Sınava ${examLabel}. Sınav tarihini değiştirin.`, `${examLabel} until the exam. Change the exam date.`)
                : examLabel}
        >
            <HourglassIcon color={colors.streak} size={15} />
            <Text style={styles.examText}>{examLabel}</Text>
        </TouchableOpacity>
    );

    return (
        <View>
            {days.map((day, index) => (
                <View key={day.dayNumber}>
                    <View style={shared.dayHeader}>
                        <View style={[styles.headerLine, index === 0 && styles.headerLineFirst]} />
                        <View style={shared.dayChipSlot}>
                            <View style={shared.dayChip}>
                                <Text style={shared.dayChipText}>{dayLabel(day.dayNumber, index)}</Text>
                            </View>
                        </View>
                        {index === 0 ? <View style={shared.dayHeaderAccessory}>{examChip}</View> : null}
                    </View>

                    {index === 0 && day.sessions.length === 0 && !live ? (
                        <View style={shared.row}>
                            <View style={shared.gutter}><View style={shared.line} /></View>
                            <View style={[shared.column, styles.todayEmpty]}>
                                <SleepingPanda width={84} snoreColor={colors.badgeNew} />
                                <Text style={styles.todayEmptyText}>{l('Henüz çalışmanız yok', 'No study yet today')}</Text>
                            </View>
                        </View>
                    ) : null}

                    {index === 0 && live ? (
                        <LiveSessionCard
                            live={live}
                            focusMinutes={focusMinutes}
                            breakMinutes={breakMinutes}
                            onEditNote={onEditLiveNote}
                        />
                    ) : null}

                    {day.sessions.map((session) => (
                        <StudySessionCard key={session.key} session={session} onOpenMenu={onSessionMenu} />
                    ))}

                    {index === 0 ? todayPlans.map((planned) => (
                        <PlannedStudyCard
                            key={planned.id}
                            plan={planned}
                            remainingMs={planLeftMs.get(planned.id) ?? planned.durationMinutes * 60_000}
                            onOpen={onOpenPlans}
                            onStart={liveKey === studySubjectKey(planned.subject) ? undefined : () => onStartPlanned(planned)}
                        />
                    )) : null}
                    {index === 0 && todayPlans.length === 0 ? (
                        <NoStudyPlanCard hasPlans={hasStudyPlans} onPress={hasStudyPlans ? onOpenPlans : onCreatePlan} />
                    ) : null}

                    {index > 0 && day.sessions.length === 0 ? (
                        <View style={shared.row}>
                            <View style={shared.gutter}>
                                <View style={shared.line} />
                                <View style={[shared.nodeSlot, { pointerEvents: 'none' }]}>
                                    <View style={[shared.node, shared.nodeMissed]}>
                                        <MinusIcon color={colors.white} size={13} />
                                    </View>
                                </View>
                            </View>
                            <View style={shared.column}>
                                <View style={[shared.card, styles.missedCard]}>
                                    <SleepingPanda width={50} snoreColor={colors.badgeNew} />
                                    <Text style={styles.missedText}>{l('Hiç çalışmanız yok!', 'No study this day!')}</Text>
                                </View>
                            </View>
                        </View>
                    ) : null}
                </View>
            ))}

            <TouchableOpacity
                style={styles.calendarCard}
                onPress={onOpenCalendar}
                accessibilityRole="button"
                accessibilityLabel={l('Çalışma Takvimi. Tüm çalışmalarınızı takvimde görün.', 'Study Calendar. See all your sessions on the calendar.')}
            >
                <View style={styles.calendarTile}>
                    <CalendarIcon color={colors.streak} size={22} />
                </View>
                <View style={styles.calendarCopy}>
                    <Text style={styles.calendarTitle}>{l('Çalışma Takvimi', 'Study Calendar')}</Text>
                    <Text style={styles.calendarHint}>{l('Tüm çalışmalarınızı takvimde görün', 'See all your sessions on the calendar')}</Text>
                </View>
                <Text style={styles.calendarChevron}>›</Text>
            </TouchableOpacity>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        headerLine: {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: TIMELINE_LINE_X,
            width: 1,
            backgroundColor: colors.border,
        },
        headerLineFirst: { top: '60%' },
        examChip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.xs,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.md,
            paddingHorizontal: Spacing.md,
            paddingVertical: 5,
            ...Shadows.sm,
        },
        examText: { fontSize: FontSize.md, fontWeight: '600', color: colors.textPrimary },
        todayEmpty: { alignItems: 'center', paddingVertical: Spacing.md, gap: Spacing.sm },
        todayEmptyText: { fontSize: FontSize.md, fontWeight: '500', color: colors.textPrimary },
        missedCard: { alignItems: 'center' },
        missedText: { flex: 1, fontSize: FontSize.md, fontWeight: '500', color: colors.textPrimary },
        calendarCard: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            marginHorizontal: Spacing.lg,
            marginTop: Spacing.lg,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.lg,
            padding: Spacing.md,
            ...Shadows.sm,
        },
        calendarTile: {
            width: 40,
            height: 40,
            borderRadius: BorderRadius.md,
            backgroundColor: colors.bgInput,
            alignItems: 'center',
            justifyContent: 'center',
        },
        calendarCopy: { flex: 1, gap: 2 },
        calendarTitle: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
        calendarHint: { fontSize: FontSize.sm, color: colors.textSecondary },
        calendarChevron: { fontSize: FontSize.xxl, color: colors.textMuted },
    });
}
