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
        PanResponder: { create: (config: unknown) => { sheet.responders.push(config); return { panHandlers: { onResponderMove: 'pan' } }; } },
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
    // The kit's type and radius tokens (components/ui/tokens) are built from these.
    BorderRadius: new Proxy({}, { get: () => 8 }),
    FontSize: new Proxy({}, { get: () => 14 }),
    Shadows: new Proxy({}, { get: () => ({}) }),
    Spacing: new Proxy({}, { get: () => 8 }),
    useThemeColors: () => ({ border: '#ccc', textPrimary: '#000', textMuted: '#666' }),
}));
vi.mock('../constants/motion', () => ({ MotionEasing: { out: (t: number) => t }, MotionSpring: { snap: {} } }));
vi.mock('../components/ui/Button', () => ({ CloseButton: 'CloseButton' }));

import SwipeDismissSheet from '../components/SwipeDismissSheet';

let renderer: TestRenderer.ReactTestRenderer | undefined;
type SheetProps = {
    onDismiss: () => void;
    enabled?: boolean;
    presentation?: 'sheet' | 'dialog';
    onClose?: () => void;
    title?: string;
};
const render = (props: SheetProps) => act(() => {
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

describe('SwipeDismissSheet as a dialog (a wide window)', () => {
    const surface = () => renderer!.root.findAll((node) => (node.type as string) === 'Animated.View')[0];
    const closeButton = () => renderer!.root.findAll((node) => (node.type as string) === 'CloseButton')[0];
    const grabber = () => renderer!.root.findAll((node) => (node.type as string) === 'TouchableOpacity' && node.props.accessibilityLabel === 'Close sheet');

    it('has no grabber and no pull-down; its close button asks the owner to close', () => {
        const onClose = vi.fn();
        const onDismiss = vi.fn();
        render({ onDismiss, onClose, presentation: 'dialog', title: 'Simple Plan' });
        expect(grabber()).toHaveLength(0);
        expect(surface().props.onResponderMove).toBeUndefined();
        // The owner plays the exit: nothing slides here, and the sheet is not reported gone.
        closeButton().props.onPress();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onDismiss).not.toHaveBeenCalled();
        expect(sheet.position).toEqual([0]);
        expect(closeButton().props.accessibilityLabel).toBe('Close');
    });

    it('fades its close button while it has to stay open', () => {
        render({ onDismiss: () => {}, onClose: () => {}, presentation: 'dialog', title: 'Unlock', enabled: false });
        expect(closeButton().props.disabled).toBe(true);
        expect(surface().props.onAccessibilityEscape).toBeUndefined();
    });

    it('keeps its close button in the corner when the content draws its own heading', () => {
        render({ onDismiss: () => {}, onClose: () => {}, presentation: 'dialog' });
        expect(closeButton()).toBeDefined();
        expect(renderer!.root.findAll((node) => (node.type as string) === 'Text')).toHaveLength(0);
    });

    it('is the pulled-down iPhone sheet on a phone, with a grabber and no close button', () => {
        render({ onDismiss: () => {}, onClose: () => {}, title: 'Simple Plan' });
        expect(grabber()).toHaveLength(1);
        expect(renderer!.root.findAll((node) => (node.type as string) === 'CloseButton')).toHaveLength(0);
        expect(surface().props.onResponderMove).toBe('pan');
    });
});
