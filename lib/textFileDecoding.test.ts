import { describe, expect, it } from 'vitest';
import { decodeTextFileBytes } from './textFileDecoding';
import { parseDelimited } from './importDelimited';

const TURKISH = 'Çölyak;İnce bağırsak\r\nIŞIK refleksi;ğüşıöç ĞÜŞİÖÇ\r\n';

function utf16(text: string, littleEndian: boolean, bom: boolean): Uint8Array {
    const bytes: number[] = bom ? (littleEndian ? [0xff, 0xfe] : [0xfe, 0xff]) : [];
    for (let index = 0; index < text.length; index++) {
        const unit = text.charCodeAt(index);
        bytes.push(...(littleEndian ? [unit & 0xff, unit >> 8] : [unit >> 8, unit & 0xff]));
    }
    return new Uint8Array(bytes);
}

/** Windows-1254 as Excel on a Turkish system writes "CSV (ayrılmış)". */
function windows1254(text: string): Uint8Array {
    const turkish: Record<string, number> = { 'Ğ': 0xd0, 'İ': 0xdd, 'Ş': 0xde, 'ğ': 0xf0, 'ı': 0xfd, 'ş': 0xfe, '€': 0x80, '’': 0x92 };
    return new Uint8Array([...text].map((char) => turkish[char] ?? char.charCodeAt(0)));
}

describe('decodeTextFileBytes', () => {
    it('reads UTF-8 with and without a byte-order mark, astral characters included', () => {
        const text = `${TURKISH}🫀 kalp\n`;
        const plain = new TextEncoder().encode(text);
        expect(decodeTextFileBytes(plain)).toEqual({ text, encoding: 'utf-8' });
        expect(decodeTextFileBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...plain]))).toEqual({ text, encoding: 'utf-8' });
        expect(decodeTextFileBytes(new Uint8Array())).toEqual({ text: '', encoding: 'utf-8' });
    });

    it('reads Excel "Unicode Metin": UTF-16 with a byte-order mark, either byte order', () => {
        const text = TURKISH.replace(/;/g, '\t');
        expect(decodeTextFileBytes(utf16(text, true, true))).toEqual({ text, encoding: 'utf-16le' });
        expect(decodeTextFileBytes(utf16(text, false, true))).toEqual({ text, encoding: 'utf-16be' });
        expect(decodeTextFileBytes(utf16(`${text}🫀`, true, true)).text).toBe(`${text}🫀`);
    });

    it('recognises UTF-16 that carries no byte-order mark', () => {
        expect(decodeTextFileBytes(utf16(TURKISH, true, false))).toEqual({ text: TURKISH, encoding: 'utf-16le' });
        expect(decodeTextFileBytes(utf16('Front\tBack\nKalp\tPompa\n', false, false)).encoding).toBe('utf-16be');
    });

    it('reads a Turkish Excel CSV (Windows-1254) instead of failing or printing "�"', () => {
        const decoded = decodeTextFileBytes(windows1254(`${TURKISH}5 €;Graves’in\r\n`));
        expect(decoded).toEqual({ text: `${TURKISH}5 €;Graves’in\r\n`, encoding: 'windows-1254' });
        // What the import screen then shows: the same rows a UTF-8 copy of the file gives.
        expect(parseDelimited(decoded.text).rows).toEqual(parseDelimited(`${TURKISH}5 €;Graves’in\r\n`).rows);
        expect(parseDelimited(decoded.text).rows[0]).toEqual(['Çölyak', 'İnce bağırsak']);
    });

    it('does not take malformed UTF-8 for UTF-8', () => {
        // An overlong "/", a lone surrogate and a truncated sequence are each one byte off valid.
        for (const bytes of [[0xc0, 0xaf], [0xed, 0xa0, 0x80], [0x41, 0xe2, 0x82], [0xf5, 0x80, 0x80, 0x80]]) {
            expect(decodeTextFileBytes(new Uint8Array(bytes)).encoding).toBe('windows-1254');
        }
    });

    it('keeps a long file whole', () => {
        const text = 'ışık;gölge\n'.repeat(20_000);
        expect(decodeTextFileBytes(new TextEncoder().encode(text)).text).toBe(text);
        expect(decodeTextFileBytes(windows1254(text)).text).toBe(text);
    });
});
