import { Platform } from 'react-native';

const WEB_MEDIA_PREFIX = 'tus-media:';

// eslint-disable-next-line @typescript-eslint/no-var-requires
let _fs: any = null;
let _mediaDir: string | null = null;

function getFileSystem(): any {
    if (!_fs) {
        _fs = require('expo-file-system');
    }
    return _fs;
}

function getMediaDir(): string {
    if (_mediaDir) return _mediaDir;
    const fs = getFileSystem();
    _mediaDir = `${fs.documentDirectory ?? ''}tus-media/`;
    return _mediaDir;
}

export async function ensureMediaDir(): Promise<string> {
    if (Platform.OS === 'web') return WEB_MEDIA_PREFIX;

    const dir = getMediaDir();
    if (!dir) throw new Error('Media directory is unavailable.');

    const fs = getFileSystem();
    try {
        const info = await fs.getInfoAsync(dir);
        if (!info.exists) {
            await fs.makeDirectoryAsync(dir, { intermediates: true });
        }
    } catch {
        await fs.makeDirectoryAsync(dir, { intermediates: true });
    }

    return dir;
}

export async function saveMediaFile(filename: string, base64Data: string): Promise<string> {
    if (Platform.OS === 'web') {
        const key = `${WEB_MEDIA_PREFIX}${filename}`;
        try {
            localStorage.setItem(key, base64Data);
        } catch (e) {
            console.warn('[MediaStore] localStorage save failed:', e);
        }
        return key;
    }

    const dir = await ensureMediaDir();
    const target = `${dir}${filename}`;
    const fs = getFileSystem();
    await fs.writeAsStringAsync(target, base64Data, {
        encoding: fs.EncodingType.Base64,
    });
    return target;
}

export function getMediaBaseUrl(): string {
    if (Platform.OS === 'web') return WEB_MEDIA_PREFIX;
    return getMediaDir();
}
