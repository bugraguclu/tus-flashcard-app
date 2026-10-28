import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { MAX_STUDY_NOTE_LENGTH } from '../../lib/stopwatch';
import StopwatchSheet from './StopwatchSheet';

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
        <StopwatchSheet visible={visible} onClose={onClose} formHeader title={l('Çalışma Notu', 'Study Note')}>
            <View style={styles.body}>
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    {l(`${subject} çalışmanıza not ekleyin; kronometreyi bitirdiğinizde çalışmayla birlikte kaydedilir.`,
                        `Add a note to your ${subject} session; it is saved with the session when you finish.`)}
                </Text>
                <TextInput
                    style={[styles.input, { backgroundColor: colors.bgInput, color: colors.textPrimary, borderColor: colors.border }]}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={l('Sayfa 120-140 arasını çalıştım, 30 soru çözdüm.', 'Studied pages 120-140, solved 30 questions.')}
                    placeholderTextColor={colors.textMuted}
                    maxLength={MAX_STUDY_NOTE_LENGTH}
                    multiline
                    textAlignVertical="top"
                    accessibilityLabel={l('Çalışma notu', 'Study note')}
                    accessibilityHint={l(`En fazla ${MAX_STUDY_NOTE_LENGTH} karakter`, `Up to ${MAX_STUDY_NOTE_LENGTH} characters`)}
                />
                <Text style={[styles.count, { color: colors.textMuted }]}>
                    {l(`Kalan: ${MAX_STUDY_NOTE_LENGTH - draft.length}`, `${MAX_STUDY_NOTE_LENGTH - draft.length} left`)}
                </Text>
                <TouchableOpacity
                    style={[styles.save, { backgroundColor: colors.accent }]}
                    onPress={() => visible && onSave(draft)}
                    accessibilityRole="button"
                    accessibilityLabel={l('Notu kaydet', 'Save the note')}
                >
                    <Text style={styles.saveText}>{l('Kaydet', 'Save')}</Text>
                </TouchableOpacity>
            </View>
        </StopwatchSheet>
    );
}

const styles = StyleSheet.create({
    body: { gap: Spacing.sm, paddingTop: Spacing.xs, paddingBottom: Spacing.md },
    hint: { fontSize: FontSize.md, lineHeight: 20 },
    input: {
        minHeight: 88,
        borderRadius: BorderRadius.md,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.sm,
        fontSize: FontSize.md,
    },
    count: { alignSelf: 'flex-end', fontSize: FontSize.sm, fontVariant: ['tabular-nums'] },
    save: { minHeight: 50, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
    saveText: { color: '#ffffff', fontSize: FontSize.xl, fontWeight: '700' },
});
