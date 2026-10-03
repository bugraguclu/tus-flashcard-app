import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Spacing } from '../../constants/theme';
import { useI18n } from '../../hooks/useI18n';
import { MAX_STUDY_PASS, clampPass, type StudyPlan } from '../../lib/stopwatch';
import StopwatchSheet from './StopwatchSheet';
import SubjectList from './SubjectList';
import { SettingRow, SheetButton, Stepper } from './SheetControls';

interface SubjectPickerSheetProps {
    visible: boolean;
    /** `start` begins the stopwatch on the chosen subject; `plan` makes it today's plan. */
    mode: 'start' | 'plan';
    plan: StudyPlan | null;
    recentSubjects: string[];
    /** The pass a new session of the subject continues, from its latest session. */
    passOf: (subject: string) => number;
    onClose: () => void;
    onPick: (subject: string, pass: number) => void;
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

    useEffect(() => {
        if (visible) setPass(plan?.pass ?? 1);
    }, [visible, plan]);

    const passLabel = (value: number) => l(`${value}. Tekrar`, `Pass ${value}`);
    const isPlan = mode === 'plan';

    return (
        <StopwatchSheet
            visible={visible}
            onClose={onClose}
            title={isPlan ? l('Bugünün planı', "Today's plan") : l('Hangi dersi çalışacaksınız?', 'What will you study?')}
            subtitle={isPlan
                ? l('Tekrarı seçin, sonra dersin üzerine dokunun.', 'Choose the pass, then tap the subject.')
                : l('Kronometre seçtiğiniz dersle başlar.', 'The stopwatch starts on the subject you choose.')}
        >
            {isPlan ? (
                <SettingRow label={l('Tekrar', 'Pass')} hint={l('Dersi kaçıncı kez bitiriyorsunuz', 'Which pass through the subject this is')}>
                    <Stepper
                        value={passLabel(pass)}
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
                planned={plan ? { subject: plan.subject, caption: passLabel(isPlan ? pass : plan.pass) } : null}
                onSelect={(subject) => {
                    if (isPlan) onPick(subject, pass);
                    else onPick(subject, plan && plan.subject === subject ? plan.pass : passOf(subject));
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
