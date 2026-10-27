import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import {
    MAX_BREAK_COUNT,
    MAX_STUDY_NOTE_LENGTH,
    MAX_STUDY_PASS,
    MIN_SESSION_MS,
    clampBreakCount,
    clampPass,
    splitHoursMinutes,
    type StudyKind,
    type StudySessionDraft,
} from '../../lib/stopwatch';
import { studySubjectGlyph, type StudySession } from '../../lib/studyCalendar';
import StopwatchSheet from './StopwatchSheet';
import StudyTypeChips, { studyTypeLabel } from './StudyTypeChips';
import SubjectList from './SubjectList';
import { SettingRow, SheetButton, Stepper } from './SheetControls';

const MINUTE_MS = 60_000;
const MAX_STUDY_HOURS = 16;
const MAX_BREAK_MINUTES = 180;

export interface SessionEditorInitial {
    recordId: number;
    subject: string;
    kind: StudyKind;
    pass: number;
    startMs: number;
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
    defaultSubject: string | null;
    defaultKind: StudyKind;
    defaultPass: number;
    recentSubjects: string[];
    passOf: (subject: string) => number;
    onClose: () => void;
    onSave: (draft: StudySessionDraft, recordId: number | null) => void;
}

function defaultStart(): Date {
    const date = new Date(Date.now() - 60 * MINUTE_MS);
    date.setMinutes(Math.floor(date.getMinutes() / 5) * 5, 0, 0);
    return date;
}

/**
 * "Çalışma Ekle": a session studied without the stopwatch, entered by hand — or an existing
 * session corrected after the fact: its subject and type, when it ran, its study and break time,
 * how many breaks it had and a short note. Picking the subject replaces the form with the subject
 * list inside the same sheet rather than stacking a second modal on top of it.
 */
export default function SessionEditorSheet({
    visible,
    initial,
    defaultSubject,
    defaultKind,
    defaultPass,
    recentSubjects,
    passOf,
    onClose,
    onSave,
}: SessionEditorSheetProps) {
    const { l, localeTag } = useI18n();
    const colors = useThemeColors();
    const [step, setStep] = useState<'form' | 'subject'>('form');
    const [subject, setSubject] = useState('');
    const [kind, setKind] = useState<StudyKind>('pass');
    const [pass, setPass] = useState(1);
    const [start, setStart] = useState(defaultStart);
    const [studyHours, setStudyHours] = useState(1);
    const [studyMinutes, setStudyMinutes] = useState(0);
    const [breakMinutes, setBreakMinutes] = useState(0);
    const [breakCount, setBreakCount] = useState(0);
    const [note, setNote] = useState('');

    useEffect(() => {
        if (!visible) return;
        setStep('form');
        if (initial) {
            const study = splitHoursMinutes(initial.studyMs);
            setSubject(initial.subject);
            setKind(initial.kind);
            setPass(initial.pass);
            setStart(new Date(initial.startMs));
            setStudyHours(study.hours);
            setStudyMinutes(study.minutes);
            setBreakMinutes(Math.round(initial.breakMs / MINUTE_MS));
            setBreakCount(initial.breakCount);
            setNote(initial.note);
        } else {
            setSubject(defaultSubject ?? '');
            setKind(defaultKind);
            setPass(defaultPass);
            setStart(defaultStart());
            setStudyHours(1);
            setStudyMinutes(0);
            setBreakMinutes(0);
            setBreakCount(0);
            setNote('');
        }
    }, [visible, initial, defaultSubject, defaultKind, defaultPass]);

    const studyMs = (studyHours * 60 + studyMinutes) * MINUTE_MS;
    const breakMs = breakMinutes * MINUTE_MS;
    const endMs = start.getTime() + studyMs + breakMs;
    const error = !subject
        ? l('Bir ders seçin.', 'Choose a subject.')
        : studyMs < MIN_SESSION_MS
            ? l('Çalışma süresi en az 1 dakika olmalı.', 'Study time must be at least a minute.')
            : endMs > Date.now() + MINUTE_MS
                ? l('Çalışma gelecekte bitemez; başlangıcı veya süreyi azaltın.', 'A session cannot end in the future; move the start or shorten it.')
                : null;

    const changeDate = (value?: Date) => {
        if (!value) return;
        const next = new Date(start.getTime());
        next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
        setStart(next);
    };
    const changeTime = (value?: Date) => {
        if (!value) return;
        const next = new Date(start.getTime());
        next.setHours(value.getHours(), value.getMinutes(), 0, 0);
        setStart(next);
    };

    const save = () => {
        if (error) return;
        onSave({
            subject,
            kind,
            pass,
            startMs: start.getTime(),
            endMs,
            studyMs,
            breakMs,
            breakCount,
            note,
        }, initial?.recordId ?? null);
    };

    const hourUnit = l('sa', 'h');
    const minuteUnit = l('dk', 'min');

    return (
        <StopwatchSheet
            visible={visible}
            onClose={onClose}
            title={step === 'subject'
                ? l('Ders seçin', 'Choose a subject')
                : initial ? l('Çalışmayı düzenle', 'Edit session') : l('Çalışma ekle', 'Add a session')}
        >
            {step === 'subject' ? (
                <>
                    <SubjectList
                        recentSubjects={recentSubjects}
                        onSelect={(chosen) => {
                            setSubject(chosen);
                            if (!initial) setPass(passOf(chosen));
                            setStep('form');
                        }}
                    />
                    <View style={styles.footer}>
                        <SheetButton label={l('Forma dön', 'Back to the form')} tone="plain" onPress={() => setStep('form')} />
                    </View>
                </>
            ) : (
                <ScrollView style={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <TouchableOpacity
                        style={[styles.subjectButton, { backgroundColor: colors.bgCard }]}
                        onPress={() => setStep('subject')}
                        accessibilityRole="button"
                        accessibilityLabel={subject
                            ? l(`Ders: ${subject}. Değiştirmek için dokunun.`, `Subject: ${subject}. Tap to change.`)
                            : l('Ders seçin', 'Choose a subject')}
                    >
                        <View style={[styles.tile, { backgroundColor: colors.accentLight }]}>
                            <Text style={[styles.tileText, { color: colors.accent }]}>{subject ? studySubjectGlyph(subject) : '＋'}</Text>
                        </View>
                        <Text style={[styles.subjectText, { color: subject ? colors.textPrimary : colors.textMuted }]} numberOfLines={1}>
                            {subject || l('Ders seçin', 'Choose a subject')}
                        </Text>
                        <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
                    </TouchableOpacity>

                    <StudyTypeChips value={kind} onChange={setKind} />
                    {kind === 'pass' ? (
                        <SettingRow label={l('Tekrar', 'Pass')}>
                            <Stepper
                                value={studyTypeLabel(l, 'pass', pass)}
                                onStep={(direction) => setPass((current) => clampPass(current + direction))}
                                decreaseLabel={l('Önceki tekrar', 'Previous pass')}
                                increaseLabel={l('Sonraki tekrar', 'Next pass')}
                                canDecrease={pass > 1}
                                canIncrease={pass < MAX_STUDY_PASS}
                            />
                        </SettingRow>
                    ) : null}
                    <SettingRow label={l('Tarih', 'Date')}>
                        <DateTimePicker
                            value={start}
                            mode="date"
                            display="compact"
                            maximumDate={new Date()}
                            locale={localeTag}
                            onChange={(_event, value) => changeDate(value)}
                        />
                    </SettingRow>
                    <SettingRow label={l('Başlangıç saati', 'Start time')}>
                        <DateTimePicker
                            value={start}
                            mode="time"
                            display="compact"
                            locale={localeTag}
                            onChange={(_event, value) => changeTime(value)}
                        />
                    </SettingRow>
                    <SettingRow label={l('Çalışma süresi', 'Study time')} hint={l('Saat ve dakika', 'Hours and minutes')}>
                        <View style={styles.stack}>
                            <Stepper
                                value={`${studyHours} ${hourUnit}`}
                                onStep={(direction) => setStudyHours((current) => Math.max(0, Math.min(MAX_STUDY_HOURS, current + direction)))}
                                decreaseLabel={l('Bir saat az', 'One hour less')}
                                increaseLabel={l('Bir saat fazla', 'One hour more')}
                                canDecrease={studyHours > 0}
                                canIncrease={studyHours < MAX_STUDY_HOURS}
                            />
                            <Stepper
                                value={`${studyMinutes} ${minuteUnit}`}
                                onStep={(direction) => setStudyMinutes((current) => (current + direction * 5 + 60) % 60)}
                                decreaseLabel={l('Beş dakika az', 'Five minutes less')}
                                increaseLabel={l('Beş dakika fazla', 'Five minutes more')}
                            />
                        </View>
                    </SettingRow>
                    <SettingRow label={l('Mola', 'Break')} hint={l('Oturum içindeki toplam mola', 'Total break within the session')}>
                        <Stepper
                            value={`${breakMinutes} ${minuteUnit}`}
                            onStep={(direction) => setBreakMinutes((current) => Math.max(0, Math.min(MAX_BREAK_MINUTES, current + direction * 5)))}
                            decreaseLabel={l('Beş dakika az mola', 'Five minutes less break')}
                            increaseLabel={l('Beş dakika fazla mola', 'Five minutes more break')}
                            canDecrease={breakMinutes > 0}
                            canIncrease={breakMinutes < MAX_BREAK_MINUTES}
                        />
                    </SettingRow>
                    <SettingRow label={l('Mola sayısı', 'Breaks')} hint={l('Kaç kez ara verdiniz', 'How many times you stopped')}>
                        <Stepper
                            value={String(breakCount)}
                            onStep={(direction) => setBreakCount((current) => clampBreakCount(current + direction))}
                            decreaseLabel={l('Bir mola az', 'One break fewer')}
                            increaseLabel={l('Bir mola fazla', 'One break more')}
                            canDecrease={breakCount > 0}
                            canIncrease={breakCount < MAX_BREAK_COUNT}
                        />
                    </SettingRow>

                    <View style={styles.noteSection}>
                        <Text style={[styles.noteLabel, { color: colors.textPrimary }]}>{l('Çalışma notu', 'Study note')}</Text>
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

                    {error ? <Text style={[styles.error, { color: colors.btnAgain }]} accessibilityLiveRegion="polite">{error}</Text> : null}
                    <View style={styles.footer}>
                        <SheetButton label={l('Kaydet', 'Save')} onPress={save} disabled={Boolean(error)} />
                    </View>
                </ScrollView>
            )}
        </StopwatchSheet>
    );
}

const styles = StyleSheet.create({
    form: { flexShrink: 1 },
    subjectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        marginBottom: Spacing.xs,
    },
    tile: { width: 40, height: 40, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
    tileText: { fontSize: FontSize.xl, fontWeight: '800' },
    subjectText: { flex: 1, fontSize: FontSize.lg, fontWeight: '700' },
    chevron: { fontSize: FontSize.xxl, fontWeight: '300' },
    stack: { gap: Spacing.sm, alignItems: 'flex-end' },
    noteSection: { gap: Spacing.xs, paddingTop: Spacing.md },
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
    error: { marginTop: Spacing.md, fontSize: FontSize.md, fontWeight: '600' },
    footer: { paddingTop: Spacing.md, paddingBottom: Spacing.xs },
});
