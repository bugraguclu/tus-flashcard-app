// Card Info from the browser: Anki's Cards › Info shows the current card, the first card of the
// note in Notes mode (https://docs.ankiweb.net/browsing.html#cards). The browser offers it in the
// selection menu for exactly one selected row and in a row's expanded details, and opens the
// existing /card-info route for that card.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.native ?? spec.default },
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {}, hairlineWidth: 1 },
    View: 'View', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', Pressable: 'Pressable',
    Modal: 'Modal', Switch: 'Switch',
}));
vi.mock('react-native-svg', () => ({ default: 'Svg', Path: 'Path', Circle: 'Circle' }));
vi.mock('expo-router', () => ({ useRouter: () => ({}) }));
vi.mock('../components/AppText', () => ({ Text: 'Text', TextInput: 'TextInput' }));
vi.mock('../components/SwipeDismissSheet', async () => {
    const { createElement } = await import('react');
    return { default: ({ children }: { children: React.ReactNode }) => createElement('SwipeDismissSheet', null, children) };
});
vi.mock('../constants/theme', () => ({ FontSize: { md: 15 }, useIsDarkTheme: () => false }));
vi.mock('./db', () => ({ getDB: () => { throw new Error('no database in this test'); } }));

import { SelectionMenuModal } from '../components/browser/BrowserMenus';
import { BrowserCardRow } from '../components/browser/BrowserCardRow';

const l = (_tr: string, en: string) => en;
const t = (key: string) => key;
let renderer: TestRenderer.ReactTestRenderer | undefined;

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
    if (renderer) act(() => renderer!.unmount());
    renderer = undefined;
});

const byLabel = (label: string) => renderer!.root.find((node) => node.props.accessibilityLabel === label && typeof node.type === 'string');
const shownText = () => renderer!.root.findAll((node) => (node.type as unknown) === 'Text').map((node) => [node.props.children].flat().join('')).join('\n');

function selectionMenu(selected: number[], tableMode: 'cards' | 'notes' = 'cards') {
    const router = { push: vi.fn() };
    const setShowSelectionMenu = vi.fn();
    const noop = () => {};
    act(() => {
        renderer = TestRenderer.create(React.createElement(SelectionMenuModal, {
            closeSelection: noop, hasCatalogCardsSelected: false, hasCatalogNotesSelected: false, l,
            openNoteTool: noop, openSelectionTags: noop, openResetDialog: noop, refreshSelection: noop,
            router: router as any, runSelectionAction: noop, selectedActionCardIds: selected,
            selectedCardIds: new Set(selected), selectedNoteIds: selected, setDueInput: noop,
            setPreviewAnswerVisible: noop, setPreviewIndex: noop, setRepositionShiftExisting: noop,
            setRepositionStart: noop, setRepositionStep: noop, setShowDeckPicker: noop, setShowDueDialog: noop,
            setShowGradePicker: noop, setShowNoteTypePicker: noop, setShowRepositionDialog: noop,
            setShowSelectionMenu, settings: { dayRolloverHour: 4 } as any, showSelectionMenu: true,
            styles: {} as any, t, tableMode,
        }));
    });
    return { router, setShowSelectionMenu };
}

describe('Card Info in the selection menu', () => {
    it('opens the selected card’s Card Info when exactly one card is selected', () => {
        const { router, setShowSelectionMenu } = selectionMenu([42]);
        const item = byLabel('Card info');
        expect(item.props.disabled).toBe(false);
        act(() => item.props.onPress());
        expect(setShowSelectionMenu).toHaveBeenCalledWith(false);
        expect(router.push).toHaveBeenCalledWith('/card-info?cardId=42');
    });

    it('is unavailable, and says why, while several are selected', () => {
        const { router } = selectionMenu([42, 43]);
        const item = byLabel('Card info');
        expect(item.props.disabled).toBe(true);
        expect(item.props.accessibilityState).toEqual({ disabled: true });
        expect(shownText()).toContain('Card info (select one card)');
        expect(router.push).not.toHaveBeenCalled();
    });

    it('names the note’s first card in Notes mode', () => {
        const { router } = selectionMenu([7], 'notes');
        act(() => byLabel("Info for the note's first card").props.onPress());
        expect(router.push).toHaveBeenCalledWith('/card-info?cardId=7');
    });
});

describe('Card Info in a row’s details', () => {
    it('opens Card Info for the row’s card', () => {
        const router = { push: vi.fn() };
        const item = {
            cardId: 9, noteId: 3, deckId: 1, subject: 'custom', topic: '', question: 'Soru', answer: 'Cevap',
            noteMarked: false, rawCard: { flags: 0, due: 1 }, rawNote: undefined,
            state: { status: 'review', suspended: false, buried: false, interval: 3, easeFactor: 2.5, dueDate: '2026-11-10', lastReviewedAtMs: 0, dueTime: 0 },
        };
        act(() => {
            renderer = TestRenderer.create(React.createElement(BrowserCardRow, {
                item: item as any, browserFontScale: 1, bumpDataVersion: () => {}, colors: {} as any,
                deckById: new Map(), expandedCard: 9, l, locale: 'en', noteTypes: [], reload: () => {},
                router: router as any, selectedCardIds: new Set(), selectionMode: false, setExpandedCard: () => {},
                setSelectionMode: () => {}, settings: { dayRolloverHour: 4, showBrowserAudioFilenames: false } as any,
                showAnswerSnippet: false, showScheduleDetails: false, styles: {} as any,
                subject: () => undefined, t, tableMode: 'cards', toggleCardSelection: () => {}, toggleSuspend: () => {},
            }));
        });
        act(() => byLabel('Card info').props.onPress());
        expect(router.push).toHaveBeenCalledWith('/card-info?cardId=9');
    });
});
