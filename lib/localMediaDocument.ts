/**
 * How a WebView is pointed at the local media directory.
 *
 * Anki addresses media by bare filename (`<img src="cizim.png">`), and both surfaces that show
 * note content — the reviewer and the note editor — keep that exact text. Instead of rewriting
 * the HTML to absolute paths, the WebView is loaded with the media directory as its base URL and
 * the browser resolves the names itself. That is what lets the editor round-trip a field through
 * `innerHTML` without ever persisting a `file://` path into the note.
 *
 * The base URL is also the only document such a WebView may load besides `about:blank`; every
 * other navigation stays refused, so local content cannot walk the WebView somewhere else.
 */

export type LocalMediaWebViewSource = { html: string; baseUrl?: string };

/**
 * Source for a WebView that renders note content. Web has no file base — media lives in
 * IndexedDB behind object URLs there — so the document is loaded without one.
 */
export function localMediaWebViewSource(html: string, mediaBaseUrl: unknown): LocalMediaWebViewSource {
    const baseUrl = typeof mediaBaseUrl === 'string' ? mediaBaseUrl.trim() : '';
    return baseUrl ? { html, baseUrl } : { html };
}

/** True only for the documents a media-backed WebView is allowed to load: blank, or its own base. */
export function isLocalMediaDocumentUrl(url: unknown, mediaBaseUrl: unknown): boolean {
    if (typeof url !== 'string' || !url) return false;
    if (url === 'about:blank') return true;
    if (typeof mediaBaseUrl !== 'string') return false;
    const base = mediaBaseUrl.trim().replace(/\/+$/, '');
    if (!base) return false;
    return url.replace(/\/+$/, '') === base;
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
    return name.normalize('NFC');
}
