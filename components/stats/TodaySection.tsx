import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { useNavigation, useRouter } from 'expo-router';
import { FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import { dayNumberToYmd } from '../../lib/ankiState';
import { openOrDismissTo } from '../../lib/backNavigation';
import type { StudyStreak, TodayAnswerStats } from '../../lib/reviewLogger';
import WeekStreakStrip from '../WeekStreakStrip';
import { Card } from '../ui/Card';
import { ChevronRightIcon } from '../ui/icons';
import type { TodayPlanProgress } from '../../lib/todayPlanProgress';
import { ProgressBar, Notice } from '../ui/Feedback';
import { Button } from '../ui/Button';
import FlameGlyph from '../FlameGlyph';
import { useStatsFormat } from './useStatsFormat';

interface TodaySectionProps {
    today: TodayAnswerStats;
    todayPlan?: TodayPlanProgress;
    todayPlanFailed?: boolean;
    streak: StudyStreak;
    rolloverHour: number;
    dataVersion: number;
    currentWeekStudiedDays: ReadonlySet<string>;
}

/**
 * The top of the screen: what was done today in the chosen deck, and the study streak across the
 * whole collection. Neither depends on the period picked for the charts below. The streak pill
 * opens the Kronometre, whose sessions keep the streak going too, and a day of the week strip
 * opens that day in the Çalışma Takvimi, which draws its days the same way.
 */
export default function TodaySection({ today, streak, rolloverHour, dataVersion, currentWeekStudiedDays, todayPlan, todayPlanFailed }: TodaySectionProps) {
    const colors = useThemeColors();
    const router = useRouter();
    const navigation = useNavigation();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const f = useStatsFormat();
    const { l } = f;
    const days = (value: number) => l(`${f.count(value)} gün`, `${f.count(value)} ${value === 1 ? 'day' : 'days'}`);

    const figures = [
        { key: 'answers', value: f.count(today.reviewed), label: l('Cevap', 'Answers') },
        { key: 'accuracy', value: f.ratio(today.passed, today.reviewed), label: l('Doğruluk', 'Correct') },
        { key: 'time', value: f.duration(today.studyTimeMs), label: l('Kart süresi', 'Card time') },
        { key: 'new', value: f.count(today.newCardsIntroduced), label: l('Yeni kart', 'New cards') },
    ];

    return (
        <Card
            padded
            title={l('Bugün', 'Today')}
            accessory={(
                <TouchableOpacity
                    style={[styles.streakPill, null]}
                    onPress={() => router.push('/stopwatch' as any)}
                    activeOpacity={0.7}
                    // The pill is drawn 24 points tall; the slop makes up a finger's 44.
                    hitSlop={{ top: 10, bottom: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={l(`Çalışma serisi: ${days(streak.current)}`, `Study streak: ${days(streak.current)}`)}
                    accessibilityHint={l('Kronometreyi açar', 'Opens the stopwatch')}
                >
                    {streak.current > 0 ? <FlameGlyph size={16} /> : null}
                    <Text style={styles.streakText}>{days(streak.current)}</Text>
                    <ChevronRightIcon color={colors.textMuted} size={16} />
                </TouchableOpacity>
            )}
        >
            <View style={styles.figures}>
                {figures.map((figure) => (
                    <View key={figure.key} style={styles.figure} accessible accessibilityLabel={`${figure.label}: ${figure.value}`}>
                        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3}>
                            {figure.value}
                        </Text>
                        <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.3}>{figure.label}</Text>
                    </View>
                ))}
            </View>
            {todayPlanFailed ? <Notice tone="danger">{l('Bugünkü plan okunamadı.', "Today's plan could not be read.")}</Notice> : todayPlan?.hasPlan ? <View style={{ gap: Spacing.sm }}>
                <Text style={[styles.best, { textAlign: 'left' }]}>{l('Kronometre planı · Tüm dersler', 'Stopwatch plan · All courses')}</Text>
                <Text style={[styles.label, { color: colors.textPrimary }]}>{l(`Planlanan ${f.duration(todayPlan.plannedMs)} · Çalışılan ${f.duration(todayPlan.studiedMs)} · Kalan ${f.duration(todayPlan.remainingMs)}`, `Planned ${f.duration(todayPlan.plannedMs)} · Studied ${f.duration(todayPlan.studiedMs)} · Remaining ${f.duration(todayPlan.remainingMs)}`)}</Text>
                <ProgressBar value={todayPlan.progressRatio} accessibilityLabel={l('Bugünkü plan ilerlemesi', "Today's plan progress")} />
                <Text style={styles.label}>{l(`${todayPlan.completedBlocks} / ${todayPlan.totalBlocks} blok tamamlandı`, `${todayPlan.completedBlocks} / ${todayPlan.totalBlocks} blocks completed`)}</Text>
                <Button variant="plain" size="compact" label={todayPlan.nextBlock ? `${todayPlan.nextBlock.subject} · ${todayPlan.nextBlock.clockRange}` : l('Plan tamamlandı', 'Plan completed')} onPress={() => router.push(todayPlan.nextBlock ? '/stopwatch' : '/study-plans')} />
            </View> : null}
            <View style={styles.week}>
                <WeekStreakStrip
                    rolloverHour={rolloverHour}
                    dataVersion={dataVersion}
                    initialWeekStudiedDays={currentWeekStudiedDays}
                    onSelectDay={(dayNumber) => openOrDismissTo(
                        router,
                        navigation,
                        'study-calendar',
                        `/study-calendar?day=${dayNumberToYmd(dayNumber, rolloverHour)}`,
                    )}
                />
                <Text style={styles.best}>{l(`En uzun seri: ${days(streak.best)}`, `Longest streak: ${days(streak.best)}`)}</Text>
            </View>
        </Card>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        streakPill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: 4,
        },
        // The flame carries the streak's colour; the words stay in the text greys, with no pill.
        streakText: { color: colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600' },
        figures: { flexDirection: 'row', gap: Spacing.sm },
        figure: { flex: 1, minWidth: 0 },
        value: { color: colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '600' },
        label: { color: colors.textSecondary, fontSize: FontSize.sm, marginTop: Spacing.xxs },
        week: {
            gap: Spacing.sm,
            paddingTop: Spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
        },
        best: { color: colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
    });
}
