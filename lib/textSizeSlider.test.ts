import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import TextSizeSlider from '../components/settings/TextSizeSlider';
import type { TextSizeLevel } from './textScale';

const { haptics } = vi.hoisted(() => ({ haptics: vi.fn(() => Promise.resolve()) }));

vi.mock('react-native', () => {
    class Value {
        value = 0;
        setValue(next: number) { this.value = next; }
        stopAnimation() { }
    }
    return {
        Platform: { OS: 'ios' },
        StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style ?? {} },
        View: 'View',
        Text: 'Text',
        TextInput: 'TextInput',
        useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
        Animated: {
            Value,
            View: 'AnimatedView',
            add: () => ({}),
            spring: (value: Value, config: { toValue: number }) => ({ start: () => value.setValue(config.toValue) }),
        },
    };
});
vi.mock('expo-haptics', () => ({ selectionAsync: haptics }));
vi.mock('../constants/theme', () => ({
    useThemeColors: () => new Proxy({}, { get: () => '#000' }),
    BorderRadius: { md: 10, full: 9999 },
    FontSize: { sm: 12, md: 14, lg: 16 },
    Spacing: { xs: 4, sm: 8, md: 12 },
    Shadows: { md: {} },
}));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (tr: string) => tr }) }));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let renderer: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
    haptics.mockClear();
});

// The touch area starts at x = 50; it is padded by half the 26 pt thumb, so the track starts at 63.
const TRACK_LEFT = 63;
const TRACK_WIDTH = 300;

function mount(value: TextSizeLevel | undefined) {
    const onChange = vi.fn();
    act(() => { renderer = TestRenderer.create(React.createElement(TextSizeSlider, { value, onChange })); });
    const track = renderer!.root.find((node) => (node.type as string) === 'View' && typeof node.props.onLayout === 'function');
    act(() => track.props.onLayout({ nativeEvent: { layout: { width: TRACK_WIDTH, height: 4, x: 0, y: 0 } } }));
    return onChange;
}

const slider = () => renderer!.root.find((node) => (node.type as string) === 'View' && node.props.accessibilityRole === 'adjustable');
const touch = (x: number) => ({ nativeEvent: { pageX: TRACK_LEFT + x, locationX: TRACK_LEFT + x - 50 } });
const shownStep = () => slider().props['aria-valuetext'];
const accessibilityAction = (actionName: string) => act(() => slider().props.onAccessibilityAction({ nativeEvent: { actionName } }));

describe('Settings text size slider', () => {
    it('starts on the saved step, or on Normal when none is saved', () => {
        mount(undefined);
        expect(shownStep()).toBe('Normal');
        expect(slider().props['aria-valuenow']).toBe(1);
        expect(slider().props['aria-valuemax']).toBe(3);
        act(() => renderer!.update(React.createElement(TextSizeSlider, { value: 'large', onChange: vi.fn() })));
        expect(shownStep()).toBe('Büyük');
    });

    it('follows the finger between the four steps and applies the step only on release', () => {
        const onChange = mount('default');
        act(() => slider().props.onResponderGrant(touch(0)));
        expect(shownStep()).toBe('Küçük');
        act(() => slider().props.onResponderMove(touch(160)));
        expect(shownStep()).toBe('Büyük');
        act(() => slider().props.onResponderMove({ nativeEvent: { pageX: TRACK_LEFT + 900, locationX: 0 } }));
        expect(shownStep()).toBe('Çok büyük');
        expect(onChange).not.toHaveBeenCalled();
        act(() => slider().props.onResponderRelease());
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('xlarge');
        // A tick of feedback for each step the thumb crossed: Küçük, Büyük, Çok büyük.
        expect(haptics).toHaveBeenCalledTimes(3);
    });

    it('jumps to the step nearest a tap on the track', () => {
        const onChange = mount('default');
        act(() => slider().props.onResponderGrant(touch(210)));
        act(() => slider().props.onResponderRelease());
        expect(onChange).toHaveBeenCalledWith('large');
    });

    it('does not report a drag that ends on the step it started from', () => {
        const onChange = mount('large');
        act(() => slider().props.onResponderGrant(touch(195)));
        act(() => slider().props.onResponderMove(touch(30)));
        act(() => slider().props.onResponderMove(touch(205)));
        act(() => slider().props.onResponderRelease());
        expect(onChange).not.toHaveBeenCalled();
    });

    it('keeps the step a scroll view took the gesture over on', () => {
        const onChange = mount('default');
        act(() => slider().props.onResponderGrant(touch(100)));
        act(() => slider().props.onResponderMove(touch(290)));
        act(() => slider().props.onResponderTerminate());
        expect(onChange).toHaveBeenCalledWith('xlarge');
    });

    it('moves one step at a time with VoiceOver and stops at either end', () => {
        const onChange = mount('xlarge');
        accessibilityAction('increment');
        expect(onChange).not.toHaveBeenCalled();
        accessibilityAction('decrement');
        expect(onChange).toHaveBeenLastCalledWith('large');
    });

    it('reports every quick step even before the screen has re-rendered with the last one', () => {
        // The value prop stays at Normal, as it does between two presses inside one frame.
        const onChange = mount('default');
        accessibilityAction('increment');
        accessibilityAction('decrement');
        expect(onChange.mock.calls).toEqual([['large'], ['default']]);
        expect(shownStep()).toBe('Normal');
    });
});
