import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { formatHeroDuration } from '../../lib/stopwatch';
import { studySubjectInitial } from '../../lib/studyCalendar';
import { formatPlanClock, type StudyPlanBlock } from '../../lib/studyPlans';
import { ClockIcon, GearIcon, PlayIcon } from './StopwatchIcons';
import { studyTypeLabel } from './StudyTypeChips';
import { timelineStyles } from './timelineStyles';

const MINUTE_MS = 60_000;

interface PlannedStudyCardProps {
    plan: StudyPlanBlock;
    /** Opens the plans ("Çalışma Planlama"). */
    onOpen: () => void;
    /**
     * Time still to study in the block today ("Kalan"). Without it — a day in the calendar — the
     * card gives the block's planned length.
     */
    remainingMs?: number;
    /** Starts the stopwatch on this plan; shown for today's plans only. */
    onStart?: () => void;
}

/**
 * A planned study block on a timeline, under the day's sessions, as TUSBuddy draws it: the plan's
 * gear and a clock on the line, then the subject and type and the time still to study ("Kalan: 8
 * saat"), the block's hours under the card. Today's blocks can start the stopwatch on the plan.
 */
function PlannedStudyCard({ plan, onOpen, remainingMs, onStart }: PlannedStudyCardProps) {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = timelineStyles(colors);
    const end = formatPlanClock(plan.startMinute + plan.durationMinutes);
    const type = studyTypeLabel(l, plan.kind, plan.pass);
    const done = remainingMs !== undefined && remainingMs <= 0;
    // A part of a minute still to go rounds up, so a block never reads "0 dk" before it is done.
    const left = remainingMs === undefined ? 0 : Math.ceil(remainingMs / MINUTE_MS) * MINUTE_MS;
    const amount = formatHeroDuration(remainingMs === undefined ? plan.durationMinutes * MINUTE_MS : left, locale);
    const summary = remainingMs === undefined
        ? l(`Süre: ${amount}`, `Length: ${amount}`)
        : done ? l('Tamamlandı', 'Done') : l(`Kalan: ${amount}`, `Left: ${amount}`);

    return (
        <View style={styles.row}>
            <View style={styles.gutter}>
                <View style={styles.line} />
                <View style={styles.sideButtonSlot}>
                    <TouchableOpacity
                        style={styles.sideButton}
                        onPress={onOpen}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={l('Çalışma planlarını aç', 'Open the study plans')}
                    >
                        <GearIcon color={colors.textSecondary} size={15} />
                    </TouchableOpacity>
                </View>
                <View style={[styles.nodeSlot, { pointerEvents: 'none' }]}>
                    <View style={[styles.node, done ? styles.nodeDone : styles.nodePlanned]}>
                        <ClockIcon color={colors.white} size={13} />
                    </View>
                </View>
            </View>
            <View style={styles.column}>
                <View style={styles.card}>
                    <TouchableOpacity
                        style={local.open}
                        onPress={onOpen}
                        accessibilityRole="button"
                        accessibilityLabel={l(
                            `Planlanan çalışma: ${plan.subject}, ${type}, ${formatPlanClock(plan.startMinute)}–${end}. ${summary}`,
                            `Planned: ${plan.subject}, ${type}, ${formatPlanClock(plan.startMinute)}–${end}. ${summary}`,
                        )}
                    >
                        <View style={styles.tile}>
                            <Text style={styles.tileText}>{studySubjectInitial(plan.subject)}</Text>
                        </View>
                        <View style={styles.body}>
                            <View style={styles.titleRow}>
                                <Text style={styles.subject} numberOfLines={1}>{plan.subject}</Text>
                                <View style={styles.chip}>
                                    <Text style={styles.chipText}>{type}</Text>
                                </View>
                            </View>
                            {done ? (
                                <Text style={[local.left, { color: colors.btnGood }]}>{l('Tamamlandı ✓', 'Done ✓')}</Text>
                            ) : (
                                <Text style={[local.left, { color: colors.textPrimary }]}>
                                    {remainingMs === undefined ? l('Süre: ', 'Length: ') : l('Kalan: ', 'Left: ')}
                                    <Text style={{ color: colors.accent }}>{amount}</Text>
                                </Text>
                            )}
                            {plan.note ? <Text style={styles.note}>{plan.note}</Text> : null}
                        </View>
                    </TouchableOpacity>
                    {onStart ? (
                        <TouchableOpacity
                            style={[local.start, { backgroundColor: colors.accent }]}
                            onPress={onStart}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={l(`${plan.subject} çalışmasını başlat`, `Start ${plan.subject}`)}
                        >
                            <PlayIcon color={colors.white} size={16} />
                        </TouchableOpacity>
                    ) : null}
                </View>
                <Text style={styles.timeRange}>
                    {l('Plan', 'Plan')} : {formatPlanClock(plan.startMinute)} - {end}
                </Text>
            </View>
        </View>
    );
}

const local = StyleSheet.create({
    open: { flex: 1, flexDirection: 'row', gap: Spacing.md },
    left: { fontSize: FontSize.md, fontWeight: '500' },
    start: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.sm, alignSelf: 'center' },
});

export default React.memo(PlannedStudyCard);
