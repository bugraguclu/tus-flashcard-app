import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('react-native', () => ({
    Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.default },
    useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
    StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style, hairlineWidth: 1, absoluteFill: {} },
    // React Native mounts a modal's content only while it is visible, and on iOS unmounts it once
    // UIKit reports the dismissal; the stand-in does the same.
    Modal: ({ visible, children }: { visible: boolean; children?: React.ReactNode }) => (visible ? children : null),
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput',
    TouchableOpacity: 'TouchableOpacity', View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
vi.mock('../constants/theme', () => {
    // Every colour reads as its own name, so a test can tell the red of a destructive row apart.
    const colors = new Proxy({}, { get: (_target, key) => String(key) });
    const sizes = new Proxy({}, { get: () => 8 });
    return { useThemeColors: () => colors, BorderRadius: sizes, FontSize: sizes, Spacing: sizes, Shadows: new Proxy({}, { get: () => ({}) }) };
});
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, l: (tr: string) => tr }) }));
import DeckRowMenu from '../components/decks/DeckRowMenu';
import type { DeckRowMenuAction } from './deckRowMenu';

const ACTIONS: DeckRowMenuAction[] = ['overview', 'rename', 'delete'];

let renderer: TestRenderer.ReactTestRenderer | undefined;
let onSelect: Mock<(action: DeckRowMenuAction) => void>;
let onClose: Mock<() => void>;
let onDismissed: Mock<() => void>;

const menu = (visible: boolean) => React.createElement(DeckRowMenu, {
    visible,
    deckName: 'TUS::Anatomi',
    actions: ACTIONS,
    onSelect,
    onClose,
    onDismissed,
});
const show = (visible: boolean) => act(() => {
    if (renderer) renderer.update(menu(visible));
    else renderer = TestRenderer.create(menu(visible));
});
const rows = () => renderer!.root.findAll((node) => (node.type as unknown) === 'TouchableOpacity');
const flatStyle = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const labelColor = (row: TestRenderer.ReactTestInstance) => flatStyle(
    row.find((node) => (node.type as unknown) === 'Text').props.style,
).color;

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
    onSelect = vi.fn();
    onClose = vi.fn();
    onDismissed = vi.fn();
});
afterEach(() => {
    if (renderer) act(() => renderer!.unmount());
    renderer = undefined;
});

describe('deck ••• menu', () => {
    it('titles the card with the deck path and offers one row per action', () => {
        show(true);
        const texts = renderer!.root.findAll((node) => (node.type as unknown) === 'Text');
        expect(texts[0].props.children).toBe('TUS › Anatomi');
        expect(rows().map((row) => row.props.accessibilityLabel)).toEqual(['Genel bakış', 'Desteyi yeniden adlandır', 'Desteyi sil']);
        expect(rows().map(labelColor)).toEqual(['textPrimary', 'textPrimary', 'textPrimary']);
    });

    it('hands the chosen action back to the deck list', () => {
        show(true);
        act(() => rows()[1].props.onPress());
        expect(onSelect).toHaveBeenCalledExactlyOnceWith('rename');
    });

    it('reports its dismissal once the menu has gone, and only then', () => {
        // The deck list holds a chosen route, dialog or sheet back until this call: iOS cannot
        // present one while the menu's modal is still on screen.
        show(true);
        expect(onDismissed).not.toHaveBeenCalled();
        show(false);
        expect(onDismissed).toHaveBeenCalledOnce();
        show(true);
        show(false);
        expect(onDismissed).toHaveBeenCalledTimes(2);
    });
});
