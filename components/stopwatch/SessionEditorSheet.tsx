import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BorderRadius, FontSize, Spacing, useIsDarkTheme, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    MAX_BREAK_COUNT,
    MAX_STUDY_NOTE_LENGTH,
    clampBreakCount,
    draftFromManualEntry,
    formatGoalClock,
    manualSessionProblem,
    type ManualSessionProblem,
    type StudyKind,
    type StudySessionDraft,
} from '../../lib/stopwatch';
import type { StudySession } from '../../lib/studyCalendar';
import { CountStepper, FormDivider, FormInfoBox, FormRow, FormSelector } from './FormControls';
import StopwatchSheet from './StopwatchSheet';
import type { StudyChoice } from './StudyStartSheet';
import { StudyTypePicker, SubjectGridPicker } from './StudyPickers';
import { studyTypeLabel } from './StudyTypeChips';

const MINUTE_MS = 60_000;
/** Longest total break the form steps to: the longest a session may span. */
const MAX_BREAK_MINUTES = 24 * 60;

export interface SessionEditorInitial {
    recordId: number;
    subject: string;
    kind: StudyKind;
    pass: number;
    startMs: number;
    endMs: number;
    studyMs: number;
    breakMs: number;
    breakCount: number;
    note: string;
}

/** A Kronometre session as the editor opens it, or null for a card session, which is not edited. */
export function editorInitialFor(session: StudySession): SessionEditorInitial | null {
    if (session.source === 'cards' || session.recordId === null) return null;
    return {
        recordId: session.recordId,
        subject: session.subject,
        kind: session.kind ?? 'pass',
        pass: session.pass ?? 1,
        startMs: session.startMs,
        endMs: session.endMs,
        studyMs: session.studyMs,
        breakMs: session.breakMs,
        breakCount: session.breakCount ?? 0,
        note: session.note,
    };
}

interface SessionEditorSheetProps {
    visible: boolean;
    /** The session being edited, or null to add a new one. */
    initial: SessionEditorInitial | null;
    /** The subject and type a new session starts with. */
    defaultChoice: StudyChoice;
    recentSubjects: string[];
    passOf: (subject: string) => number;
    onClose: () => void;
    onSave: (draft: StudySessionDraft, recordId: number | null) => void;
}

type Field = 'start' | 'end';

const startOfMinute = (ms: number) => Math.floor(ms / MINUTE_MS) * MINUTE_MS;

/**
 * "Geçmiş Çalışmanızı Ekleyin": a session studied without the stopwatch, entered by hand as
 * TUSBuddy takes it — the course and type, when it started and ended, how many breaks it had and
 * how long they were in all, and a note — or an existing session corrected after the fact. The
 * study time is the span less the breaks. Times the learner does not touch keep their exact
 * stored value, so correcting only a note never rounds a measured session to the minute.
 */
export default function SessionEditorSheet({
    visible,
    initial,
    defaultChoice,
    recentSubjects,
    passOf,
    onClose,
    onSave,
}: SessionEditorSheetProps) {
    const { l, localeTag } = useI18n();
    const colors = useThemeColors();
    const isDark = useIsDarkTheme();
    const [subject, setSubject] = useState('');
    const [kind, setKind] = useState<StudyKind>('pass');
    const [pass, setPass] = useState(1);
    const [startMs, setStartMs] = useState(0);
    const [endMs, setEndMs] = useState(0);
    const [breakMs, setBreakMs] = useState(0);
    const [breakCount, setBreakCount] = useState(0);
    const [note, setNote] = useState('');
    const [picker, setPicker] = useState<'subject' | 'type' | null>(null);
    const [openField, setOpenField] = useState<Field | null>(null);
    // Kept from when the sheet opened: the parent clears `initial` as it closes, and the sheet must
    // still read as the session it edited while it slides away.
    const [original, setOriginal] = useState<SessionEditorInitial | null>(null);
    const recordId = original?.recordId ?? null;
    // Read when the sheet opens only: the screen under it re-renders as its clock ticks.
    const openedWith = useRef({ initial, defaultChoice });
    openedWith.current = { initial, defaultChoice };

    useEffect(() => {
        if (!visible) return;
        const { initial: editing, defaultChoice: choice } = openedWith.current;
        setPicker(null);
        setOpenField(null);
        setOriginal(editing);
        if (editing) {
            setSubject(editing.subject);
            setKind(editing.kind);
            setPass(editing.pass);
            setStartMs(editing.startMs);
            setEndMs(editing.endMs);
            setBreakMs(editing.breakMs);
            setBreakCount(editing.breakCount);
            setNote(editing.note);
        } else {
            const end = startOfMinute(Date.now());
            setSubject(choice.subject);
            setKind(choice.kind);
            setPass(choice.pass);
            setStartMs(end - 60 * MINUTE_MS);
            setEndMs(end);
            setBreakMs(0);
            setBreakCount(0);
            setNote('');
        }
    }, [visible]);

    const problem = manualSessionProblem({ startMs, endMs, breakMs }, Date.now());
    const problemText = (value: ManualSessionProblem) => {
        switch (value) {
            case 'order': return l('Çalışma bitişi, başlangıcından sonra olmalı.', 'The session must end after it starts.');
            case 'future': return l('Çalışma gelecekte bitemez.', 'A session cannot end in the future.');
            case 'tooLong': return l('Bir çalışma 24 saatten uzun olamaz.', 'A session cannot be longer than 24 hours.');
            case 'break': return l('Mola süresi, başlangıç ile bitiş arasındaki süreyi aşamaz.', 'The breaks cannot be longer than the session.');
            default: return l('Molalar düşüldükten sonra en az 1 dakika çalışma kalmalı.', 'At least a minute of study must be left after the breaks.');
        }
    };
    const error = !subject ? l('Bir ders seçin.', 'Choose a subject.') : problem ? problemText(problem) : null;

    const dateLabel = (ms: number) => {
        const date = new Date(ms);
        const today = new Date();
        const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
        const time = date.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit', hour12: false });
        if (sameDay(date, today)) return l(`Bugün ${time}`, `Today ${time}`);
        if (sameDay(date, yesterday)) return l(`Dün ${time}`, `Yesterday ${time}`);
        return `${date.toLocaleDateString(localeTag, { day: 'numeric', month: 'short' })} ${time}`;
    };

    const changeField = (field: Field, value?: Date) => {
        if (!value) return;
        const ms = startOfMinute(value.getTime());
        if (field === 'start') setStartMs(ms);
        else setEndMs(ms);
    };

    const save = () => {
        // A sheet that is already closing has saved once; a second tap must not add the session again.
        if (error || !visible) return;
        const draft = draftFromManualEntry({ subject, kind, pass, startMs, endMs, breakMs, breakCount, note });
        // Untouched times keep the study time as stored, which an older session may hold as less
        // than its span less its breaks; it is never reinterpreted by an edit of its note alone.
        const timesUnchanged = original !== null
            && startMs === original.startMs && endMs === original.endMs && breakMs === original.breakMs;
        onSave(timesUnchanged ? { ...draft, studyMs: original.studyMs } : draft, recordId);
    };

    const breakMinutes = Math.floor(breakMs / MINUTE_MS);
    const typeLabel = studyTypeLabel(l, kind, pass);
    const overlay = picker === 'subject' ? (
        <SubjectGridPicker
            selected={subject}
            recentSubjects={recentSubjects}
            onSelect={(chosen) => {
                setSubject(chosen);
                // A new session continues the subject's pass; an edited one keeps its own.
                if (recordId === null) setPass(passOf(chosen));
            }}
            onClose={() => setPicker(null)}
        />
    ) : picker === 'type' ? (
        <StudyTypePicker
            kind={kind}
            pass={pass}
            onSelect={(nextKind, nextPass) => {
                setKind(nextKind);
                if (nextPass !== null) setPass(nextPass);
                setPicker(null);
            }}
            onClose={() => setPicker(null)}
        />
    ) : null;

    const timeRow = (field: Field, label: string, ms: number) => (
        <View>
            <FormRow label={label}>
                <FormSelector
                    value={dateLabel(ms)}
                    active={openField === field}
                    onPress={() => setOpenField((current) => (current === field ? null : field))}
                    accessibilityLabel={`${label}: ${dateLabel(ms)}`}
                    accessibilityHint={l('Tarih ve saat seçiciyi açar veya kapatır', 'Opens or closes the date and time picker')}
                />
            </FormRow>
            {openField === field ? (
                <View style={styles.pickerWrap}>
                    <DateTimePicker
                        value={new Date(ms)}
                        mode={Platform.OS === 'android' ? 'time' : 'datetime'}
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        maximumDate={new Date()}
                        locale={localeTag}
                        themeVariant={isDark ? 'dark' : 'light'}
                        onChange={(_event, value) => changeField(field, value)}
                    />
                </View>
            ) : null}
        </View>
    );

    return (
        <StopwatchSheet
            visible={visible}
            onClose={onClose}
            formHeader
            overlay={overlay}
            title={recordId !== null ? l('Çalışmanızı Düzenleyin', 'Edit Your Session') : l('Geçmiş Çalışmanızı Ekleyin', 'Add a Past Session')}
        >
            <ScrollView style={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <FormRow label={l('Ders seçin', 'Subject')}>
                    <FormSelector
                        value={subject || l('Seçin', 'Choose')}
                        onPress={() => setPicker('subject')}
                        accessibilityLabel={l(`Ders: ${subject || 'seçilmedi'}`, `Subject: ${subject || 'none'}`)}
                        accessibilityHint={l('Ders listesini açar', 'Opens the subject list')}
                    />
                </FormRow>
                <FormRow label={l('Tür Seçin', 'Type')}>
                    <FormSelector
                        value={typeLabel}
                        onPress={() => setPicker('type')}
                        accessibilityLabel={l(`Tür: ${typeLabel}`, `Type: ${typeLabel}`)}
                        accessibilityHint={l('Tür listesini açar', 'Opens the type list')}
                    />
                </FormRow>
                <FormDivider />
                {timeRow('start', l('Çalışma Başlangıcı', 'Start'), startMs)}
                {timeRow('end', l('Çalışma Bitişi', 'End'), endMs)}
                <FormInfoBox
                    lines={[
                        l(
                            'Çalışma süreniz, başlangıç ile bitiş arasındaki süreden toplam mola çıkarılarak hesaplanır.',
                            'Your study time is the time from start to end less the total break.',
                        ),
                        l(
                            'Elle eklediğiniz çalışmalar da günlük hedefinize, takviminize ve çalışma serinize sayılır.',
                            'Sessions you add by hand count towards your daily goal, calendar and streak too.',
                        ),
                    ]}
                />
                <FormRow label={l('Mola Sayısı', 'Breaks')}>
                    <CountStepper
                        value={String(breakCount)}
                        onStep={(direction) => setBreakCount((current) => clampBreakCount(current + direction))}
                        decreaseLabel={l('Bir mola az', 'One break fewer')}
                        increaseLabel={l('Bir mola fazla', 'One break more')}
                        canDecrease={breakCount > 0}
                        canIncrease={breakCount < MAX_BREAK_COUNT}
                    />
                </FormRow>
                <FormRow label={l('Toplam Mola Süresi', 'Total Break')}>
                    <CountStepper
                        value={formatGoalClock(breakMinutes)}
                        onStep={(direction) => setBreakMs(Math.max(0, Math.min(MAX_BREAK_MINUTES, breakMinutes + direction)) * MINUTE_MS)}
                        decreaseLabel={l('Bir dakika az mola', 'One minute less break')}
                        increaseLabel={l('Bir dakika fazla mola', 'One minute more break')}
                        canDecrease={breakMs > 0}
                        canIncrease={breakMinutes < MAX_BREAK_MINUTES}
                    />
                </FormRow>
                <FormDivider />

                <View style={styles.noteSection}>
                    <Text style={[styles.noteLabel, { color: colors.textPrimary }]}>{l('Çalışma Notu', 'Study Note')}</Text>
                    <TextInput
                        style={[styles.noteInput, { backgroundColor: colors.bgInput, color: colors.textPrimary, borderColor: colors.border }]}
                        value={note}
                        onChangeText={setNote}
                        placeholder={l('Sayfa 120-140 arasını çalıştım, 30 soru çözdüm.', 'Studied pages 120-140, solved 30 questions.')}
                        placeholderTextColor={colors.textMuted}
                        maxLength={MAX_STUDY_NOTE_LENGTH}
                        multiline
                        textAlignVertical="top"
                        accessibilityLabel={l('Çalışma notu', 'Study note')}
                        accessibilityHint={l(`En fazla ${MAX_STUDY_NOTE_LENGTH} karakter`, `Up to ${MAX_STUDY_NOTE_LENGTH} characters`)}
                    />
                    <Text style={[styles.noteCount, { color: colors.textMuted }]}>
                        {l(`Kalan: ${MAX_STUDY_NOTE_LENGTH - note.length}`, `${MAX_STUDY_NOTE_LENGTH - note.length} left`)}
                    </Text>
                </View>
                <FormDivider />

                <TouchableOpacity
                    style={[styles.saveButton, { backgroundColor: colors.accent }, error ? styles.saveDisabled : null]}
                    onPress={save}
                    disabled={Boolean(error)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: Boolean(error) }}
                    accessibilityLabel={recordId !== null ? l('Değişiklikleri kaydet', 'Save changes') : l('Çalışma ekle', 'Add session')}
                >
                    <Text style={styles.saveText}>
                        {recordId !== null ? l('Değişiklikleri Kaydet', 'Save Changes') : l('Çalışma Ekle', 'Add Session')}
                    </Text>
                </TouchableOpacity>
                {error ? <Text style={[styles.error, { color: colors.btnAgain }]} accessibilityLiveRegion="polite">{error}</Text> : null}
            </ScrollView>
        </StopwatchSheet>
    );
}

const styles = StyleSheet.create({
    form: { flexShrink: 1 },
    pickerWrap: { alignItems: 'center', paddingBottom: Spacing.sm },
    noteSection: { gap: Spacing.xs, paddingTop: Spacing.xs },
    noteLabel: { fontSize: FontSize.lg, fontWeight: '600' },
    noteInput: {
        minHeight: 72,
        borderRadius: BorderRadius.md,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.sm,
        fontSize: FontSize.md,
    },
    noteCount: { alignSelf: 'flex-end', fontSize: FontSize.sm, fontVariant: ['tabular-nums'] },
    saveButton: { minHeight: 50, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
    saveDisabled: { opacity: 0.45 },
    saveText: { color: '#ffffff', fontSize: FontSize.xl, fontWeight: '700' },
    error: { marginTop: Spacing.sm, marginBottom: Spacing.xs, fontSize: FontSize.md, fontWeight: '600', textAlign: 'center' },
});
