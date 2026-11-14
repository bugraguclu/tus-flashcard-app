// Card Info from the browser: Anki's Cards › Info shows the current card, the first card of the
// note in Notes mode (https://docs.ankiweb.net/browsing.html#cards). The browser offers it in the
// selection menu for exactly one selected row and in a row's expanded details, and opens the
// existing /card-info route for that card.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => ({
    // The shared parts animate (menus grow, buttons sink); here every animation ends at once.
    ...(await import('../test/animatedMock')).animatedModules(),
    Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.native ?? spec.default },
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {}, hairlineWidth: 1 },
    View: 'View', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', Pressable: 'Pressable',
    Modal: 'Modal', Switch: 'Switch', KeyboardAvoidingView: 'KeyboardAvoidingView',
    useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 3 }),
    AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove: () => {} }), announceForAccessibility: () => {} },
    Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: 'SafeAreaView' }));
vi.mock('react-native-svg', () => ({ default: 'Svg', Path: 'Path', Circle: 'Circle', Rect: 'Rect', Line: 'Line', Polyline: 'Polyline', Polygon: 'Polygon', G: 'G' }));
vi.mock('expo-router', () => ({ useRouter: () => ({}) }));
// The kit's dialog reads the app language for its close label.
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (_tr: string, en: string) => en, t: (key: string) => key }) }));
vi.mock('../components/AppText', () => ({ Text: 'Text', TextInput: 'TextInput' }));
vi.mock('../components/SwipeDismissSheet', async () => {
    const { createElement } = await import('react');
    return { default: ({ children }: { children: React.ReactNode }) => createElement('SwipeDismissSheet', null, children) };
});
// The menus and rows are the kit's (components/ui), which read the whole theme.
vi.mock('../constants/theme', () => {
    const colors = new Proxy({}, { get: () => '#000' });
    const sizes = new Proxy({}, { get: () => 8 });
    return {
        useThemeColors: () => colors, useIsDarkTheme: () => false,
        BorderRadius: sizes, FontSize: sizes, Spacing: sizes, Shadows: new Proxy({}, { get: () => ({}) }),
    };
});
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
            t, tableMode,
        }));
    });
    return { router, setShowSelectionMenu };
}

describe('Card Info in the selection menu', () => {
    it('opens the selected card’s Card Info when exactly one card is selected', () => {
        const { router, setShowSelectionMenu } = selectionMenu([42]);
        const item = byLabel('Card info');
        expect(item.props.disabled).toBe(false);
        vi.useFakeTimers();
        try {
            act(() => item.props.onPress());
            expect(setShowSelectionMenu).toHaveBeenCalledWith(false);
            // On iPhone the next screen opens once the sheet's modal has gone.
            act(() => { vi.runAllTimers(); });
        } finally {
            vi.useRealTimers();
        }
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
        vi.useFakeTimers();
        try {
            act(() => byLabel("Info for the note's first card").props.onPress());
            act(() => { vi.runAllTimers(); });
        } finally {
            vi.useRealTimers();
        }
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
                router: router as any, selectedCardIds: new Set<number>(), selectionMode: false, setExpandedCard: () => {},
                setSelectionMode: () => {}, settings: { dayRolloverHour: 4, showBrowserAudioFilenames: false } as any,
                showAnswerSnippet: false, showScheduleDetails: false, styles: {} as any,
                subject: () => undefined, t, tableMode: 'cards', toggleCardSelection: () => {}, toggleSuspend: () => {},
            }));
        });
        act(() => byLabel('Card info').props.onPress());
        expect(router.push).toHaveBeenCalledWith('/card-info?cardId=9');
    });
});
