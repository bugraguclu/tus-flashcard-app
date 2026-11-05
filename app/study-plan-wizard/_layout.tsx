import { Stack } from 'expo-router';
import { StudyPlanWizardProvider } from '../../components/stopwatch/StudyPlanWizardDraft';
import { useThemeColors } from '../../constants/theme';

export const unstable_settings = { initialRouteName: 'index' };

/**
 * The Detailed Plan wizard is a stack of its own, one page per step, so the back swipe on a step
 * returns to the step before instead of leaving the wizard and its draft. The draft is held here.
 */
export default function StudyPlanWizardLayout() {
    const colors = useThemeColors();

    return (
        <StudyPlanWizardProvider>
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.bgPrimary },
                    freezeOnBlur: true,
                }}
            />
        </StudyPlanWizardProvider>
    );
}
