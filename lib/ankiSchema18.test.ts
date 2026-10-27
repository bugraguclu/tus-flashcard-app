// The schema-18 reader against Anki itself: each fixture pair is one collection that Anki exported
// in its default format and with "Support older Anki versions", so the note types, decks and
// presets read from the default format must equal the JSON Anki wrote into the legacy one.
// anki-26.09-roundtrip*.apkg are written by `scripts/anki-oracle/roundtrip.py source`, and use
// field descriptions, fonts, the plain-text/collapsed/exclude-from-search/required flags, browser
// templates, a template deck override, stock kinds, a Markdown description and two presets.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractCollectionBytes, hardenAndValidateAnkiReader } from './importApkg';
import { readLegacyCollectionMeta } from './importApkgMetadata';
import { openSqlJsReader } from './webDb';
import { parseAnkiJson, stringifyAnkiJson } from './ankiJson';

const FIXTURES = path.resolve(__dirname, '../test/fixtures');

beforeAll(async () => {
    await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

async function meta(name: string) {
    const reader = await openSqlJsReader(await extractCollectionBytes(new Uint8Array(readFileSync(path.join(FIXTURES, name)))));
    try {
        hardenAndValidateAnkiReader(reader);
        return readLegacyCollectionMeta(reader)!;
    } finally {
        reader.close();
    }
}

describe('schema-18 note types, decks and presets', () => {
    for (const [modern, legacy] of [
        ['anki-26.09-roundtrip.apkg', 'anki-26.09-roundtrip-legacy.apkg'],
        ['anki-26.05-modern.apkg', 'anki-26.05-legacy.apkg'],
    ]) {
        it(`reads ${modern} as Anki writes ${legacy}`, async () => {
            const [fromModern, fromLegacy] = await Promise.all([meta(modern), meta(legacy)]);
            expect(fromModern.models).toEqual(fromLegacy.models);
            expect(fromModern.decks).toEqual(fromLegacy.decks);
            expect(fromModern.dconf).toEqual(fromLegacy.dconf);
        });
    }

    it('keeps 64-bit field and template ids exact', async () => {
        const { models } = await meta('anki-26.09-roundtrip.apkg');
        const legacyJson = await (async () => {
            const reader = await openSqlJsReader(await extractCollectionBytes(new Uint8Array(readFileSync(path.join(FIXTURES, 'anki-26.09-roundtrip-legacy.apkg')))));
            try {
                return reader.getFirstSync<{ models: string }>('SELECT models FROM col')!.models;
            } finally {
                reader.close();
            }
        })();
        const ids = (text: string) => [...text.matchAll(/"id":\s*(-?\d{16,})/g)].map((match) => match[1]).sort();
        expect(ids(stringifyAnkiJson(models))).toEqual(ids(legacyJson));
        expect(ids(stringifyAnkiJson(parseAnkiJson(legacyJson)))).toEqual(ids(legacyJson));
        expect(ids(legacyJson).length).toBeGreaterThan(10);
    });
});
