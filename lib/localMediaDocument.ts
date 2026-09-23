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
