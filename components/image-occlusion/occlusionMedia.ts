/**
 * The picture behind an Image Occlusion note: where to show a stored media file from, its size,
 * and picking a new one into the media folder. Everything stays on the device.
 */

import { Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getMediaBaseUrl, getWebMediaUrl, saveMediaFromUri } from '../../lib/mediaStore';
import { attachmentMediaFilename, mediaFilenameForPickedAsset } from '../../lib/mediaFilename';
import { soundSafeMediaFilename } from '../../lib/mediaAttachment';
import { promptPermissionSettings } from '../../lib/permissions';
import { translateActive } from '../../lib/i18n';
import type { Size } from './occlusionEditorModel';

/** A URI an `<Image>` can show a stored media file from, or null when it is not there. */
export async function mediaDisplayUri(filename: string): Promise<string | null> {
    if (Platform.OS === 'web') return getWebMediaUrl(filename);
    const base = getMediaBaseUrl();
    return base ? `${base}${encodeURIComponent(filename)}` : null;
}

export function imageSize(uri: string): Promise<Size> {
    return new Promise((resolve, reject) => {
        Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
    });
}

export interface PickedOcclusionImage {
    filename: string;
    width: number;
    height: number;
}

type Copy = (tr: string, en: string) => string;

/**
 * Lets the learner choose a picture from the library or take one, stores it unchanged in the media
 * folder under a new name, and returns that name; null when nothing was chosen.
 */
export async function pickOcclusionImage(source: 'library' | 'camera', l: Copy): Promise<PickedOcclusionImage | null> {
    const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        await promptPermissionSettings({
            title: l('İzin gerekli', 'Permission Required'),
            message: source === 'camera'
                ? l('Kamerayı kullanmak için izin vermeniz gerekiyor. Ayarlardan kamera iznini açabilirsiniz.',
                    'Allow camera access to take a photo. You can enable camera access in Settings.')
                : l('Galeriye erişmek için izin vermeniz gerekiyor. Ayarlardan erişim iznini açabilirsiniz.',
                    'Allow photo library access to choose a photo. You can enable access in Settings.'),
            settingsLabel: l('Ayarları Aç', 'Open Settings'),
            cancelLabel: translateActive('common.cancel'),
        });
        return null;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1 };
    const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({ ...options, selectionLimit: 1 });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    const name = mediaFilenameForPickedAsset({ uri: asset.uri, name: asset.fileName || 'goruntu', fallbackExtension: 'jpg' });
    const stored = await saveMediaFromUri(soundSafeMediaFilename(attachmentMediaFilename(`${Date.now()}_${name}`)), asset.uri);
    return { filename: stored, width: asset.width, height: asset.height };
}
