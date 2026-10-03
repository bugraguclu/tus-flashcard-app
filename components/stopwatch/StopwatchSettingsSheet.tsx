import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
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
import StopwatchSheet from './StopwatchSheet';
import { SettingRow, SheetButton, Stepper } from './SheetControls';

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
        <StopwatchSheet visible={visible} onClose={onClose} title={l('Kronometre ayarları', 'Stopwatch settings')}>
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                <SettingRow
                    label={l('Sınav tarihi', 'Exam date')}
                    hint={prefs.examDate
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
                            onChange={(_event, value) => value && onChange({ examDate: localYmd(value.getTime()) })}
                        />
                        {prefs.examDate ? (
                            <TouchableOpacity
                                onPress={() => onChange({ examDate: null })}
                                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                accessibilityRole="button"
                                accessibilityLabel={l('Sınav tarihini kaldır', 'Remove the exam date')}
                            >
                                <Text style={[styles.clear, { color: colors.btnAgain }]}>{l('Kaldır', 'Remove')}</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </SettingRow>
                <SettingRow label={l('Günlük hedef', 'Daily goal')} hint={l('Saat:dakika', 'Hours:minutes')}>
                    <Stepper
                        value={formatGoalClock(prefs.dailyGoalMinutes)}
                        onStep={(direction) => onChange({ dailyGoalMinutes: stepDailyGoal(prefs.dailyGoalMinutes, direction) })}
                        decreaseLabel={l('Hedefi yarım saat azalt', 'Lower the goal by half an hour')}
                        increaseLabel={l('Hedefi yarım saat artır', 'Raise the goal by half an hour')}
                        canDecrease={prefs.dailyGoalMinutes > MIN_GOAL_MINUTES}
                        canIncrease={prefs.dailyGoalMinutes < MAX_GOAL_MINUTES}
                    />
                </SettingRow>
                <SettingRow
                    label={l('Ders süresi', 'Study block')}
                    hint={l('Bu süre dolunca mola vermeniz hatırlatılır.', 'You are reminded to take a break after this long.')}
                >
                    <Stepper
                        value={minuteLabel(prefs.focusMinutes)}
                        onStep={(direction) => onChange({ focusMinutes: stepBlockMinutes(prefs.focusMinutes, direction, MAX_FOCUS_MINUTES) })}
                        decreaseLabel={l('Ders süresini kısalt', 'Shorten the study block')}
                        increaseLabel={l('Ders süresini uzat', 'Lengthen the study block')}
                        canDecrease={prefs.focusMinutes > 0}
                        canIncrease={prefs.focusMinutes < MAX_FOCUS_MINUTES}
                    />
                </SettingRow>
                <SettingRow
                    label={l('Mola süresi', 'Break length')}
                    hint={l('Mola bu süreyi aşınca derse dönmeniz hatırlatılır.', 'You are reminded to get back after a break this long.')}
                >
                    <Stepper
                        value={minuteLabel(prefs.breakMinutes)}
                        onStep={(direction) => onChange({ breakMinutes: stepBlockMinutes(prefs.breakMinutes, direction, MAX_BREAK_MINUTES) })}
                        decreaseLabel={l('Mola süresini kısalt', 'Shorten the break')}
                        increaseLabel={l('Mola süresini uzat', 'Lengthen the break')}
                        canDecrease={prefs.breakMinutes > 0}
                        canIncrease={prefs.breakMinutes < MAX_BREAK_MINUTES}
                    />
                </SettingRow>
                <View style={styles.footer}>
                    <SheetButton label={l('Tamam', 'Done')} onPress={onClose} />
                </View>
            </ScrollView>
        </StopwatchSheet>
    );
}

const styles = StyleSheet.create({
    body: { flexShrink: 1 },
    dateControls: { alignItems: 'flex-end', gap: Spacing.xs },
    clear: { fontSize: FontSize.md, fontWeight: '700' },
    footer: { paddingTop: Spacing.lg, paddingBottom: Spacing.xs },
});
