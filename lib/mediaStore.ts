/**
 * Media file storage. Card images and audio are kept by filename in a private
 * folder on native (`documentDirectory/tus-media/`) and referenced from card HTML
 * by that filename, which the WebView resolves against getMediaBaseUrl().
 *
 * On web, files live as Blobs in IndexedDB (`tus-media` database). Card HTML is
 * rewritten at render time by resolveWebMediaInHtml(), which swaps bare filename
 * refs for object URLs; the URLs are cached per session so a card re-render
 * costs one Map lookup, not an IndexedDB read.
 */

import { Platform } from 'react-native';
import { getLegacyFileSystem as getFileSystem } from './files';
import { sanitizeMediaFilename } from './mediaFilename';

export { sanitizeMediaFilename };

const WEB_MEDIA_DB = 'tus-media';
const WEB_MEDIA_STORE = 'files';

let _mediaDir: string | null = null;

function getMediaDir(): string {
    if (_mediaDir) return _mediaDir;
    _mediaDir = `${getFileSystem().documentDirectory ?? ''}tus-media/`;
    return _mediaDir;
}

export async function ensureMediaDir(): Promise<string> {
    if (Platform.OS === 'web') return '';

    const dir = getMediaDir();
    const fs = getFileSystem();
    try {
        const info = await fs.getInfoAsync(dir);
        if (info.exists) return dir;
    } catch {
        // Fall through and attempt to create it.
    }
    await fs.makeDirectoryAsync(dir, { intermediates: true });
    return dir;
}

// ---------- Web blob store (IndexedDB) ----------

let idbPromise: Promise<IDBDatabase> | null = null;

function openMediaDb(): Promise<IDBDatabase> {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(WEB_MEDIA_DB, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(WEB_MEDIA_STORE)) {
                request.result.createObjectStore(WEB_MEDIA_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            idbPromise = null;
            reject(request.error ?? new Error('IndexedDB open failed'));
        };
    });
    return idbPromise;
}

async function idbPut(name: string, blob: Blob): Promise<void> {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(WEB_MEDIA_STORE, 'readwrite');
        tx.objectStore(WEB_MEDIA_STORE).put(blob, name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });
}

async function idbGet(name: string): Promise<Blob | null> {
    const db = await openMediaDb();
    return new Promise((resolve, reject) => {
        const request = db.transaction(WEB_MEDIA_STORE, 'readonly')
            .objectStore(WEB_MEDIA_STORE)
            .get(name);
        request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
    });
}

async function idbKeys(): Promise<string[]> {
    const db = await openMediaDb();
    return new Promise((resolve, reject) => {
        const request = db.transaction(WEB_MEDIA_STORE, 'readonly')
            .objectStore(WEB_MEDIA_STORE)
            .getAllKeys();
        request.onsuccess = () => resolve(request.result.filter((key): key is string => typeof key === 'string'));
        request.onerror = () => reject(request.error ?? new Error('IndexedDB key listing failed'));
    });
}

async function idbDeleteMany(names: string[]): Promise<void> {
    if (names.length === 0) return;
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(WEB_MEDIA_STORE, 'readwrite');
        const store = tx.objectStore(WEB_MEDIA_STORE);
        for (const name of names) store.delete(name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete aborted'));
    });
}

// ---------- MIME resolution ----------

const EXTENSION_MIME: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
    ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac',
    webm: 'audio/webm',
    mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
};

/** Best-effort MIME type from a filename extension; empty string when unknown. */
export function guessMimeFromFilename(filename: string): string {
    const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
    return EXTENSION_MIME[ext] ?? '';
}

// ---------- Writing ----------

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Uint8Array -> base64 without Buffer/btoa, neither of which native Hermes guarantees. */
export function bytesToBase64(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
        out += B64_ALPHABET[b0 >> 2]
            + B64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)]
            + (i + 1 < bytes.length ? B64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '=')
            + (i + 2 < bytes.length ? B64_ALPHABET[b2 & 63] : '=');
    }
    return out;
}

/** Store one media file by (sanitized) filename; overwrites an existing file of the same name. */
export async function saveMediaBytes(filename: string, bytes: Uint8Array, mimeType?: string): Promise<void> {
    const safe = sanitizeMediaFilename(filename);

    if (Platform.OS === 'web') {
        // Copy into a plain ArrayBuffer: Blob rejects views over a SharedArrayBuffer,
        // which TS must assume a Uint8Array may wrap. The blob must carry a MIME type:
        // <img> sniffs a typeless blob happily, but <audio>/<video> refuse to play it.
        const type = mimeType || guessMimeFromFilename(safe);
        await idbPut(safe, new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], type ? { type } : undefined));
        // The next lookup must see the new content, not a cached miss or a stale URL.
        objectUrlCache.delete(safe);
        return;
    }

    const dir = await ensureMediaDir();
    const fs = getFileSystem();
    await fs.writeAsStringAsync(`${dir}${safe}`, bytesToBase64(bytes), { encoding: fs.EncodingType.Base64 });
}

/** Base64 variant of saveMediaBytes, for callers that already hold encoded data. */
export async function saveMediaFile(filename: string, base64Data: string): Promise<void> {
    const safe = sanitizeMediaFilename(filename);

    if (Platform.OS === 'web') {
        const raw = atob(base64Data);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        await saveMediaBytes(safe, bytes);
        return;
    }

    const dir = await ensureMediaDir();
    const fs = getFileSystem();
    await fs.writeAsStringAsync(`${dir}${safe}`, base64Data, { encoding: fs.EncodingType.Base64 });
}

/**
 * Remove every stored card attachment except the supplied catalog filenames.
 * Used only by an explicit full-collection replacement: ordinary imports remain additive.
 */
export async function removeMediaExcept(filenames: Iterable<string>): Promise<{ deleted: number; remaining: number }> {
    const keep = new Set(Array.from(filenames, sanitizeMediaFilename));

    if (Platform.OS === 'web') {
        const existing = await idbKeys();
        const stale = existing.filter((name) => !keep.has(name));
        await idbDeleteMany(stale);
        for (const name of stale) {
            const url = objectUrlCache.get(name);
            if (url) URL.revokeObjectURL(url);
            objectUrlCache.delete(name);
        }
        return { deleted: stale.length, remaining: existing.length - stale.length };
    }

    const dir = await ensureMediaDir();
    const fs = getFileSystem();
    const existing = await fs.readDirectoryAsync(dir);
    const stale = existing.filter((name) => !keep.has(name));
    for (const name of stale) {
        await fs.deleteAsync(`${dir}${name}`, { idempotent: true });
    }
    return { deleted: stale.length, remaining: existing.length - stale.length };
}

/** List stored attachment names without reading their contents. */
export async function listStoredMediaFilenames(): Promise<string[]> {
    if (Platform.OS === 'web') return idbKeys();
    const dir = await ensureMediaDir();
    return getFileSystem().readDirectoryAsync(dir);
}

/** Read a stored media file for Anki package export. Missing files return null. */
export async function readMediaBytes(filename: string): Promise<Uint8Array | null> {
    const safe = sanitizeMediaFilename(filename);
    if (Platform.OS === 'web') {
        const blob = await idbGet(safe);
        return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    }
    const fs = getFileSystem();
    const uri = `${await ensureMediaDir()}${safe}`;
    const info = await fs.getInfoAsync(uri);
    if (!info.exists) return null;
    const encoded = await fs.readAsStringAsync(uri, { encoding: fs.EncodingType.Base64 });
    const { base64ToBytes } = require('./files') as typeof import('./files');
    return base64ToBytes(encoded);
}

export function getMediaBaseUrl(): string {
    return Platform.OS === 'web' ? '' : getMediaDir();
}

// ---------- Web rendering support ----------

// filename -> object URL, or null for a confirmed miss. Session-lived; entries are
// invalidated by saveMediaBytes when a file is (re)imported.
const objectUrlCache = new Map<string, string | null>();

/** Object URL for a stored web media file, or null when it does not exist. */
export async function getWebMediaUrl(filename: string): Promise<string | null> {
    if (Platform.OS !== 'web' || typeof indexedDB === 'undefined') return null;

    const safe = sanitizeMediaFilename(filename);
    const cached = objectUrlCache.get(safe);
    if (cached !== undefined) return cached;

    try {
        let blob = await idbGet(safe);
        // Blobs stored by older builds carry no MIME type, which breaks <audio>/<video>
        // playback. Re-type them from the file extension at read time so existing
        // recordings play without needing a re-upload.
        if (blob && !blob.type) {
            const type = guessMimeFromFilename(safe);
            if (type) blob = new Blob([blob], { type });
        }
        const url = blob ? URL.createObjectURL(blob) : null;
        objectUrlCache.set(safe, url);
        return url;
    } catch (e) {
        console.warn('[MediaStore] web media lookup failed:', e);
        return null;
    }
}

const MEDIA_SRC_RE = /(<(?:img|audio|video|source)\b[^>]*\ssrc=")([^"]+)(")/gi;

/** Bare filename refs (Anki convention) need resolving; absolute/external URLs do not. */
function isBareMediaRef(src: string): boolean {
    return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(src);
}

/** Undo the HTML attribute escaping a filename may carry inside src="...". */
function decodeEntities(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

/**
 * Rewrite bare media filenames in rendered card HTML to object URLs (web only).
 * Unknown files are left untouched. Returns the input unchanged when there is
 * nothing to resolve, so callers can cheaply skip a re-render.
 */
export async function resolveWebMediaInHtml(html: string): Promise<string> {
    if (Platform.OS !== 'web') return html;

    const refs = new Set<string>();
    for (const match of html.matchAll(MEDIA_SRC_RE)) {
        if (isBareMediaRef(match[2])) refs.add(match[2]);
    }
    if (refs.size === 0) return html;

    const resolved = new Map<string, string>();
    for (const ref of refs) {
        const url = await getWebMediaUrl(decodeEntities(ref));
        if (url) resolved.set(ref, url);
    }
    if (resolved.size === 0) return html;

    return html.replace(MEDIA_SRC_RE, (full, prefix, src, suffix) => {
        const url = resolved.get(src);
        return url ? `${prefix}${url}${suffix}` : full;
    });
}
