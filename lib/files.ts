/**
 * Cross-platform file helpers shared by screens and lib modules, so the
 * web-vs-native branching for reading picked files, downloading text, and
 * loading the classic filesystem API lives in exactly one place.
 */

import { Platform } from 'react-native';

// The classic file-system API moved to `expo-file-system/legacy` in SDK 54.
type LegacyFileSystem = typeof import('expo-file-system/legacy');
let _fs: LegacyFileSystem | null = null;

/** Lazily load the legacy filesystem API (native only — throws if required on web). */
export function getLegacyFileSystem(): LegacyFileSystem {
    if (!_fs) _fs = require('expo-file-system/legacy') as LegacyFileSystem;
    return _fs;
}

export function assertKnownFileSize(size: number | null | undefined, maxBytes: number): void {
    if (typeof size === 'number' && Number.isFinite(size) && size > maxBytes) {
        throw new Error('FILE_TOO_LARGE');
    }
}

async function assertNativeUriSize(uri: string, maxBytes?: number): Promise<void> {
    if (!maxBytes) return;
    const info = await getLegacyFileSystem().getInfoAsync(uri);
    if (info.exists && !info.isDirectory) assertKnownFileSize(info.size, maxBytes);
}

/** Read a picked/bundled asset as text: fetch on web (object/blob URLs), FS read on native. */
export async function readUriText(uri: string, maxBytes?: number): Promise<string> {
    if (Platform.OS === 'web') {
        const response = await fetch(uri);
        if (!response.ok) throw new Error('FILE_READ_FAILED');
        const blob = await response.blob();
        assertKnownFileSize(blob.size, maxBytes ?? Number.POSITIVE_INFINITY);
        return blob.text();
    }
    await assertNativeUriSize(uri, maxBytes);
    const text = await getLegacyFileSystem().readAsStringAsync(uri);
    if (maxBytes) assertKnownFileSize(new TextEncoder().encode(text).byteLength, maxBytes);
    return text;
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 -> bytes without relying on Buffer/atob, which are not guaranteed by Hermes. */
export function base64ToBytes(value: string): Uint8Array {
    const clean = value.replace(/\s/g, '').replace(/=+$/, '');
    const lookup = new Int16Array(128).fill(-1);
    for (let i = 0; i < B64_ALPHABET.length; i++) lookup[B64_ALPHABET.charCodeAt(i)] = i;
    const output = new Uint8Array(Math.floor(clean.length * 6 / 8));
    let bits = 0;
    let bitCount = 0;
    let offset = 0;
    for (let i = 0; i < clean.length; i++) {
        const code = clean.charCodeAt(i);
        const digit = code < lookup.length ? lookup[code] : -1;
        if (digit < 0) throw new Error('Geçersiz base64 verisi.');
        bits = (bits << 6) | digit;
        bitCount += 6;
        if (bitCount >= 8) {
            bitCount -= 8;
            output[offset++] = (bits >> bitCount) & 0xff;
        }
    }
    return offset === output.length ? output : output.slice(0, offset);
}

/** Read a picked asset as bytes on every platform, including native file/content URIs. */
export async function readUriBytes(uri: string, maxBytes?: number): Promise<Uint8Array> {
    if (Platform.OS === 'web') {
        const response = await fetch(uri);
        if (!response.ok) throw new Error('FILE_READ_FAILED');
        const blob = await response.blob();
        assertKnownFileSize(blob.size, maxBytes ?? Number.POSITIVE_INFINITY);
        return new Uint8Array(await blob.arrayBuffer());
    }
    await assertNativeUriSize(uri, maxBytes);
    const fs = getLegacyFileSystem();
    const encoded = await fs.readAsStringAsync(uri, { encoding: fs.EncodingType.Base64 });
    const bytes = base64ToBytes(encoded);
    if (maxBytes) assertKnownFileSize(bytes.byteLength, maxBytes);
    return bytes;
}

/** Trigger a browser download of the given text. Web only. */
export function downloadTextFileWeb(
    fileName: string,
    contents: string,
    mimeType = 'application/json',
): void {
    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}

/** Trigger a browser download of binary data. Web only. */
export function downloadBytesFileWeb(fileName: string, contents: Uint8Array, mimeType: string): void {
    const copy = new Uint8Array(contents);
    const blob = new Blob([copy.buffer as ArrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}
