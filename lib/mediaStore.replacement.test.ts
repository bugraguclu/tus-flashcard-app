import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ files: new Set<string>(), deleted: [] as string[] }));

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('./files', () => ({
    getLegacyFileSystem: () => ({
        documentDirectory: '/documents/',
        EncodingType: { Base64: 'base64' },
        getInfoAsync: vi.fn(async () => ({ exists: true })),
        makeDirectoryAsync: vi.fn(async () => undefined),
        readDirectoryAsync: vi.fn(async () => [...fixture.files]),
        deleteAsync: vi.fn(async (uri: string) => {
            const name = uri.split('/').pop()!;
            fixture.files.delete(name);
            fixture.deleted.push(name);
        }),
    }),
}));

import { removeMediaExcept } from './mediaStore';

describe('full collection media replacement', () => {
    beforeEach(() => {
        fixture.files = new Set(['bka.png', 'bka-audio.mp3', 'old-photo.jpg', 'old-note.wav']);
        fixture.deleted = [];
    });

    it('keeps only catalog media and removes every stale attachment', async () => {
        const result = await removeMediaExcept(['bka.png', 'bka-audio.mp3']);

        expect(result).toEqual({ deleted: 2, remaining: 2 });
        expect([...fixture.files].sort()).toEqual(['bka-audio.mp3', 'bka.png']);
        expect(fixture.deleted.sort()).toEqual(['old-note.wav', 'old-photo.jpg']);
    });
});
