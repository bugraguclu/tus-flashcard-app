import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    formatClockHhMm,
    formatSessionDuration,
    studySubjectInitial,
    type StudySession,
} from '../../lib/studyCalendar';
import { CheckIcon } from './StopwatchIcons';
import { studyTypeLabel } from './StudyTypeChips';
import { timelineStyles } from './timelineStyles';

interface StudySessionCardProps {
    session: StudySession;
    onOpenMenu: (session: StudySession) => void;
}

/**
 * One session on a study timeline, as the Kronometre and the study calendar both draw it, after
 * TUSBuddy: the options button and a tick on the line, then the subject, its type chip ("N.
 * Tekrar", "Soru Çözümü"...), the study and break time with the number of breaks, the learner's
 * note and the time of day it ran. Whether it was measured, entered by hand or answered on cards
 * is in its details.
 */
function StudySessionCard({ session, onOpenMenu }: StudySessionCardProps) {
    const { l, locale } = useI18n();
    const colors = useThemeColors();
    const styles = timelineStyles(colors);
    // A card session's number counts that day's sessions of the subject; a Kronometre session's
    // is the learner's pass through it, or the kind of study it was. Turkish calls both "Tekrar".
    const repeatLabel = session.pass === null
        ? l(`${session.repeatIndex}. Tekrar`, `Session ${session.repeatIndex}`)
        : studyTypeLabel(l, session.kind ?? 'pass', session.pass);
    const breakCount = session.breakCount ?? 0;

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
                    <View style={[styles.node, styles.nodeDone]}>
                        <CheckIcon color={colors.white} size={13} />
                    </View>
                </View>
            </View>
            <View style={styles.column}>
                <View style={styles.card}>
                    <View style={styles.tile}>
                        <Text style={styles.tileText}>{studySubjectInitial(session.subject)}</Text>
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
                                <Text style={styles.metricValue}>
                                    {formatSessionDuration(session.breakMs, locale)}
                                    {breakCount > 0 ? (
                                        <Text style={styles.metricAside}>
                                            {' · '}{l(`${breakCount} mola`, breakCount === 1 ? '1 break' : `${breakCount} breaks`)}
                                        </Text>
                                    ) : null}
                                </Text>
                            </View>
                        </View>
                        {session.note ? <Text style={styles.note}>{session.note}</Text> : null}
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
