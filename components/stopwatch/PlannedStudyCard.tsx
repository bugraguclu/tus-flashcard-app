import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { formatHeroDuration } from '../../lib/stopwatch';
import { studySubjectInitial } from '../../lib/studyCalendar';
import { formatPlanClock, type StudyPlanBlock } from '../../lib/studyPlans';
import { IconButton } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Choice';
import { CheckIcon } from '../ui/icons';
import { ClockIcon, GearIcon, PlayIcon } from './StopwatchIcons';
import { studyTypeLabel } from './StudyTypeChips';
import { SIDE_BUTTON_SLOP, timelineStyles } from './timelineStyles';

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
                    <IconButton
                        style={styles.sideButton}
                        onPress={onOpen}
                        hitSlop={SIDE_BUTTON_SLOP}
                        accessibilityLabel={l('Çalışma planlarını aç', 'Open the study plans')}
                    >
                        <GearIcon color={colors.textSecondary} size={15} />
                    </IconButton>
                </View>
                <View style={[styles.nodeSlot, { pointerEvents: 'none' }]}>
                    <View style={[styles.node, done ? styles.nodeDone : styles.nodePlanned]}>
                        <ClockIcon color={colors.onAccent} size={13} />
                    </View>
                </View>
            </View>
            <View style={styles.column}>
                <Card padded>
                    <View style={styles.cardRow}>
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
                                    <Badge label={type} tone="info" style={styles.typeBadge} />
                                </View>
                                {done ? (
                                    <View style={local.done}>
                                        <Text style={[local.left, { color: colors.success }]}>{l('Tamamlandı', 'Done')}</Text>
                                        <CheckIcon color={colors.success} size={16} />
                                    </View>
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
                            <IconButton
                                style={[local.start, { backgroundColor: colors.accent }]}
                                onPress={onStart}
                                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                accessibilityLabel={l(`${plan.subject} çalışmasını başlat`, `Start ${plan.subject}`)}
                            >
                                <PlayIcon color={colors.onAccent} size={16} />
                            </IconButton>
                        ) : null}
                    </View>
                </Card>
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
    done: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    start: { width: 34, height: 34, marginLeft: Spacing.sm, alignSelf: 'center' },
});

export default React.memo(PlannedStudyCard);
