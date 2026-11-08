import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import type { StudyKind } from '../../lib/stopwatch';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { SelectRow } from '../ui/Rows';
import { AppSheet } from '../ui/Sheet';
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
        <AppSheet
            visible={visible}
            onClose={onClose}
            title={l('Çalışmaya Başla', 'Start Studying')}
            closeButton
            dividedHeader
            avoidKeyboard
            maxHeight="92%"
            overlay={overlay}
        >
            <View style={styles.body}>
                <Card divided>
                    <SelectRow
                        label={l('Ders seçin', 'Subject')}
                        value={choice.subject}
                        onPress={() => setPicker('subject')}
                        accessibilityHint={l('Ders listesini açar', 'Opens the subject list')}
                    />
                    <SelectRow
                        label={l('Tür Seçin', 'Type')}
                        value={typeLabel}
                        onPress={() => setPicker('type')}
                        accessibilityHint={l('Tür listesini açar', 'Opens the type list')}
                    />
                </Card>
                <Button
                    label={l('Başla', 'Start')}
                    icon={<PlayIcon color={colors.onAccent} size={22} />}
                    // A sheet that is already closing has started once; a second tap must not restart it.
                    onPress={() => { if (visible) onStart(choice); }}
                    accessibilityLabel={l(`${choice.subject}, ${typeLabel}: kronometreyi başlat`, `Start the stopwatch: ${choice.subject}, ${typeLabel}`)}
                    style={styles.start}
                />
            </View>
        </AppSheet>
    );
}

const styles = StyleSheet.create({
    body: { gap: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
    start: { marginTop: Spacing.lg },
});
