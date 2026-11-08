import { ScrollView, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    MAX_BREAK_MINUTES,
    MAX_FOCUS_MINUTES,
    MAX_GOAL_MINUTES,
    MIN_GOAL_MINUTES,
    formatGoalClock,
    localYmd,
    stepBlockMinutes,
    stepDailyGoal,
    type StopwatchPrefs,
} from '../../lib/stopwatch';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ValueRow } from '../ui/Rows';
import { AppSheet } from '../ui/Sheet';
import { Stepper } from '../ui/Stepper';

interface StopwatchSettingsSheetProps {
    visible: boolean;
    prefs: StopwatchPrefs;
    onChange: (patch: Partial<StopwatchPrefs>) => void;
    onClose: () => void;
}

function dateFromYmd(ymd: string): Date {
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12);
}

/** The Kronometre's settings: exam date, daily goal, and the study/break block lengths. */
export default function StopwatchSettingsSheet({ visible, prefs, onChange, onClose }: StopwatchSettingsSheetProps) {
    const { l, localeTag } = useI18n();
    const colors = useThemeColors();
    const minuteLabel = (minutes: number) => (minutes > 0 ? l(`${minutes} dk`, `${minutes} min`) : l('Kapalı', 'Off'));
    const today = new Date();

    return (
        <AppSheet visible={visible} onClose={onClose} title={l('Kronometre ayarları', 'Stopwatch settings')} avoidKeyboard>
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                <Card divided>
                    <ValueRow
                        label={l('Sınav tarihi', 'Exam date')}
                        summary={prefs.examDate
                            ? l('Kalan gün zaman çizelgesinde gösterilir.', 'The days left appear on the timeline.')
                            : l('Bir tarih seçince kalan gün gösterilir.', 'Pick a date to show the days left.')}
                    >
                        <View style={styles.dateControls}>
                            <DateTimePicker
                                value={prefs.examDate ? dateFromYmd(prefs.examDate) : today}
                                mode="date"
                                display="compact"
                                minimumDate={today}
                                locale={localeTag}
                                accentColor={colors.accent}
                                onChange={(_event, value) => value && onChange({ examDate: localYmd(value.getTime()) })}
                            />
                            {prefs.examDate ? (
                                <Button
                                    variant="plain"
                                    tone="danger"
                                    label={l('Kaldır', 'Remove')}
                                    onPress={() => onChange({ examDate: null })}
                                    accessibilityLabel={l('Sınav tarihini kaldır', 'Remove the exam date')}
                                />
                            ) : null}
                        </View>
                    </ValueRow>
                    <ValueRow label={l('Günlük hedef', 'Daily goal')} summary={l('Saat:dakika', 'Hours:minutes')}>
                        <Stepper
                            value={formatGoalClock(prefs.dailyGoalMinutes)}
                            onDecrement={() => onChange({ dailyGoalMinutes: stepDailyGoal(prefs.dailyGoalMinutes, -1) })}
                            onIncrement={() => onChange({ dailyGoalMinutes: stepDailyGoal(prefs.dailyGoalMinutes, 1) })}
                            decrementLabel={l('Hedefi yarım saat azalt', 'Lower the goal by half an hour')}
                            incrementLabel={l('Hedefi yarım saat artır', 'Raise the goal by half an hour')}
                            canDecrement={prefs.dailyGoalMinutes > MIN_GOAL_MINUTES}
                            canIncrement={prefs.dailyGoalMinutes < MAX_GOAL_MINUTES}
                            style={styles.stepper}
                        />
                    </ValueRow>
                    <ValueRow
                        label={l('Ders süresi', 'Study block')}
                        summary={l('Bu süre dolunca mola vermeniz hatırlatılır.', 'You are reminded to take a break after this long.')}
                    >
                        <Stepper
                            value={minuteLabel(prefs.focusMinutes)}
                            onDecrement={() => onChange({ focusMinutes: stepBlockMinutes(prefs.focusMinutes, -1, MAX_FOCUS_MINUTES) })}
                            onIncrement={() => onChange({ focusMinutes: stepBlockMinutes(prefs.focusMinutes, 1, MAX_FOCUS_MINUTES) })}
                            decrementLabel={l('Ders süresini kısalt', 'Shorten the study block')}
                            incrementLabel={l('Ders süresini uzat', 'Lengthen the study block')}
                            canDecrement={prefs.focusMinutes > 0}
                            canIncrement={prefs.focusMinutes < MAX_FOCUS_MINUTES}
                            style={styles.stepper}
                        />
                    </ValueRow>
                    <ValueRow
                        label={l('Mola süresi', 'Break length')}
                        summary={l('Mola bu süreyi aşınca derse dönmeniz hatırlatılır.', 'You are reminded to get back after a break this long.')}
                    >
                        <Stepper
                            value={minuteLabel(prefs.breakMinutes)}
                            onDecrement={() => onChange({ breakMinutes: stepBlockMinutes(prefs.breakMinutes, -1, MAX_BREAK_MINUTES) })}
                            onIncrement={() => onChange({ breakMinutes: stepBlockMinutes(prefs.breakMinutes, 1, MAX_BREAK_MINUTES) })}
                            decrementLabel={l('Mola süresini kısalt', 'Shorten the break')}
                            incrementLabel={l('Mola süresini uzat', 'Lengthen the break')}
                            canDecrement={prefs.breakMinutes > 0}
                            canIncrement={prefs.breakMinutes < MAX_BREAK_MINUTES}
                            style={styles.stepper}
                        />
                    </ValueRow>
                </Card>
                <View style={styles.footer}>
                    <Button label={l('Tamam', 'Done')} onPress={onClose} />
                </View>
            </ScrollView>
        </AppSheet>
    );
}

const styles = StyleSheet.create({
    body: { flexShrink: 1 },
    dateControls: { alignItems: 'flex-end', gap: Spacing.xs },
    stepper: { alignSelf: 'center' },
    footer: { paddingTop: Spacing.lg, paddingBottom: Spacing.xs },
});
