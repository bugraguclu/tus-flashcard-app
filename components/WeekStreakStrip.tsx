// Duolingo-style weekly streak strip: seven day boxes (Monday-first), studied days
// painted orange, the current day outlined, and arrow/swipe navigation over past weeks.
// Day attribution follows the study-day rollover hour, so the strip, the streak chip and
// the stats charts always agree on which day a review belongs to.

import { useCallback, useMemo, useRef, useState } from 'react';
import { View, TouchableOpacity, PanResponder, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { Text } from './AppText';
import { useThemeColors, type ColorScheme, Spacing, FontSize } from '../constants/theme';
import { localDayNumber, dayNumberToYmd } from '../lib/ankiState';
import { getStudiedDaysBetween } from '../lib/reviewLogger';
import { useI18n } from '../hooks/useI18n';
import { useDeferredScreenSnapshot } from '../hooks/useDeferredScreenSnapshot';
import StudyDayBox, { formatWeekRange, mondayIndex, studyWeekdayLabels } from './StudyDayBox';
import SideDragArea, { SIDE_DRAG_IS_NATIVE } from './SideDragArea';
import { IconButton } from './ui/Button';
import { BackIcon, ForwardIcon } from './ui/icons';

const DAY_MS = 86400000;

/** Web-only tooltip via HTML title attribute */
function webTitle(text: string): Record<string, string> {
    return Platform.OS === 'web' ? { title: text } : {};
}

interface DayCell {
    dayNumber: number;
    ymd: string;
    dateOfMonth: number;
    isToday: boolean;
    isFuture: boolean;
}

interface WeekStreakStripProps {
    rolloverHour: number;
    /** Bumped after every answer/import/restore; retriggers the studied-day query. */
    dataVersion: number;
    /** Already read with the parent Statistics snapshot; avoids a second current-week query. */
    initialWeekStudiedDays?: ReadonlySet<string>;
    /** Use full-contrast labels in the plain Statistics layout. */
    highContrast?: boolean;
    /** Makes each day a button; Statistics opens that day in the Çalışma Takvimi. */
    onSelectDay?: (dayNumber: number) => void;
}

export default function WeekStreakStrip({
    rolloverHour,
    dataVersion,
    initialWeekStudiedDays,
    highContrast = false,
    onSelectDay,
}: WeekStreakStripProps) {
    const { l, localeTag } = useI18n();
    const dayLabels = studyWeekdayLabels(l);
    const { width } = useWindowDimensions();
    const isCompact = width < 430;
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors, isCompact, highContrast), [colors, isCompact, highContrast]);

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
                dateOfMonth: new Date(dayNumber * DAY_MS).getUTCDate(),
                isToday: dayNumber === today,
                isFuture: dayNumber > today,
            };
        });
    }, [monday, today, rolloverHour]);

    const studiedDaysKey = `${dataVersion}:${rolloverHour}:${monday}:${sunday}`;
    const loadStudiedDays = useCallback(
        () => weeksBack === 0 && initialWeekStudiedDays
            ? new Set(initialWeekStudiedDays)
            : getStudiedDaysBetween(monday, sunday, rolloverHour),
        [weeksBack, initialWeekStudiedDays, monday, sunday, rolloverHour],
    );
    const { snapshot: loadedStudiedDays } = useDeferredScreenSnapshot(studiedDaysKey, loadStudiedDays);
    const studiedDays = weeksBack === 0 && initialWeekStudiedDays
        ? initialWeekStudiedDays
        : loadedStudiedDays ?? new Set<string>();

    // Swipe between weeks (right = older, left = newer), matching the arrow buttons.
    // Created once; the handlers use functional setState so they never see stale state.
    const pageBySwipe = useCallback((dx: number) => {
        if (dx > 40) {
            setWeeksBack((prev) => prev + 1);
        } else if (dx < -40) {
            setWeeksBack((prev) => Math.max(0, prev - 1));
        }
    }, []);
    const panResponder = useRef(
        PanResponder.create({
            // On iOS the swipe is read by SideDragArea instead.
            onMoveShouldSetPanResponder: (_evt, gesture) => !SIDE_DRAG_IS_NATIVE
                && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
            onPanResponderRelease: (_evt, gesture) => pageBySwipe(gesture.dx),
        }),
    ).current;

    const atCurrentWeek = weeksBack === 0;

    return (
        <SideDragArea
            // A horizontal swipe on web must page between weeks, not select the labels.
            style={[styles.container, Platform.OS === 'web' && ({ userSelect: 'none' } as object)]}
            onDragEnd={({ dx }) => pageBySwipe(dx)}
            {...panResponder.panHandlers}
        >
            <View style={styles.headerRow}>
                <IconButton
                    onPress={() => setWeeksBack((prev) => prev + 1)}
                    accessibilityLabel={l('Önceki hafta', 'Previous week')}
                >
                    <BackIcon color={colors.textSecondary} size={20} />
                </IconButton>

                <Text style={styles.rangeText}>{formatWeekRange(monday, sunday, localeTag)}</Text>

                <IconButton
                    onPress={() => setWeeksBack((prev) => Math.max(0, prev - 1))}
                    disabled={atCurrentWeek}
                    accessibilityLabel={l('Sonraki hafta', 'Next week')}
                >
                    <ForwardIcon color={colors.textSecondary} size={20} />
                </IconButton>
            </View>

            <View style={styles.daysRow}>
                {days.map((day, i) => {
                    const studied = studiedDays.has(day.ymd);
                    const tooltip = day.isToday
                        ? (studied ? l('Bugün — çalışıldı', 'Today — studied') : l('Bugün — henüz çalışılmadı', 'Today — not studied yet'))
                        : (studied ? l(`${day.ymd} — çalışıldı`, `${day.ymd} — studied`) : l(`${day.ymd} — çalışılmadı`, `${day.ymd} — not studied`));
                    const label = day.isToday
                        ? (studied ? l('Bugün, çalışıldı', 'Today, studied') : l('Bugün, henüz çalışılmadı', 'Today, not studied yet'))
                        : `${dayLabels[i]}, ${day.ymd}, ${studied ? l('çalışıldı', 'studied') : l('çalışılmadı', 'not studied')}`;
                    const box = (
                        <StudyDayBox
                            dateOfMonth={day.dateOfMonth}
                            studied={studied}
                            isToday={day.isToday}
                            dimmed={day.isFuture && !highContrast}
                            isCompact={isCompact}
                            highContrast={highContrast}
                            {...(onSelectDay ? {} : { accessible: true, accessibilityLabel: label, ...webTitle(tooltip) })}
                        />
                    );
                    return (
                        <View key={day.ymd} style={styles.dayColumn}>
                            <Text style={[styles.dayLabel, day.isToday && styles.dayLabelToday]}>
                                {dayLabels[i]}
                            </Text>
                            {onSelectDay ? (
                                <TouchableOpacity
                                    onPress={() => onSelectDay(day.dayNumber)}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityLabel={label}
                                    accessibilityHint={l('Bu günü Çalışma Takvimi\'nde açar', 'Opens this day in the Study Calendar')}
                                    {...webTitle(tooltip)}
                                >
                                    {box}
                                </TouchableOpacity>
                            ) : box}
                        </View>
                    );
                })}
            </View>
        </SideDragArea>
    );
}

function createStyles(colors: ColorScheme, isCompact: boolean, highContrast: boolean) {
    return StyleSheet.create({
    container: { width: '100%' },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isCompact ? 2 : Spacing.xs,
        marginBottom: Spacing.sm,
    },
    rangeText: {
        flexShrink: 1,
        textAlign: 'center',
        fontSize: isCompact ? FontSize.sm : FontSize.lg,
        fontWeight: '600',
        color: highContrast ? colors.textPrimary : colors.textSecondary,
    },
    daysRow: {
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-between',
        gap: 0,
    },
    dayColumn: {
        alignItems: 'center',
        gap: 4,
    },
    dayLabel: {
        fontSize: FontSize.xs,
        fontWeight: '500',
        color: highContrast ? colors.textPrimary : colors.textMuted,
    },
    dayLabelToday: { color: highContrast ? colors.textPrimary : colors.streak, fontWeight: '600' },
    });
}
