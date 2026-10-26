/** SHA-1 of a byte array as lowercase hex, for Anki's media names and package media lists. */
export function sha1Hex(input: Uint8Array): string {
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

/** The same digest as its 20 raw bytes. */
export function sha1Bytes(input: Uint8Array): Uint8Array {
    const hex = sha1Hex(input);
    return Uint8Array.from({ length: 20 }, (_, index) => parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}
