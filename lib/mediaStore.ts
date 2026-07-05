/**
 * Media file storage. Card images and audio are kept by filename in a private
 * folder on native (`documentDirectory/tus-media/`) and referenced from card HTML
 * by that filename, which the WebView resolves against getMediaBaseUrl().
 *
 * On web there is no filesystem folder, so files are keyed by a `tus-media:`
 * prefix. End-to-end web media (durable storage + resolving refs in the render
 * iframe) and wiring the write path into import are still open — see audit notes.
 */

import { Platform } from 'react-native';
import { getLegacyFileSystem as getFileSystem } from './files';
import { sanitizeMediaFilename } from './mediaFilename';

export { sanitizeMediaFilename };

const WEB_MEDIA_PREFIX = 'tus-media:';

let _mediaDir: string | null = null;

function getMediaDir(): string {
    if (_mediaDir) return _mediaDir;
    _mediaDir = `${getFileSystem().documentDirectory ?? ''}tus-media/`;
    return _mediaDir;
}

export async function ensureMediaDir(): Promise<string> {
    if (Platform.OS === 'web') return WEB_MEDIA_PREFIX;

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

export async function saveMediaFile(filename: string, base64Data: string): Promise<string> {
    const safe = sanitizeMediaFilename(filename);

    if (Platform.OS === 'web') {
        const key = `${WEB_MEDIA_PREFIX}${safe}`;
        try {
            localStorage.setItem(key, base64Data);
        } catch (e) {
            console.warn('[MediaStore] web media save failed:', e);
        }
        return key;
    }

    const dir = await ensureMediaDir();
    const target = `${dir}${safe}`;
    const fs = getFileSystem();
    await fs.writeAsStringAsync(target, base64Data, { encoding: fs.EncodingType.Base64 });
    return target;
}

export function getMediaBaseUrl(): string {
    return Platform.OS === 'web' ? WEB_MEDIA_PREFIX : getMediaDir();
}
