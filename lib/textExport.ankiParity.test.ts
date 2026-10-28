// The plain-text exports against Anki's own. test/fixtures/anki-26.09-roundtrip.colpkg is a
// learner's collection and anki-26.09-{notes,cards}-{html,text}.txt are what Anki 26.09.3 exports
// from it (`scripts/anki-oracle/roundtrip.py text`), so the app, holding the same collection, must
// write the same bytes, Image Occlusion cards included. A notes file imported back changes nothing.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { createAppDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any, media: new Map<string, Uint8Array>() }));

vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbUpsertFtsCard: () => {},
    dbIndexAllCards: () => {},
}));
vi.mock('./mediaStore', () => ({
    sanitizeMediaFilename: (name: string) => name,
    saveMediaBytes: async (name: string, bytes: Uint8Array) => { holder.media.set(name, new Uint8Array(bytes)); },
    readMediaBytes: async (name: string) => holder.media.get(name) ?? null,
    listStoredMediaFilenames: async () => [...holder.media.keys()],
}));

import { importApkg } from './importApkg';
import { buildAnkiExport } from './exportAnkiPackage';
import { openSqlJsReader } from './webDb';
import { importDelimitedNotes } from './importNotes';
import { getAllAnkiCards, getAllNotes, getAllNoteTypes } from './noteManager';

const FIXTURES = path.resolve(__dirname, '../test/fixtures');
const ankiExport = (name: string) => readFileSync(path.join(FIXTURES, `anki-26.09-${name}.txt`), 'utf8');

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    Platform.OS = 'web';
});

beforeEach(async () => {
    holder.db = createAppDb(SQL);
    holder.media.clear();
    await importApkg(new Uint8Array(readFileSync(path.join(FIXTURES, 'anki-26.09-roundtrip.colpkg'))), {
        subject: 'tus', replaceCollection: true, withScheduling: true, withDeckConfigs: true, openReader: openSqlJsReader,
    });
});

const allColumns = { includeTags: true, includeDeck: true, includeNotetype: true, includeGuid: true };

describe('plain-text exports', () => {
    for (const includeHtml of [true, false]) {
        const suffix = includeHtml ? 'html' : 'text';
        it(`writes Notes in Plain Text as Anki does (${suffix})`, async () => {
            const artifact = await buildAnkiExport('notesTxt', undefined, true, undefined, { ...allColumns, includeHtml });
            expect(artifact.text).toBe(ankiExport(`notes-${suffix}`));
        });

        it(`writes Cards in Plain Text as Anki does (${suffix})`, async () => {
            const artifact = await buildAnkiExport('cardsTxt', undefined, true, undefined, { includeHtml });
            expect(artifact.text).toBe(ankiExport(`cards-${suffix}`));
        });
    }

    it('changes nothing when its own notes file is imported back', async () => {
        const before = { notes: getAllNotes(), cards: getAllAnkiCards() };
        const basic = getAllNoteTypes().find((type) => type.name === 'Basic')!;
        const result = importDelimitedNotes(ankiExport('notes-html'), { noteType: basic, deckId: 1 });
        expect(result.added).toBe(0);
        expect(result.updated).toBe(0);
        expect({ notes: getAllNotes(), cards: getAllAnkiCards() }).toEqual(before);
    });
});
