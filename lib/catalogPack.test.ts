import { describe, expect, it } from 'vitest';
import {
    CatalogPackError,
    chacha20,
    isCatalogPackContainer,
    isRawAnkiPackage,
    packCatalogBytes,
    unpackCatalogBytes,
} from './catalogPack';
import { catalogPackKey } from './catalogPackKey';

const ZIP_HEADER = [0x50, 0x4b, 0x03, 0x04];

function fakePackage(size = 512): Uint8Array {
    const bytes = new Uint8Array(size);
    bytes.set(ZIP_HEADER, 0);
    for (let index = 4; index < size; index++) bytes[index] = (index * 31) & 0xff;
    return bytes;
}

describe('chacha20', () => {
    it('matches the RFC 8439 §2.4.2 test vector', () => {
        const key = new Uint8Array(32);
        for (let index = 0; index < 32; index++) key[index] = index;
        const nonce = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0x4a, 0, 0, 0, 0]);
        const plaintext = new TextEncoder().encode(
            "Ladies and Gentlemen of the class of '99: If I could offer you only one tip "
            + 'for the future, sunscreen would be it.',
        );

        const actual = chacha20(key, nonce, plaintext, 1);

        expect([...actual.slice(0, 16)]).toEqual([
            0x6e, 0x2e, 0x35, 0x9a, 0x25, 0x68, 0xf9, 0x80,
            0x41, 0xba, 0x07, 0x28, 0xdd, 0x0d, 0x69, 0x81,
        ]);
        expect([...actual.slice(-2)]).toEqual([0x87, 0x4d]);
    });

    it('is its own inverse', () => {
        const key = catalogPackKey();
        const nonce = new Uint8Array(12).fill(9);
        const data = fakePackage(300);
        expect([...chacha20(key, nonce, chacha20(key, nonce, data))]).toEqual([...data]);
    });

    it('encrypts data that is not a multiple of the 64-byte block', () => {
        const key = catalogPackKey();
        const nonce = new Uint8Array(12).fill(3);
        const data = fakePackage(70);
        expect(chacha20(key, nonce, data)).toHaveLength(70);
        expect([...chacha20(key, nonce, chacha20(key, nonce, data))]).toEqual([...data]);
    });

    it('rejects a key or nonce of the wrong length', () => {
        expect(() => chacha20(new Uint8Array(16), new Uint8Array(12), new Uint8Array(1))).toThrow(CatalogPackError);
        expect(() => chacha20(new Uint8Array(32), new Uint8Array(8), new Uint8Array(1))).toThrow(CatalogPackError);
    });
});

describe('catalog container', () => {
    const key = catalogPackKey();
    const nonce = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    it('round-trips a package through the container', () => {
        const original = fakePackage();
        const packed = packCatalogBytes(key, nonce, original);
        expect([...unpackCatalogBytes(key, packed)]).toEqual([...original]);
    });

    it('hides the zip signature so the bundled file is not a usable package', () => {
        const packed = packCatalogBytes(key, nonce, fakePackage());
        expect(isRawAnkiPackage(packed)).toBe(false);
        expect(isCatalogPackContainer(packed)).toBe(true);
        // Nothing an unzip tool can open: the payload no longer starts with a local file header.
        expect([...packed.slice(24, 28)]).not.toEqual(ZIP_HEADER);
    });

    it('passes a raw package through so development builds keep working', () => {
        const original = fakePackage();
        expect([...unpackCatalogBytes(key, original)]).toEqual([...original]);
    });

    it('refuses to decrypt with the wrong key instead of returning garbage', () => {
        const packed = packCatalogBytes(key, nonce, fakePackage());
        const wrongKey = catalogPackKey();
        wrongKey[0] ^= 0xff;
        expect(() => unpackCatalogBytes(wrongKey, packed)).toThrow(/anahtar eşleşmiyor/);
    });

    it('rejects an unknown container version', () => {
        const packed = packCatalogBytes(key, nonce, fakePackage());
        packed[8] = 9;
        expect(() => unpackCatalogBytes(key, packed)).toThrow(/sürümü desteklenmiyor/);
    });

    it('rejects bytes that are neither a container nor a package', () => {
        expect(() => unpackCatalogBytes(key, new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/tanınmadı/);
    });
});

describe('catalog pack key', () => {
    it('derives a stable 32-byte key', () => {
        const first = catalogPackKey();
        expect(first).toHaveLength(32);
        expect([...catalogPackKey()]).toEqual([...first]);
    });

    it('does not leave whole bytes unmixed', () => {
        expect(catalogPackKey().every((byte) => byte === 0)).toBe(false);
        expect(new Set(catalogPackKey()).size).toBeGreaterThan(8);
    });
});
