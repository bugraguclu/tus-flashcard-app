/*
 * Reading a text file whose encoding nobody states.
 *
 * A text import arrives as bytes. Files written by Anki, Google Sheets, Numbers or Excel's
 * "CSV UTF-8" are UTF-8, and that was the only form the importer could read. Excel on a Turkish
 * system offers two other ways first: "CSV (ayrılmış)" writes Windows-1254, and "Unicode Metin"
 * writes UTF-16 with a byte-order mark. On iPhone such a file ended in "Dosya okunamadı"; on web
 * every Turkish letter came through as "�" and was imported that way.
 */

export type TextFileEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1254';

export interface DecodedTextFile {
    text: string;
    encoding: TextFileEncoding;
}

const CHUNK = 8192;

/** Join UTF-16 code units without handing `fromCharCode` more arguments than an engine accepts. */
function fromCodeUnits(units: number[]): string {
    let text = '';
    for (let start = 0; start < units.length; start += CHUNK) {
        text += String.fromCharCode.apply(null, units.slice(start, start + CHUNK));
    }
    return text;
}

/** The text, or null as soon as the bytes are not well-formed UTF-8. */
function decodeUtf8Strict(bytes: Uint8Array, start = 0): string | null {
    const units: number[] = [];
    let index = start;
    const continuation = (offset: number, low = 0x80, high = 0xbf): number | null => {
        const byte = bytes[index + offset];
        return byte !== undefined && byte >= low && byte <= high ? byte & 0x3f : null;
    };
    while (index < bytes.length) {
        const lead = bytes[index];
        if (lead < 0x80) {
            units.push(lead);
            index += 1;
        } else if (lead >= 0xc2 && lead <= 0xdf) {
            const b1 = continuation(1);
            if (b1 === null) return null;
            units.push(((lead & 0x1f) << 6) | b1);
            index += 2;
        } else if (lead >= 0xe0 && lead <= 0xef) {
            // E0 must not encode an overlong form, ED must not encode a surrogate.
            const b1 = continuation(1, lead === 0xe0 ? 0xa0 : 0x80, lead === 0xed ? 0x9f : 0xbf);
            const b2 = continuation(2);
            if (b1 === null || b2 === null) return null;
            units.push(((lead & 0x0f) << 12) | (b1 << 6) | b2);
            index += 3;
        } else if (lead >= 0xf0 && lead <= 0xf4) {
            const b1 = continuation(1, lead === 0xf0 ? 0x90 : 0x80, lead === 0xf4 ? 0x8f : 0xbf);
            const b2 = continuation(2);
            const b3 = continuation(3);
            if (b1 === null || b2 === null || b3 === null) return null;
            const codePoint = (((lead & 0x07) << 18) | (b1 << 12) | (b2 << 6) | b3) - 0x10000;
            units.push(0xd800 | (codePoint >> 10), 0xdc00 | (codePoint & 0x3ff));
            index += 4;
        } else {
            return null;
        }
    }
    return fromCodeUnits(units);
}

function decodeUtf16(bytes: Uint8Array, start: number, littleEndian: boolean): string {
    const units: number[] = [];
    for (let index = start; index + 1 < bytes.length; index += 2) {
        units.push(littleEndian
            ? bytes[index] | (bytes[index + 1] << 8)
            : (bytes[index] << 8) | bytes[index + 1]);
    }
    return fromCodeUnits(units);
}

/**
 * UTF-16 without a byte-order mark: text in a Latin alphabet leaves every other byte zero, which
 * neither UTF-8 nor a single-byte code page does.
 */
function bomlessUtf16(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
    const sample = Math.min(bytes.length - (bytes.length % 2), 4096);
    if (sample < 4) return null;
    let evenZeros = 0;
    let oddZeros = 0;
    for (let index = 0; index < sample; index += 2) {
        if (bytes[index] === 0) evenZeros += 1;
        if (bytes[index + 1] === 0) oddZeros += 1;
    }
    const pairs = sample / 2;
    if (oddZeros > pairs * 0.4 && evenZeros < pairs * 0.05) return 'utf-16le';
    if (evenZeros > pairs * 0.4 && oddZeros < pairs * 0.05) return 'utf-16be';
    return null;
}

/** Windows-1254 bytes 0x80–0x9F; the rest is Latin-1 but for the six Turkish letters below. */
const WINDOWS_1254_HIGH = [
    0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x008e, 0x008f,
    0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x009e, 0x0178,
];
const WINDOWS_1254_TURKISH: Record<number, number> = {
    0xd0: 0x011e, // Ğ
    0xdd: 0x0130, // İ
    0xde: 0x015e, // Ş
    0xf0: 0x011f, // ğ
    0xfd: 0x0131, // ı
    0xfe: 0x015f, // ş
};

function decodeWindows1254(bytes: Uint8Array): string {
    const units: number[] = new Array(bytes.length);
    for (let index = 0; index < bytes.length; index++) {
        const byte = bytes[index];
        units[index] = byte < 0x80
            ? byte
            : byte < 0xa0
                ? WINDOWS_1254_HIGH[byte - 0x80]
                : WINDOWS_1254_TURKISH[byte] ?? byte;
    }
    return fromCodeUnits(units);
}

/**
 * Decode a text file: by its byte-order mark when it has one, as UTF-8 when the bytes are
 * well-formed UTF-8, and otherwise as Windows-1254, the code page a Turkish Windows writes. A
 * Western European file (Windows-1252) reads the same there except for six rarely used letters.
 * A leading byte-order mark is not part of the text.
 */
export function decodeTextFileBytes(bytes: Uint8Array): DecodedTextFile {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: decodeUtf16(bytes, 2, true), encoding: 'utf-16le' };
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: decodeUtf16(bytes, 2, false), encoding: 'utf-16be' };

    const utf8Start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
    const utf8 = decodeUtf8Strict(bytes, utf8Start);
    if (utf8 !== null) {
        // Plain ASCII is valid UTF-8 too, so the zero bytes of BOM-less UTF-16 are checked first.
        const wide = utf8Start === 0 ? bomlessUtf16(bytes) : null;
        if (wide) return { text: decodeUtf16(bytes, 0, wide === 'utf-16le'), encoding: wide };
        return { text: utf8, encoding: 'utf-8' };
    }

    const wide = bomlessUtf16(bytes);
    if (wide) return { text: decodeUtf16(bytes, 0, wide === 'utf-16le'), encoding: wide };
    return { text: decodeWindows1254(bytes), encoding: 'windows-1254' };
}
