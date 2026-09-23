/**
 * Wraps the bundled Anki package in the at-rest container the app decrypts at install time.
 *
 * Without this step the paid catalog ships inside every IPA and APK as a valid `.apkg`, so
 * anyone who unpacks the app archive can open the complete deck in Anki. The packed artifact is
 * the file that should be committed and shipped; the plain `.apkg` stays the working master and
 * belongs outside the build.
 *
 * Run with: npm run pack:catalog
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { packCatalogBytes, unpackCatalogBytes } from '../lib/catalogPack.ts';
import { catalogPackKey } from '../lib/catalogPackKey.ts';

const SOURCE_PATH = 'assets/catalog/bka-tus-complete.apkg';
const PACKED_PATH = 'assets/catalog/bka-tus-complete.tuspack';

function main(): void {
    const source = new Uint8Array(readFileSync(SOURCE_PATH));
    const key = catalogPackKey();
    const nonce = new Uint8Array(randomBytes(12));
    const packed = packCatalogBytes(key, nonce, source);

    // Never ship an artifact that has not been proved to decrypt back to the exact input.
    const verified = unpackCatalogBytes(key, packed);
    if (verified.length !== source.length || verified.some((byte, index) => byte !== source[index])) {
        throw new Error('Paketleme doğrulaması başarısız: çözülen içerik kaynakla eşleşmiyor.');
    }

    writeFileSync(PACKED_PATH, packed);
    const megabytes = (packed.length / (1024 * 1024)).toFixed(2);
    console.log(`Paketlendi: ${PACKED_PATH} (${megabytes} MB)`);
    console.log(`Kaynak .apkg dağıtıma dahil edilmemelidir: ${SOURCE_PATH}`);
}

main();
