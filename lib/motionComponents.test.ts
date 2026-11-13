// The shared motion components: a popover modal stays up while its menu leaves and then goes,
// press-scale buttons sink and come back, a "Saved" label pulses once, the study screen's answer
// badge fits its entrance, hold and exit into its lifetime, and a segmented control's pill slides.
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

interface Timing {
    value: { value: number };
    toValue: number;
    duration: number;
    delay?: number;
    easing?: unknown;
    useNativeDriver?: boolean;
}

const { motion } = vi.hoisted(() => ({
    motion: {
        timings: [] as Timing[],
        sequences: [] as Timing[][],
        // End callbacks of started parallel animations, run by finishAnimations().
        pending: [] as Array<(result: { finished: boolean }) => void>,
        reduceMotionListener: null as null | ((enabled: boolean) => void),
    },
}));

vi.mock('react-native', () => {
    // An interpolation keeps its ranges so a test can read what a style follows.
    class Node {
        source?: Node;
        inputRange?: number[];
        outputRange?: unknown[];
        interpolate(config: { inputRange?: number[]; outputRange: unknown[] }) {
            const node = new Node();
            node.source = this;
            node.inputRange = config.inputRange;
            node.outputRange = config.outputRange;
            return node;
        }
    }
    class Value extends Node {
        constructor(public value: number) { super(); }
        setValue(value: number) { this.value = value; }
        stopAnimation() {}
    }
    type Animation = { start: (done?: (result: { finished: boolean }) => void) => void; stop: () => void; config?: Timing };
    const timing = (value: Value, config: Omit<Timing, 'value'>): Animation => {
        const entry = { value, ...config };
        motion.timings.push(entry);
        // The value moves at once; an end callback waits for finishAnimations().
        return { config: entry, start: (done) => { value.setValue(config.toValue); if (done) motion.pending.push(done); }, stop: () => {} };
    };
    return {
        Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.default },
        StyleSheet: {
            create: <T,>(styles: T) => styles,
            absoluteFill: {},
            flatten: (style: unknown): Record<string, unknown> => (Array.isArray(style)
                ? Object.assign({}, ...style.map((part) => (part && typeof part === 'object' ? part : {})))
                : (style as Record<string, unknown>) ?? {}),
        },
        View: 'View',
        Modal: 'Modal',
        Pressable: 'Pressable',
        Easing: { bezier: () => (t: number) => t, linear: (t: number) => t },
        AccessibilityInfo: {
            isReduceMotionEnabled: async () => false,
            addEventListener: (_event: string, listener: (enabled: boolean) => void) => {
                motion.reduceMotionListener = listener;
                return { remove: () => {} };
            },
        },
        Animated: {
            Value,
            View: 'AnimatedView',
            createAnimatedComponent: () => 'AnimatedPressable',
            timing,
            delay: (duration: number) => timing(new Value(0), { toValue: 0, duration }),
            parallel: (animations: Animation[]): Animation => ({
                start: (done) => {
                    animations.forEach((animation) => animation.start());
                    done?.({ finished: true });
                },
                stop: () => {},
            }),
            sequence: (animations: Animation[]): Animation => {
                motion.sequences.push(animations.map((animation) => animation.config!));
                return { start: () => animations.forEach((animation) => animation.start()), stop: () => {} };
            },
        },
    };
});

vi.mock('../components/AppText', () => ({ Text: 'Text' }));
vi.mock('../constants/theme', () => ({
    BorderRadius: { md: 10 },
    FontSize: new Proxy({}, { get: () => 12 }),
    // The kit's segmented control lays its track out with the theme's spacing and shadows.
    Spacing: new Proxy({}, { get: () => 8 }),
    Shadows: new Proxy({}, { get: () => ({}) }),
    dropShadow: () => ({}),
    useIsDarkTheme: () => false,
    useThemeColors: () => new Proxy({}, { get: () => '#000' }),
}));

import { PopoverBackdrop, PopoverItem, PopoverModal } from '../components/Popover';
import { SegmentedControl } from '../components/ui/Choice';
import PressableScale from '../components/PressableScale';
import AnswerFeedbackBadge from '../components/reviewer/AnswerFeedbackBadge';
import { useSuccessPulse } from '../hooks/useSuccessPulse';

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeEach(() => {
    motion.timings = [];
    motion.sequences = [];
    motion.pending = [];
});
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
    vi.useRealTimers();
    act(() => motion.reduceMotionListener?.(false));
});

const finishAnimations = () => act(() => {
    const pending = motion.pending;
    motion.pending = [];
    pending.forEach((done) => done({ finished: true }));
});
const find = (type: string) => renderer!.root.findAll((node) => (node.type as string) === type);
const modal = () => find('Modal')[0];
const flat = (node: ReactTestInstance) => {
    const style = node.props.style;
    return (Array.isArray(style) ? Object.assign({}, ...style.flat(3).filter(Boolean)) : style ?? {}) as Record<string, any>;
};

describe('PopoverModal', () => {
    const menu = (visible: boolean) => React.createElement(PopoverModal, {
        visible,
        onRequestClose: () => {},
        itemCount: 3,
        children: [
            React.createElement(PopoverBackdrop, { key: 'backdrop', onPress: () => {} }),
            ...[0, 1, 2].map((index) => React.createElement(PopoverItem, { key: index, index, origin: 'bottom right' })),
        ],
    });

    const entrances = () => motion.timings.filter((timing) => timing.toValue === 1);
    const show = () => act(() => modal().props.onShow());

    it('opens without a native animation and brings its rows in 30 ms apart, easing out over 200 ms', () => {
        act(() => { renderer = TestRenderer.create(menu(false)); });
        expect(modal().props.visible).toBe(false);
        expect(modal().props.animationType).toBe('none');
        act(() => renderer!.update(menu(true)));
        expect(modal().props.visible).toBe(true);
        // Nothing plays until UIKit has put the Modal on screen.
        expect(entrances()).toHaveLength(0);
        show();
        // The backdrop eases in over 200 ms; one linear clock runs 260 ms for the three rows.
        const [backdrop, clock] = motion.timings.filter((timing) => timing.toValue === 1);
        expect(backdrop).toMatchObject({ duration: 200 });
        expect(typeof backdrop.easing).toBe('function');
        expect(clock).toMatchObject({ duration: 260 });
        expect(motion.timings.every((timing) => !timing.delay)).toBe(true);
        // Each row follows its own 200 ms slice of that clock, starting 30 ms after the one before.
        const rows = find('AnimatedView').map((row) => flat(row).opacity as { source: unknown; inputRange: number[]; outputRange: number[] });
        expect(rows.every((row) => row.source === clock.value)).toBe(true);
        expect(rows.map((row) => Math.round(row.inputRange[0] * 260))).toEqual([0, 30, 60]);
        expect(rows.map((row) => Math.round(row.inputRange.at(-1)! * 260))).toEqual([200, 230, 260]);
        expect(rows.every((row) => row.outputRange[0] === 0 && row.outputRange.at(-1) === 1)).toBe(true);
    });

    it('grows each row from 95% at the corner nearest its button', () => {
        act(() => { renderer = TestRenderer.create(menu(true)); });
        // An open menu lets taps through its layer to the backdrop and rows.
        expect(find('View')[0].props.pointerEvents).toBe('box-none');
        const row = flat(find('AnimatedView')[0]);
        expect(row.transformOrigin).toBe('bottom right');
        expect(row.transform[0].scale.outputRange).toEqual([0.95, 1]);
        expect(row.transform[0].scale.source).toBe(row.opacity);
    });

    it('keeps the modal up while the menu leaves, a fifth faster, then closes it', () => {
        act(() => { renderer = TestRenderer.create(menu(true)); });
        finishAnimations();
        motion.timings = [];
        act(() => renderer!.update(menu(false)));
        expect(modal().props.visible).toBe(true);
        // The leaving menu takes no more touches (a prop: react-native-web drops a 'box-none' style).
        expect(find('View')[0].props.pointerEvents).toBe('none');
        // Backdrop and rows leave together on one 160 ms ease-out.
        const exit = motion.timings.filter((timing) => timing.toValue === 0);
        expect(exit).toHaveLength(1);
        expect(exit[0]).toMatchObject({ duration: 160 });
        expect(find('AnimatedView').every((row) => flat(row).opacity === exit[0].value)).toBe(true);
        finishAnimations();
        expect(modal().props.visible).toBe(false);
    });

    it('closes the modal two frames after the exit, even when the animation never reports its end', () => {
        vi.useFakeTimers();
        act(() => { renderer = TestRenderer.create(menu(true)); });
        act(() => renderer!.update(menu(false)));
        motion.pending = [];
        act(() => { vi.advanceTimersByTime(160 + 33); });
        expect(modal().props.visible).toBe(true);
        act(() => { vi.advanceTimersByTime(1); });
        expect(modal().props.visible).toBe(false);
    });

    it('plays the entrance after 250 ms when the modal never reports being shown', () => {
        vi.useFakeTimers();
        act(() => { renderer = TestRenderer.create(menu(false)); });
        act(() => renderer!.update(menu(true)));
        act(() => { vi.advanceTimersByTime(249); });
        expect(entrances()).toHaveLength(0);
        act(() => { vi.advanceTimersByTime(1); });
        expect(entrances()).toHaveLength(2);
        // A late onShow does not play it twice.
        show();
        expect(entrances()).toHaveLength(2);
    });

    it('never plays the entrance of a menu closed before it was shown', () => {
        act(() => { renderer = TestRenderer.create(menu(false)); });
        act(() => renderer!.update(menu(true)));
        act(() => renderer!.update(menu(false)));
        show();
        expect(entrances()).toHaveLength(0);
        finishAnimations();
        expect(modal().props.visible).toBe(false);
    });

    it('carries straight on when reopened while it was leaving', () => {
        act(() => { renderer = TestRenderer.create(menu(true)); });
        show();
        act(() => renderer!.update(menu(false)));
        motion.timings = [];
        act(() => renderer!.update(menu(true)));
        // Still on screen: no wait for onShow.
        expect(entrances()).toHaveLength(2);
        // The interrupted exit still reports its end; it must not close the reopened menu.
        finishAnimations();
        expect(modal().props.visible).toBe(true);
    });

    it('drops the growth under Reduce Motion and keeps the fade', () => {
        act(() => { renderer = TestRenderer.create(menu(true)); });
        act(() => motion.reduceMotionListener?.(true));
        const row = flat(find('AnimatedView')[0]);
        expect(row.transform).toBeUndefined();
        expect(row.opacity).toBeDefined();
    });
});

describe('PressableScale', () => {
    it('sinks to 97% under the finger over 150 ms, comes back as it lifts, and still presses', () => {
        const onPress = vi.fn();
        act(() => {
            renderer = TestRenderer.create(React.createElement(PressableScale, { onPress, accessibilityLabel: 'İyi' }));
        });
        const button = find('AnimatedPressable')[0];
        expect(flat(button).transform[0].scale.outputRange).toEqual([1, 0.97]);
        act(() => button.props.onPressIn({}));
        expect(motion.timings.at(-1)).toMatchObject({ toValue: 1, duration: 150 });
        act(() => button.props.onPressOut({}));
        expect(motion.timings.at(-1)).toMatchObject({ toValue: 0, duration: 150 });
        act(() => button.props.onPress());
        expect(onPress).toHaveBeenCalledOnce();
        expect(button.props.accessibilityLabel).toBe('İyi');
    });

    it('keeps a dimmed idle or disabled look and dims from there while held', () => {
        act(() => {
            renderer = TestRenderer.create(React.createElement(PressableScale, { style: { opacity: 0.5 }, activeOpacity: 0.8 }));
        });
        expect(flat(find('AnimatedPressable')[0]).opacity.outputRange).toEqual([0.5, 0.4]);
    });

    it('keeps only the dimming under Reduce Motion', () => {
        act(() => { renderer = TestRenderer.create(React.createElement(PressableScale, { activeOpacity: 0.8 })); });
        act(() => motion.reduceMotionListener?.(true));
        const style = flat(find('AnimatedPressable')[0]);
        expect(style.transform[0].scale.outputRange).toEqual([1, 1]);
        expect(style.opacity.outputRange).toEqual([1, 0.8]);
    });
});

/** Where along its clock an interpolation first reaches `value`, and where it last holds it. */
const reaches = (node: { inputRange: number[]; outputRange: number[] }, value: number) => {
    const hits = node.inputRange.filter((_, i) => Math.abs(node.outputRange[i] - value) < 1e-9);
    return { first: hits[0], last: hits.at(-1) };
};

describe('useSuccessPulse', () => {
    let scale: { inputRange: number[]; outputRange: number[] };
    function Saved({ saved }: { saved: boolean }) {
        scale = useSuccessPulse(saved) as unknown as typeof scale;
        return React.createElement('View');
    }
    const beats = () => motion.timings.filter((timing) => timing.duration === 300);

    it('beats once, to 1.06 and back, on one 300 ms clock each time the save is confirmed', () => {
        act(() => { renderer = TestRenderer.create(React.createElement(Saved, { saved: false })); });
        expect(beats()).toHaveLength(0);
        act(() => renderer!.update(React.createElement(Saved, { saved: true })));
        expect(beats()).toHaveLength(1);
        expect(scale.outputRange[0]).toBe(1);
        expect(Math.max(...scale.outputRange)).toBeCloseTo(1.06, 10);
        expect(reaches(scale, 1.06).first).toBeCloseTo(110 / 300, 10);
        expect(scale.outputRange.at(-1)).toBe(1);
        // Staying saved does not beat again; the next save does.
        act(() => renderer!.update(React.createElement(Saved, { saved: true })));
        act(() => renderer!.update(React.createElement(Saved, { saved: false })));
        act(() => renderer!.update(React.createElement(Saved, { saved: true })));
        expect(beats()).toHaveLength(2);
    });

    it('does not beat for a label that was already saved when it appeared', () => {
        act(() => { renderer = TestRenderer.create(React.createElement(Saved, { saved: true })); });
        expect(beats()).toHaveLength(0);
    });
});

describe('AnswerFeedbackBadge', () => {
    it('grows in easing out, holds, and leaves a fifth faster, all on one clock of its lifetime', () => {
        act(() => {
            renderer = TestRenderer.create(React.createElement(AnswerFeedbackBadge, { lifetimeMs: 550, children: '×' }));
        });
        expect(motion.timings).toHaveLength(1);
        expect(motion.timings[0]).toMatchObject({ toValue: 1, duration: 550 });
        const style = flat(find('AnimatedView')[0]);
        const opacity = style.opacity as { inputRange: number[]; outputRange: number[] };
        expect(opacity.outputRange[0]).toBe(0);
        // In by 160 ms, held until 128 ms before the end, gone at 550 ms.
        expect(reaches(opacity, 1).first).toBeCloseTo(160 / 550, 10);
        expect(reaches(opacity, 1).last).toBeCloseTo((550 - 128) / 550, 10);
        expect(opacity.outputRange.at(-1)).toBe(0);
        const scale = style.transform[0].scale as { outputRange: number[] };
        expect(scale.outputRange[0]).toBe(0.85);
        expect(scale.outputRange.at(-1)).toBe(1);
    });
});

describe('SegmentedControl', () => {
    const options = [{ value: 'week', label: 'Hafta' }, { value: 'month', label: 'Ay' }, { value: 'year', label: 'Yıl' }];
    const control = (value: string) => React.createElement(SegmentedControl<string>, {
        options, value, onChange: () => {}, accessibilityLabel: 'Dönem',
    });
    const measure = () => act(() => find('Pressable').forEach((segment, index) => segment.props.onLayout({
        nativeEvent: { layout: { x: 2 + index * 60, y: 2, width: 60, height: 30 } },
    })));
    const pill = () => flat(find('AnimatedView')[0]);

    it('puts the pill under the chosen segment at once, then slides it to a new choice', () => {
        act(() => { renderer = TestRenderer.create(control('week')); });
        // Until the segments are measured the chosen one carries its own background.
        expect(find('AnimatedView')).toHaveLength(0);
        measure();
        expect(pill().left.value).toBe(2);
        expect(pill().width.value).toBe(60);
        expect(motion.timings).toHaveLength(0);

        act(() => renderer!.update(control('year')));
        expect(motion.timings.map((timing) => timing.toValue)).toEqual([122, 60]);
        // Left and width are layout: the JS driver moves them, easing in and out over 250 ms.
        expect(motion.timings.every((timing) => timing.duration === 250 && timing.useNativeDriver === false)).toBe(true);
        expect(pill().left.value).toBe(122);
    });

    it('moves the pill without a slide when only the layout changes, or under Reduce Motion', () => {
        act(() => { renderer = TestRenderer.create(control('week')); });
        measure();
        act(() => find('Pressable')[0].props.onLayout({ nativeEvent: { layout: { x: 2, y: 2, width: 80, height: 30 } } }));
        expect(pill().width.value).toBe(80);
        act(() => motion.reduceMotionListener?.(true));
        act(() => renderer!.update(control('month')));
        expect(motion.timings).toHaveLength(0);
        expect(pill().left.value).toBe(62);
    });
});
