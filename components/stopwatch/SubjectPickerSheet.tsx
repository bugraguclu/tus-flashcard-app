import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Spacing } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { MAX_STUDY_PASS, clampPass, type StudyKind, type StudyPlan } from '../../lib/stopwatch';
import StopwatchSheet from './StopwatchSheet';
import StudyTypeChips, { studyTypeLabel } from './StudyTypeChips';
import SubjectList from './SubjectList';
import { SettingRow, SheetButton, Stepper } from './SheetControls';

interface SubjectPickerSheetProps {
    visible: boolean;
    /** `start` begins the stopwatch on the chosen subject and type; `plan` makes them today's plan. */
    mode: 'start' | 'plan';
    plan: StudyPlan | null;
    recentSubjects: string[];
    /** The pass a new session of the subject continues, from its latest "N. Tekrar" session. */
    passOf: (subject: string) => number;
    onClose: () => void;
    onPick: (subject: string, pass: number, kind: StudyKind) => void;
    onClearPlan: () => void;
}

export default function SubjectPickerSheet({
    visible,
    mode,
    plan,
    recentSubjects,
    passOf,
    onClose,
    onPick,
    onClearPlan,
}: SubjectPickerSheetProps) {
    const { l } = useI18n();
    const [pass, setPass] = useState(plan?.pass ?? 1);
    const [kind, setKind] = useState<StudyKind>(plan?.kind ?? 'pass');

    useEffect(() => {
        if (!visible) return;
        setPass(plan?.pass ?? 1);
        setKind(plan?.kind ?? 'pass');
    }, [visible, plan]);

    const isPlan = mode === 'plan';

    return (
        <StopwatchSheet
            visible={visible}
            onClose={onClose}
            title={isPlan ? l('Bugünün planı', "Today's plan") : l('Hangi dersi çalışacaksınız?', 'What will you study?')}
            subtitle={isPlan
                ? l('Türü seçin, sonra dersin üzerine dokunun.', 'Choose the type, then tap the subject.')
                : l('Türü seçin; kronometre dokunduğunuz dersle başlar.', 'Choose the type; the stopwatch starts on the subject you tap.')}
        >
            <StudyTypeChips value={kind} onChange={setKind} />
            {isPlan && kind === 'pass' ? (
                <SettingRow label={l('Tekrar', 'Pass')} hint={l('Dersi kaçıncı kez bitiriyorsunuz', 'Which pass through the subject this is')}>
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
            <SubjectList
                recentSubjects={recentSubjects}
                planned={plan
                    ? { subject: plan.subject, caption: isPlan ? studyTypeLabel(l, kind, pass) : studyTypeLabel(l, plan.kind, plan.pass) }
                    : null}
                onSelect={(subject) => {
                    // Another type keeps the pass the subject is on, which it does not move.
                    if (isPlan) onPick(subject, kind === 'pass' ? pass : passOf(subject), kind);
                    // A pass continues the subject where its latest pass stopped, or where the plan says.
                    else onPick(subject, plan && plan.subject === subject ? plan.pass : passOf(subject), kind);
                }}
            />
            {isPlan && plan ? (
                <View style={styles.footer}>
                    <SheetButton label={l('Planı kaldır', 'Remove plan')} tone="danger" onPress={onClearPlan} />
                </View>
            ) : null}
        </StopwatchSheet>
    );
}

const styles = StyleSheet.create({
    footer: { paddingTop: Spacing.sm },
});
