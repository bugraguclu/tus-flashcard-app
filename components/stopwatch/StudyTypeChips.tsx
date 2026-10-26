import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, FontSize, Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { STUDY_KINDS, type StudyKind } from '../../lib/stopwatch';

type Localize = (turkish: string, english: string) => string;

/** A kind's own name: "Tekrar" for a pass, whose number the session carries separately. */
export function studyKindName(l: Localize, kind: StudyKind): string {
    switch (kind) {
        case 'pastQuestions': return l('Çıkmış TUS Soruları', 'Past TUS questions');
        case 'questions': return l('Soru Çözümü', 'Question practice');
        case 'course': return l('Dershane', 'Prep course');
        case 'video': return l('Video Ders', 'Video lesson');
        case 'mockExam': return l('Deneme Sınavı', 'Mock exam');
        default: return l('Tekrar', 'Pass');
    }
}

/** A session's type as its chip shows it: `2. Tekrar`, or the kind's name for any other kind. */
export function studyTypeLabel(l: Localize, kind: StudyKind, pass: number): string {
    return kind === 'pass' ? l(`${pass}. Tekrar`, `Pass ${pass}`) : studyKindName(l, kind);
}

interface StudyTypeChipsProps {
    value: StudyKind;
    onChange: (kind: StudyKind) => void;
}

/**
 * "Tür": what the session is spent on, one chip per kind. Choosing "Tekrar" leaves the pass
 * number to the stepper beside it, so the twenty passes do not crowd out the other kinds.
 */
export default function StudyTypeChips({ value, onChange }: StudyTypeChipsProps) {
    const { l } = useI18n();
    const colors = useThemeColors();

    return (
        <View style={[styles.section, { borderBottomColor: colors.borderLight }]}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>{l('Tür', 'Type')}</Text>
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={l('Tür', 'Type')}>
                {STUDY_KINDS.map((kind) => {
                    const selected = kind === value;
                    return (
                        <TouchableOpacity
                            key={kind}
                            style={[
                                styles.chip,
                                selected
                                    ? { backgroundColor: colors.accent, borderColor: colors.accent }
                                    : { backgroundColor: colors.bgCard, borderColor: colors.border },
                            ]}
                            onPress={() => onChange(kind)}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selected }}
                            aria-checked={selected}
                            accessibilityLabel={studyKindName(l, kind)}
                        >
                            <Text style={[styles.chipText, { color: selected ? colors.white : colors.textSecondary }]}>
                                {studyKindName(l, kind)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    section: {
        gap: Spacing.sm,
        paddingVertical: Spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    label: { fontSize: FontSize.lg, fontWeight: '600' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    chip: {
        minHeight: 36,
        justifyContent: 'center',
        paddingHorizontal: Spacing.md,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
    },
    chipText: { fontSize: FontSize.md, fontWeight: '600' },
});
