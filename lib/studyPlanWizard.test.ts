// The Detailed Plan wizard: each step is a page of the wizard's own stack, so the back swipe goes
// to the step before, and leaving the whole wizard asks only when something was entered.
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    pushed: [] as string[],
    routerBack: 0,
    replaced: [] as string[],
    leftWizard: 0,
    held: undefined as boolean | undefined,
    saved: [] as unknown[],
    changeCapacity: null as null | ((patch: Record<string, unknown>) => void),
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    ScrollView: 'ScrollView', View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({
    SafeAreaView: 'SafeAreaView',
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => {
    const router = {
        push: (href: string) => { h.pushed.push(href); },
        back: () => { h.routerBack += 1; },
        replace: (href: string) => { h.replaced.push(href); },
        canGoBack: () => true,
    };
    // The wizard's own route in the stack that opened it, as its layout sees it.
    const navigation = { canGoBack: () => true, goBack: () => { h.leftWizard += 1; } };
    return {
        useRouter: () => router,
        useNavigation: () => navigation,
        useFocusEffect: (effect: () => void) => { React.useEffect(() => effect(), [effect]); },
    };
});
vi.mock('../hooks/useUnsavedChangesGuard', () => ({
    useUnsavedChangesGuard: (dirty: boolean) => { h.held = dirty; },
}));
vi.mock('../constants/theme', () => {
    const colors = new Proxy({}, { get: () => '#000' });
    const sizes = new Proxy({}, { get: () => 8 });
    return { useThemeColors: () => colors, FontSize: sizes, Spacing: sizes };
});
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (tr: string) => tr, locale: 'tr' }) }));
vi.mock('../contexts/AppContext', () => ({ useAppSettings: () => ({ settings: { dayRolloverHour: 4 } }) }));
vi.mock('./confirm', () => ({ alert: () => {} }));
vi.mock('./studyPlanStore', () => ({ saveStudyPlans: (blocks: unknown[]) => { h.saved.push(...blocks); } }));
vi.mock('../components/AppText', () => ({ Text: 'Text' }));
vi.mock('../components/ScreenHeader', () => ({
    default: ({ onBack, backAccessibilityLabel }: { onBack: () => void; backAccessibilityLabel: string }) => (
        React.createElement('Button', { label: backAccessibilityLabel, onPress: onBack })
    ),
}));
vi.mock('../components/stopwatch/StudyToolControls', () => ({ DateField: () => null }));
// The design-system parts render as plain hosts carrying the props this screen gives them.
vi.mock('../components/ui/Button', () => ({
    Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
        React.createElement('Button', { label, onPress, disabled })
    ),
}));
vi.mock('../components/ui/Card', () => ({
    Section: ({ children }: { children: React.ReactNode }) => React.createElement('View', null, children),
}));
vi.mock('../components/ui/Feedback', () => ({ Notice: () => null, ProgressBar: () => null }));
vi.mock('../components/ui/Fields', () => ({
    TextField: (props: Record<string, unknown>) => React.createElement('TextInput', props),
}));
vi.mock('../components/stopwatch/DetailedPlanSteps', () => ({
    CoursesStep: () => null,
    CapacityStep: ({ onChange }: { onChange: (patch: Record<string, unknown>) => void }) => {
        h.changeCapacity = onChange;
        return null;
    },
}));
vi.mock('../components/stopwatch/StudyPlanEditorSheet', () => ({ weekdayShortName: () => '' }));

import StudyPlanWizardScreen from '../components/stopwatch/StudyPlanWizardScreen';
import { StudyPlanWizardProvider } from '../components/stopwatch/StudyPlanWizardDraft';

let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
    h.pushed = [];
    h.routerBack = 0;
    h.replaced = [];
    h.leftWizard = 0;
    h.held = undefined;
    h.saved = [];
    h.changeCapacity = null;
});
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
});

function mount(step: number) {
    act(() => {
        renderer = TestRenderer.create(React.createElement(StudyPlanWizardProvider, {
            children: React.createElement(StudyPlanWizardScreen, { step }),
        }));
    });
}

const button = (label: string) => renderer!.root.find((node: ReactTestInstance) => (
    (node.type as unknown) === 'Button' && node.props.label === label
));
const press = (label: string) => act(() => button(label).props.onPress());

describe('the Detailed Plan wizard', () => {
    it('opens the next step as a page of its own', () => {
        mount(0);
        press('İleri');
        expect(h.pushed).toEqual(['/study-plan-wizard/courses']);

        act(() => renderer?.unmount());
        mount(1);
        press('İleri');
        expect(h.pushed).toEqual(['/study-plan-wizard/courses', '/study-plan-wizard/capacity']);
    });

    it('goes back one step from a later step, keeping the wizard open', () => {
        mount(2);
        press('Geri');
        expect(h.routerBack).toBe(1);
        expect(h.leftWizard).toBe(0);
    });

    it('leaves the whole wizard on Cancel, without holding it while nothing was entered', () => {
        mount(1);
        expect(h.held).toBe(false);
        press('Vazgeç');
        expect(h.leftWizard).toBe(1);
        expect(h.routerBack).toBe(0);
    });

    it('holds the wizard once something was entered, so leaving it asks first', () => {
        mount(0);
        const exam = renderer!.root.find((node) => (node.type as unknown) === 'TextInput');
        act(() => exam.props.onChangeText('2027 TUS'));
        expect(h.held).toBe(true);
    });

    it('saves the plan and leaves without asking', () => {
        mount(2);
        act(() => h.changeCapacity?.({ weeklyMinutes: [600, 600, 600, 600, 600, 600, 600] }));
        expect(h.held).toBe(true);

        press('Oluştur');
        expect(h.saved.length).toBeGreaterThan(0);
        expect(h.held).toBe(false);
        expect(h.leftWizard).toBe(1);
    });
});
