// iPhone Safari zooms onto a focused field with text under 16 px; the viewport stops it on iOS only.
import { describe, expect, it } from 'vitest';
import { isIosBrowser, preventIosFocusZoom, withoutFocusZoom } from './webFocusZoom';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

describe('isIosBrowser', () => {
    it('knows iPhone, and iPad reporting itself as a Mac with touch', () => {
        expect(isIosBrowser({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
        expect(isIosBrowser({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true);
    });

    it('leaves desktop Macs and Android alone', () => {
        expect(isIosBrowser({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false);
        expect(isIosBrowser({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
    });
});

describe('withoutFocusZoom', () => {
    it('adds the limit and keeps the rest of the viewport', () => {
        expect(withoutFocusZoom('width=device-width, initial-scale=1, viewport-fit=cover'))
            .toBe('width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1');
    });

    it('replaces an existing limit instead of adding a second', () => {
        expect(withoutFocusZoom('width=device-width,maximum-scale=5')).toBe('width=device-width, maximum-scale=1');
    });
});

describe('preventIosFocusZoom', () => {
    const page = (content: string) => {
        const meta = { content };
        return { meta, doc: { querySelector: () => meta } as unknown as Document };
    };

    it('changes the viewport on iPhone only', () => {
        const iphone = page('width=device-width, initial-scale=1');
        preventIosFocusZoom(iphone.doc, { userAgent: IPHONE, maxTouchPoints: 5 } as Navigator);
        expect(iphone.meta.content).toBe('width=device-width, initial-scale=1, maximum-scale=1');

        const android = page('width=device-width, initial-scale=1');
        preventIosFocusZoom(android.doc, { userAgent: ANDROID, maxTouchPoints: 5 } as Navigator);
        expect(android.meta.content).toBe('width=device-width, initial-scale=1');
    });
});
