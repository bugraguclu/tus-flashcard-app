// A "Learn more" deep link scrolls to its section once. The section's highlight changes its
// padding, so its onLayout fires again as the highlight comes and goes; that must not scroll.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ scrollTo: vi.fn() }));
vi.mock('react-native', async () => {
    const ReactModule = await import('react');
    const ScrollView = ReactModule.forwardRef((props: any, ref: any) => {
        ReactModule.useImperativeHandle(ref, () => ({ scrollTo: h.scrollTo }));
        return ReactModule.createElement('ScrollView', props, props.children);
    });
    return {
        Linking: { openURL: vi.fn() },
        Platform: { OS: 'ios', select: (spec: any) => spec.ios ?? spec.default },
        ScrollView,
        TouchableOpacity: 'TouchableOpacity',
        useWindowDimensions: () => ({ width: 390, height: 844 }),
        View: 'View',
    };
});
vi.mock('../components/ui/Button', () => ({ Button: 'Button' }));
vi.mock('../components/ui/Choice', () => ({ Chip: 'Chip' }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn(async () => true) }));
vi.mock('../components/AppText', () => ({ Text: 'Text' }));
vi.mock('../hooks/useI18n', () => ({ useI18n: () => ({ l: (_tr: string, en: string) => en }) }));
vi.mock('../hooks/useReduceMotion', () => ({ useReduceMotion: () => true }));

import HelpArticleView from '../components/help/HelpArticleView';

const article = {
    id: 'deck-options', file: 'x.md', order: 1, title: 'Deck options', summary: 'Summary', groupId: 'studying',
    introBlocks: [],
    sections: [
        { id: 'intro', level: 2, title: 'Intro', blocks: [] },
        { id: 'daily-limits', level: 2, title: 'Daily limits', blocks: [] },
    ],
} as any;
const styles = new Proxy({}, { get: () => ({}) }) as any;

let tree: TestRenderer.ReactTestRenderer | undefined;
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    h.scrollTo.mockReset();
});
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; vi.useRealTimers(); });

const section = (id: string) => tree!.root.findAll((node) => node.props.nativeID === id)[0];
const layout = (id: string, y: number) => act(() => section(id).props.onLayout({ nativeEvent: { layout: { y } } }));

it('scrolls to a deep-linked section once, not again when its highlight changes its layout', async () => {
    act(() => {
        tree = TestRenderer.create(React.createElement(HelpArticleView, {
            article, targetSectionId: 'daily-limits', styles, onOpenArticle: () => {},
        }));
    });
    layout('intro', 0);
    layout('daily-limits', 600);
    expect(h.scrollTo).toHaveBeenCalledOnce();
    expect(h.scrollTo).toHaveBeenLastCalledWith({ y: 588, animated: false });
    // The highlight's padding re-lays the section out, and so does its removal 2.2 s later.
    layout('daily-limits', 604);
    await act(async () => { await vi.advanceTimersByTimeAsync(2300); });
    layout('daily-limits', 600);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(h.scrollTo).toHaveBeenCalledOnce();
});
