import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { MAX_STUDY_NOTE_LENGTH, MAX_STUDY_PASS, clampPass } from '../../lib/stopwatch';
import {
    MAX_PLAN_TITLE_LENGTH,
    WEEKDAYS_MONDAY_FIRST,
    formatPlanClock,
    studyPlanProblem,
    type StudyPlanBlock,
    type StudyPlanProblem,
} from '../../lib/studyPlans';
import { Button } from '../ui/Button';
import { Card, Section } from '../ui/Card';
import { Chip } from '../ui/Choice';
import { Notice } from '../ui/Feedback';
import { TextField } from '../ui/Fields';
import { ListRow, ValueRow } from '../ui/Rows';
import { AppSheet } from '../ui/Sheet';
import { Stepper } from '../ui/Stepper';
import { Type } from '../ui/tokens';
import { DateField } from './StudyToolControls';
import StudyTypeChips, { studyTypeLabel } from './StudyTypeChips';
import SubjectList from './SubjectList';

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

    // The last draft stays on the sheet after the parent clears `plan`, so it slides away whole.
    useEffect(() => {
        if (!plan) return;
        setDraft(plan);
        setStep('form');
    }, [plan]);

    if (!draft) return null;

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
        <AppSheet
            visible={plan !== null}
            onClose={onClose}
            title={step === 'subject' ? l('Ders seçin', 'Choose a subject') : isNew ? l('Sade Plan', 'Simple Plan') : l('Çalışma Planı', 'Study Plan')}
            avoidKeyboard
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
                        <Button label={l('Forma dön', 'Back to the form')} variant="plain" onPress={() => setStep('form')} />
                    </View>
                </>
            ) : (
                <ScrollView
                    style={styles.form}
                    contentContainerStyle={styles.formContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <TextField
                        value={draft.title}
                        onChangeText={(title) => update({ title })}
                        placeholder={l('Plan adı', 'Plan name')}
                        maxLength={MAX_PLAN_TITLE_LENGTH}
                        accessibilityLabel={l('Plan adı', 'Plan name')}
                    />
                    <Card>
                        <ListRow
                            title={draft.subject}
                            onPress={() => setStep('subject')}
                            accessibilityLabel={l(`Ders: ${draft.subject}. Değiştirmek için dokunun.`, `Subject: ${draft.subject}. Tap to change.`)}
                        />
                    </Card>

                    <Card padded>
                        <StudyTypeChips value={draft.kind} onChange={(kind) => update({ kind })} />
                    </Card>

                    <Card divided>
                        {draft.kind === 'pass' ? (
                            <ValueRow label={l('Tekrar', 'Pass')}>
                                <Stepper
                                    value={studyTypeLabel(l, 'pass', draft.pass)}
                                    onDecrement={() => update({ pass: clampPass(draft.pass - 1) })}
                                    onIncrement={() => update({ pass: clampPass(draft.pass + 1) })}
                                    decrementLabel={l('Önceki tekrar', 'Previous pass')}
                                    incrementLabel={l('Sonraki tekrar', 'Next pass')}
                                    canDecrement={draft.pass > 1}
                                    canIncrement={draft.pass < MAX_STUDY_PASS}
                                    style={styles.stepper}
                                />
                            </ValueRow>
                        ) : null}
                        <DateField label={l('Başlangıç', 'From')} ymd={draft.fromYmd} onChange={(fromYmd) => update({ fromYmd })} />
                        <DateField label={l('Bitiş', 'Through')} ymd={draft.throughYmd} onChange={(throughYmd) => update({ throughYmd })} />
                    </Card>

                    <Card padded>
                        <Text style={[Type.rowTitle, { color: colors.textPrimary }]}>{l('Çalışma Günleri', 'Study Days')}</Text>
                        <View style={styles.days}>
                            {WEEKDAYS_MONDAY_FIRST.map((weekday) => {
                                const selected = draft.weekdays.includes(weekday);
                                return (
                                    <Chip
                                        key={weekday}
                                        label={weekdayShortName(weekday, locale)}
                                        selected={selected}
                                        onPress={() => update({
                                            weekdays: selected
                                                ? draft.weekdays.filter((day) => day !== weekday)
                                                : [...draft.weekdays, weekday].sort(),
                                        })}
                                    />
                                );
                            })}
                        </View>
                    </Card>

                    <Card divided>
                        <ValueRow label={l('Başlangıç saati', 'Start time')}>
                            <DateTimePicker
                                value={startDate}
                                mode="time"
                                display="compact"
                                locale={localeTag}
                                accentColor={colors.accent}
                                onChange={(_event, value) => { if (value) update({ startMinute: value.getHours() * 60 + value.getMinutes() }); }}
                            />
                        </ValueRow>
                        <ValueRow
                            label={l('Çalışma süresi', 'Duration')}
                            summary={l(`Bitiş: ${formatPlanClock(draft.startMinute + draft.durationMinutes)}`, `Ends: ${formatPlanClock(draft.startMinute + draft.durationMinutes)}`)}
                        >
                            <Stepper
                                value={hours > 0 ? l(`${hours} sa ${minutes} dk`, `${hours} h ${minutes} min`) : l(`${minutes} dk`, `${minutes} min`)}
                                onDecrement={() => update({ durationMinutes: Math.max(DURATION_STEP, Math.min(1440, draft.durationMinutes - DURATION_STEP)) })}
                                onIncrement={() => update({ durationMinutes: Math.max(DURATION_STEP, Math.min(1440, draft.durationMinutes + DURATION_STEP)) })}
                                decrementLabel={l('15 dakika az', '15 minutes less')}
                                incrementLabel={l('15 dakika fazla', '15 minutes more')}
                                canDecrement={draft.durationMinutes > DURATION_STEP}
                                style={styles.stepper}
                            />
                        </ValueRow>
                    </Card>

                    <Section label={l('Çalışma notu', 'Study note')} padded>
                        <TextField
                            value={draft.note}
                            onChangeText={(note) => update({ note })}
                            placeholder={l('Örn. Kardiyoloji bölümü, 40 soru', 'E.g. cardiology chapter, 40 questions')}
                            maxLength={MAX_STUDY_NOTE_LENGTH}
                            multiline
                            accessibilityLabel={l('Çalışma notu', 'Study note')}
                        />
                        <Text style={[styles.count, { color: colors.textMuted }]}>{`${draft.note.length} / ${MAX_STUDY_NOTE_LENGTH}`}</Text>
                    </Section>

                    {problem ? <Notice tone="danger">{messages[problem]}</Notice> : null}
                    <View style={styles.footer}>
                        <Button label={l('Kaydet', 'Save')} onPress={() => { if (!problem) onSave(draft); }} disabled={problem !== null} />
                        {!isNew ? (
                            <Button label={l('Planı Sil', 'Delete Plan')} variant="destructive" onPress={() => onDelete(draft)} />
                        ) : null}
                    </View>
                </ScrollView>
            )}
        </AppSheet>
    );
}

const styles = StyleSheet.create({
    form: { flexShrink: 1 },
    formContent: { gap: Spacing.md, paddingBottom: Spacing.xs },
    stepper: { alignSelf: 'center' },
    days: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    count: { alignSelf: 'flex-end', fontSize: FontSize.sm, fontVariant: ['tabular-nums'] },
    footer: { paddingTop: Spacing.md, paddingBottom: Spacing.xs, gap: Spacing.sm },
});
