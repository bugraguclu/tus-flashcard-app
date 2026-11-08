import { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Shadows, Spacing, useIsDarkTheme, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    MAX_GOAL_MINUTES,
    MIN_GOAL_MINUTES,
    formatGoalClock,
    formatHeroDuration,
    formatStopwatchClock,
    goalProgress,
    type RunningStopwatch,
    type StopwatchElapsed,
} from '../../lib/stopwatch';
import { ProgressBar } from '../ui/Feedback';
import { Stepper } from '../ui/Stepper';
import { Radius } from '../ui/tokens';
import ProgressRing from './ProgressRing';
import { PauseIcon, PlayIcon, StopIcon } from './StopwatchIcons';

const MINUTE_MS = 60_000;
/** The hero's pill buttons are drawn 36–42 points tall; their slop makes up a full target. */
const PILL_SLOP = { top: 4, bottom: 4 };

/** A `#rrggbb` colour at an opacity: the hero's secondary text and its ring's track. */
function translucent(hex: string, alpha: number): string {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((digit) => digit + digit).join('') : value;
    const [red, green, blue] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * The hero's background, which the Kronometre's header shares: the accent, or in dark mode its
 * deep tint, on which white text keeps its contrast.
 */
export function useStopwatchHeroColor(): string {
    const colors = useThemeColors();
    return useIsDarkTheme() ? colors.accentLight : colors.accent;
}

interface StopwatchHeroProps {
    /** Today's study time, the running stopwatch's included. */
    todayStudyMs: number;
    goalMinutes: number;
    running: RunningStopwatch | null;
    elapsed: StopwatchElapsed | null;
    onStepGoal: (direction: 1 | -1) => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onFinish: () => void;
}

/**
 * The top of the Kronometre, as TUSBuddy lays it out. Idle: today's study time on a ring that
 * fills towards the daily goal, the goal's − / + and "Başla". Running: today against the goal on a
 * bar, the subject, the session's study time as a large clock (and the break's while on one), and
 * "Sonlandır" and "Mola Ver" / "Devam Et".
 */
export default function StopwatchHero({
    todayStudyMs,
    goalMinutes,
    running,
    elapsed,
    onStepGoal,
    onStart,
    onPause,
    onResume,
    onFinish,
}: StopwatchHeroProps) {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    const heroColor = useStopwatchHeroColor();
    const { width } = useWindowDimensions();
    const ringSize = Math.round(Math.min(156, Math.max(116, width * 0.34)));
    const styles = useMemo(() => createStyles(colors, heroColor), [colors, heroColor]);
    const ringTrack = translucent(colors.onAccent, 0.3);
    const total = formatHeroDuration(todayStudyMs, locale);
    const goal = formatHeroDuration(goalMinutes * MINUTE_MS, locale);
    const progress = goalProgress(todayStudyMs, goalMinutes);

    if (running) {
        const onBreak = running.phase === 'break';
        const sessionClock = formatStopwatchClock(elapsed?.studyMs ?? 0);
        const summary = l(
            `${running.subject} çalışılıyor${onBreak ? ', molada' : ''}. Bu oturum ${sessionClock}. Bugün ${total}, hedef ${goal}.`,
            `Studying ${running.subject}${onBreak ? ', on a break' : ''}. This session ${sessionClock}. Today ${total} of a ${goal} goal.`,
        );
        return (
            <View style={[styles.hero, styles.heroRunning]}>
                <View accessible accessibilityRole="summary" accessibilityLabel={summary} style={styles.runningTop}>
                    <View style={styles.todayRow}>
                        <Text style={styles.todayLabel}>
                            {l('Bugün: ', 'Today: ')}
                            <Text style={styles.todayValue}>{total}</Text>
                        </Text>
                        <Text style={styles.todayLabel}>
                            {l('Hedef: ', 'Goal: ')}
                            <Text style={styles.todayValue}>{goal}</Text>
                        </Text>
                    </View>
                    <ProgressBar value={progress} color={colors.onAccent} style={[styles.goalTrack, { backgroundColor: ringTrack }]} />
                    <Text style={styles.runningSubject} numberOfLines={1}>
                        {running.subject.toLocaleUpperCase(locale === 'tr' ? 'tr' : 'en')}
                    </Text>
                    <Text style={styles.bigClock} numberOfLines={1}>{sessionClock}</Text>
                    {onBreak ? (
                        <Text style={styles.breakLine} accessibilityLiveRegion="polite">
                            {l('Mola: ', 'Break: ')}{formatStopwatchClock(elapsed?.phaseMs ?? 0)}
                        </Text>
                    ) : null}
                </View>
                <View style={styles.runningButtons}>
                    <TouchableOpacity
                        style={styles.pill}
                        onPress={onFinish}
                        hitSlop={PILL_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={l('Çalışmayı sonlandır ve kaydet', 'Finish and save the session')}
                    >
                        <View style={styles.pillIcon}>
                            <StopIcon color={colors.onAccent} size={12} />
                        </View>
                        <Text style={styles.pillText}>{l('Sonlandır', 'Finish')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.pill}
                        onPress={onBreak ? onResume : onPause}
                        hitSlop={PILL_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={onBreak ? l('Moladan dön, devam et', 'End the break and resume') : l('Mola ver', 'Take a break')}
                    >
                        <View style={styles.pillIcon}>
                            {onBreak ? <PlayIcon color={colors.onAccent} size={14} /> : <PauseIcon color={colors.onAccent} size={13} />}
                        </View>
                        <Text style={styles.pillText}>{onBreak ? l('Devam Et', 'Resume') : l('Mola Ver', 'Break')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // "4s 55dk" at the size of "0 dk" would reach the ring and its knob. Sized by length rather
    // than with adjustsFontSizeToFit, which the web build does not support.
    const totalFontSize = total.length > 9 ? FontSize.md : total.length > 7 ? FontSize.lg : FontSize.xl;
    return (
        <View style={styles.hero}>
            <View style={styles.row}>
                <View
                    accessible
                    accessibilityRole="summary"
                    accessibilityLabel={l(`Bugün toplam çalışma ${total}, hedef ${goal}.`, `Studied today: ${total} of a ${goal} goal.`)}
                >
                    <ProgressRing
                        size={ringSize}
                        strokeWidth={10}
                        progress={progress}
                        trackColor={ringTrack}
                        progressColor={colors.onAccent}
                        knobColor={colors.onAccent}
                        knobDotColor={heroColor}
                    >
                        {/* The ring is drawn at a fixed size around this copy, which already fills its
                            centre at the designed size, so it never grows past it. */}
                        <View style={[styles.ringCenter, { maxWidth: ringSize * 0.66 }]}>
                            <Text style={styles.ringLabel} maxFontSizeMultiplier={1}>{l('Toplam\nÇalışma Süresi', 'Total\nStudy Time')}</Text>
                            <Text style={[styles.ringValue, { fontSize: totalFontSize }]} numberOfLines={1} maxFontSizeMultiplier={1}>{total}</Text>
                        </View>
                    </ProgressRing>
                </View>

                <View style={styles.controls}>
                    <Text style={styles.goalLabel}>{l('Günlük Hedef', 'Daily Goal')}</Text>
                    <Stepper
                        onSurface="tinted"
                        value={formatGoalClock(goalMinutes)}
                        onDecrement={() => onStepGoal(-1)}
                        onIncrement={() => onStepGoal(1)}
                        decrementLabel={l('Günlük hedefi yarım saat azalt', 'Lower the daily goal by half an hour')}
                        incrementLabel={l('Günlük hedefi yarım saat artır', 'Raise the daily goal by half an hour')}
                        canDecrement={goalMinutes > MIN_GOAL_MINUTES}
                        canIncrement={goalMinutes < MAX_GOAL_MINUTES}
                        style={styles.goalStepper}
                    />
                    <TouchableOpacity
                        style={styles.startButton}
                        onPress={onStart}
                        hitSlop={PILL_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={l('Kronometreyi başlat', 'Start the stopwatch')}
                    >
                        <View style={styles.iconCircle}>
                            <PlayIcon color={colors.onAccent} size={20} />
                        </View>
                        <Text style={styles.startText}>{l('Başla', 'Start')}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme, heroColor: string) {
    const soft = translucent(colors.onAccent, 0.85);
    return StyleSheet.create({
        hero: {
            backgroundColor: heroColor,
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            paddingBottom: Spacing.lg,
            gap: Spacing.md,
            ...Shadows.sm,
        },
        heroRunning: { paddingTop: Spacing.xs, gap: Spacing.sm, paddingBottom: Spacing.lg },
        row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
        ringCenter: { alignItems: 'center', gap: 2 },
        ringLabel: { fontSize: FontSize.sm, color: soft, textAlign: 'center', lineHeight: 16 },
        ringValue: { fontWeight: '800', color: colors.onAccent, marginTop: 2 },
        controls: { flex: 1, alignItems: 'center', gap: Spacing.sm },
        goalLabel: { fontSize: FontSize.md, fontWeight: '700', color: colors.onAccent },
        goalStepper: { alignSelf: 'center' },
        startButton: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            width: '100%',
            maxWidth: 188,
            marginTop: Spacing.xs,
            backgroundColor: colors.bgCard,
            borderRadius: Radius.pill,
            padding: 4,
            paddingRight: Spacing.lg,
        },
        iconCircle: {
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        startText: { flex: 1, textAlign: 'center', fontSize: FontSize.xl, fontWeight: '800', color: colors.accent },
        runningTop: { alignItems: 'center', gap: 6 },
        todayRow: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.xs },
        todayLabel: { fontSize: FontSize.md, color: soft },
        todayValue: { color: colors.onAccent, fontWeight: '700' },
        goalTrack: { alignSelf: 'stretch', height: 8, borderRadius: 4 },
        runningSubject: { marginTop: Spacing.xs, fontSize: FontSize.md, fontWeight: '600', letterSpacing: 0.6, color: colors.onAccent },
        bigClock: { fontSize: 44, lineHeight: 52, fontWeight: '700', color: colors.onAccent, fontVariant: ['tabular-nums'] },
        breakLine: { fontSize: FontSize.md, fontWeight: '600', color: soft, fontVariant: ['tabular-nums'] },
        runningButtons: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.md },
        pill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            minWidth: 132,
            backgroundColor: colors.bgCard,
            borderRadius: Radius.pill,
            padding: 4,
            paddingRight: Spacing.lg,
        },
        pillIcon: {
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        pillText: { fontSize: FontSize.lg, fontWeight: '800', color: colors.accent },
    });
}
