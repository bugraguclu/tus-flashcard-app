// AKT-14: a large picked package is read in chunks instead of through one base64 string.
import { describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ bytes: new Uint8Array(0), reads: [] as Array<{ position?: number; length?: number }> }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
const fakeFs = {
    EncodingType: { Base64: 'base64' },
    getInfoAsync: async () => ({ exists: true, isDirectory: false, size: h.bytes.length }),
    readAsStringAsync: async (_uri: string, options: { position?: number; length?: number }) => {
        h.reads.push({ position: options.position, length: options.length });
        const start = options.position ?? 0;
        const slice = h.bytes.subarray(start, options.length === undefined ? undefined : start + options.length);
        return Buffer.from(slice).toString('base64');
    },
};
import { readUriBytes, setLegacyFileSystemForTesting } from './files';
setLegacyFileSystemForTesting(fakeFs);

describe('readUriBytes on iOS', () => {
    it('reads a file larger than one chunk piece by piece into the same bytes', async () => {
        h.bytes = new Uint8Array(13 * 1024 * 1024 + 5).map((_, index) => (index * 31) % 251);
        h.reads = [];
        const read = await readUriBytes('file:///big.apkg');
        expect(read.length).toBe(h.bytes.length);
        expect(Buffer.compare(Buffer.from(read), Buffer.from(h.bytes))).toBe(0);
        expect(h.reads.length).toBe(3);
        expect(h.reads.every((entry) => entry.length !== undefined && entry.length <= 6 * 1024 * 1024)).toBe(true);
    });

    it('reads a small file in one call', async () => {
        h.bytes = new Uint8Array([1, 2, 3]);
        h.reads = [];
        expect(await readUriBytes('file:///small.apkg')).toEqual(h.bytes);
        expect(h.reads).toHaveLength(1);
    });
});
