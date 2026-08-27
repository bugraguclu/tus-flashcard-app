import { requireOptionalNativeModule } from 'expo';

export type DeckShortcutRequestStatus = 'created' | 'requested' | 'cancelled' | 'unsupported' | 'unavailable';

interface DeckShortcutsNativeModule {
    requestDeckShortcutAsync(
        shortcutId: string,
        title: string,
        url: string,
    ): Promise<{ status: DeckShortcutRequestStatus }>;
}

const nativeModule = requireOptionalNativeModule<DeckShortcutsNativeModule>('DeckShortcuts');

export async function requestDeckShortcut(
    shortcutId: string,
    title: string,
    url: string,
): Promise<DeckShortcutRequestStatus> {
    if (!nativeModule) return 'unavailable';
    const result = await nativeModule.requestDeckShortcutAsync(shortcutId, title, url);
    return result.status;
}
