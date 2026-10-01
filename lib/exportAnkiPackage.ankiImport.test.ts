// What Anki 26.05 needs from a package this app exports before it imports anything from it. Each
// requirement was found by importing an app export into Anki itself through scripts/anki-oracle,
// which names the part of the package Anki refuses. The decks come from both of Anki's package
// formats (test/fixtures/anki-26.05-*.apkg), from the importer and from this app.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import JSZip from 'jszip';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { createAppDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any, media: new Map<string, Uint8Array>() }));

vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbUpsertFtsCard: () => {},
    dbIndexAllCards: () => {},
    dbDeleteFtsCard: () => {},
}));
vi.mock('./mediaStore', () => ({
    sanitizeMediaFilename: (name: string) => name,
    saveMediaBytes: async (name: string, bytes: Uint8Array) => { holder.media.set(name, new Uint8Array(bytes)); },
    readMediaBytes: async (name: string) => holder.media.get(name) ?? null,
}));

import { importApkg } from './importApkg';
import { buildAnkiExport } from './exportAnkiPackage';
import { openSqlJsReader } from './webDb';
import { createDeck } from './deckManager';
import { getAllAnkiCards, saveAnkiCard } from './noteManager';

const FIXTURES = path.resolve(__dirname, '../test/fixtures');

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    holder.db = createAppDb(SQL);
    holder.media.clear();
    Platform.OS = 'web';
});

/** The deck and preset JSON of a whole-collection export, with progress and presets or without. */
async function exportedCollection(withProgress: boolean) {
    const artifact = await buildAnkiExport('apkg', undefined, true, undefined, {
        includeScheduling: withProgress,
        includeDeckConfigs: withProgress,
    });
    const zip = await JSZip.loadAsync(artifact.bytes!);
    const reader = await openSqlJsReader(await zip.file('collection.anki21')!.async('uint8array'));
    const col = reader.getFirstSync<{ decks: string; dconf: string }>('SELECT decks, dconf FROM col')!;
    reader.close();
    return {
        decks: Object.values(JSON.parse(col.decks)) as Record<string, any>[],
        presets: JSON.parse(col.dconf) as Record<string, Record<string, any>>,
    };
}

describe('a package this app exports', () => {
    it.each(['anki-26.05-modern.apkg', 'anki-26.05-legacy.apkg'])(
        'carries what Anki needs to accept its decks (decks from %s)',
        async (fixture) => {
            await importApkg(new Uint8Array(readFileSync(path.join(FIXTURES, fixture))), {
                subject: 'tus', topic: 'Anki', fileName: fixture, openReader: openSqlJsReader,
            });
            const madeHere = createDeck('TUS Örnek::Burada yapıldı');
            saveAnkiCard({ ...getAllAnkiCards()[0], deckId: madeHere.id });

            for (const withProgress of [true, false]) {
                const { decks, presets } = await exportedCollection(withProgress);
                expect(decks.map((deck) => deck.name)).toEqual(expect.arrayContaining([
                    'TUS Örnek', 'TUS Örnek::Kardiyoloji', 'TUS Örnek::Burada yapıldı',
                ]));
                for (const deck of decks) {
                    // Without all four, Anki 26.05 rejects the whole package with "decoding decks:
                    // JsonError". The legacy export's decks arrive with Anki's own pairs, such as
                    // newToday [400, 3]: day 400 of a collection this package does not share.
                    expect(deck, deck.name).toMatchObject({
                        lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0],
                    });
                    // A deck whose preset the package lacks fails the import with "No such deck
                    // config". Without presets every deck names preset 1, as in Anki's own exports.
                    expect(presets[String(deck.conf)], deck.name).toBeDefined();
                    if (!withProgress) expect(deck.conf, deck.name).toBe(1);
                }
            }
        },
    );
});
