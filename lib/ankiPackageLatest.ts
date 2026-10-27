import { sha1Bytes } from './sha1';

/**
 * The pieces of Anki's current package format (`PackageMetadata.Version.VERSION_LATEST`) that
 * differ from the legacy one, written without a zstd compressor: Anki's default export when
 * "Support older Anki versions" is off stores `collection.anki21b`, every media file and the media
 * list as zstd frames, and lists the media as a `MediaEntries` protobuf rather than a JSON map
 * (proto/anki/import_export.proto, rslib/src/import_export/package/meta.rs).
 */

/** `PackageMetadata { version: VERSION_LATEST }`. */
export const LATEST_PACKAGE_META = new Uint8Array([0x08, 0x03]);

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const RAW_BLOCK_MAX = 128 * 1024;

/**
 * A valid zstd frame that stores `bytes` in raw blocks. Every zstd decoder reads it; the zip
 * around the package still deflates it, so the file is not larger than a compressed frame by
 * much. Frame header: no checksum, no dictionary, no content size, a 128 KiB window (exponent 7),
 * which is also the largest a block may be.
 */
export function zstdStoredFrame(bytes: Uint8Array): Uint8Array {
    const blockCount = Math.max(1, Math.ceil(bytes.length / RAW_BLOCK_MAX));
    const out = new Uint8Array(4 + 2 + blockCount * 3 + bytes.length);
    out.set(ZSTD_MAGIC, 0);
    out[4] = 0x00;
    out[5] = 0x38;
    let offset = 6;
    for (let block = 0; block < blockCount; block += 1) {
        const start = block * RAW_BLOCK_MAX;
        const size = Math.min(RAW_BLOCK_MAX, bytes.length - start);
        const last = block === blockCount - 1 ? 1 : 0;
        const header = last | (0 << 1) | (size << 3);
        out[offset] = header & 0xff;
        out[offset + 1] = (header >>> 8) & 0xff;
        out[offset + 2] = (header >>> 16) & 0xff;
        out.set(bytes.subarray(start, start + size), offset + 3);
        offset += 3 + size;
    }
    return out;
}

function varint(value: number): number[] {
    const out: number[] = [];
    let rest = value >>> 0;
    while (rest >= 0x80) {
        out.push((rest & 0x7f) | 0x80);
        rest >>>= 7;
    }
    out.push(rest);
    return out;
}

function lengthDelimited(field: number, payload: Uint8Array | number[]): number[] {
    return [...varint((field << 3) | 2), ...varint(payload.length), ...payload];
}

/** `MediaEntries`: one `{ name, size, sha1 }` per file, in the order of the zip's numbered files. */
export function mediaEntriesProtobuf(files: ReadonlyArray<{ name: string; bytes: Uint8Array }>): Uint8Array {
    const out: number[] = [];
    for (const file of files) {
        const entry = [
            ...lengthDelimited(1, [...new TextEncoder().encode(file.name)]),
            ...varint((2 << 3) | 0), ...varint(file.bytes.length),
            ...lengthDelimited(3, sha1Bytes(file.bytes)),
        ];
        out.push(...lengthDelimited(1, entry));
    }
    return new Uint8Array(out);
}
