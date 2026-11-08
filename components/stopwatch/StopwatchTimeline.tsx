import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
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
import { Card } from '../ui/Card';
import { Chip } from '../ui/Choice';
import { MinusIcon } from '../ui/icons';
import { ListRow } from '../ui/Rows';
import { CalendarIcon, HourglassIcon } from './StopwatchIcons';
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
        <Chip
            label={examLabel}
            icon={<HourglassIcon color={colors.streak} size={15} />}
            onPress={onOpenExamSettings}
            accessibilityLabel={examDaysLeft !== null && examDaysLeft >= 0
                ? l(`Sınava ${examLabel}. Sınav tarihini değiştirin.`, `${examLabel} until the exam. Change the exam date.`)
                : examLabel}
        />
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
                                <SleepingPanda width={84} snoreColor={colors.info} />
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
                                        <MinusIcon color={colors.onAccent} size={13} />
                                    </View>
                                </View>
                            </View>
                            <View style={shared.column}>
                                <Card padded>
                                    <View style={[shared.cardRow, styles.missedRow]}>
                                        <SleepingPanda width={50} snoreColor={colors.info} />
                                        <Text style={styles.missedText}>{l('Hiç çalışmanız yok!', 'No study this day!')}</Text>
                                    </View>
                                </Card>
                            </View>
                        </View>
                    ) : null}
                </View>
            ))}

            <Card style={styles.calendarCard}>
                <ListRow
                    icon={<CalendarIcon color={colors.streak} size={22} />}
                    title={l('Çalışma Takvimi', 'Study Calendar')}
                    summary={l('Tüm çalışmalarınızı takvimde görün', 'See all your sessions on the calendar')}
                    onPress={onOpenCalendar}
                    accessibilityLabel={l('Çalışma Takvimi. Tüm çalışmalarınızı takvimde görün.', 'Study Calendar. See all your sessions on the calendar.')}
                />
            </Card>
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
        todayEmpty: { alignItems: 'center', paddingVertical: Spacing.md, gap: Spacing.sm },
        todayEmptyText: { fontSize: FontSize.md, fontWeight: '500', color: colors.textPrimary },
        missedRow: { alignItems: 'center' },
        missedText: { flex: 1, fontSize: FontSize.md, fontWeight: '500', color: colors.textPrimary },
        calendarCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
    });
}
