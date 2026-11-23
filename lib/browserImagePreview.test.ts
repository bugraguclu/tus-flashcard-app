import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    platform: 'web', cached: 'blob:thumbnail' as string | null | undefined,
    load: vi.fn(), invalidate: vi.fn(), haptic: vi.fn(),
    thumbListeners: new Set<(names: readonly string[] | null) => void>(),
}));
vi.mock('react-native', () => ({
    Platform: { get OS() { return h.platform; } },
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    Image: 'Image', View: 'View', Pressable: 'Pressable', TouchableOpacity: 'TouchableOpacity',
}));
vi.mock('../components/AppText', () => ({ Text: 'Text' }));
vi.mock('../components/ui/Choice', () => ({ Checkbox: 'Checkbox', SegmentedControl: 'SegmentedControl' }));
vi.mock('../components/CardWebView', () => ({ default: 'CardWebView' }));
vi.mock('../components/SwipeDismissSheet', () => ({ SheetNoDrag: 'SheetNoDrag' }));
vi.mock('../components/ui/Dialog', () => ({
    AppDialog: ({ visible, children, ...props }: any) => React.createElement('Dialog', props, visible ? children : null),
}));
vi.mock('../components/ui/Button', () => ({ IconButton: 'IconButton', Button: 'Button' }));
vi.mock('../components/ui/Sheet', async () => ({
    AppSheet: ({ visible, children, ...props }: any) => React.createElement('Sheet', props, visible ? children : null),
}));
vi.mock('../components/ui/Feedback', () => ({ EmptyState: 'EmptyState', LoadingState: 'LoadingState' }));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (_tr: string, en: string) => en }) }));
vi.mock('../constants/theme', () => ({
    useThemeColors: () => ({ border: 'border', bgInput: 'input' }),
    FontSize: new Proxy({}, { get: () => 14 }), Spacing: new Proxy({}, { get: () => 8 }),
}));
vi.mock('../components/ui/tokens', () => ({ Radius: { control: 8 }, Type: {}, Shadow: {} }));
vi.mock('react-native-svg', () => ({ default: 'Svg', Path: 'Path', Circle: 'Circle', Rect: 'Rect', Line: 'Line', Polyline: 'Polyline', Polygon: 'Polygon', G: 'G' }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('./db', () => ({ getDB: () => { throw new Error('No DB in this component test'); } }));
vi.mock('./haptics', () => ({ longPressHaptic: h.haptic }));
vi.mock('./mediaThumbnails', () => ({
    getCachedBrowserThumbnail: () => h.cached,
    loadBrowserThumbnail: h.load,
    invalidateMediaThumbnails: h.invalidate,
    onBrowserThumbnailsInvalidated: (fn: (names: readonly string[] | null) => void) => {
        h.thumbListeners.add(fn); return () => { h.thumbListeners.delete(fn); };
    },
}));
import { BrowserThumbnail } from '../components/browser/BrowserThumbnail';
import { BrowserImagePreviewSheet } from '../components/browser/BrowserImagePreviewSheet';
import { humanizeCardText } from './displayText';
import { BrowserCardRow } from '../components/browser/BrowserCardRow';
import { EditorPreviewModal } from '../components/editor/EditorPreviewModal';
import { BUILTIN_NOTE_TYPES, type AnkiCard, type Note } from './models';
import { renderCardHtml } from './templates';

let tree: TestRenderer.ReactTestRenderer | undefined;
const byType = (type: string) => tree!.root.findByType(type as any);
const byTypes = (type: string) => tree!.root.findAllByType(type as any);
const render = async (element: React.ReactElement) => act(async () => { tree = TestRenderer.create(element); });
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    h.platform = 'web'; h.cached = 'blob:thumbnail';
    h.load.mockReset(); h.invalidate.mockReset(); h.haptic.mockClear();
    h.thumbListeners.clear();
});
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; vi.restoreAllMocks(); });

describe('thumbnail interaction inside the Browser', () => {
    it('connects the image row to the in-place viewer and leaves plain rows without a leading icon', async () => {
        const onOpenImage = vi.fn(); const select = vi.fn(); const route = vi.fn();
        const props = {
            item: { cardId: 1, deckId: 1, subject: 'custom', topic: '', question: '<img src="heart.png">Kalp', answer: 'Yanıt',
                state: { status: 'new', suspended: false, buried: false }, rawCard: { flags: 0, due: 1 } },
            browserFontScale: 1, colors: {}, deckById: new Map(), expandedCard: null,
            l: (_tr: string, en: string) => en, locale: 'en', noteTypes: [],
            router: { push: route }, selectedCardIds: new Set(), selectionMode: false,
            setExpandedCard: vi.fn(), setSelectionMode: select, settings: {}, showAnswerSnippet: false,
            showImageThumbnails: true, onOpenImage, showScheduleDetails: false, styles: {},
            subject: () => undefined, t: (k: string) => k, tableMode: 'cards',
            bumpDataVersion: vi.fn(), reload: vi.fn(), toggleCardSelection: select, toggleSuspend: vi.fn(),
        };
        await render(React.createElement(BrowserCardRow, props as any));
        const text = () => tree!.root.findAllByType('Text' as any).map(n => n.props.children).join(' ');
        expect(text()).toContain('Görsel Kalp');
        expect(text()).not.toContain('🖼');
        const open = byTypes('IconButton').find(n => n.props.accessibilityLabel === 'Preview card')!;
        act(() => open.props.onLongPress({ stopPropagation: vi.fn() }));
        expect(onOpenImage).toHaveBeenCalledWith(props.item);
        expect(select).not.toHaveBeenCalled(); expect(route).not.toHaveBeenCalled();
        await act(async () => tree!.update(React.createElement(BrowserCardRow, { ...props, item: { ...props.item, question: 'Plain' } } as any)));
        expect(byTypes('Image')).toHaveLength(0);
    });
    it('opens directly on tap, hold and right click without bubbling to the row', async () => {
        const onOpen = vi.fn();
        await render(React.createElement(BrowserThumbnail, { filename: 'heart.png', onOpen }));
        const stopPropagation = vi.fn(); const preventDefault = vi.fn();
        act(() => byType('IconButton').props.onPress({ stopPropagation }));
        expect(onOpen).toHaveBeenLastCalledWith();
        act(() => byType('IconButton').props.onLongPress({ stopPropagation }));
        expect(onOpen).toHaveBeenLastCalledWith();
        act(() => byType('IconButton').props.onContextMenu({ stopPropagation, preventDefault }));
        expect(stopPropagation).toHaveBeenCalledTimes(3);
        expect(preventDefault).toHaveBeenCalledOnce();
        expect(h.haptic).toHaveBeenCalledTimes(2);
        expect(byType('Image').props.source.uri).toBe('blob:thumbnail');
    });

    it('removes the image emoji from image markup, keeping words and authored emoji intact', () => {
        const raw = '<img src="heart.png">Kalp 🖼️ notu';
        expect(humanizeCardText(raw, { showImageIcon: false })).toBe('Görsel Kalp 🖼️ notu');
        expect(humanizeCardText('{{c1::image-occlusion:rect:left=.1}}', { showImageIcon: false })).toBe('Görüntü örtme');
        expect(humanizeCardText('<img src="heart.png">')).toBe('🖼️ Görsel');
    });

    it('refreshes a mounted thumbnail and ignores a late obsolete decode', async () => {
        await render(React.createElement(BrowserThumbnail, { filename: 'heart.png', onOpen: vi.fn() }));
        let old!: (uri: string) => void;
        h.cached = undefined;
        h.load.mockImplementationOnce(() => new Promise<string>(resolve => { old = resolve; }));
        await act(async () => { h.thumbListeners.forEach(fn => fn(['heart.png'])); });
        h.load.mockResolvedValue('blob:new');
        await act(async () => { h.thumbListeners.forEach(fn => fn(['heart.png'])); });
        await act(async () => old('blob:old'));
        expect(byType('Image').props.source.uri).toBe('blob:new');
    });

    it('shows no fallback emoji or button when the image is missing', async () => {
        h.cached = null;
        await render(React.createElement(BrowserThumbnail, { filename: 'missing.png', onOpen: vi.fn() }));
        expect(byTypes('Image')).toHaveLength(0);
        expect(byTypes('IconButton')).toHaveLength(0);
    });
});

const noteType = BUILTIN_NOTE_TYPES[0];
const note: Note = {
    id: 42, guid: 'image-preview', noteTypeId: noteType.id, mod: 0, usn: -1, tags: [],
    fields: ['Soru <img src="front.png"><img src="front-detail.png">', 'Cevap <img src="back.png">'],
    sfld: 'Soru', csum: 0, flags: 0,
};
const card: AnkiCard = {
    id: 43, noteId: note.id, deckId: 1, ord: 0, mod: 0, usn: -1, type: 0, queue: 0,
    due: 1, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
};
const payload = { note, card, noteType };
const previewProps = { visible: true, payload, deck: null, audioPlaybackRate: 1.25, onClose: vi.fn() };
function renderedSideHtml() {
    const props = byType('CardWebView').props;
    return renderCardHtml(props.noteType, props.note, props.card.ord, props.side);
}

describe('question and answer preview above the Browser', () => {
    it('shows the card immediately and switches every image to its template side, with the same content as Add Card', async () => {
        await render(React.createElement(BrowserImagePreviewSheet, previewProps));
        expect(byTypes('MenuItem')).toHaveLength(0);
        expect(byType('Sheet').props.title).toBe('Preview');
        expect(byTypes('SheetNoDrag')).toHaveLength(1);
        const segments = byType('SegmentedControl');
        expect(segments.props.options).toEqual([
            { value: 'question', label: 'Question' }, { value: 'answer', label: 'Answer' },
        ]);
        expect(segments.props.value).toBe('question');
        expect(renderedSideHtml()).toContain('front.png');
        expect(renderedSideHtml()).toContain('front-detail.png');
        expect(renderedSideHtml()).not.toContain('back.png');
        await act(async () => segments.props.onChange('answer'));
        expect(byType('CardWebView').props.side).toBe('answer');
        // Basic's answer includes FrontSide, so all three originals must remain in the preview.
        expect(renderedSideHtml()).toContain('front.png');
        expect(renderedSideHtml()).toContain('front-detail.png');
        expect(renderedSideHtml()).toContain('back.png');
        expect(byType('CardWebView').props.audioPlaybackRate).toBe(1.25);
        expect(byType('CardWebView').props.scrollMode).toBe('contained');
        const browserHtml = renderedSideHtml();
        await act(async () => tree!.update(React.createElement(EditorPreviewModal, {
            visible: true, payload, side: 'answer', onSideChange: vi.fn(), bodyHeight: 400,
            audioPlaybackRate: 1.25, onClose: vi.fn(), deck: null, styles: {},
            l: (_tr: string, en: string) => en, t: (key: string) => key,
        } as any)));
        expect(renderedSideHtml()).toBe(browserHtml);
        expect(byTypes('SheetNoDrag')).toHaveLength(0);
    });

    it('shows a back-only image after switching to Answer and respects a reversed card ordinal', async () => {
        const reversed = BUILTIN_NOTE_TYPES.find(type => type.id === 2)!;
        const backOnly = { ...note, fields: ['Metin soru', '<img src="back-only.png">'] };
        await render(React.createElement(BrowserImagePreviewSheet, { ...previewProps, payload: { ...payload, note: backOnly } }));
        expect(renderedSideHtml()).not.toContain('back-only.png');
        act(() => byType('SegmentedControl').props.onChange('answer'));
        expect(renderedSideHtml()).toContain('back-only.png');
        await act(async () => tree!.update(React.createElement(BrowserImagePreviewSheet, {
            ...previewProps, payload: { note: { ...backOnly, noteTypeId: reversed.id },
                noteType: reversed, card: { ...card, id: 44, ord: 1 } },
        })));
        expect(byType('SegmentedControl').props.value).toBe('question');
        expect(renderedSideHtml()).toContain('back-only.png');
    });

    it('closes in place and starts on Question when reopened', async () => {
        const onClose = vi.fn();
        await render(React.createElement(BrowserImagePreviewSheet, { ...previewProps, onClose }));
        act(() => byType('SegmentedControl').props.onChange('answer'));
        act(() => byType('Sheet').props.onClose());
        expect(onClose).toHaveBeenCalledOnce();
        await act(async () => tree!.update(React.createElement(BrowserImagePreviewSheet, { ...previewProps, visible: false, onClose })));
        expect(byTypes('CardWebView')).toHaveLength(0);
        await act(async () => tree!.update(React.createElement(BrowserImagePreviewSheet, { ...previewProps, onClose })));
        expect(byType('CardWebView').props.side).toBe('question');
    });

    it('names an unavailable card instead of showing a blank viewer', async () => {
        await render(React.createElement(BrowserImagePreviewSheet, { ...previewProps, payload: null }));
        expect(byType('EmptyState').props.title).toBe('Could not preview the card.');
        expect(byTypes('CardWebView')).toHaveLength(0);
    });
});
