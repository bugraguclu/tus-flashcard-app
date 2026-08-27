import type JSZip from 'jszip';
import type { JSZipObject } from 'jszip';
import { Decompress, decompress } from 'fzstd';

export const MAX_ARCHIVE_ENTRIES = 20_000;
export const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 450 * 1024 * 1024;
export const MAX_ZIP_ENTRY_BYTES = 220 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 300;

type ZipSizes = { compressed?: number; uncompressed?: number };

/** JSZip keeps trusted central-directory sizes internally after loadAsync(). */
export function zipEntrySizes(entry: JSZipObject): ZipSizes {
    const data = (entry as JSZipObject & {
        _data?: { compressedSize?: unknown; uncompressedSize?: unknown };
    })._data;
    const finite = (value: unknown): number | undefined => {
        const number = Number(value);
        return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
    };
    return { compressed: finite(data?.compressedSize), uncompressed: finite(data?.uncompressedSize) };
}

/** Reject ZIP bombs from central-directory metadata before inflating any entry. */
export function assertSafeAnkiArchive(zip: Pick<JSZip, 'files'>): void {
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    if (entries.length > MAX_ARCHIVE_ENTRIES) {
        throw new Error(`Paket çok fazla dosya içeriyor (en fazla ${MAX_ARCHIVE_ENTRIES.toLocaleString('tr-TR')}).`);
    }

    let total = 0;
    for (const entry of entries) {
        const { compressed, uncompressed } = zipEntrySizes(entry);
        // Newly-created in-memory JSZip instances do not expose these fields. Packages loaded
        // from user bytes do, and are the security boundary this preflight is designed for.
        if (uncompressed === undefined) continue;
        if (uncompressed > MAX_ZIP_ENTRY_BYTES) throw new Error('Paket içinde aşırı büyük bir dosya var.');
        total += uncompressed;
        if (total > MAX_ARCHIVE_UNCOMPRESSED_BYTES) throw new Error('Paket açıldığında güvenli boyut sınırını aşıyor.');
        if (compressed !== undefined && compressed > 0 && uncompressed > 1024 * 1024
            && uncompressed / compressed > MAX_COMPRESSION_RATIO) {
            throw new Error('Paket olağan dışı sıkıştırma oranı nedeniyle güvenli değil.');
        }
    }
}

export function assertZipEntrySize(entry: JSZipObject, maxBytes: number, label: string): void {
    const { uncompressed } = zipEntrySizes(entry);
    if (uncompressed !== undefined && uncompressed > maxBytes) {
        throw new Error(`${label} güvenli boyut sınırını aşıyor.`);
    }
}

type ZstdFrameInfo = { contentSize: number; windowSize: number; frameEnd: number };

function readLittleEndian(bytes: Uint8Array, offset: number, length: number): bigint {
    if (offset < 0 || length < 0 || offset + length > bytes.length) throw new Error('Eksik zstd başlığı.');
    let value = 0n;
    for (let index = 0; index < length; index++) value |= BigInt(bytes[offset + index]) << BigInt(index * 8);
    return value;
}

/** Parse one complete standard zstd frame without allocating its output. */
export function inspectZstdFrame(bytes: Uint8Array): ZstdFrameInfo {
    if (bytes.length < 6 || bytes[0] !== 0x28 || bytes[1] !== 0xb5 || bytes[2] !== 0x2f || bytes[3] !== 0xfd) {
        throw new Error('Geçersiz zstd verisi.');
    }
    const flag = bytes[4];
    if ((flag & 0x08) !== 0) throw new Error('Geçersiz zstd başlığı.');
    const singleSegment = (flag >> 5) & 1;
    const checksum = (flag >> 2) & 1;
    const dictionaryFlag = flag & 3;
    const contentFlag = flag >> 6;
    let offset = 6 - singleSegment;
    offset += dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentFlag ? 1 << contentFlag : singleSegment;
    let contentSizeBig = readLittleEndian(bytes, offset, contentSizeBytes);
    if (contentFlag === 1) contentSizeBig += 256n;
    offset += contentSizeBytes;
    if (contentSizeBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Zstd çıktı boyutu geçersiz.');
    const contentSize = Number(contentSizeBig);
    const windowSize = singleSegment
        ? contentSize
        : (() => {
            const descriptor = bytes[5];
            const base = 2 ** (10 + (descriptor >> 3));
            return base + (base >> 3) * (descriptor & 7);
        })();

    while (true) {
        if (offset + 3 > bytes.length) throw new Error('Eksik zstd bloğu.');
        const header = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
        offset += 3;
        const isLast = (header & 1) === 1;
        const type = (header >> 1) & 3;
        const declaredBlockSize = header >>> 3;
        if (type === 3) throw new Error('Geçersiz zstd blok türü.');
        offset += type === 1 ? 1 : declaredBlockSize;
        if (offset > bytes.length) throw new Error('Eksik zstd verisi.');
        if (isLast) break;
    }
    if (checksum) offset += 4;
    if (offset !== bytes.length) throw new Error('Birleştirilmiş veya art arda zstd çerçeveleri kabul edilmiyor.');
    return { contentSize, windowSize, frameEnd: offset };
}

/** Decompress one frame into a fixed, pre-validated buffer. */
export function decompressZstdBounded(bytes: Uint8Array, maxBytes: number, label: string): Uint8Array {
    const frame = inspectZstdFrame(bytes);
    if (frame.contentSize > maxBytes || frame.windowSize > maxBytes) {
        throw new Error(`${label} açıldığında güvenli boyut sınırını aşıyor.`);
    }
    if (bytes.length > 0 && frame.contentSize > 1024 * 1024
        && frame.contentSize / bytes.length > MAX_COMPRESSION_RATIO) {
        throw new Error(`${label} olağan dışı sıkıştırma oranına sahip.`);
    }
    if (frame.contentSize > 0) {
        const output = decompress(bytes, new Uint8Array(frame.contentSize));
        if (output.length !== frame.contentSize) throw new Error(`${label} çıktı boyutu beklenenden farklı.`);
        return output;
    }

    // Some legitimate Anki frames omit the total output size. fzstd's streaming decoder emits
    // bounded blocks and retains only the declared window, allowing us to stop as soon as the
    // cumulative output crosses the limit instead of trusting an attacker-controlled allocation.
    const chunks: Uint8Array[] = [];
    let total = 0;
    const decoder = new Decompress((chunk) => {
        total += chunk.length;
        if (total > maxBytes) throw new Error(`${label} açıldığında güvenli boyut sınırını aşıyor.`);
        chunks.push(chunk.slice());
    });
    decoder.push(bytes, true);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.length;
    }
    return output;
}
