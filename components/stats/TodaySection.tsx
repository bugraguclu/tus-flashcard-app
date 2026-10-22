import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors, type ColorScheme } from '../../constants/theme';
import type { StudyStreak, TodayAnswerStats } from '../../lib/reviewLogger';
import WeekStreakStrip from '../WeekStreakStrip';
import StatsCard from './StatsCard';
import { useStatsFormat } from './useStatsFormat';

interface TodaySectionProps {
    today: TodayAnswerStats;
    streak: StudyStreak;
    rolloverHour: number;
    dataVersion: number;
    currentWeekStudiedDays: ReadonlySet<string>;
}

/**
 * The top of the screen: what was done today in the chosen deck, and the study streak across the
 * whole collection. Neither depends on the period picked for the charts below.
 */
export default function TodaySection({ today, streak, rolloverHour, dataVersion, currentWeekStudiedDays }: TodaySectionProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const f = useStatsFormat();
    const { l } = f;
    const days = (value: number) => l(`${f.count(value)} gün`, `${f.count(value)} ${value === 1 ? 'day' : 'days'}`);

    const figures = [
        { key: 'answers', value: f.count(today.reviewed), label: l('Cevap', 'Answers') },
        { key: 'accuracy', value: f.ratio(today.passed, today.reviewed), label: l('Doğruluk', 'Correct') },
        { key: 'time', value: f.duration(today.studyTimeMs), label: l('Süre', 'Time') },
        { key: 'new', value: f.count(today.newCardsIntroduced), label: l('Yeni kart', 'New cards') },
    ];

    return (
        <StatsCard
            title={l('Bugün', 'Today')}
            accessory={(
                <View
                    style={[styles.streakPill, streak.current === 0 && styles.streakPillIdle]}
                    accessible
                    accessibilityLabel={l(`Çalışma serisi: ${days(streak.current)}`, `Study streak: ${days(streak.current)}`)}
                >
                    <Text style={styles.streakIcon}>🔥</Text>
                    <Text style={[styles.streakText, streak.current === 0 && styles.streakTextIdle]}>{days(streak.current)}</Text>
                </View>
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
            <View style={styles.week}>
                <WeekStreakStrip
                    rolloverHour={rolloverHour}
                    dataVersion={dataVersion}
                    initialWeekStudiedDays={currentWeekStudiedDays}
                />
                <Text style={styles.best}>{l(`En uzun seri: ${days(streak.best)}`, `Longest streak: ${days(streak.best)}`)}</Text>
            </View>
        </StatsCard>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
        streakPill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: BorderRadius.full,
            backgroundColor: colors.streakBg,
        },
        streakPillIdle: { backgroundColor: colors.bgInput },
        streakIcon: { fontSize: FontSize.sm },
        streakText: { color: colors.streak, fontSize: FontSize.sm, fontWeight: '700' },
        streakTextIdle: { color: colors.textSecondary },
        figures: { flexDirection: 'row', gap: Spacing.sm },
        figure: { flex: 1, minWidth: 0 },
        value: { color: colors.textPrimary, fontSize: FontSize.xxl, fontWeight: '700' },
        label: { color: colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
        week: {
            gap: Spacing.sm,
            paddingTop: Spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderLight,
        },
        best: { color: colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center' },
    });
}
