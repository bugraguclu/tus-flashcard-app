import type { Note } from './models';
import { readMediaBytes, saveMediaBytes } from './mediaStore';
import { rewriteMediaReferences } from './mediaAttachment';
import { sanitizeMediaFilename } from './mediaFilename';
import { getDB } from './db';
import { assertZipEntrySize, decompressZstdBounded } from './archiveSecurity';
import type { JSZipType } from './apkgFormat';

/**
 * A package's media: its manifest in either format, the size and name checks every file
 * passes, and the renames written back into the imported notes.
 */

// Media caps: one runaway file must not exhaust storage, and the total stays inside
// what IndexedDB (web) comfortably holds.
const MEDIA_MANIFEST_NAME = 'media';

const MAX_MEDIA_FILE_BYTES = 20 * 1024 * 1024;

const MAX_MEDIA_TOTAL_BYTES = 200 * 1024 * 1024;

const MAX_MEDIA_MANIFEST_BYTES = 5 * 1024 * 1024;

const MAX_MEDIA_FILES = 20_000;

/**
 * Copies the package's media files (numeric zip entries mapped by the `media`
 * manifest) into the media store. Oversized or unreadable entries are skipped,
 * never fatal — the notes have already been imported at this point.
 */
export async function importMediaFromZip(
    zip: JSZipType,
    resolveConflicts = false,
): Promise<{ imported: number; skipped: number; filenames: string[]; renames?: Record<string, string> }> {
    const counts = { imported: 0, skipped: 0, filenames: [] as string[] };
    const renames: Record<string, string> = {};

    const manifestFile = zip.file(MEDIA_MANIFEST_NAME);
    if (!manifestFile) return counts;

    let manifest: Record<string, unknown>;
    try {
        assertZipEntrySize(manifestFile, MAX_MEDIA_MANIFEST_BYTES, 'Medya listesi');
        let bytes = await manifestFile.async('uint8array');
        if (bytes.length > MAX_MEDIA_MANIFEST_BYTES) throw new Error('Medya listesi çok büyük.');
        if (isZstd(bytes)) {
            bytes = decompressZstdBounded(bytes, MAX_MEDIA_MANIFEST_BYTES, 'Medya listesi');
            manifest = parseModernMediaManifest(bytes);
        } else {
            const parsed = JSON.parse(new TextDecoder().decode(bytes));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Geçersiz medya listesi.');
            manifest = parsed;
        }
    } catch (error) {
        console.warn('[ApkgImport] media manifest skipped:', error);
        return { ...counts, skipped: 1 };
    }

    const manifestEntries = Object.entries(manifest);
    if (manifestEntries.length > MAX_MEDIA_FILES) {
        console.warn('[ApkgImport] media manifest skipped: too many files');
        return { ...counts, skipped: manifestEntries.length };
    }

    let totalBytes = 0;
    for (const [entryName, filename] of manifestEntries) {
        if (typeof filename !== 'string' || filename === '') {
            counts.skipped++;
            continue;
        }

        const entry = zip.file(entryName);
        if (!entry) {
            counts.skipped++;
            continue;
        }

        try {
            assertZipEntrySize(entry, MAX_MEDIA_FILE_BYTES, 'Medya dosyası');
            let bytes = await entry.async('uint8array');
            // Current packages may zstd-compress individual media entries.
            if (isZstd(bytes)) {
                bytes = decompressZstdBounded(bytes, MAX_MEDIA_FILE_BYTES, 'Medya dosyası');
            }
            if (bytes.length > MAX_MEDIA_FILE_BYTES || totalBytes + bytes.length > MAX_MEDIA_TOTAL_BYTES) {
                counts.skipped++;
                continue;
            }
            totalBytes += bytes.length;
            const originalName = sanitizeMediaFilename(filename);
            if (!isSafePassiveMediaFilename(originalName)) {
                counts.skipped++;
                continue;
            }
            let targetName = originalName;
            if (resolveConflicts) {
                const existing = await readMediaBytes(targetName);
                if (existing && (sameBytes(existing, bytes) || originalName.startsWith('_') || originalName.startsWith('latex-'))) {
                    counts.filenames.push(originalName);
                    continue;
                }
                if (existing) {
                    targetName = ankiHashedMediaName(originalName, sha1Hex(bytes));
                    renames[originalName] = targetName;
                }
            }
            await saveMediaBytes(targetName, bytes);
            counts.imported++;
            counts.filenames.push(targetName);
        } catch (e) {
            console.warn(`[ApkgImport] media entry ${entryName} (${filename}) skipped:`, e);
            counts.skipped++;
        }
    }

    return resolveConflicts ? { ...counts, renames } : counts;
}

/** Active document/code formats are not needed for passive card media. */
function isSafePassiveMediaFilename(filename: string): boolean {
    return !/\.(?:html?|xhtml|svg|xml|mjs|cjs|js|wasm)$/i.test(filename);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Anki renames conflicting media as stem-{full SHA1}.ext (120 UTF-8 bytes max). */
function ankiHashedMediaName(filename: string, hash: string): string {
    const dot = filename.lastIndexOf('.');
    let stem = dot > 0 ? filename.slice(0, dot) : filename;
    let extension = dot > 0 ? filename.slice(dot + 1) : '';
    const truncateUtf8 = (value: string, maxBytes: number): string => {
        let output = '';
        let size = 0;
        for (const character of value) {
            const length = new TextEncoder().encode(character).length;
            if (size + length > maxBytes) break;
            output += character;
            size += length;
        }
        return output;
    };
    extension = truncateUtf8(extension, 10);
    const maxStemBytes = 120 - 40 - 1 - new TextEncoder().encode(extension).length - 2;
    stem = truncateUtf8(stem, maxStemBytes);
    return `${stem}-${hash}.${extension}`;
}

function sha1Hex(input: Uint8Array): string {
    const bitLength = input.length * 8;
    const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
    const bytes = new Uint8Array(paddedLength);
    bytes.set(input);
    bytes[input.length] = 0x80;
    const view = new DataView(bytes.buffer);
    view.setUint32(paddedLength - 4, bitLength >>> 0, false);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;
    const words = new Uint32Array(80);
    const rotate = (value: number, bits: number) => (value << bits) | (value >>> (32 - bits));
    for (let block = 0; block < bytes.length; block += 64) {
        for (let index = 0; index < 16; index++) words[index] = view.getUint32(block + index * 4, false);
        for (let index = 16; index < 80; index++) words[index] = rotate(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1) >>> 0;
        let a = h0; let b = h1; let c = h2; let d = h3; let e = h4;
        for (let index = 0; index < 80; index++) {
            const f = index < 20 ? (b & c) | (~b & d) : index < 40 ? b ^ c ^ d : index < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
            const k = index < 20 ? 0x5a827999 : index < 40 ? 0x6ed9eba1 : index < 60 ? 0x8f1bbcdc : 0xca62c1d6;
            const temp = (rotate(a, 5) + f + e + k + words[index]) >>> 0;
            e = d; d = c; c = rotate(b, 30) >>> 0; b = a; a = temp;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    return [h0, h1, h2, h3, h4].map((value) => value.toString(16).padStart(8, '0')).join('');
}

export function rewriteImportedMediaReferences(packageId: string, renames: Record<string, string>): void {
    if (Object.keys(renames).length === 0) return;
    const db = getDB();
    for (const row of db.getAllSync<{ id: number; data: string }>('SELECT id, data FROM notes')) {
        let note: Note;
        try { note = JSON.parse(row.data) as Note; } catch { continue; }
        if (note.sourcePackageId !== packageId) continue;
        // Every reference form the media scan knows about, so a renamed file cannot be left
        // behind in a form the rewrite did not look for — an `<a href>` attachment, an
        // unquoted attribute, a `url(…)`, or a name written with its entities escaped.
        const fields = note.fields.map((field) => rewriteMediaReferences(field, renames));
        if (fields.every((field, index) => field === note.fields[index])) continue;
        note = { ...note, fields, mod: Math.floor(Date.now() / 1000), usn: -1 };
        db.runSync(
            'UPDATE notes SET data = ?, updated_at = ?, usn = -1 WHERE id = ?',
            JSON.stringify(note), Date.now(), note.id,
        );
    }
}

function isZstd(bytes: Uint8Array): boolean {
    return bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd;
}

function decodeUtf8(bytes: Uint8Array): string {
    let result = '';
    for (let i = 0; i < bytes.length;) {
        const first = bytes[i++];
        if (first < 0x80) { result += String.fromCharCode(first); continue; }
        const extra = first < 0xe0 ? 1 : first < 0xf0 ? 2 : 3;
        let codePoint = first & (extra === 1 ? 0x1f : extra === 2 ? 0x0f : 0x07);
        for (let j = 0; j < extra && i < bytes.length; j++) codePoint = (codePoint << 6) | (bytes[i++] & 0x3f);
        if (codePoint <= 0xffff) result += String.fromCharCode(codePoint);
        else {
            codePoint -= 0x10000;
            result += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
        }
    }
    return result;
}

function readVarint(bytes: Uint8Array, state: { offset: number }): number {
    let value = 0;
    let shift = 0;
    while (state.offset < bytes.length && shift < 35) {
        const byte = bytes[state.offset++];
        value += (byte & 0x7f) * 2 ** shift;
        if ((byte & 0x80) === 0) return value;
        shift += 7;
    }
    throw new Error('Geçersiz Anki medya manifesti.');
}

function skipProtoField(bytes: Uint8Array, state: { offset: number }, wire: number): void {
    if (wire === 0) { readVarint(bytes, state); return; }
    if (wire === 1) { state.offset += 8; return; }
    if (wire === 2) { state.offset += readVarint(bytes, state); return; }
    if (wire === 5) { state.offset += 4; return; }
    throw new Error('Desteklenmeyen Anki medya alanı.');
}

/** Decode Anki's current MediaEntries protobuf without pulling in a protobuf runtime. */
function parseModernMediaManifest(bytes: Uint8Array): Record<string, string> {
    const result: Record<string, string> = {};
    const outer = { offset: 0 };
    let sequentialIndex = 0;
    while (outer.offset < bytes.length) {
        const tag = readVarint(bytes, outer);
        const field = tag >>> 3;
        const wire = tag & 7;
        if (field !== 1 || wire !== 2) { skipProtoField(bytes, outer, wire); continue; }
        const end = outer.offset + readVarint(bytes, outer);
        const inner = { offset: outer.offset };
        let name = '';
        let legacyIndex: number | undefined;
        while (inner.offset < end) {
            const innerTag = readVarint(bytes, inner);
            const innerField = innerTag >>> 3;
            const innerWire = innerTag & 7;
            if (innerField === 1 && innerWire === 2) {
                const length = readVarint(bytes, inner);
                name = decodeUtf8(bytes.slice(inner.offset, inner.offset + length));
                inner.offset += length;
            } else if (innerField === 255 && innerWire === 0) {
                legacyIndex = readVarint(bytes, inner);
            } else {
                skipProtoField(bytes, inner, innerWire);
            }
        }
        outer.offset = end;
        if (name) result[String(legacyIndex ?? sequentialIndex)] = name;
        sequentialIndex++;
    }
    return result;
}
