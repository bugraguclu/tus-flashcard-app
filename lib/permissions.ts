import { Linking, Platform } from 'react-native';
import { alert, choose } from './confirm';
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
 *
 * A web page cannot open the browser's settings, and the callers' messages point at the iPhone's
 * Settings app, so the web build says where a browser keeps the permission instead.
 */
export async function promptPermissionSettings(options: PromptPermissionSettingsOptions): Promise<boolean> {
    const title = options.title ?? translateActive('permissions.title');

    if (Platform.OS === 'web') {
        await new Promise<void>((resolve) => alert(title, translateActive('permissions.webSiteSettings'), resolve));
        return false;
    }

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
