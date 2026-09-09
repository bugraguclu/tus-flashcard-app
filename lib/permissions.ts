import { Linking } from 'react-native';
import { choose } from './confirm';
import { translateActive } from './i18n';

export interface PromptPermissionSettingsOptions {
    title?: string;
    message: string;
    settingsLabel?: string;
    cancelLabel?: string;
}

/**
 * Prompts the user when a permission is required and directs them to system settings.
 * If the user chooses settings, Linking.openSettings() is called.
 * Returns true if the user confirmed and settings was opened, false otherwise.
 */
export async function promptPermissionSettings(options: PromptPermissionSettingsOptions): Promise<boolean> {
    const title = options.title ?? translateActive('permissions.title');
    const settingsLabel = options.settingsLabel ?? translateActive('permissions.openSettings');
    const cancelLabel = options.cancelLabel ?? translateActive('common.cancel');

    const shouldOpen = await choose(title, options.message, settingsLabel, cancelLabel);
    if (shouldOpen) {
        try {
            await Linking.openSettings();
            return true;
        } catch (error) {
            console.warn('[Permissions] Failed to open settings:', error);
        }
    }
    return false;
}
