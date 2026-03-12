import * as FileSystem from 'expo-file-system';

const MEDIA_DIR = `${FileSystem.documentDirectory ?? ''}tus-media/`;

export async function ensureMediaDir(): Promise<string> {
    if (!MEDIA_DIR) {
        throw new Error('Media directory is unavailable.');
    }

    try {
        const info = await FileSystem.getInfoAsync(MEDIA_DIR);
        if (!info.exists) {
            await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
        }
    } catch {
        await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
    }

    return MEDIA_DIR;
}

export async function saveMediaFile(filename: string, base64Data: string): Promise<string> {
    const dir = await ensureMediaDir();
    const target = `${dir}${filename}`;
    await FileSystem.writeAsStringAsync(target, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
    });
    return target;
}

export function getMediaBaseUrl(): string {
    return MEDIA_DIR || '';
}
