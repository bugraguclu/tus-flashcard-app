/**
 * Cross-platform file helpers shared by screens and lib modules, so the
 * web-vs-native branching for reading picked files, downloading text, and
 * loading the classic filesystem API lives in exactly one place.
 */

import { Platform } from 'react-native';

// The classic file-system API moved to `expo-file-system/legacy` in SDK 54.
type LegacyFileSystem = typeof import('expo-file-system/legacy');
let _fs: LegacyFileSystem | null = null;

/** Lazily load the legacy filesystem API (native only — throws if required on web). */
export function getLegacyFileSystem(): LegacyFileSystem {
    if (!_fs) _fs = require('expo-file-system/legacy') as LegacyFileSystem;
    return _fs;
}

/** Read a picked/bundled asset as text: fetch on web (object/blob URLs), FS read on native. */
export async function readUriText(uri: string): Promise<string> {
    if (Platform.OS === 'web') {
        const response = await fetch(uri);
        return response.text();
    }
    return getLegacyFileSystem().readAsStringAsync(uri);
}

/** Trigger a browser download of the given text. Web only. */
export function downloadTextFileWeb(
    fileName: string,
    contents: string,
    mimeType = 'application/json',
): void {
    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}
