/**
 * Key material for the bundled catalog container.
 *
 * An app that installs its catalog offline has to carry the key it decrypts with, so this is
 * not a secret in the cryptographic sense and is not treated as one. What it does buy is
 * distance: the key is assembled from fragments at runtime instead of sitting in the JavaScript
 * bundle as a greppable hex string, so recovering it means reading and running the code rather
 * than running `strings` over the bundle that ships inside every IPA.
 *
 * To rotate: change `KEY_FRAGMENTS`, re-run `npm run pack:catalog`, and ship both together —
 * an installed collection is unaffected because the container is only read at install time.
 */

const KEY_FRAGMENTS = [
    'bka-tus',
    'catalog-container',
    'v1',
    'tusankim.com',
    'chacha20-at-rest',
];

/** Deterministic 32-byte expansion; identical under Node and Hermes because it is all int32. */
export function catalogPackKey(): Uint8Array {
    const key = new Uint8Array(32);
    let hash = 0x811c9dc5;
    let index = 0;
    for (const fragment of KEY_FRAGMENTS) {
        for (let position = 0; position < fragment.length; position++) {
            hash = Math.imul(hash ^ fragment.charCodeAt(position), 0x01000193) >>> 0;
            key[index % 32] = (key[index % 32] ^ (hash >>> ((index % 4) * 8))) & 0xff;
            index++;
        }
    }
    // A second pass so every byte depends on the whole input, not just the fragment that
    // happened to land on its slot.
    for (let round = 0; round < 32; round++) {
        hash = Math.imul(hash ^ key[round], 0x01000193) >>> 0;
        key[(round * 7 + 3) % 32] = (key[(round * 7 + 3) % 32] ^ (hash >>> 16)) & 0xff;
    }
    return key;
}
