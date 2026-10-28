import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import type { StudyKind } from '../../lib/stopwatch';
import { FormRow, FormSelector } from './FormControls';
import StopwatchSheet from './StopwatchSheet';
import { PlayIcon } from './StopwatchIcons';
import { StudyTypePicker, SubjectGridPicker } from './StudyPickers';
import { studyTypeLabel } from './StudyTypeChips';

export interface StudyChoice {
    subject: string;
    kind: StudyKind;
    pass: number;
}

interface StudyStartSheetProps {
    visible: boolean;
    /** What the sheet offers first: the last subject and type started. */
    initial: StudyChoice;
    recentSubjects: string[];
    /** The pass a new "N. Tekrar" session of the subject continues, from its latest one. */
    passOf: (subject: string) => number;
    onClose: () => void;
    onStart: (choice: StudyChoice) => void;
}

/**
 * "Çalışmaya Başla": the course ("Ders seçin") and the type ("Tür Seçin") the stopwatch starts
 * with, chosen with the same pickers as the hand-entry form, then "Başla".
 */
export default function StudyStartSheet({ visible, initial, recentSubjects, passOf, onClose, onStart }: StudyStartSheetProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const [choice, setChoice] = useState<StudyChoice>(initial);
    const [picker, setPicker] = useState<'subject' | 'type' | null>(null);
    // Read when the sheet opens only: the screen under it re-renders as its clock ticks.
    const initialRef = useRef(initial);
    initialRef.current = initial;

    useEffect(() => {
        if (!visible) return;
        setChoice(initialRef.current);
        setPicker(null);
    }, [visible]);

    const chooseSubject = (subject: string) => {
        // A pass continues the subject where its latest pass stopped; another type keeps it too.
        setChoice((current) => ({ ...current, subject, pass: passOf(subject) }));
    };

    const typeLabel = studyTypeLabel(l, choice.kind, choice.pass);
    const overlay = picker === 'subject' ? (
        <SubjectGridPicker
            selected={choice.subject}
            recentSubjects={recentSubjects}
            onSelect={chooseSubject}
            onClose={() => setPicker(null)}
        />
    ) : picker === 'type' ? (
        <StudyTypePicker
            kind={choice.kind}
            pass={choice.pass}
            onSelect={(kind, pass) => {
                setChoice((current) => ({ ...current, kind, pass: pass ?? current.pass }));
                setPicker(null);
            }}
            onClose={() => setPicker(null)}
        />
    ) : null;

    return (
        <StopwatchSheet visible={visible} onClose={onClose} title={l('Çalışmaya Başla', 'Start Studying')} formHeader overlay={overlay}>
            <View style={styles.body}>
                <FormRow label={l('Ders seçin', 'Subject')}>
                    <FormSelector
                        value={choice.subject}
                        onPress={() => setPicker('subject')}
                        accessibilityLabel={l(`Ders: ${choice.subject}`, `Subject: ${choice.subject}`)}
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
                <TouchableOpacity
                    style={[styles.startButton, { backgroundColor: colors.accent }]}
                    onPress={() => onStart(choice)}
                    disabled={!visible}
                    accessibilityRole="button"
                    accessibilityLabel={l(`${choice.subject}, ${typeLabel}: kronometreyi başlat`, `Start the stopwatch: ${choice.subject}, ${typeLabel}`)}
                >
                    <PlayIcon color={colors.white} size={22} />
                    <Text style={styles.startText}>{l('Başla', 'Start')}</Text>
                </TouchableOpacity>
            </View>
        </StopwatchSheet>
    );
}

const styles = StyleSheet.create({
    body: { gap: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
    startButton: {
        marginTop: Spacing.lg,
        minHeight: 50,
        borderRadius: BorderRadius.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    startText: { color: '#ffffff', fontSize: FontSize.xl, fontWeight: '700' },
});
