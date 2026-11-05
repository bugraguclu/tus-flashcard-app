/**
 * How a WebView is pointed at the local media directory.
 *
 * Anki addresses media by bare filename (`<img src="cizim.png">`), and both surfaces that show
 * note content — the reviewer and the note editor — keep that exact text. Instead of rewriting
 * the HTML to absolute paths, the document is placed in the media directory and the browser
 * resolves the names itself. That is what lets the editor round-trip a field through `innerHTML`
 * without ever persisting a `file://` path into the note.
 *
 * On iPhone the document is a file written into the media folder and loaded with read access to
 * that folder (`loadFileURL:allowingReadAccessToURL:`). An HTML string loaded with the folder as
 * its base URL is not enough on a device: WebKit gives the processes that read a page's
 * subresources no sandbox access to the base directory, so every picture came up as a broken "?"
 * and every sound as an error, while the simulator, which has no such sandbox, showed them all.
 * WebKit fixed that only in July 2026 (bugs.webkit.org/show_bug.cgi?id=318626), after the iOS
 * versions this app runs on.
 *
 * The document is also the only page such a WebView may load besides `about:blank`; every other
 * navigation stays refused, so local content cannot walk the WebView somewhere else.
 */

export type LocalMediaWebViewSource = { html: string; baseUrl?: string } | { uri: string };

/**
 * Every document a WebView reads from the media folder is named with this prefix. The leading dot
 * keeps it apart from the collection's media: a stored file never starts with one, because
 * `sanitizeMediaFilename` strips it, and the media listings skip such names.
 */
export const LOCAL_MEDIA_DOCUMENT_PREFIX = '.tus-view-';

/**
 * Source for a WebView that renders note content from an HTML string. Web has no file base —
 * media lives in IndexedDB behind object URLs there — so the document is loaded without one.
 */
export function localMediaWebViewSource(html: string, mediaBaseUrl: unknown): { html: string; baseUrl?: string } {
    const baseUrl = typeof mediaBaseUrl === 'string' ? mediaBaseUrl.trim() : '';
    return baseUrl ? { html, baseUrl } : { html };
}

/** True for a name in the media folder that is not collection media: a hidden file or one of our documents. */
export function isReservedMediaDirectoryEntry(name: unknown): boolean {
    return typeof name === 'string' && name.startsWith('.');
}

/** The media folder's own address with exactly one trailing slash, or '' when there is none. */
function folderUrl(mediaBaseUrl: unknown): string {
    if (typeof mediaBaseUrl !== 'string') return '';
    const base = mediaBaseUrl.trim().replace(/\/+$/, '');
    return base ? `${base}/` : '';
}

/** The file one WebView's document is written to. Only letters, digits and dashes reach the name. */
export function localMediaDocumentFilename(instanceId: string): string {
    const safe = String(instanceId).replace(/[^A-Za-z0-9-]/g, '').slice(0, 48) || 'doc';
    return `${LOCAL_MEDIA_DOCUMENT_PREFIX}${safe}.html`;
}

/** True for a name `localMediaDocumentFilename` could have produced. */
export function isLocalMediaDocumentFilename(name: unknown): boolean {
    return typeof name === 'string'
        && name.startsWith(LOCAL_MEDIA_DOCUMENT_PREFIX)
        && /^[A-Za-z0-9-]+\.html$/.test(name.slice(LOCAL_MEDIA_DOCUMENT_PREFIX.length));
}

/**
 * A short fingerprint of a document's text (cyrb53). The WebView skips a load whose address equals
 * the one it shows, so the address carries this as its query: rewriting the same file with new
 * content then still reloads it, and the same content twice gives the same address.
 */
export function localMediaDocumentVersion(html: string): string {
    let h1 = 0xdeadbeef ^ html.length;
    let h2 = 0x41c6ce57 ^ html.length;
    for (let index = 0; index < html.length; index += 1) {
        const code = html.charCodeAt(index);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Where one WebView's document lives, and the address that loads this version of it. */
export function localMediaDocumentLocation(
    mediaBaseUrl: unknown,
    instanceId: string,
    html: string,
): { fileUri: string; uri: string } | null {
    const folder = folderUrl(mediaBaseUrl);
    if (!folder.startsWith('file://')) return null;
    const fileUri = `${folder}${localMediaDocumentFilename(instanceId)}`;
    return { fileUri, uri: `${fileUri}?v=${localMediaDocumentVersion(html)}` };
}

/**
 * True only for the documents a media-backed WebView is allowed to load: blank, the media base
 * (where an HTML string is loaded), or the WebView's own document file in any of its versions.
 * A fragment is refused, as it was for the string document: a card cannot navigate in place.
 */
export function isLocalMediaDocumentUrl(url: unknown, mediaBaseUrl: unknown, documentUri?: unknown): boolean {
    if (typeof url !== 'string' || !url) return false;
    if (url === 'about:blank') return true;
    if (typeof mediaBaseUrl !== 'string') return false;
    const base = mediaBaseUrl.trim().replace(/\/+$/, '');
    if (!base) return false;
    if (url.replace(/\/+$/, '') === base) return true;
    if (typeof documentUri !== 'string' || !documentUri || url.includes('#')) return false;
    const documentPath = documentUri.split(/[?#]/)[0];
    return documentPath.startsWith(`${base}/`) && url.split('?')[0] === documentPath;
}

/**
 * The stored file a tapped link points at, when the WebView resolved it inside the media folder.
 *
 * An attached file is linked by its bare name (`<a href="notlar.pdf">`), which the WebView
 * resolves against the media base before asking whether it may navigate there. Only a direct
 * child of the base counts: a deeper path, a query, a fragment or an escape that decodes to a
 * separator is not a file of this collection, and the navigation stays refused like any other.
 */
export function localMediaFileFromUrl(url: unknown, mediaBaseUrl: unknown): string | null {
    if (typeof url !== 'string' || typeof mediaBaseUrl !== 'string') return null;
    const base = mediaBaseUrl.trim().replace(/\/+$/, '');
    if (!base || !url.startsWith(`${base}/`)) return null;
    const encoded = url.slice(base.length + 1);
    if (!encoded || /[/?#\\]/.test(encoded)) return null;
    let name: string;
    try {
        name = decodeURIComponent(encoded);
    } catch {
        return null;
    }
    if (!name.trim() || name === '.' || name === '..' || /[\\/]|\p{Cc}/u.test(name)) return null;
    // One of the app's own documents is never an attachment.
    if (isReservedMediaDirectoryEntry(name)) return null;
    return name.normalize('NFC');
}
