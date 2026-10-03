import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { dayNumberToYmd } from '../../lib/ankiState';
import { formatGoalRemaining, formatStopwatchClock, type StudyPlan } from '../../lib/stopwatch';
import { studySubjectGlyph, type StudySession } from '../../lib/studyCalendar';
import SleepingPanda from './SleepingPanda';
import StudySessionCard from './StudySessionCard';
import { ClockIcon, GearIcon, HourglassIcon, StopwatchIcon } from './StopwatchIcons';
import { TIMELINE_LINE_X, timelineStyles } from './timelineStyles';

export interface TimelineDay {
    dayNumber: number;
    studyMs: number;
    sessions: StudySession[];
}

/** The stopwatch that is running now, shown as today's latest entry. */
export interface LiveSession {
    subject: string;
    pass: number;
    studyMs: number;
    onBreak: boolean;
}

interface StopwatchTimelineProps {
    /** Today first, then the days before it. */
    days: TimelineDay[];
    examDaysLeft: number | null;
    plan: StudyPlan | null;
    /** Time still needed today to reach the daily goal. */
    goalRemainingMs: number;
    live: LiveSession | null;
    onOpenExamSettings: () => void;
    onPlanStart: () => void;
    onPlanEdit: () => void;
    onSessionMenu: (session: StudySession) => void;
    onOpenCalendar: () => void;
}

/**
 * "Son Çalışmalarınız": the last days as a vertical timeline. Today lists its sessions and then
 * the plan with the time still needed for the daily goal; an earlier day without study says so
 * rather than disappearing, which is what makes a broken streak visible.
 */
export default function StopwatchTimeline({
    days,
    examDaysLeft,
    plan,
    goalRemainingMs,
    live,
    onOpenExamSettings,
    onPlanStart,
    onPlanEdit,
    onSessionMenu,
    onOpenCalendar,
}: StopwatchTimelineProps) {
    const { l, locale, localeTag } = useI18n();
    const colors = useThemeColors();
    const shared = timelineStyles(colors);
    const styles = useMemo(() => createStyles(colors), [colors]);

    const dayLabel = (dayNumber: number, index: number) => {
        if (index === 0) return l('Bugün', 'Today');
        if (index === 1) return l('Dün', 'Yesterday');
        return new Date(`${dayNumberToYmd(dayNumber)}T12:00:00`)
            .toLocaleDateString(localeTag, { day: 'numeric', month: 'short' });
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
            <HourglassIcon color={colors.streak} size={18} />
            <Text style={styles.examText}>{examLabel}</Text>
        </TouchableOpacity>
    );

    const goalMet = goalRemainingMs <= 0;
    const planIsRunning = Boolean(plan && live?.subject === plan.subject);

    const liveRow = live ? (
        <View style={shared.row} accessible accessibilityLabel={l(
            `Şu an ${live.subject} çalışılıyor${live.onBreak ? ', molada' : ''}, ${formatStopwatchClock(live.studyMs)}`,
            `Studying ${live.subject} now${live.onBreak ? ', on a break' : ''}, ${formatStopwatchClock(live.studyMs)}`,
        )}>
            <View style={shared.gutter}>
                <View style={shared.line} />
                <View style={shared.nodeSlot}>
                    <View style={[shared.node, live.onBreak ? styles.nodeBreak : shared.nodeTimer]}>
                        <StopwatchIcon color={colors.white} size={16} />
                    </View>
                </View>
            </View>
            <View style={shared.column}>
                <View style={[shared.card, styles.liveCard]}>
                    <View style={shared.tile}>
                        <Text style={shared.tileText}>{studySubjectGlyph(live.subject)}</Text>
                    </View>
                    <View style={shared.body}>
                        <View style={shared.titleRow}>
                            <Text style={shared.subject} numberOfLines={1}>{live.subject}</Text>
                            <View style={shared.chip}>
                                <Text style={shared.chipText}>{l(`${live.pass}. Tekrar`, `Pass ${live.pass}`)}</Text>
                            </View>
                        </View>
                        <Text style={[styles.liveStatus, live.onBreak && styles.liveStatusBreak]}>
                            {live.onBreak ? l('Molada', 'On a break') : l('Şu an çalışılıyor', 'Studying now')}
                            {' · '}
                            <Text style={styles.liveClock}>{formatStopwatchClock(live.studyMs)}</Text>
                        </Text>
                    </View>
                </View>
            </View>
        </View>
    ) : null;

    const planRow = (
        <View style={shared.row}>
            <View style={shared.gutter}>
                <View style={shared.line} />
                <View style={shared.sideButtonSlot}>
                    <TouchableOpacity
                        style={shared.sideButton}
                        onPress={onPlanEdit}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={l('Bugünün planını düzenle', "Edit today's plan")}
                    >
                        <GearIcon color={colors.textSecondary} size={16} />
                    </TouchableOpacity>
                </View>
                <View style={[shared.nodeSlot, { pointerEvents: 'none' }]}>
                    <View style={[shared.node, shared.nodePlanned]}>
                        <ClockIcon color={colors.white} size={18} />
                    </View>
                </View>
            </View>
            <View style={shared.column}>
                {plan ? (
                    <View style={shared.card}>
                        <View style={shared.tile}>
                            <Text style={shared.tileText}>{studySubjectGlyph(plan.subject)}</Text>
                        </View>
                        <View style={shared.body}>
                            <View style={shared.titleRow}>
                                <Text style={shared.subject} numberOfLines={1}>{plan.subject}</Text>
                                <View style={styles.planChip}>
                                    <Text style={styles.planChipText}>{l(`${plan.pass}. Tekrar`, `Pass ${plan.pass}`)}</Text>
                                </View>
                            </View>
                            <View style={styles.planFooter}>
                                {goalMet ? (
                                    <Text style={[styles.remaining, styles.goalMet]}>
                                        {l('Hedef tamamlandı ✓', 'Goal reached ✓')}
                                    </Text>
                                ) : (
                                    <Text style={styles.remaining}>
                                        {l('Kalan: ', 'Left: ')}
                                        <Text style={styles.remainingValue}>{formatGoalRemaining(goalRemainingMs, locale)}</Text>
                                    </Text>
                                )}
                                <TouchableOpacity
                                    style={[styles.startButton, planIsRunning && styles.startButtonBusy]}
                                    onPress={onPlanStart}
                                    disabled={planIsRunning}
                                    accessibilityRole="button"
                                    accessibilityLabel={planIsRunning
                                        ? l(`${plan.subject} çalışılıyor`, `Studying ${plan.subject}`)
                                        : l(`${plan.subject} için kronometreyi başlat`, `Start the stopwatch for ${plan.subject}`)}
                                    accessibilityState={{ disabled: planIsRunning }}
                                >
                                    <Text style={styles.startText}>{planIsRunning ? l('Çalışılıyor', 'Running') : l('Başlat', 'Start')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[shared.card, styles.planPrompt]}
                        onPress={onPlanEdit}
                        accessibilityRole="button"
                    >
                        <Text style={styles.planPromptTitle}>{l('Bugün hangi dersi çalışacaksınız?', 'What will you study today?')}</Text>
                        <Text style={styles.planPromptHint}>{l('Bir ders ve tekrar seçin; buradan tek dokunuşla başlarsınız.', 'Choose a subject and pass to start it from here in one tap.')}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
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
                                <SleepingPanda width={112} snoreColor={colors.badgeNew} />
                                <Text style={styles.todayEmptyText}>{l('Henüz çalışmanız yok', 'No study yet today')}</Text>
                            </View>
                        </View>
                    ) : null}

                    {day.sessions.map((session) => (
                        <StudySessionCard key={session.key} session={session} onOpenMenu={onSessionMenu} />
                    ))}

                    {index === 0 ? liveRow : null}
                    {index === 0 ? planRow : null}

                    {index > 0 && day.sessions.length === 0 ? (
                        <View style={shared.row}>
                            <View style={shared.gutter}>
                                <View style={shared.line} />
                                <View style={[shared.nodeSlot, { pointerEvents: 'none' }]}>
                                    <View style={[shared.node, shared.nodeMissed]}>
                                        <Text style={styles.missedGlyph}>−</Text>
                                    </View>
                                </View>
                            </View>
                            <View style={shared.column}>
                                <View style={[shared.card, styles.missedCard]}>
                                    <SleepingPanda width={64} snoreColor={colors.badgeNew} />
                                    <Text style={styles.missedText}>{l('Hiç çalışmanız yok!', 'No study this day!')}</Text>
                                </View>
                            </View>
                        </View>
                    ) : null}
                </View>
            ))}

            <TouchableOpacity
                style={styles.calendarLink}
                onPress={onOpenCalendar}
                accessibilityRole="button"
            >
                <Text style={styles.calendarLinkText}>{l('Tüm çalışmalarınız Çalışma Takvimi’nde ›', 'All your sessions are in the Study Calendar ›')}</Text>
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
            paddingVertical: 7,
            ...Shadows.sm,
        },
        examText: { fontSize: FontSize.md, fontWeight: '700', color: colors.textPrimary },
        todayEmpty: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
        todayEmptyText: { fontSize: FontSize.lg, fontWeight: '600', color: colors.textSecondary },
        planChip: {
            borderWidth: 1,
            borderColor: colors.badgeNew,
            borderRadius: BorderRadius.full,
            paddingHorizontal: Spacing.sm,
            paddingVertical: 3,
        },
        planChipText: { fontSize: FontSize.xs, fontWeight: '700', color: colors.badgeNew },
        // When "Kalan" and the button do not fit side by side, the button moves under it, right-aligned.
        planFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Spacing.sm, rowGap: Spacing.xs },
        remaining: { fontSize: FontSize.md, fontWeight: '600', color: colors.textSecondary },
        remainingValue: { color: colors.accent, fontWeight: '800' },
        goalMet: { color: colors.btnGood, fontWeight: '800' },
        startButton: {
            marginLeft: 'auto',
            backgroundColor: colors.accent,
            borderRadius: BorderRadius.md,
            paddingHorizontal: Spacing.md,
            paddingVertical: 7,
        },
        startButtonBusy: { backgroundColor: colors.textMuted },
        startText: { fontSize: FontSize.md, fontWeight: '800', color: colors.white },
        planPrompt: { flexDirection: 'column', gap: Spacing.xs },
        planPromptTitle: { fontSize: FontSize.lg, fontWeight: '800', color: colors.accent },
        planPromptHint: { fontSize: FontSize.md, color: colors.textSecondary },
        nodeBreak: { backgroundColor: colors.streak },
        liveCard: { borderWidth: 1.5, borderColor: colors.accent },
        liveStatus: { fontSize: FontSize.md, fontWeight: '600', color: colors.accent },
        liveStatusBreak: { color: colors.streak },
        liveClock: { fontWeight: '800', fontVariant: ['tabular-nums'] },
        missedGlyph: { color: colors.white, fontSize: FontSize.xl, fontWeight: '900', lineHeight: 22 },
        missedCard: { alignItems: 'center' },
        missedText: { flex: 1, fontSize: FontSize.lg, fontWeight: '600', color: colors.textPrimary },
        calendarLink: { alignItems: 'center', paddingVertical: Spacing.xl },
        calendarLinkText: { fontSize: FontSize.md, fontWeight: '700', color: colors.accent },
    });
}
