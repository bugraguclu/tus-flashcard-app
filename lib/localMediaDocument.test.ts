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

describe('local media file links', () => {
    it('names the stored file a tapped attachment link resolved to', () => {
        expect(localMediaFileFromUrl(`${MEDIA_BASE}notlar.pdf`, MEDIA_BASE)).toBe('notlar.pdf');
        expect(localMediaFileFromUrl(`${MEDIA_BASE}1793193341059_Kardiyoloji%20notlar%C4%B1.pdf`, MEDIA_BASE))
            .toBe('1793193341059_Kardiyoloji notları.pdf');
        expect(localMediaFileFromUrl(`${MEDIA_BASE}notlar.pdf`, MEDIA_BASE.replace(/\/$/, ''))).toBe('notlar.pdf');
    });

    it('returns the composed form of a name, as attachments are stored', () => {
        // "ı" is already single; "ö" decomposed as o + U+0308 must come back as one character.
        expect(localMediaFileFromUrl(`${MEDIA_BASE}o%CC%88zet.pdf`, MEDIA_BASE)).toBe('özet.pdf');
    });

    it('is not a file link for the base itself or anything outside the media folder', () => {
        for (const url of [
            MEDIA_BASE,
            MEDIA_BASE.replace(/\/$/, ''),
            `${MEDIA_BASE}alt/notlar.pdf`,
            `${MEDIA_BASE}..%2Fcollection.anki2`,
            `${MEDIA_BASE}%2E%2E`,
            `${MEDIA_BASE}notlar.pdf?x=1`,
            `${MEDIA_BASE}notlar.pdf#page=2`,
            `${MEDIA_BASE}a%5Cb.pdf`,
            `${MEDIA_BASE}%E0%A4%A`,
            `${MEDIA_BASE}%0A.pdf`,
            'file:///var/mobile/Containers/Data/Application/ABC/Documents/collection.anki2',
            'https://example.com/notlar.pdf',
            'about:blank',
        ]) {
            expect(localMediaFileFromUrl(url, MEDIA_BASE)).toBeNull();
        }
    });

    it('needs a real base, so web never mistakes a link for a stored file', () => {
        expect(localMediaFileFromUrl('notlar.pdf', '')).toBeNull();
        expect(localMediaFileFromUrl('/notlar.pdf', '')).toBeNull();
        expect(localMediaFileFromUrl(`${MEDIA_BASE}notlar.pdf`, undefined)).toBeNull();
        expect(localMediaFileFromUrl(undefined, MEDIA_BASE)).toBeNull();
    });
});
