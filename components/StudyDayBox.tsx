// One day of the study calendars: the Statistics week strip and the Çalışma Takvimi grid draw
// every day with this box, so a studied day looks the same wherever the learner sees it.

import { useMemo } from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';
import { BorderRadius, FontSize, useThemeColors, type ColorScheme } from '../constants/theme';

const DAY_MS = 86400000;

/** Monday-first weekday index of a study-day number (its date is encoded at UTC midnight). */
export function mondayIndex(dayNumber: number): number {
    return (new Date(dayNumber * DAY_MS).getUTCDay() + 6) % 7;
}

/** "14 – 20 Tem 2026" for one month, "29 Haz – 5 Tem 2026" across months, years spelled out when they differ. */
export function formatWeekRange(monday: number, sunday: number, localeTag: string): string {
    const from = new Date(monday * DAY_MS);
    const to = new Date(sunday * DAY_MS);
    const fromDay = from.getUTCDate();
    const toDay = to.getUTCDate();
    const monthFormatter = new Intl.DateTimeFormat(localeTag, { month: 'short', timeZone: 'UTC' });
    const fromMonth = monthFormatter.format(from);
    const toMonth = monthFormatter.format(to);
    const fromYear = from.getUTCFullYear();
    const toYear = to.getUTCFullYear();

    if (fromYear !== toYear) {
        return `${fromDay} ${fromMonth} ${fromYear} – ${toDay} ${toMonth} ${toYear}`;
    }
    if (fromMonth !== toMonth) {
        return `${fromDay} ${fromMonth} – ${toDay} ${toMonth} ${toYear}`;
    }
    return `${fromDay} – ${toDay} ${fromMonth} ${toYear}`;
}

/** Monday-first weekday labels above the boxes. */
export function studyWeekdayLabels(l: (tr: string, en: string) => string): string[] {
    return l('Pzt,Sal,Çar,Per,Cum,Cmt,Paz', 'Mon,Tue,Wed,Thu,Fri,Sat,Sun').split(',');
}

export function studyDayBoxSize(isCompact: boolean): number {
    return isCompact ? 32 : 36;
}

interface StudyDayBoxProps extends Omit<ViewProps, 'style' | 'children'> {
    dateOfMonth: number;
    studied: boolean;
    isToday: boolean;
    /** Faded: a day still to come, or a neighbouring month's day in a month grid. */
    dimmed?: boolean;
    /** The day the calendar below the grid is scrolled to. Today keeps its own outline. */
    selected?: boolean;
    isCompact: boolean;
    /** Full-contrast date numbers. */
    highContrast?: boolean;
}

/** Studied days are filled orange with a dot, today is outlined orange. */
export default function StudyDayBox({
    dateOfMonth,
    studied,
    isToday,
    dimmed = false,
    selected = false,
    isCompact,
    highContrast = false,
    ...viewProps
}: StudyDayBoxProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors, isCompact, highContrast), [colors, isCompact, highContrast]);

    return (
        <View
            {...viewProps}
            style={[
                styles.box,
                studied && styles.boxStudied,
                isToday && !studied && styles.boxToday,
                selected && !isToday && styles.boxSelected,
                dimmed && styles.boxDimmed,
            ]}
        >
            <Text style={[styles.date, studied && styles.dateStudied, dimmed && !studied && styles.dateDimmed]}>
                {dateOfMonth}
            </Text>
            {studied && <View style={styles.dot} />}
        </View>
    );
}

function createStyles(colors: ColorScheme, isCompact: boolean, highContrast: boolean) {
    const size = studyDayBoxSize(isCompact);
    return StyleSheet.create({
        box: {
            width: size,
            height: size,
            borderRadius: BorderRadius.md,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.bgCard,
            alignItems: 'center',
            justifyContent: 'center',
        },
        boxStudied: { backgroundColor: colors.streak, borderColor: colors.streak },
        boxToday: { borderColor: colors.streak, backgroundColor: colors.streakBg },
        boxSelected: { borderColor: colors.accent, borderWidth: 2 },
        boxDimmed: { opacity: 0.45 },
        date: { color: highContrast ? colors.textPrimary : colors.textSecondary, fontSize: FontSize.sm, fontWeight: '800' },
        dateStudied: { color: colors.white },
        dateDimmed: { color: highContrast ? colors.textPrimary : colors.textMuted },
        dot: { position: 'absolute', bottom: 3, width: 3, height: 3, borderRadius: 2, backgroundColor: colors.white },
    });
}
