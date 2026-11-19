import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ OS: 'ios' as 'ios' | 'web' }));
vi.mock('react-native', () => ({
    Platform: platform,
    View: 'View',
}));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (tr: string) => tr }) }));
import DeckDragHandle from '../components/decks/DeckDragHandle';

let renderer: TestRenderer.ReactTestRenderer | undefined;

function renderHandle(onStep: (direction: 'up' | 'down') => void) {
    act(() => {
        renderer = TestRenderer.create(React.createElement(DeckDragHandle, {
            displayName: 'Anatomi',
            panHandlers: {},
            onStep,
            style: null,
            children: null,
        }));
    });
    return renderer!.root.find((node) => (node.type as unknown) === 'View');
}

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
    if (renderer) act(() => renderer!.unmount());
    renderer = undefined;
    platform.OS = 'ios';
});

describe('DeckDragHandle', () => {
    it('offers VoiceOver Move up and Move down actions that move the deck one place', () => {
        platform.OS = 'ios';
        const onStep = vi.fn();
        const handle = renderHandle(onStep);
        expect(handle.props.accessibilityLabel).toBe('Anatomi destesini taşı');
        expect(handle.props.accessibilityActions.map((action: { name: string; label: string }) => action.label))
            .toEqual(['Yukarı taşı', 'Aşağı taşı']);
        handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'moveUp' } });
        handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'moveDown' } });
        handle.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
        expect(onStep.mock.calls).toEqual([['up'], ['down']]);
        // The iPhone gets no web key handler.
        expect(handle.props.onKeyDown).toBeUndefined();
        expect(handle.props['aria-keyshortcuts']).toBeUndefined();
    });

    it('moves the deck with Up and Down on the web and leaves other keys alone', () => {
        platform.OS = 'web';
        const onStep = vi.fn();
        const handle = renderHandle(onStep);
        const press = (key: string) => {
            const preventDefault = vi.fn();
            handle.props.onKeyDown({ key, preventDefault });
            return preventDefault;
        };
        expect(press('ArrowUp')).toHaveBeenCalled();
        expect(press('ArrowDown')).toHaveBeenCalled();
        expect(press('Enter')).not.toHaveBeenCalled();
        expect(onStep.mock.calls).toEqual([['up'], ['down']]);
        expect(handle.props['aria-keyshortcuts']).toBe('ArrowUp ArrowDown');
    });
});
