import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { MAX_STUDY_NOTE_LENGTH } from '../../lib/stopwatch';
import { SheetNoDrag } from '../SwipeDismissSheet';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';
import { AppSheet } from '../ui/Sheet';
import { Type } from '../ui/tokens';

interface RunningNoteSheetProps {
    visible: boolean;
    subject: string;
    note: string;
    onClose: () => void;
    onSave: (note: string) => void;
}

/**
 * The note of the session the stopwatch is timing ("Çalışma Notu"), written while it runs from the
 * book beside its card; it is saved with the session when the stopwatch stops.
 */
export default function RunningNoteSheet({ visible, subject, note, onClose, onSave }: RunningNoteSheetProps) {
    const { l } = useI18n();
    const colors = useThemeColors();
    const [draft, setDraft] = useState(note);
    const noteRef = useRef(note);
    noteRef.current = note;

    useEffect(() => {
        if (visible) setDraft(noteRef.current);
    }, [visible]);

    return (
        <AppSheet visible={visible} onClose={onClose} title={l('Çalışma Notu', 'Study Note')} avoidKeyboard>
            <View style={styles.body}>
                <Text style={[Type.body, styles.hint, { color: colors.textSecondary }]}>
                    {l(`${subject} çalışmanıza not ekleyin; kronometreyi bitirdiğinizde çalışmayla birlikte kaydedilir.`,
                        `Add a note to your ${subject} session; it is saved with the session when you finish.`)}
                </Text>
                <SheetNoDrag>
                    <TextField
                        value={draft}
                        onChangeText={setDraft}
                        placeholder={l('Sayfa 120-140 arasını çalıştım, 30 soru çözdüm.', 'Studied pages 120-140, solved 30 questions.')}
                        maxLength={MAX_STUDY_NOTE_LENGTH}
                        multiline
                        accessibilityLabel={l('Çalışma notu', 'Study note')}
                        accessibilityHint={l(`En fazla ${MAX_STUDY_NOTE_LENGTH} karakter`, `Up to ${MAX_STUDY_NOTE_LENGTH} characters`)}
                    />
                </SheetNoDrag>
                <Text style={[Type.caption, styles.count, { color: colors.textMuted }]}>
                    {l(`Kalan: ${MAX_STUDY_NOTE_LENGTH - draft.length}`, `${MAX_STUDY_NOTE_LENGTH - draft.length} left`)}
                </Text>
                {/* TUSBuddy's words: "Not Ekle" for a first note, "Çalışma Notunu Güncelle" after. */}
                <Button
                    label={note ? l('Çalışma Notunu Güncelle', 'Update Study Note') : l('Not Ekle', 'Add Note')}
                    onPress={() => visible && onSave(draft)}
                    accessibilityLabel={note ? l('Çalışma notunu güncelle', 'Update the study note') : l('Not ekle', 'Add the note')}
                    style={styles.save}
                />
            </View>
        </AppSheet>
    );
}

const styles = StyleSheet.create({
    body: { gap: Spacing.sm, paddingTop: Spacing.xs, paddingBottom: Spacing.md },
    hint: { lineHeight: 20 },
    count: { alignSelf: 'flex-end', fontVariant: ['tabular-nums'] },
    save: { marginTop: Spacing.sm },
});
