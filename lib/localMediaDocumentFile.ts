/**
 * The document files iPhone WebViews load their note content from (see lib/localMediaDocument.ts
 * for why they are files at all).
 *
 * Each WebView owns one file in the media folder, named after the WebView, and rewrites it when its
 * content changes. The write is synchronous, so the file is on disk before the WebView is handed its
 * address in the same render. A file is deleted when its WebView goes; whatever an earlier run left
 * behind (the app killed with an editor open) is swept a few seconds after the first write.
 */

import { Platform } from 'react-native';
import { getLegacyFileSystem } from './files';
import { isLocalMediaDocumentFilename, localMediaDocumentLocation } from './localMediaDocument';

type ModernFileSystem = Pick<typeof import('expo-file-system'), 'File' | 'Directory'>;

let modernFileSystem: ModernFileSystem | null = null;

/** The synchronous file API, loaded only on a device: web never writes these documents. */
function fileSystem(): ModernFileSystem {
    if (!modernFileSystem) modernFileSystem = require('expo-file-system') as ModernFileSystem;
    return modernFileSystem;
}

/** Tests run without the native module: they hand in a stand-in instead. */
export function setLocalMediaDocumentFileSystemForTesting(fs: unknown): void {
    modernFileSystem = fs as ModernFileSystem | null;
    liveDocuments.clear();
    if (sweepTimer) clearTimeout(sweepTimer);
    sweepTimer = null;
    swept = true;
}

/**
 * Marks the file as UTF-8. A page read from a file has no HTTP charset and these documents declare
 * none, so WebKit fell back to Latin-1: "Ön yazın…" came out as "Ã–n yazÄ±nâ€¦". A byte order mark
 * decides the encoding before anything in the page is read, and the parser drops it.
 */
const UTF8_BOM = '\uFEFF';

/** Files some mounted WebView still shows, which the sweep must leave alone. */
const liveDocuments = new Set<string>();
let sweepTimer: ReturnType<typeof setTimeout> | null = null;
let swept = false;

/** Only the iPhone build loads its WebViews from files. */
export function usesLocalMediaDocumentFiles(): boolean {
    return Platform.OS === 'ios';
}

/**
 * Write one WebView's document and return the address to load it from, or null when it cannot be
 * written, in which case the caller loads the HTML string as before.
 */
export function writeLocalMediaDocument(mediaBaseUrl: string, instanceId: string, html: string): string | null {
    if (!usesLocalMediaDocumentFiles()) return null;
    const location = localMediaDocumentLocation(mediaBaseUrl, instanceId, html);
    if (!location) return null;
    try {
        const { File, Directory } = fileSystem();
        const folder = new Directory(mediaBaseUrl);
        if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
        new File(location.fileUri).write(`${UTF8_BOM}${html}`);
        liveDocuments.add(location.fileUri);
        scheduleSweep(mediaBaseUrl);
        return location.uri;
    } catch (error) {
        console.warn('[localMediaDocument] could not write the WebView document:', error);
        return null;
    }
}

/** True when the document a WebView was given is still on disk. */
export function localMediaDocumentExists(mediaBaseUrl: string, instanceId: string): boolean {
    const location = localMediaDocumentLocation(mediaBaseUrl, instanceId, '');
    if (!location) return false;
    try {
        return new (fileSystem().File)(location.fileUri).exists;
    } catch {
        return false;
    }
}

/** Delete a WebView's document once nothing shows it. */
export function removeLocalMediaDocument(mediaBaseUrl: string, instanceId: string): void {
    const location = localMediaDocumentLocation(mediaBaseUrl, instanceId, '');
    if (!location) return;
    liveDocuments.delete(location.fileUri);
    try {
        const file = new (fileSystem().File)(location.fileUri);
        if (file.exists) file.delete();
    } catch (error) {
        console.warn('[localMediaDocument] could not delete the WebView document:', error);
    }
}

function scheduleSweep(mediaBaseUrl: string): void {
    if (swept || sweepTimer) return;
    sweepTimer = setTimeout(() => {
        swept = true;
        sweepTimer = null;
        void sweepLocalMediaDocuments(mediaBaseUrl).catch((error) => {
            console.warn('[localMediaDocument] sweep failed:', error);
        });
    }, 4000);
}

/** Delete the documents no mounted WebView shows: leftovers of an earlier run. Returns how many went. */
export async function sweepLocalMediaDocuments(mediaBaseUrl: string): Promise<number> {
    const folder = mediaBaseUrl.replace(/\/+$/, '');
    if (!folder.startsWith('file://')) return 0;
    const legacy = getLegacyFileSystem();
    let names: string[];
    try {
        names = await legacy.readDirectoryAsync(`${folder}/`);
    } catch {
        return 0;
    }
    let removed = 0;
    for (const name of names) {
        if (!isLocalMediaDocumentFilename(name)) continue;
        const fileUri = `${folder}/${name}`;
        // Checked at deletion time: a WebView may have written its document since the listing.
        if (liveDocuments.has(fileUri)) continue;
        try {
            await legacy.deleteAsync(fileUri, { idempotent: true });
            removed += 1;
        } catch (error) {
            console.warn('[localMediaDocument] could not delete a stale document:', error);
        }
    }
    return removed;
}
