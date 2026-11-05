// The kit's surfaces with useModalHandoff: a PopoverMenu (PopoverModal), an AppSheet
// (BottomSheetModal) and an AppDialog that hand the screen to another modal take their Modal down
// in the same commit, without the exit that UIKit would make the next modal wait for. An ordinary
// close keeps that exit.
import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { motion } = vi.hoisted(() => ({
    motion: {
        // Where each started animation was heading: a popover's progress (1 in, 0 out) or a
        // sheet's position (0 on screen, its height off it).
        targets: [] as number[],
        // End callbacks of started animations, run by finishAnimations().
        pending: [] as Array<(result: { finished: boolean }) => void>,
    },
}));

vi.mock('react-native', () => {
    class Node {
        interpolate() { return new Node(); }
    }
    class Value extends Node {
        constructor(public value: number) { super(); }
        setValue(value: number) { this.value = value; }
        stopAnimation() {}
    }
    type Animation = { start: (done?: (result: { finished: boolean }) => void) => void; stop: () => void };
    const timing = (value: Value, config: { toValue: number }): Animation => ({
        start: (done) => {
            motion.targets.push(config.toValue);
            value.setValue(config.toValue);
            if (done) motion.pending.push(done);
        },
        stop: () => {},
    });
    return {
        Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.default },
        StyleSheet: { create: <T,>(styles: T) => styles, absoluteFill: {}, hairlineWidth: 1 },
        View: 'View',
        Modal: 'Modal',
        Pressable: 'Pressable',
        KeyboardAvoidingView: 'KeyboardAvoidingView',
        useWindowDimensions: () => ({ width: 390, height: 844 }),
        Easing: { bezier: () => (t: number) => t, linear: (t: number) => t },
        AccessibilityInfo: {
            isReduceMotionEnabled: async () => false,
            addEventListener: () => ({ remove: () => {} }),
        },
        Animated: {
            Value,
            View: 'AnimatedView',
            createAnimatedComponent: () => 'AnimatedPressable',
            timing,
            parallel: (animations: Animation[]): Animation => ({
                start: (done) => {
                    animations.forEach((animation) => animation.start());
                    if (done) motion.pending.push(done);
                },
                stop: () => {},
            }),
        },
    };
});

vi.mock('../components/AppText', () => ({ Text: 'Text' }));
vi.mock('../components/SwipeDismissSheet', () => ({ default: 'SwipeDismissSheet' }));
vi.mock('../components/ui/Button', () => ({ CloseButton: 'CloseButton' }));
vi.mock('../hooks/useReduceMotion', () => ({ useReduceMotion: () => false }));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (tr: string) => tr }) }));
vi.mock('../constants/theme', () => ({
    BorderRadius: new Proxy({}, { get: () => 10 }),
    FontSize: new Proxy({}, { get: () => 12 }),
    Spacing: new Proxy({}, { get: () => 8 }),
    Shadows: new Proxy({}, { get: () => ({}) }),
    useThemeColors: () => new Proxy({}, { get: () => '#000' }),
}));

import BottomSheetModal from '../components/BottomSheetModal';
import { PopoverModal } from '../components/Popover';
import { AppDialog } from '../components/ui/Dialog';
import { useModalHandoff } from '../hooks/useModalHandoff';

type Surface = 'popover' | 'sheet' | 'dialog';

interface Screen {
    handOffToNext: () => void;
    close: () => void;
    reopen: () => void;
}

let renderer: TestRenderer.ReactTestRenderer | undefined;
let screen!: Screen;

/** A menu on `surface` and the dialog it hands off to, each a Modal of its own. */
function mount(surface: Surface) {
    function Menu() {
        const [menuVisible, setMenuVisible] = useState(true);
        const [nextVisible, setNextVisible] = useState(false);
        const handoff = useModalHandoff(menuVisible);
        screen = {
            handOffToNext: () => handoff.handOff(() => { setMenuVisible(false); setNextVisible(true); }),
            close: () => setMenuVisible(false),
            reopen: () => { setNextVisible(false); setMenuVisible(true); },
        };
        const props = { visible: menuVisible, closeAtOnce: handoff.closeAtOnce, children: null };
        const menu = surface === 'popover'
            ? React.createElement(PopoverModal, { ...props, key: 'menu', onRequestClose: screen.close })
            : surface === 'sheet'
                ? React.createElement(BottomSheetModal, { ...props, key: 'menu', onClose: screen.close })
                : React.createElement(AppDialog, { ...props, key: 'menu', onClose: screen.close, title: 'Menu' });
        // The surface the menu hands off to: a plain Modal, as the next dialog's own is.
        return React.createElement(React.Fragment, null, menu, React.createElement('Modal', { key: 'next', visible: nextVisible, testID: 'next' }));
    }
    act(() => { renderer = TestRenderer.create(React.createElement(Menu)); });
}

const menuModal = () => renderer!.root.findAll((node) => (node.type as string) === 'Modal' && node.props.testID !== 'next')[0];
const nextModal = () => renderer!.root.findAll((node) => node.props.testID === 'next' && (node.type as string) === 'Modal')[0];
const finishAnimations = () => act(() => {
    const pending = motion.pending;
    motion.pending = [];
    pending.forEach((done) => done({ finished: true }));
});

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
    motion.targets = [];
    motion.pending = [];
});
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
});

describe('a menu that hands off on iOS', () => {
    it('PopoverMenu: the Modal goes in the commit that opens the next one, without waiting for the shrink', () => {
        mount('popover');
        finishAnimations();
        act(() => screen.handOffToNext());
        expect(menuModal().props.visible).toBe(false);
        expect(menuModal().props.animationType).toBe('none');
        expect(nextModal().props.visible).toBe(true);
    });

    it('PopoverMenu: an ordinary close keeps the Modal up while the menu shrinks away', () => {
        mount('popover');
        finishAnimations();
        motion.targets = [];
        act(() => screen.close());
        expect(menuModal().props.visible).toBe(true);
        expect(motion.targets).toEqual([0]);
        finishAnimations();
        expect(menuModal().props.visible).toBe(false);
    });

    it('AppSheet: the sheet goes at once instead of sliding away first', () => {
        mount('sheet');
        finishAnimations();
        motion.targets = [];
        act(() => screen.handOffToNext());
        expect(menuModal().props.visible).toBe(false);
        expect(menuModal().props.animationType).toBe('none');
        expect(nextModal().props.visible).toBe(true);
        // No slide was started for a sheet that is already gone.
        expect(motion.targets).toEqual([]);
    });

    it('AppSheet: an ordinary close slides the sheet off, then takes the Modal down', () => {
        mount('sheet');
        finishAnimations();
        motion.targets = [];
        act(() => screen.close());
        expect(menuModal().props.visible).toBe(true);
        expect(motion.targets).toEqual([844]);
        finishAnimations();
        expect(menuModal().props.visible).toBe(false);
    });

    it('AppDialog: the hand-off drops the fade for that one dismissal only', () => {
        mount('dialog');
        expect(menuModal().props.animationType).toBe('fade');
        act(() => screen.handOffToNext());
        expect(menuModal().props.visible).toBe(false);
        expect(menuModal().props.animationType).toBe('none');
        expect(nextModal().props.visible).toBe(true);
        // Opened again, it fades in as before, and an ordinary close fades out.
        act(() => screen.reopen());
        expect(menuModal().props.visible).toBe(true);
        expect(menuModal().props.animationType).toBe('fade');
        act(() => screen.close());
        expect(menuModal().props.animationType).toBe('fade');
    });

    it('PopoverMenu and AppSheet: reopened after a hand-off, they open as usual', () => {
        for (const surface of ['popover', 'sheet'] as const) {
            mount(surface);
            finishAnimations();
            act(() => screen.handOffToNext());
            finishAnimations();
            act(() => screen.reopen());
            expect(menuModal().props.visible).toBe(true);
            act(() => renderer?.unmount());
            renderer = undefined;
        }
    });
});
