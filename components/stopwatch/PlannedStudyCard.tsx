import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { formatStudyTotal } from '../../lib/stopwatch';
import { studySubjectGlyph } from '../../lib/studyCalendar';
import { formatPlanClock, type StudyPlanBlock } from '../../lib/studyPlans';
import { ClockIcon, PlayIcon } from './StopwatchIcons';
import { studyTypeLabel } from './StudyTypeChips';
import { timelineStyles } from './timelineStyles';

interface PlannedStudyCardProps {
    plan: StudyPlanBlock;
    /** Opens the plans ("Çalışma Planlama"). */
    onOpen: () => void;
    /** Starts the stopwatch on this plan; shown for today's plans only. */
    onStart?: () => void;
}

/**
 * A planned study block on a timeline, under the day's sessions: a clock node on the line, the
 * subject and type, when it starts and how long it lasts, and the plan's note. Today's blocks can
 * start the stopwatch on the plan's subject and type.
 */
function PlannedStudyCard({ plan, onOpen, onStart }: PlannedStudyCardProps) {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = timelineStyles(colors);
    const end = formatPlanClock(plan.startMinute + plan.durationMinutes);
    const type = studyTypeLabel(l, plan.kind, plan.pass);

    return (
        <View style={styles.row}>
            <View style={styles.gutter}>
                <View style={styles.line} />
                <View style={[styles.nodeSlot, { pointerEvents: 'none' }]}>
                    <View style={[styles.node, { backgroundColor: colors.studyTool }]}>
                        <ClockIcon color={colors.white} size={16} />
                    </View>
                </View>
            </View>
            <View style={styles.column}>
                <View style={[styles.card, local.card, { borderColor: colors.studyTool }]}>
                    <TouchableOpacity
                        style={local.open}
                        onPress={onOpen}
                        accessibilityRole="button"
                        accessibilityLabel={l(
                            `Planlanan çalışma: ${plan.subject}, ${type}, ${formatPlanClock(plan.startMinute)}–${end}`,
                            `Planned: ${plan.subject}, ${type}, ${formatPlanClock(plan.startMinute)}–${end}`,
                        )}
                    >
                        <View style={styles.tile}>
                            <Text style={styles.tileText}>{studySubjectGlyph(plan.subject)}</Text>
                        </View>
                        <View style={styles.body}>
                            <View style={styles.titleRow}>
                                <Text style={styles.subject} numberOfLines={1}>{plan.subject}</Text>
                                <View style={styles.chip}>
                                    <Text style={styles.chipText}>{type}</Text>
                                </View>
                            </View>
                            <Text style={[local.meta, { color: colors.textSecondary }]}>
                                {`${l('Planlanan', 'Planned')} · ${formatPlanClock(plan.startMinute)}–${end} · ${formatStudyTotal(plan.durationMinutes * 60_000, locale)}`}
                            </Text>
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
            </View>
        </View>
    );
}

const local = StyleSheet.create({
    card: { borderWidth: 1, borderStyle: 'dashed' },
    open: { flex: 1, flexDirection: 'row', gap: Spacing.md },
    meta: { fontSize: FontSize.sm, marginTop: 2 },
    start: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.sm, alignSelf: 'center' },
});

export default React.memo(PlannedStudyCard);
