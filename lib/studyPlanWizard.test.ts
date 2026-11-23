// The Detailed Plan wizard: each step is a page of the wizard's own stack, so the back swipe goes
// to the step before, and leaving the whole wizard asks only when something was entered.
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    data: new Map<string, string>(), readFailed: false, flush: vi.fn(), alert: vi.fn(), confirm: vi.fn(),
    guardOptions: null as any,
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
    AppState: { addEventListener: () => ({ remove: () => {} }) },
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    ScrollView: 'ScrollView', View: 'View',
    useWindowDimensions: () => ({ width: 390, height: 844 }),
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
    useUnsavedChangesGuard: (dirty: boolean, options: any) => { h.held = dirty; h.guardOptions = options; },
}));
vi.mock('../constants/theme', () => {
    const colors = new Proxy({}, { get: () => '#000' });
    const sizes = new Proxy({}, { get: () => 8 });
    return { useThemeColors: () => colors, FontSize: sizes, Spacing: sizes };
});
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (tr: string) => tr, locale: 'tr' }) }));
vi.mock('../contexts/AppContext', () => ({ useAppSettings: () => ({ settings: { dayRolloverHour: 4 } }), useCollectionInvalidation: () => ({ invalidateCollection: vi.fn() }) }));
vi.mock('./confirm', () => ({ alert: h.alert, confirm: h.confirm }));
vi.mock('./studyPlanStore', () => ({ STUDY_PLANS_KEY: 'tus_study_plans_v1', saveStudyPlans: (blocks: unknown[]) => { h.saved.push(...blocks); } }));
vi.mock('./db', () => ({ getDB: () => ({ getFirstSync: (_sql: string, key: string) => { if (h.readFailed) throw new Error('Storage busy'); return h.data.has(key) ? { value: h.data.get(key) } : null; }, runSync: (sql: string, key: string, value: string) => { if (sql.startsWith('DELETE')) h.data.delete(key); else h.data.set(key, value); }, execSync: () => {} }), readOnlyTabMessage: () => null, flushDatabaseWrites: h.flush }));
vi.mock('../components/ReadErrorBanner', () => ({ ReadErrorBanner: 'ReadErrorBanner' }));
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
    vi.useFakeTimers(); h.data.clear(); h.readFailed = false; h.flush.mockReset().mockResolvedValue(undefined); h.alert.mockReset(); h.confirm.mockReset();
    h.pushed = [];
    h.routerBack = 0;
    h.replaced = [];
    h.leftWizard = 0;
    h.held = undefined;
    h.saved = [];
    h.changeCapacity = null;
});
afterEach(() => {
    vi.useRealTimers();
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

    it('saves the plan and leaves after durable completion', async () => {
        mount(2);
        act(() => h.changeCapacity?.({ weeklyMinutes: [600, 600, 600, 600, 600, 600, 600] }));
        expect(h.held).toBe(true);

        await act(async () => { press('Oluştur'); });
        expect(h.saved.length).toBeGreaterThan(0);
        expect(h.held).toBe(false);
        expect(h.leftWizard).toBe(1);
    });
});

it('flushes the latest edit on guarded exit before the autosave timer', async () => {
    mount(0);
    act(() => renderer!.root.findByType('TextInput' as any).props.onChangeText('Latest exam'));
    let allowed = false;
    await act(async () => { allowed = await h.guardOptions.beforeLeave(); });
    expect(allowed).toBe(true);
    expect(JSON.parse(h.data.get('tus_study_plan_wizard_draft_v1')!).draft.targetExam).toBe('Latest exam');
    expect(h.flush).toHaveBeenCalledOnce();
});
it('withholds an editable form when saved draft reads fail and restores it on retry', async () => {
    h.readFailed = true; mount(0);
    expect(renderer!.root.findAllByType('TextInput' as any)).toHaveLength(0);
    expect(h.data.size).toBe(0);
    h.readFailed = false;
    await act(async () => renderer!.root.findByType('ReadErrorBanner' as any).props.onRetry());
    expect(renderer!.root.findAllByType('TextInput' as any)).toHaveLength(1);
    expect(h.flush).not.toHaveBeenCalled();
});
it('coalesces edits and holds repeated Create until the durable commit finishes', async () => {
    mount(2);
    act(() => h.changeCapacity?.({ weeklyMinutes: [600, 600, 600, 600, 600, 600, 600] }));
    let finish!: () => void;
    h.flush.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    await act(async () => { press('Oluştur'); press('Oluştur'); });
    const createdCount = h.saved.length;
    expect(createdCount).toBeGreaterThan(0);
    expect(h.leftWizard).toBe(0);
    expect(h.flush).toHaveBeenCalledOnce();
    await act(async () => { finish(); });
    expect(h.saved).toHaveLength(createdCount);
    expect(h.leftWizard).toBe(1);
});
