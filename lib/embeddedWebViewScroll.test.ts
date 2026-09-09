import { describe, expect, it } from 'vitest';
import {
    embeddedWebViewLayout,
    stableMeasuredHeight,
    type EmbeddedWebViewScrollMode,
} from './embeddedWebViewScroll';

function cardLayout(scrollMode: EmbeddedWebViewScrollMode, measuredHeight: number | null) {
    return embeddedWebViewLayout({
        scrollMode,
        minHeight: 140,
        measuredHeight,
        initialHeight: 260,
        containedHeight: 420,
    });
}

describe('embedded WebView scroll ownership', () => {
    it.each([
        ['first frame', null],
        ['long question', 1_240],
        ['long answer', 1_860],
        ['large image after load', 2_400],
    ])('keeps the parent as reviewer owner for %s', (_fixture, measuredHeight) => {
        expect(cardLayout('intrinsic', measuredHeight)).toMatchObject({
            scrollEnabled: false,
            scrollOwner: 'parent',
        });
    });

    it('keeps a bounded preview internally scrollable before and after measurement', () => {
        expect(cardLayout('contained', null)).toEqual({
            frameHeight: 420,
            scrollEnabled: true,
            scrollOwner: 'webview',
        });
        expect(cardLayout('contained', 2_400)).toEqual({
            frameHeight: 420,
            scrollEnabled: true,
            scrollOwner: 'webview',
        });
    });

    it('keeps long editor text WebView-owned across fallback and WebView measurements', () => {
        const fallback = embeddedWebViewLayout({
            scrollMode: 'contained',
            minHeight: 58,
            measuredHeight: null,
            initialHeight: 58,
            containedHeight: 58,
        });
        const webView = embeddedWebViewLayout({
            scrollMode: 'contained',
            minHeight: 58,
            measuredHeight: 320,
            initialHeight: 58,
            containedHeight: 320,
        });

        expect(fallback).toEqual({
            frameHeight: 58,
            scrollEnabled: true,
            scrollOwner: 'webview',
        });
        expect(webView).toEqual({
            frameHeight: 320,
            scrollEnabled: true,
            scrollOwner: 'webview',
        });
    });

    it('coalesces duplicate and one-pixel height jitter', () => {
        expect(stableMeasuredHeight(null, 900.4, 140)).toBe(900);
        expect(stableMeasuredHeight(900, 900.8, 140)).toBe(900);
        expect(stableMeasuredHeight(900, 903, 140)).toBe(903);
        expect(stableMeasuredHeight(900, Number.NaN, 140)).toBe(900);
    });
});
