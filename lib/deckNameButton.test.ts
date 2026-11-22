import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Platform } from 'react-native';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('react-native', () => ({
    Platform: { OS: 'ios' },
    View: 'View',
    Pressable: 'Pressable',
    TouchableOpacity: 'TouchableOpacity',
    PanResponder: { create: (handlers: object) => ({ panHandlers: handlers }) },
}));

import DeckNameButton from '../components/decks/DeckNameButton';

let renderer: TestRenderer.ReactTestRenderer | undefined;
let onPress: Mock<() => void>;
let drag: { begin: Mock<(pageY: number) => void>; move: Mock<(pageY: number) => void>; complete: Mock<() => void>; cancel: Mock<() => void> };
const event = (pageX = 60, pageY = 100) => ({ nativeEvent: { pageX, pageY } });
const button = () => renderer!.root.findByType('View' as unknown as typeof DeckNameButton);
let onPressedChange: Mock<(pressed: boolean) => void>;
const props = () => ({ children: 'Deste', style: {}, accessibilityLabel: 'Deste çalış', onPress, onPressedChange, drag });

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
    Object.assign(Platform, { OS: 'ios' });
    vi.useFakeTimers();
    onPress = vi.fn();
    onPressedChange = vi.fn();
    drag = { begin: vi.fn(), move: vi.fn(), complete: vi.fn(), cancel: vi.fn() };
});
afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    if (renderer) act(() => renderer!.unmount());
    renderer = undefined;
    vi.useRealTimers();
});
/** The web build under a mouse that can hover. */
const withMouse = () => {
    Object.assign(Platform, { OS: 'web' });
    (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: true }) };
};
const render = () => act(() => { renderer = TestRenderer.create(React.createElement(DeckNameButton, props())); });
const grant = () => act(() => button().props.onPanResponderGrant(event()));
const hold = () => act(() => { vi.advanceTimersByTime(450); });

describe('deck name tap and hold', () => {
    it('opens study on a short tap and clears the pending hold', () => {
        render();
        grant();
        act(() => { vi.advanceTimersByTime(200); });
        act(() => button().props.onPanResponderRelease(event()));
        hold();
        expect(onPress).toHaveBeenCalledOnce();
        expect(drag.begin).not.toHaveBeenCalled();
        expect(drag.complete).not.toHaveBeenCalled();
    });

    it('lifts on hold, follows the finger outside the name and drops at the final position', () => {
        render();
        grant();
        hold();
        expect(drag.begin).toHaveBeenCalledWith(100);
        expect(button().props.onPanResponderTerminationRequest()).toBe(false);
        act(() => button().props.onPanResponderMove(event(120, 380)));
        act(() => button().props.onPanResponderRelease(event(120, 390)));
        expect(drag.move.mock.calls).toEqual([[380], [390]]);
        expect(drag.complete).toHaveBeenCalledOnce();
        expect(onPress).not.toHaveBeenCalled();
        expect(button().props.onPanResponderTerminationRequest()).toBe(true);
    });

    it('ends a stationary hold without opening study, then accepts a new tap', () => {
        render();
        grant();
        hold();
        act(() => button().props.onPanResponderRelease(event()));
        expect(drag.complete).toHaveBeenCalledOnce();
        expect(onPress).not.toHaveBeenCalled();
        grant();
        act(() => button().props.onPanResponderRelease(event()));
        expect(onPress).toHaveBeenCalledOnce();
    });

    it('gives a normal scroll to the list and cancels both hold and tap, even after returning', () => {
        render();
        grant();
        expect(button().props.onPanResponderTerminationRequest()).toBe(true);
        act(() => button().props.onPanResponderMove(event(60, 125)));
        act(() => button().props.onPanResponderMove(event()));
        hold();
        act(() => button().props.onPanResponderRelease(event()));
        expect(onPress).not.toHaveBeenCalled();
        expect(drag.begin).not.toHaveBeenCalled();
    });

    it('cancels on responder termination before or after a hold', () => {
        render();
        grant();
        act(() => button().props.onPanResponderTerminate());
        hold();
        expect(drag.begin).not.toHaveBeenCalled();
        expect(drag.cancel).not.toHaveBeenCalled();
        grant();
        hold();
        act(() => button().props.onPanResponderTerminate());
        expect(drag.cancel).toHaveBeenCalledOnce();
        expect(drag.complete).not.toHaveBeenCalled();
        expect(onPress).not.toHaveBeenCalled();
    });

    it('keeps the active gesture through a re-render and uses the latest handlers', () => {
        render();
        grant();
        hold();
        const handlers = button().props.onPanResponderRelease;
        const complete = vi.fn();
        act(() => renderer!.update(React.createElement(DeckNameButton, { ...props(), drag: { ...drag, complete } })));
        expect(button().props.onPanResponderRelease).toBe(handlers);
        act(() => button().props.onPanResponderRelease(event()));
        expect(complete).toHaveBeenCalledOnce();
        expect(drag.complete).not.toHaveBeenCalled();
    });

    it('clears a pending hold on unmount and cancels an active drag on unmount', () => {
        render();
        grant();
        act(() => renderer!.unmount());
        hold();
        expect(drag.begin).not.toHaveBeenCalled();
        render();
        grant();
        hold();
        act(() => renderer!.unmount());
        renderer = undefined;
        expect(drag.cancel).toHaveBeenCalledOnce();
        expect(drag.complete).not.toHaveBeenCalled();
    });

    it('retains a normal study button for filtered and protected decks without drag handlers', () => {
        act(() => { renderer = TestRenderer.create(React.createElement(DeckNameButton, { ...props(), drag: undefined })); });
        const normalButton = renderer!.root.findByType('Pressable' as unknown as typeof DeckNameButton);
        act(() => normalButton.props.onPressIn());
        expect(normalButton.props.style).toContainEqual({ opacity: 0.2 });
        act(() => normalButton.props.onPressOut());
        act(() => normalButton.props.onPress());
        expect(onPress).toHaveBeenCalledOnce();
        expect(normalButton.props.onLongPress).toBeUndefined();
    });

    it('supports web keyboard and assistive activation without a duplicate pointer click', () => {
        Object.assign(Platform, { OS: 'web' });
        render();
        const preventDefault = vi.fn();
        act(() => button().props.onKeyDown({ key: 'Enter', preventDefault }));
        act(() => button().props.onKeyDown({ key: ' ', preventDefault }));
        act(() => button().props.onKeyDown({ key: 'Enter', repeat: true, preventDefault }));
        act(() => button().props.onClick({ detail: 1 }));
        expect(onPress).toHaveBeenCalledTimes(2);
        act(() => button().props.onClick({ detail: 0 }));
        expect(onPress).toHaveBeenCalledTimes(3);
        expect(preventDefault).toHaveBeenCalledTimes(2);
        expect(button().props.tabIndex).toBe(0);
    });

    it('exposes the study action to native accessibility activation', () => {
        render();
        act(() => button().props.onAccessibilityTap());
        expect(onPress).toHaveBeenCalledOnce();
        expect(button().props.accessibilityRole).toBe('button');
        expect(button().props.accessibilityLabel).toBe('Deste çalış');
        expect(drag.begin).not.toHaveBeenCalled();
    });

    it('keeps the phone feedback: the name fades under the finger and the row is left alone', () => {
        render();
        grant();
        expect(button().props.style).toContainEqual({ opacity: 0.2 });
        act(() => button().props.onPanResponderRelease(event()));
        act(() => { vi.advanceTimersByTime(200); });
        expect(button().props.style).not.toContainEqual({ opacity: 0.2 });
        expect(onPressedChange).not.toHaveBeenCalled();
    });

    it('lights the row for a mouse held still, never for one that starts a scroll', () => {
        withMouse();
        render();
        grant();
        act(() => { vi.advanceTimersByTime(50); });
        act(() => button().props.onPanResponderMove(event(60, 125)));
        act(() => { vi.advanceTimersByTime(200); });
        expect(onPressedChange).not.toHaveBeenCalled();

        grant();
        act(() => { vi.advanceTimersByTime(100); });
        expect(onPressedChange.mock.calls).toEqual([[true]]);
        act(() => button().props.onPanResponderRelease(event()));
        act(() => { vi.advanceTimersByTime(200); });
        expect(onPressedChange.mock.calls).toEqual([[true], [false]]);
    });

    it('flashes the row for a click released before the highlight showed', () => {
        withMouse();
        render();
        grant();
        act(() => { vi.advanceTimersByTime(30); });
        act(() => button().props.onPanResponderRelease(event()));
        expect(onPressedChange.mock.calls).toEqual([[true]]);
        act(() => { vi.advanceTimersByTime(200); });
        expect(onPressedChange.mock.calls).toEqual([[true], [false]]);
        expect(onPress).toHaveBeenCalledOnce();
    });

    it('turns the highlight off when a hold lifts the deck for dragging', () => {
        withMouse();
        render();
        grant();
        hold();
        expect(onPressedChange.mock.calls).toEqual([[true], [false]]);
    });
});
