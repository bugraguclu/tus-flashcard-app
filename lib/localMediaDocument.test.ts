import { describe, expect, it } from 'vitest';
import { isLocalMediaDocumentUrl, localMediaWebViewSource } from './localMediaDocument';

const MEDIA_BASE = 'file:///var/mobile/Containers/Data/Application/ABC/Documents/tus-media/';

describe('local media WebView source', () => {
    it('loads note content from the media directory on native', () => {
        expect(localMediaWebViewSource('<p>hi</p>', MEDIA_BASE)).toEqual({
            html: '<p>hi</p>',
            baseUrl: MEDIA_BASE,
        });
    });

    it('omits the base entirely when there is none, so web keeps its current document', () => {
        expect(localMediaWebViewSource('<p>hi</p>', '')).toEqual({ html: '<p>hi</p>' });
        expect(localMediaWebViewSource('<p>hi</p>', '   ')).toEqual({ html: '<p>hi</p>' });
        expect(localMediaWebViewSource('<p>hi</p>', undefined)).toEqual({ html: '<p>hi</p>' });
        expect('baseUrl' in localMediaWebViewSource('<p>hi</p>', '')).toBe(false);
    });
});

describe('local media document navigation', () => {
    it('allows the blank page and the media base itself, trailing slashes aside', () => {
        expect(isLocalMediaDocumentUrl('about:blank', MEDIA_BASE)).toBe(true);
        expect(isLocalMediaDocumentUrl(MEDIA_BASE, MEDIA_BASE)).toBe(true);
        expect(isLocalMediaDocumentUrl(MEDIA_BASE.replace(/\/$/, ''), MEDIA_BASE)).toBe(true);
        expect(isLocalMediaDocumentUrl(MEDIA_BASE, MEDIA_BASE.replace(/\/$/, ''))).toBe(true);
    });

    it('refuses every other destination, including neighbouring local files', () => {
        for (const url of [
            `${MEDIA_BASE}cizim.png`,
            'file:///etc/passwd',
            'file:///var/mobile/Containers/Data/Application/ABC/Documents/',
            'https://example.com',
            'http://localhost:8081/index.html',
            'data:text/html,hello',
            'blob:https://example.com/id',
            'javascript:alert(1)',
            '',
        ]) {
            expect(isLocalMediaDocumentUrl(url, MEDIA_BASE)).toBe(false);
        }
    });

    it('never treats an empty base as a match, so web allows only the blank page', () => {
        expect(isLocalMediaDocumentUrl('about:blank', '')).toBe(true);
        expect(isLocalMediaDocumentUrl('', '')).toBe(false);
        expect(isLocalMediaDocumentUrl('/', '')).toBe(false);
        expect(isLocalMediaDocumentUrl('file:///', '')).toBe(false);
        expect(isLocalMediaDocumentUrl('https://example.com', undefined)).toBe(false);
    });
});
