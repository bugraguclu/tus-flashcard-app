/**
 * Making a very large photo small enough to live in a flashcard collection.
 *
 * A learner photographing a textbook page, or exporting a plate from a radiology viewer, can
 * arrive with a file of a few hundred megabytes: a RAW capture, a TIFF, or a screenshot saved as
 * PNG at full sensor resolution. Copied into the collection untouched, one such attachment is
 * larger than every other card put together, and it goes into every backup and every `.apkg`
 * export from then on.
 *
 * What this module can and cannot promise is worth stating plainly, because "no quality loss" is
 * the request and only half of it is achievable:
 *
 * - Bit-exact lossless recompression of a photograph does not shrink it by an order of
 *   magnitude. PNG and RAW are already lossless; re-encoding them losslessly saves a few percent.
 *   Nothing here pretends otherwise.
 * - What *is* achievable, and what the huge files actually have in common, is that they are
 *   stored far above the resolution anything will ever display them at, in an encoding chosen for
 *   editing rather than for viewing. A 8000x6000 TIFF at six bytes a pixel becomes a 3000x2250
 *   JPEG at high quality with no difference a reader can see on a phone — and it is roughly a
 *   hundredth of the size. That is where the 300 MB to a couple of MB comes from.
 *
 * Three rules keep that from ever costing the learner something they wanted:
 *
 * 1. An image already stored efficiently is left completely alone. `bytesPerPixel` tells a RAW or
 *    a PNG apart from a camera JPEG, and a photo that is already a well-encoded JPEG of a
 *    sensible size is passed through byte for byte.
 * 2. Transparency is never flattened. A picture that can carry an alpha channel is re-encoded as
 *    PNG or not at all, because a JPEG would fill its transparent parts with black.
 * 3. The result is only kept if it is genuinely smaller (see `isCompressionWorthKeeping`). A
 *    re-encode that came out bigger, or barely smaller, is discarded and the original is stored.
 *
 * The decision is pure and lives here so it can be tested without a device; the one native call
 * is in `compressPhotoForAttachment`, which loads `expo-image-manipulator` lazily.
 */

import { getLegacyFileSystem, toFileUri } from './files';

/** Container formats a picked photo can arrive in, as far as the first bytes can tell. */
export type PhotoFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'heif' | 'avif' | 'tiff' | 'bmp' | 'unknown';

export type PhotoHeader = {
    format: PhotoFormat;
    /**
     * Whether this file may carry transparency. Deliberately pessimistic: `true` also means
     * "cannot tell", because flattening an alpha channel onto black is not recoverable and
     * declining to recompress is.
     */
    mayHaveAlpha: boolean;
    /**
     * Whether the format stores its pixels losslessly (or not at all compressed). These are the
     * files worth re-encoding — the ones whose size comes from the encoding, not the content.
     */
    lossless: boolean;
};

/**
 * The long edge, in pixels, a stored attachment is allowed to keep.
 *
 * The largest iPhone panel is 1290 px across. Three thousand leaves more than a doubling in hand
 * for pinching into the small print on a scanned table, which is the one thing a learner actually
 * zooms a card image for, and still costs a fraction of a full-resolution capture.
 */
export const PHOTO_MAX_LONG_EDGE = 3000;

/**
 * JPEG quality for a re-encode. At 0.9 the artefacts are below what a phone panel resolves on
 * photographic content, while the file is a small fraction of a lossless one.
 */
export const PHOTO_JPEG_QUALITY = 0.9;

/**
 * Below this, a photo is left alone whatever it is. Shaving a few hundred kilobytes is not worth
 * a re-encode, the wait, or the risk of touching a file that was already fine.
 */
export const PHOTO_COMPRESSION_MIN_BYTES = 1_500_000;

/**
 * Bytes per pixel above which a file is considered inefficiently stored.
 *
 * Photographic JPEG at a high quality lands around 0.2-0.5 bytes a pixel; PNG, TIFF and RAW land
 * between 3 and 8. The gap is wide enough that a single threshold separates "already a
 * well-encoded photo, leave it" from "stored in an editing format, worth re-encoding" without
 * needing to decode anything.
 */
export const PHOTO_EFFICIENT_BYTES_PER_PIXEL = 0.75;

/**
 * The size below which an efficiently encoded photo is left alone even though it has more pixels
 * than a card needs.
 *
 * An ordinary iPhone capture is around four thousand pixels across and three or four megabytes —
 * over the display ceiling, but already encoded about as tightly as it can be. Re-encoding one to
 * save a megabyte and a half would spend real quality on a file that was never the problem. The
 * files this feature exists for are an order of magnitude larger than this.
 */
export const PHOTO_COMFORTABLE_BYTES = 8_000_000;

/** Expected bytes per pixel of the output, used only to show the learner an estimate. */
const ESTIMATED_JPEG_BYTES_PER_PIXEL = 0.42;
const ESTIMATED_PNG_BYTES_PER_PIXEL = 1.6;

/** A re-encode has to save at least this share of the file to be worth keeping over the original. */
export const PHOTO_COMPRESSION_MIN_SAVING = 0.15;

export type PhotoCompressionPlan =
    | {
        action: 'keep';
        /** Why the original is being stored untouched — surfaced in logs, not to the learner. */
        reason: 'too-small' | 'unknown-size' | 'unknown-dimensions' | 'already-efficient' | 'alpha-no-resize';
    }
    | {
        action: 'recompress';
        /** Target pixel size. Equal to the source when only the encoding is being changed. */
        width: number;
        height: number;
        /** Whether the pixels are actually being scaled down, as opposed to only re-encoded. */
        resized: boolean;
        format: 'jpeg' | 'png';
        /** Quality passed to the encoder, 0-1. PNG ignores it. */
        quality: number;
        /** Roughly how large the result should come out. Approximate, and shown as such. */
        estimatedBytes: number;
    };

const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

function ascii(bytes: Uint8Array, start: number, length: number): string {
    let out = '';
    for (let i = start; i < start + length && i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
    return out;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
    if (bytes.length < signature.length) return false;
    return signature.every((value, index) => bytes[index] === value);
}

/**
 * What the first bytes of a file say about it.
 *
 * Only the header is needed, which is the point: the caller reads sixty-four bytes off the front
 * of a file that may be hundreds of megabytes, and never holds the rest of it in memory.
 */
export function sniffPhotoHeader(bytes: Uint8Array): PhotoHeader {
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
        return { format: 'jpeg', mayHaveAlpha: false, lossless: false };
    }

    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        // IHDR is the first chunk and its layout is fixed: 8 bytes of signature, a 4-byte length,
        // the "IHDR" tag, width, height, bit depth, then the colour type at offset 25. Types 4 and
        // 6 carry an alpha channel outright; a palette (3) or a plain image can still be given
        // transparency by a tRNS chunk further in, which this header read cannot see, so anything
        // but true colour and greyscale is treated as possibly transparent.
        const colourType = bytes.length > 25 ? bytes[25] : -1;
        const opaque = colourType === 0 || colourType === 2;
        return { format: 'png', mayHaveAlpha: !opaque, lossless: true };
    }

    if (ascii(bytes, 0, 3) === 'GIF') {
        return { format: 'gif', mayHaveAlpha: true, lossless: true };
    }

    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
        const chunk = ascii(bytes, 12, 4);
        // VP8L is the lossless codec and always may carry alpha; VP8X is the extended container
        // and declares alpha in bit 4 of its flags byte; plain "VP8 " is lossy and opaque.
        if (chunk === 'VP8L') return { format: 'webp', mayHaveAlpha: true, lossless: true };
        if (chunk === 'VP8X') {
            const flags = bytes.length > 20 ? bytes[20] : 0;
            return { format: 'webp', mayHaveAlpha: (flags & 0x10) !== 0, lossless: false };
        }
        if (chunk === 'VP8 ') return { format: 'webp', mayHaveAlpha: false, lossless: false };
        return { format: 'webp', mayHaveAlpha: true, lossless: false };
    }

    if (ascii(bytes, 4, 4) === 'ftyp') {
        const brand = ascii(bytes, 8, 4).toLowerCase();
        if (brand === 'avif' || brand === 'avis') return { format: 'avif', mayHaveAlpha: true, lossless: false };
        if (HEIF_BRANDS.has(brand)) return { format: 'heif', mayHaveAlpha: true, lossless: false };
    }

    if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
        return { format: 'tiff', mayHaveAlpha: true, lossless: true };
    }

    if (ascii(bytes, 0, 2) === 'BM') {
        return { format: 'bmp', mayHaveAlpha: true, lossless: true };
    }

    // An unrecognised container gets the cautious answer on both counts, which together mean
    // "only touch this if it is far too many pixels, and never flatten it to JPEG".
    return { format: 'unknown', mayHaveAlpha: true, lossless: false };
}

function positiveInteger(value: unknown): number {
    const numeric = Math.round(Number(value));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

/**
 * Decide what, if anything, to do with a picked photo.
 *
 * Every branch that returns `keep` is a case where re-encoding would cost quality without buying
 * meaningful space, so the original file is copied in unchanged.
 */
export function planPhotoCompression(input: {
    byteLength: number | null | undefined;
    width: number | null | undefined;
    height: number | null | undefined;
    header: PhotoHeader;
    /** Long-edge ceiling; defaults to `PHOTO_MAX_LONG_EDGE`. */
    maxLongEdge?: number;
    quality?: number;
    minBytes?: number;
    /** Size under which an already-efficient photo is left alone; `PHOTO_COMFORTABLE_BYTES`. */
    comfortableBytes?: number;
}): PhotoCompressionPlan {
    const byteLength = positiveInteger(input.byteLength);
    if (!byteLength) return { action: 'keep', reason: 'unknown-size' };

    const minBytes = Number.isFinite(input.minBytes as number)
        ? Math.max(0, input.minBytes as number)
        : PHOTO_COMPRESSION_MIN_BYTES;
    if (byteLength < minBytes) return { action: 'keep', reason: 'too-small' };

    const width = positiveInteger(input.width);
    const height = positiveInteger(input.height);
    // Without the pixel dimensions there is no way to tell an efficiently stored image from a
    // wasteful one, and no safe target to resize to. A file of unknown shape is left alone.
    if (!width || !height) return { action: 'keep', reason: 'unknown-dimensions' };

    const rawCeiling = Number(input.maxLongEdge);
    const maxLongEdge = Number.isFinite(rawCeiling) && rawCeiling > 0
        ? Math.round(rawCeiling)
        : PHOTO_MAX_LONG_EDGE;

    const longEdge = Math.max(width, height);
    const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
    const resized = scale < 1;

    const bytesPerPixel = byteLength / (width * height);
    const efficient = bytesPerPixel <= PHOTO_EFFICIENT_BYTES_PER_PIXEL;
    const comfortable = byteLength <= (Number.isFinite(input.comfortableBytes as number)
        ? Math.max(0, input.comfortableBytes as number)
        : PHOTO_COMFORTABLE_BYTES);
    // A file already dense with information has nothing left to give: re-encoding it would only
    // add a second generation of artefacts. Being over the pixel ceiling is not on its own a
    // reason to touch one — an ordinary phone capture is — so the pixels are only dropped when
    // the file is also big enough for the saving to be worth the quality it costs.
    if (efficient && (!resized || comfortable)) {
        return { action: 'keep', reason: 'already-efficient' };
    }

    // Transparency survives only in PNG, and a PNG re-encode at the same size saves nothing worth
    // the wait — so a transparent image is touched only when there are pixels to drop.
    if (input.header.mayHaveAlpha && !resized) {
        return { action: 'keep', reason: 'alpha-no-resize' };
    }

    const format: 'jpeg' | 'png' = input.header.mayHaveAlpha ? 'png' : 'jpeg';
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const rawQuality = Number(input.quality);
    const quality = Number.isFinite(rawQuality)
        ? Math.min(1, Math.max(0.1, rawQuality))
        : PHOTO_JPEG_QUALITY;

    const perPixel = format === 'jpeg' ? ESTIMATED_JPEG_BYTES_PER_PIXEL : ESTIMATED_PNG_BYTES_PER_PIXEL;
    const estimatedBytes = Math.round(targetWidth * targetHeight * perPixel);

    return {
        action: 'recompress',
        width: targetWidth,
        height: targetHeight,
        resized,
        format,
        quality,
        // An estimate that promised a saving the re-encode cannot deliver would read as a bug, so
        // it is never allowed to claim the result will be larger than the file already is.
        estimatedBytes: Math.min(estimatedBytes, byteLength),
    };
}

/**
 * Whether a finished re-encode earns its place over the original.
 *
 * Re-encoding can come out *larger* — a photograph of noise, or a source already compressed
 * harder than the target quality — and a marginal win is not worth a second generation of
 * artefacts. Both cases end with the original being stored, so an attachment can never grow by
 * being optimised.
 */
export function isCompressionWorthKeeping(
    originalBytes: number | null | undefined,
    compressedBytes: number | null | undefined,
    minSaving = PHOTO_COMPRESSION_MIN_SAVING,
): boolean {
    const original = positiveInteger(originalBytes);
    const compressed = positiveInteger(compressedBytes);
    if (!original || !compressed) return false;
    return (original - compressed) / original >= minSaving;
}

/**
 * A file size the way a phone shows one: "820 KB", "12,4 MB".
 *
 * Powers of ten, not of two, because that is what iOS reports for the same file and a learner
 * comparing the two numbers should see them agree.
 */
export function formatByteSize(bytes: number | null | undefined, locale = 'tr'): string {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '';
    const decimal = locale.startsWith('tr') ? ',' : '.';
    if (value < 1000) return `${Math.round(value)} B`;
    const units = ['KB', 'MB', 'GB'];
    let scaled = value / 1000;
    let unit = 0;
    while (scaled >= 1000 && unit < units.length - 1) {
        scaled /= 1000;
        unit += 1;
    }
    // One decimal below ten reads precisely without being noisy; above it the fraction is noise.
    const text = scaled >= 10 ? String(Math.round(scaled)) : scaled.toFixed(1);
    return `${text.replace('.', decimal)} ${units[unit]}`;
}

/**
 * Rename a picked file to the container it is actually stored in after a re-encode.
 *
 * A HEIC that came out of the encoder as a JPEG must not keep its old name: a stored `.HEIC` that
 * is really a JPEG is a reference other Anki clients can refuse, and it survives an `.apkg` round
 * trip still mislabelled — the same trap `mediaFilenameForPickedAsset` exists to avoid.
 */
export function withPhotoExtension(name: string, extension: string): string {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    const base = trimmed.replace(/\.[A-Za-z0-9]{1,5}$/, '');
    return `${base || 'gorsel'}.${extension}`;
}

/** How much smaller the result is, as a whole percentage. Zero when there is no saving. */
export function compressionSavingPercent(
    originalBytes: number | null | undefined,
    compressedBytes: number | null | undefined,
): number {
    const original = positiveInteger(originalBytes);
    const compressed = positiveInteger(compressedBytes);
    if (!original || !compressed || compressed >= original) return 0;
    return Math.round(((original - compressed) / original) * 100);
}

// ---------- Native side ----------

/** Size of a local file in bytes, or null when it cannot be determined. */
export async function readUriByteLength(uri: string): Promise<number | null> {
    try {
        const info = await getLegacyFileSystem().getInfoAsync(toFileUri(uri));
        if (!info.exists || info.isDirectory) return null;
        return typeof info.size === 'number' && Number.isFinite(info.size) ? info.size : null;
    } catch {
        return null;
    }
}

/** Bytes needed to recognise every container in `sniffPhotoHeader`, with room to spare. */
const HEADER_PROBE_BYTES = 64;

/**
 * The first bytes of a file, without reading the rest of it.
 *
 * `position`/`length` keep this to a single short read: the file this is asked about may be
 * hundreds of megabytes, and the whole purpose of the module is to never hold one of those in
 * memory at once.
 */
export async function readPhotoHeader(uri: string): Promise<PhotoHeader> {
    try {
        const fs = getLegacyFileSystem();
        const encoded = await fs.readAsStringAsync(toFileUri(uri), {
            encoding: fs.EncodingType.Base64,
            position: 0,
            length: HEADER_PROBE_BYTES,
        });
        const { base64ToBytes } = require('./files') as typeof import('./files');
        return sniffPhotoHeader(base64ToBytes(encoded));
    } catch {
        // An unreadable header is the cautious case: possibly transparent, not known lossless.
        return { format: 'unknown', mayHaveAlpha: true, lossless: false };
    }
}

export type PhotoCompressionResult = {
    /** The file to store. The source URI itself when nothing was worth changing. */
    uri: string;
    /** Extension the stored file must carry, since a re-encode changes the container. */
    extension: 'jpg' | 'png' | null;
    originalBytes: number | null;
    finalBytes: number | null;
    /** True only when a re-encoded file is actually being used. */
    compressed: boolean;
    width?: number;
    height?: number;
};

/**
 * Inspect a picked photo and, when it is worth it, produce a smaller file to store instead.
 *
 * Never throws: a failure anywhere — an unreadable header, an encoder error, a result that came
 * out no smaller — ends with the original URI being returned, because an attachment that is
 * larger than it needed to be is a far better outcome than one that fails to attach.
 */
export async function compressPhotoForAttachment(
    photo: { uri: string; width?: number | null; height?: number | null },
    options?: { maxLongEdge?: number; quality?: number; minBytes?: number },
): Promise<PhotoCompressionResult> {
    const originalBytes = await readUriByteLength(photo.uri);
    const untouched: PhotoCompressionResult = {
        uri: photo.uri,
        extension: null,
        originalBytes,
        finalBytes: originalBytes,
        compressed: false,
    };

    const plan = await planPhotoCompressionForUri(photo, originalBytes, options);
    if (plan.action !== 'recompress') return untouched;

    try {
        const { manipulateAsync, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
        const result = await manipulateAsync(
            toFileUri(photo.uri),
            plan.resized ? [{ resize: { width: plan.width, height: plan.height } }] : [],
            {
                compress: plan.quality,
                format: plan.format === 'png' ? SaveFormat.PNG : SaveFormat.JPEG,
            },
        );
        const finalBytes = await readUriByteLength(result.uri);
        if (!isCompressionWorthKeeping(originalBytes, finalBytes)) return untouched;
        return {
            uri: result.uri,
            extension: plan.format === 'png' ? 'png' : 'jpg',
            originalBytes,
            finalBytes,
            compressed: true,
            width: result.width,
            height: result.height,
        };
    } catch (e) {
        console.warn('[photoCompression] re-encode failed, keeping the original:', e);
        return untouched;
    }
}

/**
 * The plan for one picked photo, with the header read from disk.
 *
 * Split out so the sheet can ask what *would* happen — and show the learner the saving on offer —
 * without doing the work twice.
 */
export async function planPhotoCompressionForUri(
    photo: { uri: string; width?: number | null; height?: number | null },
    knownByteLength?: number | null,
    options?: { maxLongEdge?: number; quality?: number; minBytes?: number },
): Promise<PhotoCompressionPlan> {
    const byteLength = knownByteLength ?? await readUriByteLength(photo.uri);
    if (!byteLength) return { action: 'keep', reason: 'unknown-size' };
    // The header read is skipped for a file too small to be worth touching, so the common case
    // costs one `getInfoAsync` and nothing else.
    const minBytes = options?.minBytes ?? PHOTO_COMPRESSION_MIN_BYTES;
    if (byteLength < minBytes) return { action: 'keep', reason: 'too-small' };

    const header = await readPhotoHeader(photo.uri);
    return planPhotoCompression({
        byteLength,
        width: photo.width,
        height: photo.height,
        header,
        maxLongEdge: options?.maxLongEdge,
        quality: options?.quality,
        minBytes,
    });
}
