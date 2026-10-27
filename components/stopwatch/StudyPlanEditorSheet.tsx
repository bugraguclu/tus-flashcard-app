import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { MAX_STUDY_NOTE_LENGTH, MAX_STUDY_PASS, clampPass } from '../../lib/stopwatch';
import { studySubjectGlyph } from '../../lib/studyCalendar';
import {
    MAX_PLAN_TITLE_LENGTH,
    WEEKDAYS_MONDAY_FIRST,
    formatPlanClock,
    localDateToYmd,
    studyPlanProblem,
    ymdToLocalDate,
    type StudyPlanBlock,
    type StudyPlanProblem,
} from '../../lib/studyPlans';
import StopwatchSheet from './StopwatchSheet';
import StudyTypeChips, { studyTypeLabel } from './StudyTypeChips';
import SubjectList from './SubjectList';
import { SettingRow, SheetButton, Stepper } from './SheetControls';

interface StudyPlanEditorSheetProps {
    /** The plan to edit, or a new one; null hides the sheet. */
    plan: StudyPlanBlock | null;
    isNew: boolean;
    recentSubjects: string[];
    onClose: () => void;
    onSave: (plan: StudyPlanBlock) => void;
    onDelete: (plan: StudyPlanBlock) => void;
}

const WEEKDAY_SHORT_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const WEEKDAY_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DURATION_STEP = 15;

export function weekdayShortName(weekday: number, locale: 'tr' | 'en'): string {
    return (locale === 'tr' ? WEEKDAY_SHORT_TR : WEEKDAY_SHORT_EN)[weekday];
}

/**
 * "Sade Plan": one recurring study block — its name, subject and type, the dates it runs between,
 * the weekdays it repeats on, when it starts, how long it lasts and a note. The same sheet edits a
 * single day's block of a detailed plan.
 */
export default function StudyPlanEditorSheet({ plan, isNew, recentSubjects, onClose, onSave, onDelete }: StudyPlanEditorSheetProps) {
    const { l, locale, localeTag } = useI18n();
    const colors = useThemeColors();
    const [step, setStep] = useState<'form' | 'subject'>('form');
    const [draft, setDraft] = useState<StudyPlanBlock | null>(plan);

    useEffect(() => {
        setDraft(plan);
        setStep('form');
    }, [plan]);

    if (!draft) return <StopwatchSheet visible={false} title="" onClose={onClose}>{null}</StopwatchSheet>;

    const update = (patch: Partial<StudyPlanBlock>) => setDraft((current) => (current ? { ...current, ...patch } : current));
    const problem = studyPlanProblem(draft);
    const messages: Record<StudyPlanProblem, string> = {
        title: l(`Plan adı 1–${MAX_PLAN_TITLE_LENGTH} karakter olmalıdır.`, `The plan name must be 1–${MAX_PLAN_TITLE_LENGTH} characters.`),
        subject: l('Bir ders seçin.', 'Choose a subject.'),
        range: l('En fazla iki yıllık geçerli bir tarih aralığı seçin.', 'Choose a valid date range of up to two years.'),
        weekdays: l('En az bir çalışma günü seçin.', 'Choose at least one day.'),
        time: l('Çalışma aynı gün içinde bitmeli ve süresi sıfırdan büyük olmalıdır.', 'The block must end the same day and last more than zero minutes.'),
        noOccurrence: l('Seçilen aralıkta çalışma gününüz bulunmuyor.', 'None of the chosen days falls in this range.'),
    };
    const startDate = new Date(2000, 0, 1, Math.floor(draft.startMinute / 60), draft.startMinute % 60);
    const hours = Math.floor(draft.durationMinutes / 60);
    const minutes = draft.durationMinutes % 60;

    return (
        <StopwatchSheet
            visible
            onClose={onClose}
            title={step === 'subject' ? l('Ders seçin', 'Choose a subject') : isNew ? l('Sade Plan', 'Simple Plan') : l('Çalışma Planı', 'Study Plan')}
        >
            {step === 'subject' ? (
                <>
                    <SubjectList
                        recentSubjects={recentSubjects}
                        onSelect={(subject) => {
                            update({ subject });
                            setStep('form');
                        }}
                    />
                    <View style={styles.footer}>
                        <SheetButton label={l('Forma dön', 'Back to the form')} tone="plain" onPress={() => setStep('form')} />
                    </View>
                </>
            ) : (
                <ScrollView style={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.bgInput, color: colors.textPrimary, borderColor: colors.border }]}
                        value={draft.title}
                        onChangeText={(title) => update({ title })}
                        placeholder={l('Plan adı', 'Plan name')}
                        placeholderTextColor={colors.textMuted}
                        maxLength={MAX_PLAN_TITLE_LENGTH}
                        accessibilityLabel={l('Plan adı', 'Plan name')}
                    />
                    <TouchableOpacity
                        style={[styles.subjectButton, { backgroundColor: colors.bgCard }]}
                        onPress={() => setStep('subject')}
                        accessibilityRole="button"
                        accessibilityLabel={l(`Ders: ${draft.subject}. Değiştirmek için dokunun.`, `Subject: ${draft.subject}. Tap to change.`)}
                    >
                        <View style={[styles.tile, { backgroundColor: colors.accentLight }]}>
                            <Text style={[styles.tileText, { color: colors.accent }]}>{studySubjectGlyph(draft.subject)}</Text>
                        </View>
                        <Text style={[styles.subjectText, { color: colors.textPrimary }]} numberOfLines={1}>{draft.subject}</Text>
                        <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
                    </TouchableOpacity>

                    <StudyTypeChips value={draft.kind} onChange={(kind) => update({ kind })} />
                    {draft.kind === 'pass' ? (
                        <SettingRow label={l('Tekrar', 'Pass')}>
                            <Stepper
                                value={studyTypeLabel(l, 'pass', draft.pass)}
                                onStep={(direction) => update({ pass: clampPass(draft.pass + direction) })}
                                decreaseLabel={l('Önceki tekrar', 'Previous pass')}
                                increaseLabel={l('Sonraki tekrar', 'Next pass')}
                                canDecrease={draft.pass > 1}
                                canIncrease={draft.pass < MAX_STUDY_PASS}
                            />
                        </SettingRow>
                    ) : null}

                    <SettingRow label={l('Başlangıç', 'From')}>
                        <DateTimePicker
                            value={ymdToLocalDate(draft.fromYmd)}
                            mode="date"
                            display="compact"
                            locale={localeTag}
                            onChange={(_event, value) => { if (value) update({ fromYmd: localDateToYmd(value) }); }}
                        />
                    </SettingRow>
                    <SettingRow label={l('Bitiş', 'Through')}>
                        <DateTimePicker
                            value={ymdToLocalDate(draft.throughYmd)}
                            mode="date"
                            display="compact"
                            locale={localeTag}
                            onChange={(_event, value) => { if (value) update({ throughYmd: localDateToYmd(value) }); }}
                        />
                    </SettingRow>

                    <View style={styles.daysSection}>
                        <Text style={[styles.label, { color: colors.textPrimary }]}>{l('Çalışma Günleri', 'Study Days')}</Text>
                        <View style={styles.days}>
                            {WEEKDAYS_MONDAY_FIRST.map((weekday) => {
                                const selected = draft.weekdays.includes(weekday);
                                return (
                                    <TouchableOpacity
                                        key={weekday}
                                        style={[styles.day, { borderColor: colors.accent }, selected && { backgroundColor: colors.accent }]}
                                        onPress={() => update({
                                            weekdays: selected
                                                ? draft.weekdays.filter((day) => day !== weekday)
                                                : [...draft.weekdays, weekday].sort(),
                                        })}
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked: selected }}
                                    >
                                        <Text style={[styles.dayText, { color: selected ? colors.white : colors.accent }]}>
                                            {weekdayShortName(weekday, locale)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    <SettingRow label={l('Başlangıç saati', 'Start time')}>
                        <DateTimePicker
                            value={startDate}
                            mode="time"
                            display="compact"
                            locale={localeTag}
                            onChange={(_event, value) => { if (value) update({ startMinute: value.getHours() * 60 + value.getMinutes() }); }}
                        />
                    </SettingRow>
                    <SettingRow
                        label={l('Çalışma süresi', 'Duration')}
                        hint={l(`Bitiş: ${formatPlanClock(draft.startMinute + draft.durationMinutes)}`, `Ends: ${formatPlanClock(draft.startMinute + draft.durationMinutes)}`)}
                    >
                        <Stepper
                            value={hours > 0 ? l(`${hours} sa ${minutes} dk`, `${hours} h ${minutes} min`) : l(`${minutes} dk`, `${minutes} min`)}
                            onStep={(direction) => update({ durationMinutes: Math.max(DURATION_STEP, Math.min(1440, draft.durationMinutes + direction * DURATION_STEP)) })}
                            decreaseLabel={l('15 dakika az', '15 minutes less')}
                            increaseLabel={l('15 dakika fazla', '15 minutes more')}
                            canDecrease={draft.durationMinutes > DURATION_STEP}
                        />
                    </SettingRow>

                    <View style={styles.noteSection}>
                        <Text style={[styles.label, { color: colors.textPrimary }]}>{l('Çalışma notu', 'Study note')}</Text>
                        <TextInput
                            style={[styles.input, styles.note, { backgroundColor: colors.bgInput, color: colors.textPrimary, borderColor: colors.border }]}
                            value={draft.note}
                            onChangeText={(note) => update({ note })}
                            placeholder={l('Örn. Kardiyoloji bölümü, 40 soru', 'E.g. cardiology chapter, 40 questions')}
                            placeholderTextColor={colors.textMuted}
                            maxLength={MAX_STUDY_NOTE_LENGTH}
                            multiline
                            textAlignVertical="top"
                            accessibilityLabel={l('Çalışma notu', 'Study note')}
                        />
                        <Text style={[styles.count, { color: colors.textMuted }]}>{`${draft.note.length} / ${MAX_STUDY_NOTE_LENGTH}`}</Text>
                    </View>

                    {problem ? <Text style={[styles.error, { color: colors.btnAgain }]} accessibilityLiveRegion="polite">{messages[problem]}</Text> : null}
                    <View style={styles.footer}>
                        <SheetButton label={l('Kaydet', 'Save')} onPress={() => { if (!problem) onSave(draft); }} disabled={problem !== null} />
                        {!isNew ? (
                            <SheetButton label={l('Planı Sil', 'Delete Plan')} tone="danger" onPress={() => onDelete(draft)} />
                        ) : null}
                    </View>
                </ScrollView>
            )}
        </StopwatchSheet>
    );
}

const styles = StyleSheet.create({
    form: { flexShrink: 1 },
    input: {
        borderRadius: BorderRadius.md,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        fontSize: FontSize.md,
        marginBottom: Spacing.sm,
    },
    note: { minHeight: 64 },
    subjectButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.xs },
    tile: { width: 40, height: 40, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
    tileText: { fontSize: FontSize.xl, fontWeight: '800' },
    subjectText: { flex: 1, fontSize: FontSize.lg, fontWeight: '700' },
    chevron: { fontSize: FontSize.xxl, fontWeight: '300' },
    label: { fontSize: FontSize.lg, fontWeight: '600' },
    daysSection: { gap: Spacing.sm, paddingVertical: Spacing.md },
    days: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    day: { minWidth: 42, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 6, borderRadius: 999, borderWidth: 1 },
    dayText: { fontSize: FontSize.sm, fontWeight: '700' },
    noteSection: { gap: Spacing.xs, paddingTop: Spacing.md },
    count: { alignSelf: 'flex-end', fontSize: FontSize.sm, fontVariant: ['tabular-nums'] },
    error: { marginTop: Spacing.md, fontSize: FontSize.md, fontWeight: '600' },
    footer: { paddingTop: Spacing.md, paddingBottom: Spacing.xs, gap: Spacing.sm },
});
