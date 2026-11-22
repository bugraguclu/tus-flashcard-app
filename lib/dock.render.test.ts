// The dock puts its raised action between the two halves of its shortcuts, and out of the way it
// lets touches and VoiceOver through to the list under it: it slides away (fades with Reduce
// Motion) in 80% of the time it takes to come back, without holding up the deck list's reads.
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
    reduceMotion: false,
    holdHalfway: false,
    timings: [] as Array<{ toValue: number; duration: number; isInteraction?: boolean; useNativeDriver?: boolean }>,
}));

vi.mock('react-native', () => {
    class Node {
        config?: { inputRange: number[]; outputRange: unknown[] };
        interpolate(config: { inputRange: number[]; outputRange: unknown[] }) {
            const node = new Node();
            node.config = config;
            return node;
        }
    }
    class Value extends Node {
        constructor(public value: number) { super(); }
        setValue(value: number) { this.value = value; }
        stopAnimation(callback?: (value: number) => void) { callback?.(this.value); }
    }
    return {
        Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.default },
        StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 0.5, absoluteFill: {} },
        View: 'View',
        Easing: { bezier: () => (t: number) => t },
        useWindowDimensions: () => ({ width: 390, height: 844 }),
        Animated: {
            Value,
            View: 'AnimatedView',
            // Each animation lands at once, unless a test holds it halfway.
            timing: (value: Value, config: (typeof env.timings)[number]) => {
                env.timings.push(config);
                return { start: () => { if (!env.holdHalfway) value.setValue(config.toValue); else value.setValue(0.5); }, stop: () => {} };
            },
        },
    };
});
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
vi.mock('react-native-svg', () => ({ default: 'Svg', Path: 'Path' }));
vi.mock('../constants/theme', () => ({
    Spacing: { xxs: 2, xs: 4, s6: 6, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },
    FontSize: { xs: 11, sm: 12, md: 14, lg: 16, xl: 18 },
    BorderRadius: { sm: 8, md: 12, lg: 16, full: 999 },
    Shadows: { sm: {}, md: {}, lg: {}, lgOutline: { shadowOpacity: 0.1 } },
    useThemeColors: () => ({ bgCard: 'white', border: 'grey', accent: 'teal', onAccent: 'white', textSecondary: 'grey' }),
}));
vi.mock('../components/AppText', () => ({ Text: 'Text' }));
vi.mock('../components/PressableScale', () => ({ default: 'PressableScale' }));
vi.mock('../components/Popover', () => ({
    PopoverBackdrop: 'PopoverBackdrop',
    PopoverItem: 'PopoverItem',
    PopoverModal: 'PopoverModal',
    usePopoverProgress: () => null,
}));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (tr: string) => tr }) }));
vi.mock('../lib/haptics', () => ({ menuOpenHaptic: () => {} }));
vi.mock('../hooks/useReduceMotion', () => ({ useReduceMotion: () => env.reduceMotion }));
import { Dock, DockItem } from '../components/ui/Dock';
import { exitDuration, MotionDuration } from '../lib/motion';

let renderer: TestRenderer.ReactTestRenderer | undefined;
const onAdd = vi.fn();

function dock(hidden: boolean, expanded = false) {
    return React.createElement(Dock, {
        hidden,
        action: { icon: null, label: 'Ekle', onPress: onAdd, expanded },
        children: ['Kartlarım', 'Kronometre', 'İstatistik', 'Ayarlar'].map((label) => (
            React.createElement(DockItem, { key: label, label, icon: null, onPress: () => {} })
        )),
    });
}

function render(hidden: boolean) {
    act(() => { renderer = TestRenderer.create(dock(hidden)); });
    return renderer!.root;
}

const wrapper = (root: ReactTestInstance) => root.find((node) => (node.type as unknown) === 'AnimatedView');
const flat = (style: unknown): Record<string, unknown> => Object.assign(
    {},
    ...(Array.isArray(style) ? style : [style]).filter((part) => part && typeof part === 'object'),
);

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
    if (renderer) act(() => renderer!.unmount());
    renderer = undefined;
    env.reduceMotion = false;
    env.holdHalfway = false;
    env.timings.length = 0;
    onAdd.mockReset();
});

describe('Dock', () => {
    it('raises its action between the two halves of its shortcuts', () => {
        const root = render(false);
        const row = root.find((node) => (node.type as unknown) === 'View' && flat(node.props.style).flexDirection === 'row');
        expect(row.children.map((child) => (
            typeof child !== 'string' && (child.type as unknown) === 'View' ? 'slot' : (child as ReactTestInstance).props.label
        ))).toEqual(['Kartlarım', 'Kronometre', 'slot', 'İstatistik', 'Ayarlar']);
        const add = root.find((node) => (node.type as unknown) === 'PressableScale' && node.props.accessibilityLabel === 'Ekle');
        expect(add.props['aria-expanded']).toBe(false);
        add.props.onPress();
        expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it('lets touches and VoiceOver through while it is out of the way', () => {
        const shown = wrapper(render(false));
        expect(shown.props.pointerEvents).toBe('box-none');
        expect(shown.props.accessibilityElementsHidden).toBe(false);
        expect(shown.props['aria-hidden']).toBeUndefined();
        act(() => renderer!.update(dock(true)));
        const hidden = wrapper(renderer!.root);
        expect(hidden.props.pointerEvents).toBe('none');
        expect(hidden.props.accessibilityElementsHidden).toBe(true);
        expect(hidden.props.importantForAccessibility).toBe('no-hide-descendants');
        expect(hidden.props['aria-hidden']).toBe(true);
    });

    it('leaves in 80% of the time it takes to come back, outside the interaction queue', () => {
        render(false);
        act(() => renderer!.update(dock(true)));
        act(() => renderer!.update(dock(false)));
        // Shown from the start: nothing to animate on the first frame.
        expect(env.timings.map(({ toValue, duration }) => [toValue, duration])).toEqual([
            [1, exitDuration(MotionDuration.dock)],
            [0, MotionDuration.dock],
        ]);
        expect(env.timings.every((timing) => timing.isInteraction === false && timing.useNativeDriver)).toBe(true);
    });

    it('turned around halfway, covers the way left in that share of the time', () => {
        render(false);
        env.holdHalfway = true;
        act(() => renderer!.update(dock(true)));
        act(() => renderer!.update(dock(false)));
        expect(env.timings.map(({ toValue, duration }) => [toValue, duration])).toEqual([
            [1, exitDuration(MotionDuration.dock)],
            [0, Math.round(MotionDuration.dock / 2)],
        ]);
    });

    it('slides below the screen edge, or fades with Reduce Motion', () => {
        const sliding = flat(wrapper(render(false)).props.style);
        const slide = (sliding.transform as Array<{ translateY: { config: { outputRange: number[] } } }>)[0].translateY;
        // Panel, raised button, home-indicator gap and shadow all leave the screen.
        expect(slide.config.outputRange[1]).toBeGreaterThanOrEqual(34 + 68 + 28);
        expect(sliding.opacity).toBeUndefined();
        act(() => renderer!.unmount());
        env.reduceMotion = true;
        const fading = flat(wrapper(render(false)).props.style);
        expect(fading.transform).toBeUndefined();
        expect((fading.opacity as { config: { outputRange: number[] } }).config.outputRange).toEqual([1, 0]);
    });
});
