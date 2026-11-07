import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import TextSizeSlider from '../components/settings/TextSizeSlider';
import type { TextSizeLevel } from './textScale';

const { haptics, motion } = vi.hoisted(() => ({
    haptics: vi.fn(() => Promise.resolve()),
    // Each animation the slider starts: a spring settles the thumb, a timed clock stretches it.
    motion: { springs: 0, timings: [] as number[] },
}));

vi.mock('react-native', () => {
    class Value {
        value = 0;
        setValue(next: number) { this.value = next; }
        stopAnimation() { }
        interpolate() { return this; }
    }
    const instant = (value: Value, config: { toValue: number }) => ({ start: () => value.setValue(config.toValue) });
    return {
        Platform: { OS: 'ios' },
        StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style ?? {} },
        View: 'View',
        Text: 'Text',
        TextInput: 'TextInput',
        Easing: { bezier: () => (t: number) => t, linear: (t: number) => t },
        useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
        Animated: {
            Value,
            View: 'AnimatedView',
            spring: (value: Value, config: { toValue: number }) => {
                motion.springs += 1;
                return instant(value, config);
            },
            timing: (value: Value, config: { toValue: number; duration: number }) => {
                motion.timings.push(config.duration);
                return instant(value, config);
            },
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
    motion.springs = 0;
    motion.timings = [];
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
/** Where the thumb sits along the track: its translateX. */
const thumbX = () => {
    const thumb = renderer!.root.findAll((node) => (node.type as string) === 'AnimatedView').at(-1)!;
    const style = (thumb.props.style as Array<{ transform?: Array<Record<string, { value: number }>> }>)[1];
    return style.transform![0].translateX.value;
};
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

    it('gives a little past either end, never more than half the thumb, and springs back', () => {
        const onChange = mount('large');
        act(() => slider().props.onResponderGrant(touch(200)));
        act(() => slider().props.onResponderMove(touch(TRACK_WIDTH + 40)));
        const near = thumbX();
        act(() => slider().props.onResponderMove(touch(TRACK_WIDTH + 400)));
        const far = thumbX();
        // Past the end the thumb follows less and less: 40 pt over gives some, 400 pt little more.
        expect(near).toBeGreaterThan(TRACK_WIDTH);
        expect(far).toBeGreaterThan(near);
        expect(far - TRACK_WIDTH).toBeLessThan(13);
        expect(far - near).toBeLessThan(near - TRACK_WIDTH);
        expect(shownStep()).toBe('Çok büyük');
        act(() => slider().props.onResponderRelease());
        expect(thumbX()).toBe(TRACK_WIDTH);
        expect(onChange).toHaveBeenCalledWith('xlarge');

        act(() => slider().props.onResponderGrant(touch(10)));
        act(() => slider().props.onResponderMove(touch(-400)));
        expect(thumbX()).toBeLessThan(0);
        expect(thumbX()).toBeGreaterThan(-13);
        expect(shownStep()).toBe('Küçük');
        act(() => slider().props.onResponderRelease());
        expect(thumbX()).toBe(0);
    });

    it('stretches the thumb while it travels to a step, not when it is let go beside one', () => {
        mount('default');
        accessibilityAction('increment');
        expect(motion.springs).toBe(1);
        // One 260 ms clock plays the whole stretch: out quickly, back to round as it lands.
        expect(motion.timings).toEqual([260]);
        // A release 4 pt from the Büyük step settles there without changing shape.
        act(() => slider().props.onResponderGrant(touch(204)));
        act(() => slider().props.onResponderRelease());
        expect(motion.springs).toBe(2);
        expect(motion.timings).toEqual([260]);
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
