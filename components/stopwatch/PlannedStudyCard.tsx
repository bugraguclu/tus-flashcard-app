import React from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { formatHeroDuration } from '../../lib/stopwatch';
import { formatPlanClock, type StudyPlanBlock } from '../../lib/studyPlans';
import { ClockIcon, GearIcon } from './StopwatchIcons';
import { studyTypeLabel } from './StudyTypeChips';
import { SubjectTile } from './SubjectArt';
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
 * gear and a clock on the line, then the course's picture, the subject and type and the time
 * still to study ("Kalan: 8 Saat") — or on another day the time planned ("Planlanan: 8 Saat") —
 * with the block's hours under the card. Today's blocks start the stopwatch on the plan from the
 * small "Başlat" beside the time left.
 */
function PlannedStudyCard({ plan, onOpen, remainingMs, onStart }: PlannedStudyCardProps) {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = timelineStyles(colors);
    const end = formatPlanClock(plan.startMinute + plan.durationMinutes);
    const type = studyTypeLabel(l, plan.kind, plan.pass);
    const done = remainingMs !== undefined && remainingMs <= 0;
    const startable = Boolean(onStart) && !done;
    // A part of a minute still to go rounds up, so a block never reads "0 dk" before it is done.
    const left = remainingMs === undefined ? 0 : Math.ceil(remainingMs / MINUTE_MS) * MINUTE_MS;
    // Whole hours read "8 Saat", as TUSBuddy writes a plan's time.
    const amount = formatHeroDuration(remainingMs === undefined ? plan.durationMinutes * MINUTE_MS : left, locale)
        .replace(/ saat$/, ' Saat');
    const summary = remainingMs === undefined
        ? l(`Planlanan: ${amount}`, `Planned: ${amount}`)
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
                    {/* The card opens the plans from a layer behind its content, so "Başlat" is a
                        button of its own beside it rather than one inside another. VoiceOver reads
                        the card as one button and offers "Başlat" among its actions. */}
                    <Pressable
                        style={({ pressed }) => [StyleSheet.absoluteFill, local.press, pressed && { backgroundColor: colors.bgInput }]}
                        onPress={onOpen}
                        accessibilityRole="button"
                        accessibilityLabel={l(
                            `Planlanan çalışma: ${plan.subject}, ${type}, ${formatPlanClock(plan.startMinute)}–${end}. ${summary}`,
                            `Planned: ${plan.subject}, ${type}, ${formatPlanClock(plan.startMinute)}–${end}. ${summary}`,
                        )}
                        accessibilityActions={startable ? [{ name: 'start', label: l('Başlat', 'Start') }] : undefined}
                        onAccessibilityAction={(event) => {
                            if (event.nativeEvent.actionName === 'start') onStart?.();
                        }}
                    />
                    {/* box-none as a prop: the web build reads only the prop form of it. */}
                    <View
                        style={local.content}
                        pointerEvents="box-none"
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                    >
                        <View style={{ pointerEvents: 'none' }}>
                            <SubjectTile subject={plan.subject} />
                        </View>
                        <View style={styles.body} pointerEvents="box-none">
                            <View style={[styles.titleRow, { pointerEvents: 'none' }]}>
                                <Text style={styles.subject} numberOfLines={1}>{plan.subject}</Text>
                                <View style={styles.chip}>
                                    <Text style={styles.chipText}>{type}</Text>
                                </View>
                            </View>
                            <View style={local.leftRow} pointerEvents="box-none">
                                <View style={{ pointerEvents: 'none' }}>
                                    {done ? (
                                        <Text style={[local.left, { color: colors.btnGood }]}>{l('Tamamlandı ✓', 'Done ✓')}</Text>
                                    ) : (
                                        <Text style={[local.left, { color: colors.textPrimary }]}>
                                            {remainingMs === undefined ? l('Planlanan: ', 'Planned: ') : l('Kalan: ', 'Left: ')}
                                            <Text style={{ color: colors.accent }}>{amount}</Text>
                                        </Text>
                                    )}
                                </View>
                                {startable ? (
                                    <TouchableOpacity
                                        style={[local.start, { backgroundColor: colors.accent }]}
                                        onPress={onStart}
                                        hitSlop={{ top: 10, right: 8, bottom: 10, left: 8 }}
                                        accessibilityRole="button"
                                        accessibilityLabel={l(`${plan.subject} çalışmasını başlat`, `Start ${plan.subject}`)}
                                    >
                                        <Text style={[local.startText, { color: colors.onAccent }]}>{l('Başlat', 'Start')}</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                            {plan.note ? (
                                <View style={{ pointerEvents: 'none' }}>
                                    <Text style={styles.note}>{plan.note}</Text>
                                </View>
                            ) : null}
                        </View>
                    </View>
                </View>
                <Text style={styles.timeRange}>
                    {l('Plan', 'Plan')} : {formatPlanClock(plan.startMinute)} - {end}
                </Text>
            </View>
        </View>
    );
}

const local = StyleSheet.create({
    press: { borderRadius: BorderRadius.lg },
    content: { flex: 1, flexDirection: 'row', gap: Spacing.md },
    leftRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.md },
    left: { fontSize: FontSize.md, fontWeight: '500' },
    // The small filled "Başlat" TUSBuddy puts after the time left.
    start: { borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
    startText: { fontSize: FontSize.sm, fontWeight: '700' },
});

export default React.memo(PlannedStudyCard);
