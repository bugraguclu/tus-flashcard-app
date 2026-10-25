import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    formatClockHhMm,
    formatSessionDuration,
    studySubjectGlyph,
    type StudySession,
} from '../../lib/studyCalendar';
import { StopwatchIcon } from './StopwatchIcons';
import { timelineStyles } from './timelineStyles';

interface StudySessionCardProps {
    session: StudySession;
    onOpenMenu: (session: StudySession) => void;
}

/**
 * One session on a study timeline, as the Kronometre and the study calendar both draw it: the
 * options button and a node on the line, then the subject, its "N. Tekrar" chip, the study and
 * break time, and the time of day it ran. A card session's node is a tick; a Kronometre session
 * shows a stopwatch, or a pencil when it was entered by hand.
 */
function StudySessionCard({ session, onOpenMenu }: StudySessionCardProps) {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = timelineStyles(colors);
    // A card session's number counts that day's sessions of the subject; a Kronometre session's
    // is the learner's pass through it. Turkish calls both "Tekrar".
    const repeatLabel = session.pass === null
        ? l(`${session.repeatIndex}. Tekrar`, `Session ${session.repeatIndex}`)
        : l(`${session.pass}. Tekrar`, `Pass ${session.pass}`);

    return (
        <View style={styles.row}>
            <View style={styles.gutter}>
                <View style={styles.line} />
                <View style={styles.sideButtonSlot}>
                    <TouchableOpacity
                        style={styles.sideButton}
                        onPress={() => onOpenMenu(session)}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={l(
                            `${session.subject} oturumu için seçenekler`,
                            `Options for the ${session.subject} session`,
                        )}
                    >
                        <Text style={styles.sideButtonText}>•••</Text>
                    </TouchableOpacity>
                </View>
                <View style={[styles.nodeSlot, { pointerEvents: 'none' }]}>
                    <View style={[styles.node, session.source === 'cards' ? styles.nodeDone : styles.nodeTimer]}>
                        {session.source === 'timer'
                            ? <StopwatchIcon color={colors.white} size={16} />
                            : <Text style={styles.nodeText}>{session.source === 'manual' ? '✎' : '✓'}</Text>}
                    </View>
                </View>
            </View>
            <View style={styles.column}>
                <View style={styles.card}>
                    <View style={styles.tile}>
                        <Text style={styles.tileText}>{studySubjectGlyph(session.subject)}</Text>
                    </View>
                    <View style={styles.body}>
                        <View style={styles.titleRow}>
                            <Text style={styles.subject} numberOfLines={1}>{session.subject}</Text>
                            <View style={styles.chip}>
                                <Text style={styles.chipText}>{repeatLabel}</Text>
                            </View>
                        </View>
                        <View style={styles.metricsRow}>
                            <View style={styles.metric}>
                                <Text style={styles.metricLabel}>{l('Çalışma', 'Study')}</Text>
                                <Text style={styles.metricValue}>{formatSessionDuration(session.studyMs, locale)}</Text>
                            </View>
                            <View style={styles.metric}>
                                <Text style={styles.metricLabelBreak}>{l('Mola', 'Break')}</Text>
                                <Text style={styles.metricValue}>{formatSessionDuration(session.breakMs, locale)}</Text>
                            </View>
                        </View>
                    </View>
                </View>
                <Text style={styles.timeRange}>
                    {l('Zaman aralığı', 'Time range')} : {formatClockHhMm(session.startMs)} - {formatClockHhMm(session.endMs)}
                </Text>
            </View>
        </View>
    );
}

export default React.memo(StudySessionCard);
