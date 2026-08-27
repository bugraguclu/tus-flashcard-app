import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { assertSafeAnkiArchive, decompressZstdBounded, inspectZstdFrame, MAX_ARCHIVE_ENTRIES } from './archiveSecurity';

describe('archive security', () => {
    const modernCollection = new Uint8Array(Buffer.from('KLUv/QRYuQAAbW9kZXJuIGNvbGxlY3Rpb24gYnl0ZXPtQ4PX', 'base64'));

    it('inspects and decompresses a bounded, single zstd frame', () => {
        expect(inspectZstdFrame(modernCollection).contentSize).toBe(0);
        expect(new TextDecoder().decode(decompressZstdBounded(modernCollection, 4 * 1024 * 1024, 'test')))
            .toBe('modern collection bytes');
    });

    it('rejects oversized-window and concatenated zstd frames before decompression', () => {
        const oversizedWindow = modernCollection.slice();
        oversizedWindow[5] = 0xf8;
        expect(() => decompressZstdBounded(oversizedWindow, 4 * 1024 * 1024, 'test')).toThrow(/boyut/);
        expect(() => decompressZstdBounded(modernCollection, 10, 'test')).toThrow(/boyut/);
        const concatenated = new Uint8Array(modernCollection.length * 2);
        concatenated.set(modernCollection);
        concatenated.set(modernCollection, modernCollection.length);
        expect(() => decompressZstdBounded(concatenated, 4 * 1024 * 1024, 'test')).toThrow(/art arda/);
    });

    it('rejects archives with an excessive entry count before inflation', () => {
        const zip = new JSZip();
        for (let index = 0; index <= MAX_ARCHIVE_ENTRIES; index++) zip.file(String(index), '');
        expect(() => assertSafeAnkiArchive(zip)).toThrow(/çok fazla dosya/);
    });
});
