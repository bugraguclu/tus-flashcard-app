import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('react-native', async () => {
    const { createElement, Fragment } = await import('react');
    type ListProps = {
        data: unknown[];
        renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
        keyExtractor: (item: unknown, index: number) => string;
        ListHeaderComponent?: React.ReactNode;
        ListEmptyComponent?: React.ReactNode;
    };
    return {
        Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.default },
        Keyboard: { dismiss: () => {} },
        useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
        StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style, hairlineWidth: 1, absoluteFill: {} },
        ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView', Modal: 'Modal', Pressable: 'Pressable',
        Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', View: 'View',
        // Renders every row at once, which is all a test of the picker's rows needs.
        FlatList: ({ data, renderItem, keyExtractor, ListHeaderComponent, ListEmptyComponent }: ListProps) => createElement(
            'FlatList',
            null,
            ListHeaderComponent ?? null,
            data.length > 0
                ? data.map((item, index) => createElement(Fragment, { key: keyExtractor(item, index) }, renderItem({ item, index })))
                : ListEmptyComponent ?? null,
        ),
    };
});
vi.mock('../constants/theme', () => {
    const colors = new Proxy({}, { get: (_target, key) => String(key) });
    const sizes = new Proxy({}, { get: () => 8 });
    return { useThemeColors: () => colors, BorderRadius: sizes, FontSize: sizes, Spacing: sizes, Shadows: new Proxy({}, { get: () => ({}) }) };
});
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, l: (tr: string) => tr }) }));
vi.mock('./userFacingError', () => ({ userFacingErrorMessage: (_error: unknown, fallback: string) => fallback }));
// The picker lists the decks it is given, here as one flat level.
vi.mock('./deckManager', () => ({
    buildDeckTree: (decks: Array<{ id: number; name: string }>) => decks.map((deck) => ({
        deck, children: [], depth: 0, newCount: 0, learnCount: 0, reviewCount: 0, totalCards: 0,
    })),
}));

import DeckPickerModal from '../components/DeckPickerModal';
import type { Deck } from './models';

const DECKS = [{ id: 1, name: 'Anatomi' }, { id: 2, name: 'Fizyoloji' }] as Deck[];
const colors = new Proxy({}, { get: (_target, key) => String(key) }) as React.ComponentProps<typeof DeckPickerModal>['colors'];

let renderer: TestRenderer.ReactTestRenderer | undefined;
let onClose: Mock<() => void>;
let onSelect: Mock<(name: string | null) => void>;
let onCreateDeck: Mock<(name: string) => string | null>;

const render = (selectedDeckName: string | null = 'Fizyoloji') => act(() => {
    renderer = TestRenderer.create(React.createElement(DeckPickerModal, {
        visible: true,
        colors,
        decks: DECKS,
        selectedDeckName,
        title: 'Deste seç',
        allDecksLabel: 'Tüm desteler',
        searchPlaceholder: 'Desteleri filtrele',
        emptySearchLabel: 'Eşleşen deste yok',
        cancelLabel: 'Vazgeç',
        closeAccessibilityLabel: 'Deste seçiciyi kapat',
        searchAccessibilityLabel: 'Deste ara',
        createAccessibilityLabel: 'Yeni deste oluştur',
        onClose,
        onSelect,
        onCreateDeck,
    }));
});
const byLabel = (label: string) => renderer!.root.findAll((node) => (
    (node.type as unknown) === 'TouchableOpacity' && node.props.accessibilityLabel === label
));
const press = (label: string, index = 0) => act(() => byLabel(label)[index].props.onPress());
const field = (label: string) => renderer!.root.findAll((node) => (
    (node.type as unknown) === 'TextInput' && node.props.accessibilityLabel === label
));
const texts = () => renderer!.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => node.props.children);

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
    onClose = vi.fn();
    onSelect = vi.fn();
    onCreateDeck = vi.fn((name: string) => name);
});
afterEach(() => {
    if (renderer) act(() => renderer!.unmount());
    renderer = undefined;
});

describe('deck picker', () => {
    it('opens on the list with its title and closes from the × or the footer', () => {
        render();
        expect(texts()).toContain('Deste seç');
        press('Deste seçiciyi kapat');
        expect(onClose).toHaveBeenCalledOnce();
        press('Vazgeç');
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('selects a deck from its row and marks the chosen one', () => {
        render();
        const chosen = byLabel('Fizyoloji')[0];
        expect(chosen.props.accessibilityState).toEqual({ selected: true });
        expect(byLabel('Anatomi')[0].props.accessibilityState).toEqual({ selected: false });
        press('Anatomi');
        expect(onSelect).toHaveBeenCalledExactlyOnceWith('Anatomi');
    });

    it('steps into search and back out of it without closing', () => {
        render();
        press('Deste ara');
        expect(field('Desteleri filtrele')).toHaveLength(1);
        act(() => field('Desteleri filtrele')[0].props.onChangeText('zzz'));
        expect(texts()).toContain('Eşleşen deste yok');
        // In a step the leading arrow returns to the list; the picker stays open.
        press('Deste seçiciyi kapat');
        expect(onClose).not.toHaveBeenCalled();
        expect(field('Desteleri filtrele')).toHaveLength(0);
        expect(texts()).toContain('Deste seç');
    });

    it('creates a deck inside the picker and returns it to the operation', () => {
        render();
        press('Yeni deste oluştur');
        act(() => field('Yeni deste adı')[0].props.onChangeText('Patoloji'));
        press('common.create');
        expect(onCreateDeck).toHaveBeenCalledExactlyOnceWith('Patoloji');
        expect(onSelect).toHaveBeenCalledExactlyOnceWith('Patoloji');
        expect(onClose).not.toHaveBeenCalled();
    });
});
