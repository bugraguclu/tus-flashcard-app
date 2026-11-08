import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    status: {
        startupError: null as 'timeout' | 'failed' | null,
        isLoading: false,
        startupActionPending: false,
        continueStartupWait: (() => undefined) as () => void,
        retryStartup: (() => undefined) as () => void,
    },
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    StyleSheet: { create: (styles: unknown) => styles },
    useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
    ActivityIndicator: 'ActivityIndicator', Text: 'Text', TextInput: 'TextInput',
    TouchableOpacity: 'TouchableOpacity', View: 'View',
}));
vi.mock('../constants/theme', () => ({
    useThemeColors: () => new Proxy({}, { get: () => '#000' }),
    BorderRadius: { md: 10 }, FontSize: { sm: 12, md: 14, lg: 16 }, Spacing: { sm: 8, md: 12, lg: 16, xl: 24 },
}));
vi.mock('../contexts/AppContext', () => ({ useStartupStatus: () => h.status }));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (tr: string) => tr }) }));

import StartupIssueScreen from '../components/StartupIssueScreen';
import { startupIssueView } from './startupIssue';

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let renderer: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => { if (renderer) act(() => renderer?.unmount()); renderer = undefined; });

function mount(startupError: 'timeout' | 'failed' | null, startupActionPending = false) {
    const continueStartupWait = vi.fn();
    const retryStartup = vi.fn();
    h.status = { startupError, isLoading: false, startupActionPending, continueStartupWait, retryStartup };
    act(() => { renderer = TestRenderer.create(React.createElement(StartupIssueScreen)); });
    return { continueStartupWait, retryStartup };
}
const texts = () => renderer!.root.findAll((node) => (node.type as string) === 'Text')
    .map((node) => node.children.join(''));
const buttons = () => renderer!.root.findAll((node) => (
    (node.type as string) === 'TouchableOpacity' && node.props.accessibilityRole === 'button'
));
const press = (button: ReactTestInstance) => act(() => { button.props.onPress(); });

describe('startup screen', () => {
    it('lets the learner keep waiting while a long migration is still running', () => {
        const actions = mount('timeout');
        expect(texts()).toContain('Başlatma uzun sürüyor');
        expect(texts().join(' ')).toContain('Hazır olunca kendiliğinden açılır.');
        expect(texts()).not.toContain('Beklenmeyen Bir Hata Oluştu');
        expect(buttons().map((button) => button.props.accessibilityLabel)).toEqual(['Beklemeye devam et']);

        press(buttons()[0]);
        expect(actions.continueStartupWait).toHaveBeenCalledOnce();
        expect(actions.retryStartup).not.toHaveBeenCalled();
    });

    it('offers a retry when startup failed', () => {
        const actions = mount('failed');
        expect(texts()).toContain('Beklenmeyen Bir Hata Oluştu');
        expect(texts().join(' ')).toContain('Verileriniz silinmedi.');
        expect(buttons().map((button) => button.props.accessibilityLabel)).toEqual(['Tekrar dene']);

        press(buttons()[0]);
        expect(actions.retryStartup).toHaveBeenCalledOnce();
        expect(actions.continueStartupWait).not.toHaveBeenCalled();
    });

    it('holds the button while the attempt it started is being watched', () => {
        mount('failed', true);
        const [button] = buttons();
        expect(button.props.disabled).toBe(true);
        expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
    });

    it('draws nothing once startup has no issue', () => {
        mount(null);
        expect(renderer!.toJSON()).toBeNull();
    });

    it('words both states in English too', () => {
        const english = (_tr: string, en: string) => en;
        expect(startupIssueView('timeout', english)).toMatchObject({
            title: 'Startup is taking longer than usual',
            action: 'keepWaiting',
            actionLabel: 'Keep waiting',
        });
        expect(startupIssueView('failed', english)).toMatchObject({
            title: 'Something went wrong',
            action: 'retry',
            actionLabel: 'Try Again',
        });
        expect(startupIssueView('failed', english).message).toContain('Settings › About › Support');
    });
});
