/**
 * SHA-256 of a UTF-8 string, as the base64 digest a Content-Security-Policy hash source expects.
 *
 * Synchronous and dependency-free on purpose: the web document head is rendered once at build
 * time, before any asynchronous Web Crypto call could return, and `crypto` is stubbed out of the
 * Metro bundle. Speed is irrelevant at the few kilobytes it is ever asked to hash.
 */

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8Bytes(text: string): Uint8Array {
    const bytes: number[] = [];
    for (let index = 0; index < text.length; index++) {
        let code = text.charCodeAt(index);
        // Combine a surrogate pair into one code point; a lone surrogate encodes as U+FFFD,
        // which is what TextEncoder (and therefore the browser) does with it.
        if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
            const low = text.charCodeAt(index + 1);
            if (low >= 0xdc00 && low <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                index++;
            } else {
                code = 0xfffd;
            }
        } else if (code >= 0xd800 && code <= 0xdfff) {
            code = 0xfffd;
        }
        if (code < 0x80) bytes.push(code);
        else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
    return Uint8Array.from(bytes);
}

function digest(message: Uint8Array): Uint8Array {
    const bitLength = message.length * 8;
    const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(message);
    padded[message.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
    view.setUint32(paddedLength - 4, bitLength >>> 0);

    const hash = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    const words = new Uint32Array(64);
    const rotate = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));

    for (let offset = 0; offset < paddedLength; offset += 64) {
        for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4);
        for (let index = 16; index < 64; index++) {
            const s0 = rotate(words[index - 15], 7) ^ rotate(words[index - 15], 18) ^ (words[index - 15] >>> 3);
            const s1 = rotate(words[index - 2], 17) ^ rotate(words[index - 2], 19) ^ (words[index - 2] >>> 10);
            words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = hash;
        for (let index = 0; index < 64; index++) {
            const sum1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
            const choice = (e & f) ^ (~e & g);
            const temp1 = (h + sum1 + choice + K[index] + words[index]) >>> 0;
            const sum0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
            const majority = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (sum0 + majority) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }
        hash[0] = (hash[0] + a) >>> 0;
        hash[1] = (hash[1] + b) >>> 0;
        hash[2] = (hash[2] + c) >>> 0;
        hash[3] = (hash[3] + d) >>> 0;
        hash[4] = (hash[4] + e) >>> 0;
        hash[5] = (hash[5] + f) >>> 0;
        hash[6] = (hash[6] + g) >>> 0;
        hash[7] = (hash[7] + h) >>> 0;
    }

    const output = new Uint8Array(32);
    const outputView = new DataView(output.buffer);
    hash.forEach((word, index) => outputView.setUint32(index * 4, word));
    return output;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes: Uint8Array): string {
    let out = '';
    for (let index = 0; index < bytes.length; index += 3) {
        const b0 = bytes[index];
        const b1 = index + 1 < bytes.length ? bytes[index + 1] : 0;
        const b2 = index + 2 < bytes.length ? bytes[index + 2] : 0;
        out += BASE64[b0 >> 2]
            + BASE64[((b0 & 3) << 4) | (b1 >> 4)]
            + (index + 1 < bytes.length ? BASE64[((b1 & 15) << 2) | (b2 >> 6)] : '=')
            + (index + 2 < bytes.length ? BASE64[b2 & 63] : '=');
    }
    return out;
}

/** Base64 SHA-256 digest of the UTF-8 encoding of `text`. */
export function sha256Base64(text: string): string {
    return toBase64(digest(utf8Bytes(text)));
}

/** The `'sha256-…'` source that allows exactly this inline script under a CSP. */
export function cspHashSource(script: string): string {
    return `'sha256-${sha256Base64(script)}'`;
}
