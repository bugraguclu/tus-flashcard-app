import { describe, expect, it } from 'vitest';
import {
    PHOTO_COMFORTABLE_BYTES,
    PHOTO_COMPRESSION_MIN_BYTES,
    PHOTO_MAX_LONG_EDGE,
    compressionSavingPercent,
    formatByteSize,
    isCompressionWorthKeeping,
    planPhotoCompression,
    sniffPhotoHeader,
    withPhotoExtension,
    type PhotoHeader,
} from './photoCompression';

function header(...bytes: number[]): Uint8Array {
    const out = new Uint8Array(64);
    out.set(bytes, 0);
    return out;
}

function ascii(text: string, offset = 0, size = 64): Uint8Array {
    const out = new Uint8Array(size);
    for (let i = 0; i < text.length; i += 1) out[offset + i] = text.charCodeAt(i);
    return out;
}

const OPAQUE: PhotoHeader = { format: 'jpeg', mayHaveAlpha: false, lossless: false };
const LOSSLESS_OPAQUE: PhotoHeader = { format: 'tiff', mayHaveAlpha: false, lossless: true };
const TRANSPARENT: PhotoHeader = { format: 'png', mayHaveAlpha: true, lossless: true };

describe('sniffPhotoHeader', () => {
    it('recognises a JPEG as opaque and already compressed', () => {
        expect(sniffPhotoHeader(header(0xff, 0xd8, 0xff, 0xe0))).toEqual({
            format: 'jpeg', mayHaveAlpha: false, lossless: false,
        });
    });

    it('reads the PNG colour type rather than assuming every PNG is transparent', () => {
        const png = (colourType: number) => {
            const bytes = header(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
            bytes[25] = colourType;
            return sniffPhotoHeader(bytes);
        };
        // Greyscale and true colour carry no alpha channel of their own.
        expect(png(0).mayHaveAlpha).toBe(false);
        expect(png(2).mayHaveAlpha).toBe(false);
        // A palette can be given transparency by a tRNS chunk this read cannot see.
        expect(png(3).mayHaveAlpha).toBe(true);
        expect(png(4).mayHaveAlpha).toBe(true);
        expect(png(6).mayHaveAlpha).toBe(true);
        expect(png(2).format).toBe('png');
        expect(png(2).lossless).toBe(true);
    });

    it('separates the WebP codecs, because only some of them can be transparent', () => {
        const webp = (chunk: string, flags = 0) => {
            const bytes = ascii('RIFF');
            bytes.set(ascii('WEBP', 0, 4), 8);
            bytes.set(ascii(chunk, 0, 4), 12);
            bytes[20] = flags;
            return sniffPhotoHeader(bytes);
        };
        expect(webp('VP8 ').mayHaveAlpha).toBe(false);
        expect(webp('VP8L').mayHaveAlpha).toBe(true);
        expect(webp('VP8X', 0x00).mayHaveAlpha).toBe(false);
        expect(webp('VP8X', 0x10).mayHaveAlpha).toBe(true);
    });

    it('recognises the ftyp brands an iPhone actually produces', () => {
        const ftyp = (brand: string) => {
            const bytes = new Uint8Array(64);
            bytes.set(ascii('ftyp', 0, 4), 4);
            bytes.set(ascii(brand, 0, 4), 8);
            return sniffPhotoHeader(bytes);
        };
        expect(ftyp('heic').format).toBe('heif');
        expect(ftyp('mif1').format).toBe('heif');
        expect(ftyp('avif').format).toBe('avif');
    });

    it('recognises both TIFF byte orders and GIF and BMP', () => {
        expect(sniffPhotoHeader(header(0x49, 0x49, 0x2a, 0x00)).format).toBe('tiff');
        expect(sniffPhotoHeader(header(0x4d, 0x4d, 0x00, 0x2a)).format).toBe('tiff');
        expect(sniffPhotoHeader(ascii('GIF89a')).format).toBe('gif');
        expect(sniffPhotoHeader(ascii('BM')).format).toBe('bmp');
    });

    it('gives an unrecognised file the cautious answer', () => {
        // Unknown means "do not flatten it to JPEG", which is the only safe reading.
        expect(sniffPhotoHeader(header(0x00, 0x01, 0x02, 0x03))).toEqual({
            format: 'unknown', mayHaveAlpha: true, lossless: false,
        });
        expect(sniffPhotoHeader(new Uint8Array(0)).format).toBe('unknown');
    });
});

describe('planPhotoCompression', () => {
    it('turns a huge lossless capture into a card-sized JPEG', () => {
        // 8000x6000 at six bytes a pixel: the 300 MB case the feature exists for.
        const plan = planPhotoCompression({
            byteLength: 288_000_000,
            width: 8000,
            height: 6000,
            header: LOSSLESS_OPAQUE,
        });
        expect(plan.action).toBe('recompress');
        if (plan.action !== 'recompress') return;
        expect(plan.format).toBe('jpeg');
        expect(plan.resized).toBe(true);
        expect(Math.max(plan.width, plan.height)).toBe(PHOTO_MAX_LONG_EDGE);
        // The aspect ratio survives the resize.
        expect(plan.width / plan.height).toBeCloseTo(8000 / 6000, 3);
        // And the estimate is a small fraction of what came in, not a rounding of it.
        expect(plan.estimatedBytes).toBeLessThan(288_000_000 / 20);
    });

    it('leaves an ordinary camera JPEG completely alone', () => {
        // 4032x3024 at 3.5 MB is 0.29 bytes a pixel: over the pixel ceiling, but already encoded
        // about as tightly as it can be, and small enough that shrinking it is not worth quality.
        const plan = planPhotoCompression({
            byteLength: 3_500_000,
            width: 4032,
            height: 3024,
            header: OPAQUE,
        });
        expect(plan).toEqual({ action: 'keep', reason: 'already-efficient' });
    });

    it('still shrinks an efficient photo once it is genuinely too big for a collection', () => {
        // Same 0.2 bytes a pixel as the capture above, but sixty megapixels and twelve megabytes.
        const plan = planPhotoCompression({
            byteLength: 12_000_000,
            width: 9504,
            height: 6336,
            header: OPAQUE,
        });
        expect(plan.action).toBe('recompress');
        if (plan.action !== 'recompress') return;
        expect(plan.resized).toBe(true);
        expect(plan.width).toBe(PHOTO_MAX_LONG_EDGE);
    });

    it('draws the line for an efficient photo at the comfortable size, not at the pixel ceiling', () => {
        const oversizedButSmall = { width: 6000, height: 4000, header: OPAQUE } as const;
        expect(planPhotoCompression({ ...oversizedButSmall, byteLength: PHOTO_COMFORTABLE_BYTES }))
            .toEqual({ action: 'keep', reason: 'already-efficient' });
        expect(planPhotoCompression({ ...oversizedButSmall, byteLength: PHOTO_COMFORTABLE_BYTES + 1 }).action)
            .toBe('recompress');
    });

    it('never flattens transparency onto black', () => {
        // Big enough and wasteful enough to qualify, but it may carry an alpha channel.
        const sameSize = planPhotoCompression({
            byteLength: 20_000_000,
            width: 2000,
            height: 1500,
            header: TRANSPARENT,
        });
        expect(sameSize).toEqual({ action: 'keep', reason: 'alpha-no-resize' });

        const oversized = planPhotoCompression({
            byteLength: 90_000_000,
            width: 6000,
            height: 4000,
            header: TRANSPARENT,
        });
        expect(oversized.action).toBe('recompress');
        if (oversized.action !== 'recompress') return;
        expect(oversized.format).toBe('png');
    });

    it('leaves a small file alone whatever it is', () => {
        const plan = planPhotoCompression({
            byteLength: PHOTO_COMPRESSION_MIN_BYTES - 1,
            width: 8000,
            height: 6000,
            header: LOSSLESS_OPAQUE,
        });
        expect(plan).toEqual({ action: 'keep', reason: 'too-small' });
    });

    it('declines to guess when the size or the shape is unknown', () => {
        expect(planPhotoCompression({ byteLength: null, width: 8000, height: 6000, header: LOSSLESS_OPAQUE }))
            .toEqual({ action: 'keep', reason: 'unknown-size' });
        // A picker that reports no dimensions gives nothing to judge efficiency by.
        expect(planPhotoCompression({ byteLength: 90_000_000, width: 0, height: 6000, header: LOSSLESS_OPAQUE }))
            .toEqual({ action: 'keep', reason: 'unknown-dimensions' });
        expect(planPhotoCompression({ byteLength: 90_000_000, width: null, height: null, header: LOSSLESS_OPAQUE }))
            .toEqual({ action: 'keep', reason: 'unknown-dimensions' });
    });

    it('re-encodes a wasteful image that is already small enough in pixels', () => {
        // A 2000x1500 BMP is under the ceiling but eight bytes a pixel; the encoding is the waste.
        const plan = planPhotoCompression({
            byteLength: 24_000_000,
            width: 2000,
            height: 1500,
            header: { format: 'bmp', mayHaveAlpha: false, lossless: true },
        });
        expect(plan.action).toBe('recompress');
        if (plan.action !== 'recompress') return;
        expect(plan.resized).toBe(false);
        expect(plan.width).toBe(2000);
        expect(plan.height).toBe(1500);
    });

    it('honours a caller-supplied ceiling and quality, and clamps a nonsense quality', () => {
        const plan = planPhotoCompression({
            byteLength: 90_000_000,
            width: 6000,
            height: 4000,
            header: LOSSLESS_OPAQUE,
            maxLongEdge: 1200,
            quality: 5,
        });
        expect(plan.action).toBe('recompress');
        if (plan.action !== 'recompress') return;
        expect(plan.width).toBe(1200);
        expect(plan.quality).toBe(1);
    });

    it('never estimates a result larger than the file it started from', () => {
        const plan = planPhotoCompression({
            byteLength: 2_000_000,
            width: 4000,
            height: 3000,
            header: { format: 'png', mayHaveAlpha: false, lossless: true },
        });
        if (plan.action !== 'recompress') return;
        expect(plan.estimatedBytes).toBeLessThanOrEqual(2_000_000);
    });
});

describe('isCompressionWorthKeeping', () => {
    it('keeps a real saving and discards a marginal or negative one', () => {
        expect(isCompressionWorthKeeping(100_000_000, 2_000_000)).toBe(true);
        expect(isCompressionWorthKeeping(1_000_000, 900_000)).toBe(false);
        // A re-encode that came out larger must never replace the original.
        expect(isCompressionWorthKeeping(1_000_000, 1_400_000)).toBe(false);
    });

    it('treats an unmeasurable result as not worth keeping', () => {
        expect(isCompressionWorthKeeping(1_000_000, null)).toBe(false);
        expect(isCompressionWorthKeeping(null, 1_000)).toBe(false);
        expect(isCompressionWorthKeeping(0, 0)).toBe(false);
    });
});

describe('formatByteSize', () => {
    it('reads the way a phone shows a file size', () => {
        expect(formatByteSize(820_000)).toBe('820 KB');
        expect(formatByteSize(12_400_000)).toBe('12 MB');
        expect(formatByteSize(1_240_000)).toBe('1,2 MB');
        expect(formatByteSize(1_240_000, 'en')).toBe('1.2 MB');
        expect(formatByteSize(300_000_000)).toBe('300 MB');
        expect(formatByteSize(940)).toBe('940 B');
    });

    it('has nothing to say about a size it does not have', () => {
        expect(formatByteSize(null)).toBe('');
        expect(formatByteSize(0)).toBe('');
        expect(formatByteSize(Number.NaN)).toBe('');
    });
});

describe('withPhotoExtension', () => {
    it('renames a re-encoded file to the container it is actually stored in', () => {
        // The trap this avoids: a HEIC that the encoder handed back as a JPEG keeping its old
        // name, which other Anki clients can refuse and an .apkg carries mislabelled.
        expect(withPhotoExtension('IMG_0042.HEIC', 'jpg')).toBe('IMG_0042.jpg');
        expect(withPhotoExtension('tarama.png', 'jpg')).toBe('tarama.jpg');
        expect(withPhotoExtension('logo.jpeg', 'png')).toBe('logo.png');
    });

    it('leaves a name with no extension recognisable, and never produces a bare dot', () => {
        expect(withPhotoExtension('kalp', 'jpg')).toBe('kalp.jpg');
        expect(withPhotoExtension('', 'jpg')).toBe('gorsel.jpg');
        expect(withPhotoExtension('   ', 'jpg')).toBe('gorsel.jpg');
        // Only a plausible extension is replaced: a dotted tail too long to be one is part of
        // the name and stays, while a short one is treated as the extension it looks like.
        expect(withPhotoExtension('ders.notu.20260907', 'jpg')).toBe('ders.notu.20260907.jpg');
        expect(withPhotoExtension('ders.notu.2026', 'jpg')).toBe('ders.notu.jpg');
    });
});

describe('compressionSavingPercent', () => {
    it('reports the share of the file that was saved', () => {
        expect(compressionSavingPercent(100, 10)).toBe(90);
        expect(compressionSavingPercent(100, 100)).toBe(0);
        expect(compressionSavingPercent(100, 120)).toBe(0);
        expect(compressionSavingPercent(null, 10)).toBe(0);
    });
});
