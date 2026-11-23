import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
    platform: 'web', cached: 'blob:thumbnail' as string | null | undefined,
    read: vi.fn(), load: vi.fn(), invalidate: vi.fn(), haptic: vi.fn(),
    mediaListeners: new Set<(names: readonly string[]) => void>(),
    thumbListeners: new Set<(names: readonly string[] | null) => void>(),
    createUrl: vi.fn(), revokeUrl: vi.fn(),
}));
vi.mock('react-native', () => ({
    Platform: { get OS() { return h.platform; } },
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    Image: 'Image', View: 'View', Pressable: 'Pressable', TouchableOpacity: 'TouchableOpacity',
}));
vi.mock('../components/AppText', () => ({ Text: 'Text' }));
vi.mock('../components/ui/Choice', () => ({ Checkbox: 'Checkbox' }));
vi.mock('../components/ui/Button', () => ({ IconButton: 'IconButton', Button: 'Button' }));
vi.mock('../components/ui/Sheet', async () => ({
    AppSheet: ({ visible, children, ...props }: any) => React.createElement('Sheet', props, visible ? children : null),
}));
vi.mock('../components/ui/Menu', () => ({ MenuItem: 'MenuItem' }));
vi.mock('../components/ui/Feedback', () => ({ EmptyState: 'EmptyState', LoadingState: 'LoadingState' }));
vi.mock('../components/SwipeDismissSheet', () => ({ SheetNoDrag: 'SheetNoDrag' }));
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
vi.mock('./mediaStore', () => ({
    ensureMediaDir: async () => 'file:///media/',
    readWebMediaBlob: h.read,
    onMediaChanged: (fn: (names: readonly string[]) => void) => {
        h.mediaListeners.add(fn); return () => { h.mediaListeners.delete(fn); };
    },
}));
import { BrowserThumbnail } from '../components/browser/BrowserThumbnail';
import { BrowserImagePreviewSheet } from '../components/browser/BrowserImagePreviewSheet';
import { humanizeCardText } from './displayText';
import { BrowserCardRow } from '../components/browser/BrowserCardRow';

let tree: TestRenderer.ReactTestRenderer | undefined;
const byType = (type: string) => tree!.root.findByType(type as any);
const byTypes = (type: string) => tree!.root.findAllByType(type as any);
const render = async (element: React.ReactElement) => act(async () => { tree = TestRenderer.create(element); });
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    h.platform = 'web'; h.cached = 'blob:thumbnail';
    h.read.mockReset().mockResolvedValue(new Blob(['original'], { type: 'image/png' }));
    h.load.mockReset(); h.invalidate.mockReset(); h.haptic.mockClear();
    h.createUrl.mockReset().mockReturnValue('blob:original'); h.revokeUrl.mockClear();
    h.mediaListeners.clear(); h.thumbListeners.clear();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(h.createUrl);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(h.revokeUrl);
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
        const open = byTypes('IconButton').find(n => n.props.accessibilityLabel === 'Open image')!;
        act(() => open.props.onLongPress({ stopPropagation: vi.fn() }));
        expect(onOpenImage).toHaveBeenCalledWith('heart.png', true);
        expect(select).not.toHaveBeenCalled(); expect(route).not.toHaveBeenCalled();
        await act(async () => tree!.update(React.createElement(BrowserCardRow, { ...props, item: { ...props.item, question: 'Plain' } } as any)));
        expect(byTypes('Image')).toHaveLength(0);
    });
    it('opens the original on tap and offers the action on hold or right click without bubbling to the row', async () => {
        const onOpen = vi.fn();
        await render(React.createElement(BrowserThumbnail, { filename: 'heart.png', onOpen }));
        const stopPropagation = vi.fn(); const preventDefault = vi.fn();
        act(() => byType('IconButton').props.onPress({ stopPropagation }));
        expect(onOpen).toHaveBeenLastCalledWith('heart.png', false);
        act(() => byType('IconButton').props.onLongPress({ stopPropagation }));
        expect(onOpen).toHaveBeenLastCalledWith('heart.png', true);
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

describe('original image in the same sheet', () => {
    it('waits for Open image and then reads the full original, with no route or download', async () => {
        const onClose = vi.fn();
        const image = { filename: 'heart.png', showActions: true };
        await render(React.createElement(BrowserImagePreviewSheet, { image, onClose }));
        expect(byType('MenuItem').props.label).toBe('Open image');
        expect(h.read).not.toHaveBeenCalled();
        await act(async () => byType('MenuItem').props.onPress());
        expect(h.read).toHaveBeenCalledWith('heart.png');
        expect(byType('Image').props.source.uri).toBe('blob:original');
        expect(byType('Image').props.resizeMode).toBe('contain');
        act(() => byType('Sheet').props.onClose());
        expect(onClose).toHaveBeenCalledOnce();
        await act(async () => tree!.update(React.createElement(BrowserImagePreviewSheet, { image: null, onClose })));
        expect(h.revokeUrl).toHaveBeenCalledWith('blob:original');
        await act(async () => tree!.update(React.createElement(BrowserImagePreviewSheet, { image: { ...image }, onClose })));
        expect(byTypes('MenuItem')).toHaveLength(1);
    });

    it('reads the native original file with encoded special filename characters', async () => {
        h.platform = 'ios';
        await render(React.createElement(BrowserImagePreviewSheet, {
            image: { filename: 'heart #1?.png', showActions: false }, onClose: vi.fn(),
        }));
        expect(byType('Image').props.source.uri).toBe('file:///media/heart%20%231%3F.png');
        expect(h.read).not.toHaveBeenCalled();
    });

    it('discards a late read after closing and never creates a leaked original URL', async () => {
        let resolve!: (blob: Blob) => void;
        h.read.mockImplementationOnce(() => new Promise<Blob>(done => { resolve = done; }));
        const onClose = vi.fn();
        await render(React.createElement(BrowserImagePreviewSheet, { image: { filename: 'heart.png', showActions: false }, onClose }));
        await act(async () => tree!.update(React.createElement(BrowserImagePreviewSheet, { image: null, onClose })));
        await act(async () => resolve(new Blob(['old'])));
        expect(h.createUrl).not.toHaveBeenCalled();
    });

    it('shows a recoverable missing-image state and reloads the original after media changes', async () => {
        h.read.mockResolvedValueOnce(null);
        await render(React.createElement(BrowserImagePreviewSheet, { image: { filename: 'heart.png', showActions: false }, onClose: vi.fn() }));
        expect(byType('EmptyState').props.title).toBe('Could not open image');
        await act(async () => { h.mediaListeners.forEach(fn => fn(['unrelated.png'])); });
        expect(h.read).toHaveBeenCalledOnce();
        await act(async () => { h.mediaListeners.forEach(fn => fn(['heart.png'])); });
        expect(byType('Image').props.source.uri).toBe('blob:original');
        await act(async () => byType('Image').props.onError());
        expect(byType('EmptyState').props.action.props.label).toBe('Try again');
        await act(async () => byType('EmptyState').props.action.props.onPress());
        expect(byTypes('Image')).toHaveLength(1);
    });
});
