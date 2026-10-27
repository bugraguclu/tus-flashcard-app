import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useIsDarkTheme, useThemeColors, type ColorScheme } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    MAX_GOAL_MINUTES,
    MIN_GOAL_MINUTES,
    formatGoalClock,
    formatStopwatchClock,
    formatStudyTotal,
    goalProgress,
    type RunningStopwatch,
    type StopwatchElapsed,
} from '../../lib/stopwatch';
import ProgressRing from './ProgressRing';
import { Stepper } from './SheetControls';
import { PauseIcon, PlayIcon, StopIcon } from './StopwatchIcons';

const MINUTE_MS = 60_000;
/** Secondary text and the ring's track on the coloured hero. */
const ON_HERO_SOFT = 'rgba(255, 255, 255, 0.85)';
const RING_TRACK = 'rgba(255, 255, 255, 0.3)';

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
    focusMinutes: number;
    breakMinutes: number;
    onStepGoal: (direction: 1 | -1) => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onFinish: () => void;
}

/**
 * The top of the Kronometre: today's study time on a ring that fills towards the daily goal, the
 * goal itself, and the stopwatch controls. While the stopwatch runs, the ring shows the session's
 * own time and a line underneath counts the current study block or break against its length.
 */
export default function StopwatchHero({
    todayStudyMs,
    goalMinutes,
    running,
    elapsed,
    focusMinutes,
    breakMinutes,
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
    const onBreak = running?.phase === 'break';
    const total = formatStudyTotal(todayStudyMs, locale);
    // "2 sa 30 dk" at the size of "0 dk" would reach the ring and its knob. Sized by length rather
    // than with adjustsFontSizeToFit, which the web build does not support.
    const totalFontSize = total.length > 9 ? FontSize.md : total.length > 7 ? FontSize.lg : FontSize.xl;

    const blockMinutes = onBreak ? breakMinutes : focusMinutes;
    const phaseMs = elapsed?.phaseMs ?? 0;
    const blockOver = blockMinutes > 0 && phaseMs >= blockMinutes * MINUTE_MS;
    const blockText = !running
        ? null
        : blockOver
            ? onBreak
                ? l('Mola süresi doldu — derse dönebilirsiniz.', 'Break time is up — you can get back to it.')
                : l('Ders süresi doldu — kısa bir mola verebilirsiniz.', 'Study block is up — you can take a short break.')
            : `${onBreak ? l('Mola', 'Break') : l('Ders bloğu', 'Study block')} ${formatStopwatchClock(phaseMs)}${blockMinutes > 0 ? ` / ${formatStopwatchClock(blockMinutes * MINUTE_MS)}` : ''}`;

    const summary = running
        ? l(
            `${running.subject} çalışılıyor${onBreak ? ', molada' : ''}. Bu oturum ${formatStopwatchClock(elapsed?.studyMs ?? 0)}. Bugün toplam ${total}, hedef ${formatGoalClock(goalMinutes)}.`,
            `Studying ${running.subject}${onBreak ? ', on a break' : ''}. This session ${formatStopwatchClock(elapsed?.studyMs ?? 0)}. Today ${total} of a ${formatGoalClock(goalMinutes)} goal.`,
        )
        : l(`Bugün toplam çalışma ${total}, hedef ${formatGoalClock(goalMinutes)}.`, `Studied today: ${total} of a ${formatGoalClock(goalMinutes)} goal.`);

    return (
        <View style={styles.hero}>
            <View style={styles.row}>
                <View accessible accessibilityRole="summary" accessibilityLabel={summary}>
                    <ProgressRing
                        size={ringSize}
                        strokeWidth={10}
                        progress={goalProgress(todayStudyMs, goalMinutes)}
                        trackColor={RING_TRACK}
                        progressColor={colors.white}
                        knobColor={colors.white}
                        knobDotColor={heroColor}
                    >
                        <View style={[styles.ringCenter, { maxWidth: ringSize * 0.66 }]}>
                            {running ? (
                                <>
                                    <Text style={styles.ringCaption} numberOfLines={1}>
                                        {onBreak ? l('Molada', 'On a break') : running.subject}
                                    </Text>
                                    <Text style={styles.ringClock} numberOfLines={1}>
                                        {formatStopwatchClock(elapsed?.studyMs ?? 0)}
                                    </Text>
                                    <Text style={styles.ringFootnote} numberOfLines={1}>{l(`Bugün ${total}`, `Today ${total}`)}</Text>
                                </>
                            ) : (
                                <>
                                    <Text style={styles.ringLabel}>{l('Toplam\nÇalışma Süresi', 'Total\nStudy Time')}</Text>
                                    <Text style={[styles.ringValue, { fontSize: totalFontSize }]} numberOfLines={1}>{total}</Text>
                                </>
                            )}
                        </View>
                    </ProgressRing>
                </View>

                <View style={styles.controls}>
                    <Text style={styles.goalLabel}>{l('Günlük Hedef', 'Daily Goal')}</Text>
                    <Stepper
                        size="hero"
                        value={formatGoalClock(goalMinutes)}
                        onStep={onStepGoal}
                        decreaseLabel={l('Günlük hedefi yarım saat azalt', 'Lower the daily goal by half an hour')}
                        increaseLabel={l('Günlük hedefi yarım saat artır', 'Raise the daily goal by half an hour')}
                        canDecrease={goalMinutes > MIN_GOAL_MINUTES}
                        canIncrease={goalMinutes < MAX_GOAL_MINUTES}
                    />
                    {running ? null : (
                        <TouchableOpacity
                            style={styles.startButton}
                            onPress={onStart}
                            accessibilityRole="button"
                            accessibilityLabel={l('Kronometreyi başlat', 'Start the stopwatch')}
                        >
                            <View style={styles.iconCircle}>
                                <PlayIcon color={colors.white} size={20} />
                            </View>
                            <Text style={styles.startText}>{l('Başla', 'Start')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {running ? (
                <>
                    <View style={styles.runningRow}>
                        <TouchableOpacity
                            style={styles.pill}
                            onPress={onBreak ? onResume : onPause}
                            accessibilityRole="button"
                            accessibilityLabel={onBreak ? l('Moladan dön', 'End the break') : l('Mola ver', 'Take a break')}
                        >
                            <View style={styles.pillIcon}>
                                {onBreak ? <PlayIcon color={colors.white} size={16} /> : <PauseIcon color={colors.white} size={16} />}
                            </View>
                            <Text style={styles.pillText}>{onBreak ? l('Devam et', 'Resume') : l('Mola ver', 'Break')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.pill}
                            onPress={onFinish}
                            accessibilityRole="button"
                            accessibilityLabel={l('Çalışmayı bitir ve kaydet', 'Finish and save the session')}
                        >
                            <View style={[styles.pillIcon, styles.pillIconStop]}>
                                <StopIcon color={colors.white} size={14} />
                            </View>
                            <Text style={styles.pillText}>{l('Bitir', 'Finish')}</Text>
                        </TouchableOpacity>
                    </View>
                    {blockText ? (
                        <Text style={[styles.blockText, blockOver && styles.blockTextOver]} accessibilityLiveRegion="polite">
                            {blockText}
                        </Text>
                    ) : null}
                </>
            ) : null}
        </View>
    );
}

function createStyles(colors: ColorScheme, heroColor: string) {
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
        row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
        ringCenter: { alignItems: 'center', gap: 2 },
        ringLabel: { fontSize: FontSize.sm, color: ON_HERO_SOFT, textAlign: 'center', lineHeight: 16 },
        ringValue: { fontWeight: '800', color: colors.white, marginTop: 2 },
        ringCaption: { fontSize: FontSize.xs, fontWeight: '700', color: colors.white },
        ringClock: { fontSize: FontSize.lg, fontWeight: '800', color: colors.white, fontVariant: ['tabular-nums'] },
        ringFootnote: { fontSize: FontSize.xs, color: ON_HERO_SOFT },
        controls: { flex: 1, alignItems: 'center', gap: Spacing.sm },
        goalLabel: { fontSize: FontSize.md, fontWeight: '700', color: colors.white },
        startButton: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            width: '100%',
            maxWidth: 188,
            marginTop: Spacing.xs,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.full,
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
        runningRow: { flexDirection: 'row', gap: Spacing.sm },
        pill: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            backgroundColor: colors.bgCard,
            borderRadius: BorderRadius.full,
            padding: 4,
            paddingRight: Spacing.md,
        },
        pillIcon: {
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        pillIconStop: { backgroundColor: colors.btnAgain },
        pillText: { flex: 1, textAlign: 'center', fontSize: FontSize.md, fontWeight: '800', color: colors.textPrimary },
        blockText: { textAlign: 'center', fontSize: FontSize.sm, fontWeight: '600', color: ON_HERO_SOFT, fontVariant: ['tabular-nums'] },
        blockTextOver: { color: colors.white, fontWeight: '800' },
    });
}
