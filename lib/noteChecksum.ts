/** Independently implemented SHA-1 checksum (not a security primitive here).
 * Anki stores the unsigned big-endian first four digest bytes of the HTML-free first field:
 * https://github.com/ankitects/anki/blob/main/rslib/src/notes/mod.rs
 */
export function checksumFieldText(field: string): string {
    const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', deg: '°', plusmn: '±', times: '×', divide: '÷', micro: 'µ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', omega: 'ω' };
    return field
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<img\b[^>]*>/gi, tag => {
            const src = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
            return src ? ` ${src[1] ?? src[2] ?? src[3]} ` : '';
        })
        .replace(/<!--[\s\S]*?-->|<[^>]+>/g, '')
        .replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (whole, entity: string) => {
            if (!entity.startsWith('#')) return entities[entity] ?? whole;
            const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
            return n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : whole;
        }).normalize('NFC');
}
export function ankiFieldChecksum(field: string): number {
    const bytes: number[] = [];
    for (const char of checksumFieldText(field)) {
        const cp = char.codePointAt(0)!;
        if (cp < 0x80) bytes.push(cp);
        else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
        else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
        else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(Math.floor(bitLength / 2 ** (i * 8)) & 255);
    const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    const rotate = (n: number, bits: number) => (n << bits) | (n >>> (32 - bits));
    for (let offset = 0; offset < bytes.length; offset += 64) {
        const w = new Int32Array(80);
        for (let i = 0; i < 16; i++) {
            const j = offset + i * 4;
            w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
        }
        for (let i = 16; i < 80; i++) w[i] = rotate(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
        let [a, b, c, d, e] = state;
        for (let i = 0; i < 80; i++) {
            const f = i < 20 ? ((b & c) | (~b & d)) : i < 40 ? b ^ c ^ d : i < 60 ? ((b & c) | (b & d) | (c & d)) : b ^ c ^ d;
            const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
            const next = (rotate(a, 5) + f + e + k + w[i]) | 0;
            e = d; d = c; c = rotate(b, 30); b = a; a = next;
        }
        [a, b, c, d, e].forEach((n, i) => { state[i] = (state[i] + n) | 0; });
    }
    return state[0] >>> 0;
}
