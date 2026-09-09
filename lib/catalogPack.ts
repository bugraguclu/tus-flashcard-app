/**
 * At-rest container for the bundled paid catalog.
 *
 * The catalog ships inside the app binary, so an unmodified `.apkg` sitting in `assets/` is one
 * `unzip` away from being opened in Anki by anyone who downloads the IPA or APK. Wrapping it in
 * this container means the bundled bytes are not a valid Anki package at all: extracting them
 * yields ciphertext, and the file has to be run through this module to become a package again.
 *
 * The honest limit: an offline app must carry its own key, so this stops copying and casual
 * extraction, not a determined reverse-engineer. It raises the cost of theft from "rename and
 * double-click" to "read the binary", which is the difference that matters in practice. The
 * enforcement that cannot be bypassed is in `lib/catalogProtection.ts` — the content can never
 * leave the app as a file, whatever the attacker knows about this container.
 */

const MAGIC = 'TUSPACK1';
const VERSION = 1;
const NONCE_BYTES = 12;
const HEADER_BYTES = 24;
/** ZIP local file header; the plain `.apkg` used during development starts with it. */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

export class CatalogPackError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CatalogPackError';
    }
}

function rotl(value: number, bits: number): number {
    return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function quarterRound(state: Uint32Array, a: number, b: number, c: number, d: number): void {
    state[a] = (state[a] + state[b]) >>> 0; state[d] = rotl(state[d] ^ state[a], 16);
    state[c] = (state[c] + state[d]) >>> 0; state[b] = rotl(state[b] ^ state[c], 12);
    state[a] = (state[a] + state[b]) >>> 0; state[d] = rotl(state[d] ^ state[a], 8);
    state[c] = (state[c] + state[d]) >>> 0; state[b] = rotl(state[b] ^ state[c], 7);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

/**
 * RFC 8439 ChaCha20 keystream applied to `data`.
 *
 * A stream cipher keeps the container the same size as the package and needs no padding, and
 * ChaCha20 is fast enough in pure JavaScript to run over a 9 MB package during installation.
 * Encryption and decryption are the same operation, so both directions call this.
 */
export function chacha20(key: Uint8Array, nonce: Uint8Array, data: Uint8Array, counter = 0): Uint8Array {
    if (key.length !== 32) throw new CatalogPackError('ChaCha20 anahtarı 32 bayt olmalıdır.');
    if (nonce.length !== NONCE_BYTES) throw new CatalogPackError('ChaCha20 nonce değeri 12 bayt olmalıdır.');

    const initial = new Uint32Array(16);
    initial[0] = 0x61707865; initial[1] = 0x3320646e; initial[2] = 0x79622d32; initial[3] = 0x6b206574;
    for (let index = 0; index < 8; index++) initial[4 + index] = readUint32LE(key, index * 4);
    for (let index = 0; index < 3; index++) initial[13 + index] = readUint32LE(nonce, index * 4);

    const out = new Uint8Array(data.length);
    const state = new Uint32Array(16);
    const block = new Uint8Array(64);
    let blockCounter = counter >>> 0;

    for (let offset = 0; offset < data.length; offset += 64) {
        initial[12] = blockCounter;
        state.set(initial);
        for (let round = 0; round < 10; round++) {
            quarterRound(state, 0, 4, 8, 12);
            quarterRound(state, 1, 5, 9, 13);
            quarterRound(state, 2, 6, 10, 14);
            quarterRound(state, 3, 7, 11, 15);
            quarterRound(state, 0, 5, 10, 15);
            quarterRound(state, 1, 6, 11, 12);
            quarterRound(state, 2, 7, 8, 13);
            quarterRound(state, 3, 4, 9, 14);
        }
        for (let word = 0; word < 16; word++) {
            const mixed = (state[word] + initial[word]) >>> 0;
            block[word * 4] = mixed & 0xff;
            block[word * 4 + 1] = (mixed >>> 8) & 0xff;
            block[word * 4 + 2] = (mixed >>> 16) & 0xff;
            block[word * 4 + 3] = (mixed >>> 24) & 0xff;
        }
        const limit = Math.min(64, data.length - offset);
        for (let index = 0; index < limit; index++) out[offset + index] = data[offset + index] ^ block[index];
        blockCounter = (blockCounter + 1) >>> 0;
    }
    return out;
}

/** True when the bytes carry this module's container rather than a raw package. */
export function isCatalogPackContainer(bytes: Uint8Array): boolean {
    if (bytes.length < HEADER_BYTES) return false;
    for (let index = 0; index < MAGIC.length; index++) {
        if (bytes[index] !== MAGIC.charCodeAt(index)) return false;
    }
    return true;
}

/** True for a bare ZIP, which is what an unpacked `.apkg` is. */
export function isRawAnkiPackage(bytes: Uint8Array): boolean {
    return ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export function packCatalogBytes(key: Uint8Array, nonce: Uint8Array, packageBytes: Uint8Array): Uint8Array {
    if (nonce.length !== NONCE_BYTES) throw new CatalogPackError('Nonce 12 bayt olmalıdır.');
    const out = new Uint8Array(HEADER_BYTES + packageBytes.length);
    for (let index = 0; index < MAGIC.length; index++) out[index] = MAGIC.charCodeAt(index);
    out[8] = VERSION;
    out.set(nonce, 12);
    out.set(chacha20(key, nonce, packageBytes), HEADER_BYTES);
    return out;
}

/**
 * Turn bundled bytes back into an Anki package.
 *
 * A raw `.apkg` passes through untouched so a development build can keep using the unpacked
 * asset; release builds ship the container and take the decrypt path.
 */
export function unpackCatalogBytes(key: Uint8Array, bytes: Uint8Array): Uint8Array {
    if (!isCatalogPackContainer(bytes)) {
        if (isRawAnkiPackage(bytes)) return bytes;
        throw new CatalogPackError('Katalog paketi tanınmadı.');
    }
    if (bytes[8] !== VERSION) {
        throw new CatalogPackError(`Katalog paketi sürümü desteklenmiyor: ${bytes[8]}`);
    }
    const nonce = bytes.subarray(12, 12 + NONCE_BYTES);
    const plain = chacha20(key, nonce, bytes.subarray(HEADER_BYTES));
    if (!isRawAnkiPackage(plain)) {
        throw new CatalogPackError('Katalog paketi çözülemedi; anahtar eşleşmiyor.');
    }
    return plain;
}
