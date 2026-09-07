import { describe, expect, it } from 'vitest';
import { isLocalMediaDocumentUrl, localMediaFileFromUrl, localMediaWebViewSource } from './localMediaDocument';

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

/**
 * A tapped attachment is refused as a navigation and answered as a hand-off, so the reviewer has
 * to be able to tell "this is a file the learner attached" from "this is somewhere else entirely".
 */
describe('recognising an attachment a card links to', () => {
    it('names the stored file a link inside the media directory is asking for', () => {
        expect(localMediaFileFromUrl(`${MEDIA_BASE}1757265000_notlar.pdf`, MEDIA_BASE))
            .toBe('1757265000_notlar.pdf');
        // A base written without its trailing slash still addresses the same directory.
        expect(localMediaFileFromUrl(`${MEDIA_BASE}notlar.pdf`, MEDIA_BASE.replace(/\/$/, '')))
            .toBe('notlar.pdf');
        // The name comes back as it was stored, not as the URL had to spell it.
        expect(localMediaFileFromUrl(`${MEDIA_BASE}ders%20notu.pdf`, MEDIA_BASE)).toBe('ders notu.pdf');
    });

    it('recognises nothing outside the directory itself', () => {
        for (const url of [
            `${MEDIA_BASE}alt/klasor/notlar.pdf`,
            `${MEDIA_BASE}..%2F..%2Fetc%2Fpasswd`,
            `${MEDIA_BASE}notlar.pdf?x=1`,
            `${MEDIA_BASE}notlar.pdf#page=2`,
            `${MEDIA_BASE}.gizli`,
            MEDIA_BASE,
            'file:///etc/passwd',
            'https://example.com/notlar.pdf',
            'javascript:alert(1)',
            '',
        ]) {
            expect(localMediaFileFromUrl(url, MEDIA_BASE)).toBeNull();
        }
    });

    it('recognises nothing at all when there is no media directory, as on web', () => {
        expect(localMediaFileFromUrl(`${MEDIA_BASE}notlar.pdf`, '')).toBeNull();
        expect(localMediaFileFromUrl(`${MEDIA_BASE}notlar.pdf`, undefined)).toBeNull();
    });
});
