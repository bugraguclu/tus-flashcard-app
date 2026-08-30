import { afterEach, describe, expect, it } from 'vitest';
import { Platform } from 'react-native';
import { confirmAsync, registerDialogHost, type DialogRequest } from './confirm';

const originalPlatform = Platform.OS;

afterEach(() => {
    Platform.OS = originalPlatform;
});

describe('confirmAsync', () => {
    it('resolves false when a destructive confirmation is cancelled', async () => {
        Platform.OS = 'web';
        let request: DialogRequest | null = null;
        const unregister = registerDialogHost((next) => { request = next; });
        try {
            const result = confirmAsync('Replace', 'Everything changes', { destructive: true });
            expect(request).toMatchObject({ kind: 'confirm', destructive: true });
            request!.onCancel?.();
            await expect(result).resolves.toBe(false);
        } finally {
            unregister();
        }
    });

    it('resolves true only after explicit acceptance', async () => {
        Platform.OS = 'web';
        let request: DialogRequest | null = null;
        const unregister = registerDialogHost((next) => { request = next; });
        try {
            const result = confirmAsync('Replace', 'Everything changes', { destructive: true });
            request!.onAccept?.();
            await expect(result).resolves.toBe(true);
        } finally {
            unregister();
        }
    });
});
