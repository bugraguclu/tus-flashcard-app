// A sheet's pull-down has to outlive its owner's re-renders: the Kronometre re-renders every
// second, and a responder rebuilt mid-drag starts a new gesture under the finger.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Gesture = { dx: number; dy: number; vy: number };
type Responder = {
    onStartShouldSetPanResponder: () => boolean;
    onPanResponderGrant: () => void;
    onPanResponderMove: (event: unknown, gesture: Gesture) => void;
    onPanResponderRelease: (event: unknown, gesture: Gesture) => void;
};
const sheet = vi.hoisted(() => ({ responders: [] as unknown[], position: [] as number[] }));

vi.mock('react-native', () => {
    class Value {
        setValue = (value: number) => { sheet.position.push(value); };
        stopAnimation = () => {};
    }
    const animation = { start: (done?: () => void) => done?.() };
    return {
        Animated: { Value, View: 'Animated.View', timing: () => animation, spring: () => animation },
        Keyboard: { dismiss: () => {} },
        PanResponder: { create: (config: unknown) => { sheet.responders.push(config); return { panHandlers: {} }; } },
        Platform: { OS: 'ios' },
        ScrollView: 'ScrollView',
        StyleSheet: { create: (styles: unknown) => styles },
        TouchableOpacity: 'TouchableOpacity',
        useWindowDimensions: () => ({ width: 390, height: 844 }),
        View: 'View',
    };
});
vi.mock('../components/AppText', () => ({ Text: 'Text' }));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (_tr: string, en: string) => en }) }));
vi.mock('../constants/theme', () => ({
    FontSize: new Proxy({}, { get: () => 14 }),
    Spacing: new Proxy({}, { get: () => 8 }),
    useThemeColors: () => ({ border: '#ccc', textPrimary: '#000', textMuted: '#666' }),
}));
vi.mock('../constants/motion', () => ({ MotionEasing: { out: (t: number) => t }, MotionSpring: { snap: {} } }));

import SwipeDismissSheet from '../components/SwipeDismissSheet';

let renderer: TestRenderer.ReactTestRenderer | undefined;
const render = (props: { onDismiss: () => void; enabled?: boolean }) => act(() => {
    const element = React.createElement(SwipeDismissSheet, { ...props, children: null });
    if (renderer) renderer.update(element);
    else renderer = TestRenderer.create(element);
});
const responder = () => sheet.responders[sheet.responders.length - 1] as Responder;

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { sheet.responders.length = 0; sheet.position.length = 0; });
afterEach(() => {
    if (renderer) act(() => renderer!.unmount());
    renderer = undefined;
});

describe('SwipeDismissSheet pull-down', () => {
    it('keeps the same responder, and the drag, when its owner re-renders mid-pull', () => {
        const first = vi.fn();
        const second = vi.fn();
        render({ onDismiss: first });
        const pulled = responder();
        pulled.onPanResponderGrant();
        pulled.onPanResponderMove({}, { dx: 0, dy: 20, vy: 0 });
        pulled.onPanResponderMove({}, { dx: 0, dy: 60, vy: 0 });

        // The owner re-renders with a new callback, as a parent with inline handlers does.
        render({ onDismiss: second });
        expect(sheet.responders).toHaveLength(1);

        pulled.onPanResponderMove({}, { dx: 0, dy: 140, vy: 0 });
        expect(sheet.position[sheet.position.length - 1]).toBe(120);
        pulled.onPanResponderRelease({}, { dx: 0, dy: 140, vy: 0 });
        expect(second).toHaveBeenCalledTimes(1);
        expect(first).not.toHaveBeenCalled();
    });

    it('stops taking touches once it is disabled, without a new responder', () => {
        render({ onDismiss: () => {} });
        expect(responder().onStartShouldSetPanResponder()).toBe(true);
        render({ onDismiss: () => {}, enabled: false });
        expect(sheet.responders).toHaveLength(1);
        expect(responder().onStartShouldSetPanResponder()).toBe(false);
    });
});
