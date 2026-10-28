import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { blockProgress, formatStopwatchClock, type StudyKind } from '../../lib/stopwatch';
import { formatClockHhMm, formatSessionDuration, studySubjectInitial } from '../../lib/studyCalendar';
import { BookIcon, CheckIcon } from './StopwatchIcons';
import { studyTypeLabel } from './StudyTypeChips';
import { timelineStyles } from './timelineStyles';

const MINUTE_MS = 60_000;

/** The stopwatch that is running now, shown as today's latest entry. */
export interface LiveSession {
    subject: string;
    kind: StudyKind;
    pass: number;
    startMs: number;
    studyMs: number;
    breakMs: number;
    /** Time in the current study block or break. */
    phaseMs: number;
    onBreak: boolean;
    note: string;
}

interface LiveSessionCardProps {
    live: LiveSession;
    /** Length of a study block and of a break; 0 when that reminder is off. */
    focusMinutes: number;
    breakMinutes: number;
    onEditNote: () => void;
}

/**
 * The session the stopwatch is timing, at the top of today as TUSBuddy shows it: the book beside
 * it for the session's note, its study and break so far, "Oturum süreniz", the note (or "İyi
 * çalışmalar") and how far the current study block or break has gone against its length — "%60 ·
 * 20 dk kaldı", "%100 · 15 dk aşıldı" — with the start of its time range.
 */
export default function LiveSessionCard({ live, focusMinutes, breakMinutes, onEditNote }: LiveSessionCardProps) {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = timelineStyles(colors);
    const progress = blockProgress(live.phaseMs, live.onBreak ? breakMinutes : focusMinutes);
    const type = studyTypeLabel(l, live.kind, live.pass);
    const barColor = live.onBreak ? colors.streak : colors.btnGood;

    const status = !progress
        ? null
        : progress.overMs >= MINUTE_MS
            ? l(`${Math.floor(progress.overMs / MINUTE_MS)} dk aşıldı`, `${Math.floor(progress.overMs / MINUTE_MS)} min over`)
            : progress.remainingMs <= 0
                ? l('Süre doldu', "Time's up")
                : l(`${Math.ceil(progress.remainingMs / MINUTE_MS)} dk kaldı`, `${Math.ceil(progress.remainingMs / MINUTE_MS)} min left`);
    const statusColor = progress && progress.remainingMs <= 0
        ? live.onBreak ? colors.btnAgain : colors.btnGood
        : colors.textSecondary;
    const message = live.onBreak
        ? l('Moladasınız', 'On a break')
        : live.note || l('İyi çalışmalar', 'Happy studying');

    return (
        <View style={styles.row}>
            <View style={styles.gutter}>
                <View style={styles.line} />
                <View style={styles.sideButtonSlot}>
                    <TouchableOpacity
                        style={styles.sideButton}
                        onPress={onEditNote}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={live.note
                            ? l(`Çalışma notunu düzenle: ${live.note}`, `Edit the study note: ${live.note}`)
                            : l('Çalışmaya not ekle', 'Add a note to the session')}
                    >
                        <BookIcon color={colors.btnGood} size={16} />
                    </TouchableOpacity>
                </View>
                <View style={[styles.nodeSlot, { pointerEvents: 'none' }]}>
                    <View style={[styles.node, styles.nodeDone]}>
                        <CheckIcon color={colors.white} size={13} />
                    </View>
                </View>
            </View>
            <View style={styles.column}>
                <View
                    style={[styles.card, local.card]}
                    accessible
                    accessibilityLabel={l(
                        `Şu an ${live.subject}, ${type}${live.onBreak ? ', molada' : ''}. Oturum süreniz ${formatStopwatchClock(live.studyMs)}.${status ? ` ${status}.` : ''}`,
                        `Now ${live.subject}, ${type}${live.onBreak ? ', on a break' : ''}. Session time ${formatStopwatchClock(live.studyMs)}.${status ? ` ${status}.` : ''}`,
                    )}
                >
                    <View style={local.top}>
                        <View style={styles.tile}>
                            <Text style={styles.tileText}>{studySubjectInitial(live.subject)}</Text>
                        </View>
                        <View style={styles.body}>
                            <View style={styles.titleRow}>
                                <Text style={styles.subject} numberOfLines={1}>{live.subject}</Text>
                                <View style={styles.chip}>
                                    <Text style={styles.chipText}>{type}</Text>
                                </View>
                            </View>
                            <View style={styles.metricsRow}>
                                <View style={styles.metric}>
                                    <Text style={styles.metricLabel}>{l('Çalışma', 'Study')}</Text>
                                    <Text style={styles.metricValue}>{formatSessionDuration(Math.floor(live.studyMs / MINUTE_MS) * MINUTE_MS, locale)}</Text>
                                </View>
                                <View style={styles.metric}>
                                    <Text style={styles.metricLabelBreak}>{l('Mola', 'Break')}</Text>
                                    <Text style={styles.metricValue}>{formatSessionDuration(Math.floor(live.breakMs / MINUTE_MS) * MINUTE_MS, locale)}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                    <View style={[local.sessionPill, { backgroundColor: colors.accentLight, borderColor: colors.border }]}>
                        <Text style={[local.sessionText, { color: colors.textPrimary }]}>
                            {l('Oturum süreniz: ', 'Session time: ')}
                            <Text style={local.sessionClock}>{formatStopwatchClock(live.studyMs)}</Text>
                        </Text>
                    </View>
                    <View style={[local.rule, { backgroundColor: colors.borderLight }]} />
                    <TouchableOpacity
                        style={local.messageRow}
                        onPress={onEditNote}
                        disabled={live.onBreak}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                    >
                        <BookIcon color={live.onBreak ? colors.streak : colors.btnGood} size={18} />
                        <Text style={[local.message, { color: live.onBreak ? colors.streak : colors.textPrimary }]} numberOfLines={2}>{message}</Text>
                    </TouchableOpacity>
                    {progress ? (
                        <View style={local.progress}>
                            <View style={local.progressLabels}>
                                <Text style={[local.percent, { color: colors.textSecondary }]}>
                                    {l(`%${Math.floor(progress.share * 100)}`, `${Math.floor(progress.share * 100)}%`)}
                                </Text>
                                <Text style={[local.status, { color: statusColor }]}>{status}</Text>
                            </View>
                            <View style={[local.track, { backgroundColor: colors.bgInput }]}>
                                <View style={[local.fill, { width: `${progress.share * 100}%`, backgroundColor: barColor }]} />
                            </View>
                        </View>
                    ) : null}
                </View>
                <Text style={styles.timeRange}>
                    {l('Zaman aralığı', 'Time range')} : {formatClockHhMm(live.startMs)} - . . .
                </Text>
            </View>
        </View>
    );
}

const local = StyleSheet.create({
    card: { flexDirection: 'column', gap: Spacing.sm },
    top: { flexDirection: 'row', gap: Spacing.md },
    sessionPill: {
        alignItems: 'center',
        borderRadius: BorderRadius.full,
        borderWidth: StyleSheet.hairlineWidth,
        paddingVertical: 5,
        paddingHorizontal: Spacing.md,
    },
    sessionText: { fontSize: FontSize.md },
    sessionClock: { fontWeight: '800', fontVariant: ['tabular-nums'] },
    rule: { height: StyleSheet.hairlineWidth },
    messageRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    message: { flex: 1, fontSize: FontSize.md, fontWeight: '500' },
    progress: { gap: 4 },
    progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    percent: { fontSize: FontSize.sm, fontVariant: ['tabular-nums'] },
    status: { fontSize: FontSize.sm, fontWeight: '600' },
    track: { height: 6, borderRadius: 3, overflow: 'hidden' },
    fill: { height: 6, borderRadius: 3 },
});
