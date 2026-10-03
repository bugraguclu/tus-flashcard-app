import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { BorderRadius, FontSize, Shadows, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
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
    const { width } = useWindowDimensions();
    const ringSize = Math.round(Math.min(184, Math.max(132, width * 0.4)));
    const styles = useMemo(() => createStyles(colors), [colors]);
    const onBreak = running?.phase === 'break';
    const total = formatStudyTotal(todayStudyMs, locale);
    // "2 sa 30 dk" at the size of "0 dk" would reach the ring and its knob. Sized by length rather
    // than with adjustsFontSizeToFit, which the web build does not support.
    const totalFontSize = total.length > 9 ? FontSize.lg : total.length > 7 ? FontSize.xl : FontSize.xxl + 2;

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
                        strokeWidth={12}
                        progress={goalProgress(todayStudyMs, goalMinutes)}
                        trackColor={colors.border}
                        progressColor={colors.accent}
                        knobColor={colors.bgCard}
                    >
                        <View style={[styles.ringCenter, { maxWidth: ringSize * 0.66 }]}>
                            {running ? (
                                <>
                                    <Text style={[styles.ringCaption, onBreak ? styles.breakText : styles.subjectText]} numberOfLines={1}>
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
                                <PlayIcon color={colors.white} size={24} />
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
                                {onBreak ? <PlayIcon color={colors.white} size={18} /> : <PauseIcon color={colors.white} size={18} />}
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
                                <StopIcon color={colors.white} size={16} />
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

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        hero: {
            backgroundColor: colors.bgCard,
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.lg,
            paddingBottom: Spacing.xl,
            gap: Spacing.md,
            ...Shadows.sm,
        },
        row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
        ringCenter: { alignItems: 'center', gap: 2 },
        ringLabel: { fontSize: FontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
        ringValue: { fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
        ringCaption: { fontSize: FontSize.sm, fontWeight: '700' },
        subjectText: { color: colors.accent },
        breakText: { color: colors.streak },
        ringClock: { fontSize: FontSize.xl + 2, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
        ringFootnote: { fontSize: FontSize.xs, color: colors.textMuted },
        controls: { flex: 1, alignItems: 'center', gap: Spacing.md },
        goalLabel: { fontSize: FontSize.lg, fontWeight: '700', color: colors.textPrimary },
        startButton: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            width: '100%',
            maxWidth: 220,
            backgroundColor: colors.bgInput,
            borderRadius: BorderRadius.full,
            padding: 6,
            paddingRight: Spacing.xl,
        },
        iconCircle: {
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        startText: { flex: 1, textAlign: 'center', fontSize: FontSize.xxl, fontWeight: '800', color: colors.accent },
        runningRow: { flexDirection: 'row', gap: Spacing.sm },
        pill: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            backgroundColor: colors.bgInput,
            borderRadius: BorderRadius.full,
            padding: 5,
            paddingRight: Spacing.md,
        },
        pillIcon: {
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
        },
        pillIconStop: { backgroundColor: colors.btnAgain },
        pillText: { flex: 1, textAlign: 'center', fontSize: FontSize.lg, fontWeight: '800', color: colors.textPrimary },
        blockText: { textAlign: 'center', fontSize: FontSize.md, fontWeight: '600', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
        blockTextOver: { color: colors.streak },
    });
}
