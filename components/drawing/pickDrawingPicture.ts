import * as ImagePicker from 'expo-image-picker';
import { promptPermissionSettings } from '../../lib/permissions';

type Localize = (turkish: string, english: string) => string;

/** Ask for the library, then for one picture from it. Null means the user backed out. */
export async function pickDrawingPicture(l: Localize, cancelLabel: string): Promise<ImagePicker.ImagePickerAsset | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        await promptPermissionSettings({
            title: l('İzin gerekli', 'Permission Required'),
            message: l(
                'Sayfaya görsel eklemek için galeri izni gerekiyor. Ayarlardan erişim iznini açabilirsiniz.',
                'Allow photo library access to add a picture to the page. You can enable access in Settings.',
            ),
            settingsLabel: l('Ayarları Aç', 'Open Settings'),
            cancelLabel,
        });
        return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
        selectionLimit: 1,
    });
    if (result.canceled || !result.assets?.length) return null;
    return result.assets[0];
}
