import { describe, expect, it } from 'vitest';
import {
    LOCAL_MEDIA_DOCUMENT_PREFIX,
    isLocalMediaDocumentFilename,
    isLocalMediaDocumentUrl,
    isReservedMediaDirectoryEntry,
    localMediaDocumentFilename,
    localMediaDocumentLocation,
    localMediaDocumentVersion,
    localMediaFileFromUrl,
    localMediaWebViewSource,
} from './localMediaDocument';
import { sanitizeMediaFilename } from './mediaFilename';

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

describe('local media document files', () => {
    it('names each WebView its own hidden document, which no stored media file can be called', () => {
        const name = localMediaDocumentFilename('a1b2c3');
        expect(name).toBe(`${LOCAL_MEDIA_DOCUMENT_PREFIX}a1b2c3.html`);
        expect(isLocalMediaDocumentFilename(name)).toBe(true);
        expect(isReservedMediaDirectoryEntry(name)).toBe(true);
        // Every stored name goes through the sanitizer, which drops a leading dot.
        expect(sanitizeMediaFilename(name).startsWith('.')).toBe(false);
        expect(isReservedMediaDirectoryEntry(sanitizeMediaFilename('.hidden.jpg'))).toBe(false);
    });

    it('keeps anything but letters, digits and dashes out of the document name', () => {
        expect(localMediaDocumentFilename('../../x?y#z')).toBe(`${LOCAL_MEDIA_DOCUMENT_PREFIX}xyz.html`);
        expect(localMediaDocumentFilename('')).toBe(`${LOCAL_MEDIA_DOCUMENT_PREFIX}doc.html`);
        for (const name of ['.tus-view-.html', '.tus-view-a/b.html', 'tus-view-a.html', '.tus-view-a.htm', '.DS_Store', 'kalp.png']) {
            expect(isLocalMediaDocumentFilename(name)).toBe(false);
        }
    });

    it('treats hidden files and its own documents as outside the media, and nothing else', () => {
        expect(isReservedMediaDirectoryEntry('.DS_Store')).toBe(true);
        expect(isReservedMediaDirectoryEntry('kalp.png')).toBe(false);
        expect(isReservedMediaDirectoryEntry('_template.css')).toBe(false);
        expect(isReservedMediaDirectoryEntry(undefined)).toBe(false);
    });

    it('gives the same content the same version, and changed content a new one', () => {
        const page = '<img src="kalp.png">';
        expect(localMediaDocumentVersion(page)).toBe(localMediaDocumentVersion(page));
        expect(localMediaDocumentVersion(page)).not.toBe(localMediaDocumentVersion(`${page} `));
        expect(localMediaDocumentVersion('ab')).not.toBe(localMediaDocumentVersion('ba'));
        expect(localMediaDocumentVersion('')).toMatch(/^[0-9a-z]+$/);
    });

    it('puts the document in the media folder itself, so bare names resolve to the media', () => {
        const location = localMediaDocumentLocation(MEDIA_BASE, 'abc', '<p>x</p>');
        expect(location?.fileUri).toBe(`${MEDIA_BASE}${LOCAL_MEDIA_DOCUMENT_PREFIX}abc.html`);
        expect(location?.uri).toBe(`${location?.fileUri}?v=${localMediaDocumentVersion('<p>x</p>')}`);
        expect(new URL('kalp.png', location?.uri).href).toBe(`${MEDIA_BASE}kalp.png`);
        expect(localMediaDocumentLocation(MEDIA_BASE.replace(/\/$/, ''), 'abc', '')?.fileUri)
            .toBe(`${MEDIA_BASE}${LOCAL_MEDIA_DOCUMENT_PREFIX}abc.html`);
    });

    it('has no file location without a file media folder, as on web', () => {
        expect(localMediaDocumentLocation('', 'abc', '')).toBeNull();
        expect(localMediaDocumentLocation(undefined, 'abc', '')).toBeNull();
        expect(localMediaDocumentLocation('https://example.com/media/', 'abc', '')).toBeNull();
    });

    it('lets a WebView load its own document in any version, and no other file', () => {
        const mine = localMediaDocumentLocation(MEDIA_BASE, 'abc', 'one')!;
        const next = localMediaDocumentLocation(MEDIA_BASE, 'abc', 'two')!;
        const other = localMediaDocumentLocation(MEDIA_BASE, 'def', 'one')!;
        expect(isLocalMediaDocumentUrl(mine.uri, MEDIA_BASE, mine.uri)).toBe(true);
        expect(isLocalMediaDocumentUrl(next.uri, MEDIA_BASE, mine.uri)).toBe(true);
        expect(isLocalMediaDocumentUrl(mine.fileUri, MEDIA_BASE, mine.uri)).toBe(true);
        expect(isLocalMediaDocumentUrl(other.uri, MEDIA_BASE, mine.uri)).toBe(false);
        expect(isLocalMediaDocumentUrl(`${mine.uri}#top`, MEDIA_BASE, mine.uri)).toBe(false);
        expect(isLocalMediaDocumentUrl(`${MEDIA_BASE}kalp.png`, MEDIA_BASE, mine.uri)).toBe(false);
        expect(isLocalMediaDocumentUrl('about:blank', MEDIA_BASE, mine.uri)).toBe(true);
        // A document address outside the media folder is never one of ours.
        expect(isLocalMediaDocumentUrl('file:///etc/x.html', MEDIA_BASE, 'file:///etc/x.html')).toBe(false);
    });

    it('never offers one of its own documents as an attachment', () => {
        const mine = localMediaDocumentLocation(MEDIA_BASE, 'abc', 'one')!;
        expect(localMediaFileFromUrl(mine.fileUri, MEDIA_BASE)).toBeNull();
        expect(localMediaFileFromUrl(`${MEDIA_BASE}.DS_Store`, MEDIA_BASE)).toBeNull();
    });
});
