import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => {
    // The menu grows out of •••; the animation finishes at once here.
    class Value {
        constructor(public value: number) {}
        setValue(value: number) { this.value = value; }
        stopAnimation() {}
        interpolate() { return {}; }
    }
    const run = (value: Value, config: { toValue: number }) => ({ start: () => value.setValue(config.toValue) });
    return {
        Platform: { OS: 'ios', select: (spec: { ios?: unknown; default?: unknown }) => spec.ios ?? spec.default },
        StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
        Text: 'Text', View: 'View', Pressable: 'Pressable', TouchableOpacity: 'TouchableOpacity', Modal: 'Modal',
        Easing: { bezier: () => (t: number) => t },
        Animated: {
            Value,
            View: 'AnimatedView',
            createAnimatedComponent: (component: unknown) => component,
            timing: run,
            parallel: (animations: { start: () => void }[]) => ({
                start: (done?: () => void) => { animations.forEach((animation) => animation.start()); done?.(); },
            }),
        },
    };
});
import { EditorOverflowMenu } from '../components/editor/EditorOverflowMenu';
import type { EditorStyles } from '../components/editor/editorStyles';

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let renderer: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => { if (renderer) act(() => renderer?.unmount()); renderer = undefined; });

function mount(contentReadOnly: boolean) {
    const clear = vi.fn();
    const preferences = vi.fn();
    act(() => {
        renderer = TestRenderer.create(React.createElement(EditorOverflowMenu, {
            topInset: 0, isCatalog: true, isEditing: true, contentReadOnly,
            preferences: { fontSize: 16, capitalizeSentences: true, toolbarVisible: true, toolbarScrollable: true, pasteClipboardImagesAsPng: false },
            onClearFields: clear, onUpdatePreferences: preferences, onDeleteNote: vi.fn(),
            onOpenFontSize: vi.fn(), onClose: vi.fn(), styles: {} as EditorStyles,
            l: (tr: string) => tr,
        }));
    });
    return { clear, preferences };
}
const text = (label: string) => renderer!.root.findAll((node) => (node.type as string) === 'Text' && node.children.includes(label));
/** Presses the control that carries this label: the nearest ancestor of its text with onPress. */
const press = (label: string) => act(() => {
    let node = text(label)[0].parent;
    while (node && typeof node.props.onPress !== 'function') node = node.parent;
    node!.props.onPress();
});

describe('catalog editor content actions', () => {
    it('exposes clear fields and working formatting preferences for purchased content', () => {
        const actions = mount(false);
        press('Alanları temizle');
        press('Araç çubuğunu göster');
        press('Araç çubuğunu kaydır');
        expect(actions.clear).toHaveBeenCalledOnce();
        expect(actions.preferences).toHaveBeenCalledWith({ toolbarVisible: false });
        expect(actions.preferences).toHaveBeenCalledWith({ toolbarScrollable: false });
    });

    it('keeps trial content actions locked', () => {
        mount(true);
        expect(text('Alanları temizle')).toHaveLength(0);
        expect(text('Araç çubuğunu göster')).toHaveLength(0);
        expect(text('Araç çubuğunu kaydır')).toHaveLength(0);
    });
});
