import { describe, expect, it } from 'vitest';
import { decompress } from 'fzstd';
import { mediaEntriesProtobuf, zstdStoredFrame } from './ankiPackageLatest';
import { sha1Hex } from './sha1';

describe('zstdStoredFrame', () => {
    it.each([0, 1, 1000, 128 * 1024, 128 * 1024 + 1, 300_000])('round-trips %i bytes through a zstd decoder', (size) => {
        const bytes = Uint8Array.from({ length: size }, (_, index) => (index * 31 + 7) & 0xff);
        expect(decompress(zstdStoredFrame(bytes))).toEqual(bytes);
    });
});

describe('mediaEntriesProtobuf', () => {
    it('writes name, size and the SHA-1 of each file', () => {
        const bytes = new TextEncoder().encode('abc');
        expect(sha1Hex(bytes)).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
        const proto = mediaEntriesProtobuf([{ name: 'a.png', bytes }]);
        // entries(1) { name(1) "a.png", size(2) 3, sha1(3) <20 bytes> }
        expect([...proto.slice(0, 11)]).toEqual([0x0a, 31, 0x0a, 5, 0x61, 0x2e, 0x70, 0x6e, 0x67, 0x10, 3]);
        expect([...proto.slice(11, 13)]).toEqual([0x1a, 20]);
        expect(proto.length).toBe(33);
    });
});
