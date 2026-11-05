import { useEffect, useMemo, useRef } from 'react';
import { localMediaWebViewSource, type LocalMediaWebViewSource } from '../lib/localMediaDocument';
import {
    localMediaDocumentExists,
    removeLocalMediaDocument,
    usesLocalMediaDocumentFiles,
    writeLocalMediaDocument,
} from '../lib/localMediaDocumentFile';

function newDocumentId(): string {
    const bytes = new Uint8Array(8);
    globalThis.crypto?.getRandomValues?.(bytes);
    if (bytes.some(Boolean)) return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The WebView source for note content that names its media by bare filename.
 *
 * On iPhone the document is written into the media folder and loaded from there with read access
 * to the folder, which is what lets a device show the pictures and play the sounds (see
 * lib/localMediaDocument.ts). Elsewhere, and if the file cannot be written, the HTML string is
 * loaded with the folder as its base, as before.
 *
 * `documentUri` is the one address besides `about:blank` the WebView may load, for its
 * `onShouldStartLoadWithRequest`; it is null for a string document.
 */
export function useLocalMediaWebViewSource(
    html: string,
    mediaBaseUrl: string,
): { source: LocalMediaWebViewSource; documentUri: string | null } {
    const idRef = useRef<string | null>(null);
    if (!idRef.current) idRef.current = newDocumentId();
    const documentId = idRef.current;
    const latestRef = useRef({ html, mediaBaseUrl });
    latestRef.current = { html, mediaBaseUrl };

    // Written while rendering, so the file is on disk before the WebView is given its address.
    // The write is idempotent: the same content goes to the same file under the same address.
    const documentUri = useMemo(
        () => (usesLocalMediaDocumentFiles() && mediaBaseUrl ? writeLocalMediaDocument(mediaBaseUrl, documentId, html) : null),
        [documentId, html, mediaBaseUrl],
    );

    // The file goes with the WebView. A remount straight after an unmount (StrictMode, Fast
    // Refresh) finds it gone and writes it again.
    useEffect(() => {
        const base = latestRef.current.mediaBaseUrl;
        if (!usesLocalMediaDocumentFiles() || !base) return undefined;
        if (!localMediaDocumentExists(base, documentId)) writeLocalMediaDocument(base, documentId, latestRef.current.html);
        return () => removeLocalMediaDocument(base, documentId);
    }, [documentId]);

    const source = useMemo<LocalMediaWebViewSource>(
        () => (documentUri ? { uri: documentUri } : localMediaWebViewSource(html, mediaBaseUrl)),
        [documentUri, html, mediaBaseUrl],
    );
    return { source, documentUri };
}
