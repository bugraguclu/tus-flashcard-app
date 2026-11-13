import { StyleSheet, View } from 'react-native';
import { Text } from '../AppText';
import { Spacing, useThemeColors } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { STUDY_KINDS, type StudyKind } from '../../lib/stopwatch';
import { Chip } from '../ui/Choice';
import { Type } from '../ui/tokens';

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
        <View style={styles.section}>
            <Text style={[Type.rowTitle, { color: colors.textPrimary }]}>{l('Tür', 'Type')}</Text>
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={l('Tür', 'Type')}>
                {STUDY_KINDS.map((kind) => (
                    <Chip
                        key={kind}
                        label={studyKindName(l, kind)}
                        selected={kind === value}
                        onPress={() => onChange(kind)}
                    />
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    section: { gap: Spacing.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
