import { afterEach, describe, expect, it, vi } from 'vitest';
import { Linking, Platform } from 'react-native';
import { registerDialogHost, type DialogRequest } from './confirm';
import { promptPermissionSettings } from './permissions';

const originalPlatform = Platform.OS;

afterEach(() => {
    Platform.OS = originalPlatform;
    vi.restoreAllMocks();
});

describe('promptPermissionSettings', () => {
    it('calls Linking.openSettings and resolves true when accepted', async () => {
        Platform.OS = 'web';
        const openSettingsSpy = vi.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);
        let request: DialogRequest | null = null;
        const unregister = registerDialogHost((next) => { request = next; });

        try {
            const promise = promptPermissionSettings({
                title: 'İzin gerekli',
                message: 'Galeri izni vermeniz gerekiyor.',
            });

            expect(request).toMatchObject({
                kind: 'choice',
                title: 'İzin gerekli',
                message: 'Galeri izni vermeniz gerekiyor.',
            });

            request!.onAccept?.();
            const result = await promise;

            expect(result).toBe(true);
            expect(openSettingsSpy).toHaveBeenCalledTimes(1);
        } finally {
            unregister();
        }
    });

    it('does not call Linking.openSettings and resolves false when cancelled', async () => {
        Platform.OS = 'web';
        const openSettingsSpy = vi.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);
        let request: DialogRequest | null = null;
        const unregister = registerDialogHost((next) => { request = next; });

        try {
            const promise = promptPermissionSettings({
                title: 'İzin gerekli',
                message: 'Galeri izni vermeniz gerekiyor.',
            });

            expect(request).toMatchObject({
                kind: 'choice',
            });

            request!.onCancel?.();
            const result = await promise;

            expect(result).toBe(false);
            expect(openSettingsSpy).not.toHaveBeenCalled();
        } finally {
            unregister();
        }
    });
});
