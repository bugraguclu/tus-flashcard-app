// SideDragArea on iOS: a responder handed to the area must end up on the content inside its hidden
// scroll view. React Native's iOS scroll view does not scroll while an ancestor is the JS responder,
// so a responder left on the area (a chart that takes taps) gave every sideways drag to the back swipe.
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => {
    class Value {
        constructor(public value: number) {}
        setValue(value: number) { this.value = value; }
    }
    return {
        Platform: { OS: 'ios' },
        View: 'View',
        ScrollView: 'ScrollView',
        Animated: {
            Value,
            subtract: () => ({}),
            event: () => () => {},
            ScrollView: 'Animated.ScrollView',
            View: 'Animated.View',
        },
    };
});

import SideDragArea from '../components/SideDragArea';

let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = undefined;
});

const onStartShouldSetResponder = () => true;
const onResponderRelease = () => {};

function render(enabled: boolean) {
    act(() => {
        renderer = TestRenderer.create(React.createElement(SideDragArea, {
            enabled,
            onStartShouldSetResponder,
            onResponderRelease,
            accessibilityLabel: 'Chart',
            style: { height: 10 },
            children: React.createElement('View', { testID: 'plot' }),
        }));
    });
}

const hostsOf = (type: string) => renderer!.root.findAll((node: ReactTestInstance) => (node.type as unknown) === type);

describe('SideDragArea responder props', () => {
    it('puts them on the content inside the scroll view, and the rest on the area', () => {
        render(true);
        const [area] = hostsOf('View');
        const [content] = hostsOf('Animated.View');
        expect(area.props.accessibilityLabel).toBe('Chart');
        expect(area.props.onStartShouldSetResponder).toBeUndefined();
        expect(area.props.onResponderRelease).toBeUndefined();
        expect(content.props.onStartShouldSetResponder).toBe(onStartShouldSetResponder);
        expect(content.props.onResponderRelease).toBe(onResponderRelease);
        expect(content.props.accessibilityLabel).toBeUndefined();
    });

    it('leaves them on the area when it takes no drags', () => {
        render(false);
        expect(hostsOf('Animated.ScrollView')).toHaveLength(0);
        const [area] = hostsOf('View');
        expect(area.props.onStartShouldSetResponder).toBe(onStartShouldSetResponder);
        expect(area.props.accessibilityLabel).toBe('Chart');
    });
});
