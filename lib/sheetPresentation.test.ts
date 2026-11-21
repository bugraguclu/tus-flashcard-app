// A sheet is the iPhone's pulled-down panel on a phone and a centred dialog on a wide window
// (desktop web, a tablet): the grabber means nothing under a mouse, and a panel stuck to the
// bottom of a wide window reads as a phone layout.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const windowSize = vi.hoisted(() => ({ width: 390, height: 844 }));
const motion = vi.hoisted(() => ({ timings: [] as Array<{ toValue: number; duration: number }> }));

vi.mock('react-native', () => {
    class Node {
        interpolate(config: unknown) { const node = new Node(); (node as unknown as { config: unknown }).config = config; return node; }
    }
    class Value extends Node {
        constructor(public value: number) { super(); }
        setValue(value: number) { this.value = value; }
        stopAnimation() {}
    }
    return {
        Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web ?? spec.default },
        StyleSheet: { create: <T,>(styles: T) => styles, absoluteFill: {}, hairlineWidth: 1 },
        View: 'View',
        Modal: 'Modal',
        Pressable: 'Pressable',
        KeyboardAvoidingView: 'KeyboardAvoidingView',
        useWindowDimensions: () => windowSize,
        Easing: { bezier: () => (t: number) => t },
        Animated: {
            Value,
            View: 'AnimatedView',
            timing: (_value: Value, config: { toValue: number; duration: number }) => ({
                start: () => { motion.timings.push({ toValue: config.toValue, duration: config.duration }); },
                stop: () => {},
            }),
        },
    };
});
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }) }));
vi.mock('../components/SwipeDismissSheet', () => ({ default: 'SwipeDismissSheet' }));
vi.mock('../components/ui/Button', () => ({ Button: 'Button' }));
vi.mock('../hooks/useReduceMotion', () => ({ useReduceMotion: () => false }));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (_tr: string, en: string) => en }) }));
vi.mock('../constants/theme', () => ({
    BorderRadius: new Proxy({}, { get: () => 16 }),
    FontSize: new Proxy({}, { get: () => 14 }),
    Spacing: new Proxy({}, { get: () => 8 }),
    Shadows: new Proxy({}, { get: () => ({}) }),
    useThemeColors: () => new Proxy({}, { get: () => '#000' }),
}));

import {
    SHEET_DIALOG_MAX_WIDTH,
    SHEET_DIALOG_MIN_WINDOW_WIDTH,
    sheetDialogMaxHeight,
    sheetPresentationFor,
} from './sheetPresentation';
import { AppSheet } from '../components/ui/Sheet';

type Props = React.ComponentProps<typeof AppSheet>;

let renderer: TestRenderer.ReactTestRenderer | undefined;
const show = (width: number, props: Partial<Props> = {}) => {
    windowSize.width = width;
    const element = React.createElement(AppSheet, { visible: true, onClose: () => {}, title: 'Record Audio', children: null, ...props });
    act(() => {
        if (renderer) renderer.update(element);
        else renderer = TestRenderer.create(element);
    });
};
const surface = () => renderer!.root.findAll((node) => (node.type as string) === 'SwipeDismissSheet')[0].props;
const flatStyle = (style: unknown): Record<string, unknown> => (
    Array.isArray(style) ? Object.assign({}, ...style.map(flatStyle)) : ((style as Record<string, unknown>) ?? {})
);

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
    motion.timings = [];
});

describe('sheet presentation by window width', () => {
    it('keeps every phone held upright on the pulled-down sheet', () => {
        for (const width of [320, 375, 390, 402, 430, 440]) expect(sheetPresentationFor(width)).toBe('sheet');
        expect(sheetPresentationFor(SHEET_DIALOG_MIN_WINDOW_WIDTH - 1)).toBe('sheet');
    });

    it('shows a tablet or a desktop window a dialog', () => {
        for (const width of [SHEET_DIALOG_MIN_WINDOW_WIDTH, 744, 820, 1024, 1280, 1440]) expect(sheetPresentationFor(width)).toBe('dialog');
    });

    it('never lets a dialog grow taller than AppDialog', () => {
        expect(sheetDialogMaxHeight('88%')).toBe('86%');
        expect(sheetDialogMaxHeight('92%')).toBe('86%');
        expect(sheetDialogMaxHeight('70%')).toBe('70%');
        expect(sheetDialogMaxHeight('0%')).toBe('86%');
    });
});

describe('AppSheet on a phone and on a wide window', () => {
    it('on a phone: a bottom sheet over the safe area, its Cancel a text button at the header start', () => {
        const onClose = vi.fn();
        show(390, { onClose, cancelLabel: 'Cancel', swipeEnabled: false });
        expect(surface().presentation).toBe('sheet');
        expect(surface().enabled).toBe(false);
        const style = flatStyle(surface().style);
        expect(style.borderTopLeftRadius).toBe(16);
        expect(style.paddingBottom).toBe(34);
        expect(style.maxHeight).toBe('88%');
        const cancel = surface().headerLeft as React.ReactElement<{ label: string; onPress: () => void; disabled: boolean }>;
        expect(cancel.props.label).toBe('Cancel');
        expect(cancel.props.disabled).toBe(false);
        cancel.props.onPress();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('on a wide window: a centred card whose close button is the Cancel', () => {
        show(1280, { cancelLabel: 'Cancel', swipeEnabled: false });
        expect(surface().presentation).toBe('dialog');
        // A stray swipe is not a risk under a mouse: the close button stays, and asks as Cancel does.
        expect(surface().enabled).toBe(true);
        expect(surface().headerLeft).toBeUndefined();
        const style = flatStyle(surface().style);
        expect(style.maxWidth).toBe(SHEET_DIALOG_MAX_WIDTH);
        expect(style.borderRadius).toBe(16);
        expect(style.borderTopLeftRadius).toBe(16);
        expect(style.maxHeight).toBe('86%');
        expect(style.paddingBottom).not.toBe(34);
        // It fades and grows in place instead of sliding: an opacity and a scale, no translation.
        expect(style.opacity).toBeDefined();
        expect((style.transform as Array<Record<string, unknown>>).map((step) => Object.keys(step)[0])).toEqual(['scale']);
        const layer = renderer!.root.findAll((node) => (node.type as string) === 'KeyboardAvoidingView')[0];
        expect(flatStyle(layer.props.style)).toMatchObject({ justifyContent: 'center', alignItems: 'center' });
    });

    it('on a wide window: the close button fades with the Cancel while work runs, and when nothing may close it', () => {
        show(1280, { cancelLabel: 'Cancel', cancelDisabled: true, swipeEnabled: false });
        expect(surface().enabled).toBe(false);
        act(() => renderer?.unmount());
        renderer = undefined;
        show(1280, { swipeEnabled: false });
        expect(surface().enabled).toBe(false);
    });

    it('on a wide window: a picker drawn over the dialog takes its close button out of play', () => {
        show(1280, { overlay: React.createElement('View') });
        expect(surface().enabled).toBe(false);
    });

    it('on a wide window: grows in for a popover’s 200 ms, and leaves in 80% of that', () => {
        show(1280);
        expect(motion.timings[motion.timings.length - 1]).toEqual({ toValue: 0, duration: 200 });
        show(1280, { visible: false });
        expect(motion.timings[motion.timings.length - 1].duration).toBe(160);
    });

    it('on a phone: slides up as an iPhone sheet does', () => {
        show(390);
        expect(motion.timings[motion.timings.length - 1]).toEqual({ toValue: 0, duration: 440 });
        expect(flatStyle(surface().style).transform).toBeUndefined();
    });
});
