import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
    files: new Set<string>(),
    deleted: [] as string[],
    copied: [] as { from: string; to: string }[],
}));

vi.mock('react-native', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    Platform: { OS: 'ios' },
}));
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
        copyAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
            fixture.copied.push({ from, to });
            const name = to.split('/').pop()!;
            fixture.files.add(name);
        }),
    }),
    toFileUri: (path: string) => path.startsWith('file://') ? path : `file://${path}`,
    readUriBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

import { removeMediaExcept, saveMediaFromUri } from './mediaStore';

describe('full collection media replacement', () => {
    beforeEach(() => {
        fixture.files = new Set(['bka.png', 'bka-audio.mp3', 'old-photo.jpg', 'old-note.wav']);
        fixture.deleted = [];
        fixture.copied = [];
    });

    it('keeps only catalog media and removes every stale attachment', async () => {
        const result = await removeMediaExcept(['bka.png', 'bka-audio.mp3']);

        expect(result).toEqual({ deleted: 2, remaining: 2 });
        expect([...fixture.files].sort()).toEqual(['bka-audio.mp3', 'bka.png']);
        expect(fixture.deleted.sort()).toEqual(['old-note.wav', 'old-photo.jpg']);
    });

    it('saves media from local uri using native copy without corruption', async () => {
        const savedName = await saveMediaFromUri('recording_123.m4a', 'file:///tmp/cache/rec.m4a');

        expect(savedName).toBe('recording_123.m4a');
        expect(fixture.copied).toHaveLength(1);
        expect(fixture.copied[0].from).toBe('file:///tmp/cache/rec.m4a');
        expect(fixture.files.has('recording_123.m4a')).toBe(true);
    });
});
