// Duolingo-style weekly streak strip: seven day boxes (Monday-first), studied days
// painted orange, the current day outlined, and arrow/swipe navigation over past weeks.
// Day attribution follows the study-day rollover hour, so the strip, the streak chip and
// the stats charts always agree on which day a review belongs to.

import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, PanResponder, Platform, StyleSheet } from 'react-native';
import { useThemeColors, type ColorScheme, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { localDayNumber, dayNumberToYmd } from '../lib/ankiState';
import { getStudiedDaysBetween } from '../lib/reviewLogger';

const DAY_MS = 86400000;
const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTH_LABELS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** Web-only tooltip via HTML title attribute */
function webTitle(text: string): Record<string, string> {
    return Platform.OS === 'web' ? { title: text } : {};
}

interface DayCell {
    dayNumber: number;
    ymd: string;
    isToday: boolean;
    isFuture: boolean;
}

/** Monday-first weekday index of a study-day number (its date is encoded at UTC midnight). */
function mondayIndex(dayNumber: number): number {
    return (new Date(dayNumber * DAY_MS).getUTCDay() + 6) % 7;
}

/** "14 – 20 Tem 2026" for one month, "29 Haz – 5 Tem 2026" across months, years spelled out when they differ. */
function formatWeekRange(monday: number, sunday: number): string {
    const from = new Date(monday * DAY_MS);
    const to = new Date(sunday * DAY_MS);
    const fromDay = from.getUTCDate();
    const toDay = to.getUTCDate();
    const fromMonth = MONTH_LABELS[from.getUTCMonth()];
    const toMonth = MONTH_LABELS[to.getUTCMonth()];
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

interface WeekStreakStripProps {
    rolloverHour: number;
    /** Bumped after every answer/import/restore; retriggers the studied-day query. */
    dataVersion: number;
}

export default function WeekStreakStrip({ rolloverHour, dataVersion }: WeekStreakStripProps) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    // 0 = current week, 1 = one week back, and so on.
    const [weeksBack, setWeeksBack] = useState(0);

    const today = localDayNumber(Date.now(), rolloverHour);
    const monday = today - mondayIndex(today) - weeksBack * 7;
    const sunday = monday + 6;

    const days = useMemo<DayCell[]>(() => {
        return Array.from({ length: 7 }, (_, i) => {
            const dayNumber = monday + i;
            return {
                dayNumber,
                ymd: dayNumberToYmd(dayNumber, rolloverHour),
                isToday: dayNumber === today,
                isFuture: dayNumber > today,
            };
        });
    }, [monday, today, rolloverHour]);

    const studiedDays = useMemo(
        () => getStudiedDaysBetween(monday, sunday, rolloverHour),
        [monday, sunday, rolloverHour, dataVersion],
    );

    // Swipe between weeks (right = older, left = newer), matching the arrow buttons.
    // Created once; the handlers use functional setState so they never see stale state.
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_evt, gesture) =>
                Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
            onPanResponderRelease: (_evt, gesture) => {
                if (gesture.dx > 40) {
                    setWeeksBack((prev) => prev + 1);
                } else if (gesture.dx < -40) {
                    setWeeksBack((prev) => Math.max(0, prev - 1));
                }
            },
        }),
    ).current;

    const atCurrentWeek = weeksBack === 0;

    return (
        <View
            // A horizontal swipe on web must page between weeks, not select the labels.
            style={[styles.container, Platform.OS === 'web' && ({ userSelect: 'none' } as object)]}
            {...panResponder.panHandlers}
        >
            <View style={styles.headerRow}>
                <TouchableOpacity
                    style={styles.arrowBtn}
                    onPress={() => setWeeksBack((prev) => prev + 1)}
                    accessibilityRole="button"
                    accessibilityLabel="Önceki hafta"
                    {...webTitle('Önceki hafta')}
                >
                    <Text style={styles.arrowText}>‹</Text>
                </TouchableOpacity>

                <Text style={styles.rangeText}>{formatWeekRange(monday, sunday)}</Text>

                <TouchableOpacity
                    style={[styles.arrowBtn, atCurrentWeek && styles.arrowBtnDisabled]}
                    onPress={() => setWeeksBack((prev) => Math.max(0, prev - 1))}
                    disabled={atCurrentWeek}
                    accessibilityRole="button"
                    accessibilityLabel="Sonraki hafta"
                    {...webTitle('Sonraki hafta')}
                >
                    <Text style={styles.arrowText}>›</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.daysRow}>
                {days.map((day, i) => {
                    const studied = studiedDays.has(day.ymd);
                    return (
                        <View key={day.ymd} style={styles.dayColumn}>
                            <Text style={[styles.dayLabel, day.isToday && styles.dayLabelToday]}>
                                {DAY_LABELS[i]}
                            </Text>
                            <View
                                style={[
                                    styles.dayBox,
                                    studied && styles.dayBoxStudied,
                                    day.isToday && !studied && styles.dayBoxToday,
                                    day.isFuture && styles.dayBoxFuture,
                                ]}
                                {...webTitle(
                                    day.isToday
                                        ? (studied ? 'Bugün — çalışıldı' : 'Bugün — henüz çalışılmadı')
                                        : (studied ? `${day.ymd} — çalışıldı` : `${day.ymd} — çalışılmadı`),
                                )}
                            >
                                {studied && <Text style={styles.dayCheck}>✓</Text>}
                            </View>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

function createStyles(colors: ColorScheme) {
    return StyleSheet.create({
    container: { marginTop: -Spacing.lg },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.xs,
        marginBottom: Spacing.sm,
    },
    arrowBtn: {
        width: 26,
        height: 26,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: BorderRadius.sm,
    },
    arrowBtnDisabled: { opacity: 0.25 },
    arrowText: {
        fontSize: 24,
        lineHeight: 26,
        color: colors.textSecondary,
        fontWeight: '600',
    },
    rangeText: {
        fontSize: FontSize.lg,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    daysRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    dayColumn: {
        alignItems: 'center',
        gap: 4,
    },
    dayLabel: {
        fontSize: FontSize.xs,
        fontWeight: '600',
        color: colors.textMuted,
        textTransform: 'uppercase',
    },
    dayLabelToday: { color: colors.streak, fontWeight: '700' },
    dayBox: {
        width: 34,
        height: 34,
        borderRadius: BorderRadius.md,
        borderWidth: 1.5,
        borderColor: colors.border,
        backgroundColor: colors.bgCard,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayBoxStudied: {
        backgroundColor: colors.streak,
        borderColor: colors.streak,
    },
    dayBoxToday: {
        borderColor: colors.streak,
        backgroundColor: colors.streakBg,
    },
    dayBoxFuture: { opacity: 0.45 },
    dayCheck: {
        color: colors.white,
        fontSize: FontSize.md,
        fontWeight: '800',
    },
    });
}
