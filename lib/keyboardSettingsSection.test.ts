import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Platform, TextInput } from 'react-native';
import KeyboardSettingsSection from '../components/settings/KeyboardSettingsSection';
import type { KeyBindings } from './types';

const { defaults, colors } = vi.hoisted(() => ({
    defaults: { showAnswer: ' ', again: '1', hard: '2', good: '3', easy: '4', replayAudio: 'r', buryCard: '-', suspendCard: '@', markNote: '*' },
    colors: { bgCard: '#fff', bgSecondary: '#eee', border: '#ccc', borderLight: '#ddd', textPrimary: '#111', textSecondary: '#222', textMuted: '#777', accent: '#080', accentLight: '#dfd' },
}));

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' }, Keyboard: { dismiss: vi.fn() },
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    Text: 'Text', View: 'View', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity',
}));
vi.mock('../constants/theme', () => ({
    useThemeColors: () => colors, BorderRadius: { lg: 16, sm: 6 },
    FontSize: { lg: 16, md: 14, sm: 12, xs: 10 }, Spacing: { lg: 16, md: 12, sm: 8, xs: 4 }, Shadows: { sm: {} },
}));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (tr: string) => tr }) }));
vi.mock('./storage', () => ({ DEFAULT_KEY_BINDINGS: defaults }));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let renderer: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
    Platform.OS = 'ios';
    vi.unstubAllGlobals();
});

function mount() {
    const changed = vi.fn();
    function Harness() {
        const [bindings, setBindings] = useState<KeyBindings>({ ...defaults });
        return React.createElement(KeyboardSettingsSection, { bindings, onChange: (next) => { changed(next); setBindings(next); } });
    }
    act(() => { renderer = TestRenderer.create(React.createElement(Harness)); });
    return changed;
}
const button = (label: string) => renderer!.root.findByProps({ accessibilityLabel: label });
const input = () => renderer!.root.findByType(TextInput);

describe('keyboard settings on iPhone', () => {
    it('captures a hardware key without opening the software keyboard or changing other bindings', () => {
        const changed = mount();
        act(() => button('Kartı askıya al kısayolunu değiştir').props.onPress());
        const capture = input();
        const submit = capture.props.onSubmitEditing;
        expect(capture.props.autoFocus).toBe(true);
        expect(capture.props.showSoftInputOnFocus).toBe(false);
        expect(capture.props.accessible).toBe(false);
        act(() => capture.props.onKeyPress({ nativeEvent: { key: 'Shift' } }));
        expect(changed).not.toHaveBeenCalled();
        act(() => capture.props.onKeyPress({ nativeEvent: { key: 's' } }));
        expect(changed).toHaveBeenCalledWith({ ...defaults, suspendCard: 's' });
        expect(renderer!.root.findAllByType(TextInput)).toHaveLength(0);
        // A late submit from the unmounted capture must not overwrite the assigned key.
        act(() => submit());
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it('cancels by Escape, Cancel or loss of focus without changing a binding', () => {
        const changed = mount();
        act(() => button('Cevabı göster kısayolunu değiştir').props.onPress());
        act(() => input().props.onKeyPress({ nativeEvent: { key: 'Esc' } }));
        act(() => button('Cevabı göster kısayolunu değiştir').props.onPress());
        act(() => button('Cevabı göster tuş atamasını iptal et').props.onPress());
        act(() => button('Cevabı göster kısayolunu değiştir').props.onPress());
        act(() => input().props.onBlur());
        expect(changed).not.toHaveBeenCalled();
        expect(renderer!.root.findAllByType(TextInput)).toHaveLength(0);
    });

    it('lets a new row take focus without its old input cancelling it, and resets all shortcuts', () => {
        const changed = mount();
        act(() => button('Cevabı göster kısayolunu değiştir').props.onPress());
        const oldBlur = input().props.onBlur;
        const oldKeyPress = input().props.onKeyPress;
        const oldSubmit = input().props.onSubmitEditing;
        act(() => button('İyi kısayolunu değiştir').props.onPress());
        act(() => { oldBlur(); oldKeyPress({ nativeEvent: { key: 'x' } }); oldSubmit(); });
        expect(changed).not.toHaveBeenCalled();
        act(() => input().props.onKeyPress({ nativeEvent: { key: 'Enter' } }));
        expect(changed).toHaveBeenLastCalledWith({ ...defaults, good: 'Enter' });
        act(() => button('Kısayolları sıfırla').props.onPress());
        expect(changed).toHaveBeenLastCalledWith(defaults);
    });

    it('refuses a key another action already uses and says which one', () => {
        const changed = mount();
        act(() => button('Kartı göm kısayolunu değiştir').props.onPress());
        // Upper case is the same key: the reviewer matches shortcuts without case.
        act(() => input().props.onKeyPress({ nativeEvent: { key: 'R' } }));
        expect(changed).not.toHaveBeenCalled();
        const message = renderer!.root.findByProps({ accessibilityRole: 'alert' });
        expect(message.props.children).toBe('R zaten “Sesi yeniden oynat” için kullanılıyor. Başka bir tuş seçin.');
        act(() => button('Kartı göm kısayolunu değiştir').props.onPress());
        expect(renderer!.root.findAllByProps({ accessibilityRole: 'alert' })).toHaveLength(0);
        act(() => input().props.onKeyPress({ nativeEvent: { key: 'g' } }));
        expect(changed).toHaveBeenLastCalledWith({ ...defaults, buryCard: 'g' });
    });

    it('keeps Cancel cancelled if native focus is lost before the press finishes', () => {
        const changed = mount();
        act(() => button('Cevabı göster kısayolunu değiştir').props.onPress());
        const cancel = button('Cevabı göster tuş atamasını iptal et');
        const finishPress = cancel.props.onPress;
        act(() => cancel.props.onPressIn());
        act(() => input().props.onBlur());
        act(() => finishPress());
        expect(renderer!.root.findAllByType(TextInput)).toHaveLength(0);
        expect(changed).not.toHaveBeenCalled();
    });
});

describe('keyboard settings on narrow web screens', () => {
    it('records with capture priority, ignores held/composing keys and removes the listener on unmount', () => {
        Platform.OS = 'web';
        const target = new EventTarget();
        vi.stubGlobal('window', target);
        const changed = mount();
        const key = (value: string, extras = {}) => {
            const event = Object.assign(new Event('keydown', { cancelable: true }), { key: value, repeat: false, isComposing: false, ...extras });
            act(() => { target.dispatchEvent(event); });
            return event;
        };
        act(() => button('Cevabı göster kısayolunu değiştir').props.onPress());
        key('j', { repeat: true }); key('j', { isComposing: true }); key('Control');
        expect(changed).not.toHaveBeenCalled();
        expect(key('Spacebar').defaultPrevented).toBe(true);
        expect(changed).toHaveBeenLastCalledWith(defaults);
        act(() => button('Tekrar kısayolunu değiştir').props.onPress());
        key('Escape');
        expect(changed).toHaveBeenCalledTimes(1);
        act(() => button('Tekrar kısayolunu değiştir').props.onPress());
        act(() => renderer!.unmount());
        renderer = undefined;
        expect(key('x').defaultPrevented).toBe(false);
        expect(changed).toHaveBeenCalledTimes(1);
    });
});
