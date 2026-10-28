// A package that goes through this app any number of times comes out as it went in. The fixture is
// a learner's collection exported by Anki 26.09.3 (`scripts/anki-oracle/roundtrip.py source`): its
// note types, decks and presets must leave exactly as Anki wrote them, with no key added or lost,
// and every later pass must write the same collection again. lib/ankiRoundtrip.oracle.test.ts runs
// the same loop with Anki itself importing and exporting between passes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { createAppDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any, media: new Map<string, Uint8Array>() }));

vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbUpsertFtsCard: () => {},
    dbIndexAllCards: () => {},
    isPrimaryTab: () => true,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getAllKeys: async () => [], multiRemove: async () => {} } }));
vi.mock('./mediaStore', () => ({
    sanitizeMediaFilename: (name: string) => name,
    saveMediaBytes: async (name: string, bytes: Uint8Array) => { holder.media.set(name, new Uint8Array(bytes)); },
    readMediaBytes: async (name: string) => holder.media.get(name) ?? null,
    listStoredMediaFilenames: async () => [...holder.media.keys()],
}));

import { importApkg } from './importApkg';
import { buildAnkiExport } from './exportAnkiPackage';
import { openSqlJsReader } from './webDb';
import { parseAnkiJson } from './ankiJson';
import { BUILTIN_NOTE_TYPES, DEFAULT_DECK_CONFIG } from './models';
import { createDeck, saveDeckConfig } from './deckManager';
import { createNote, getAllAnkiCards, getAllNotes, saveNoteType } from './noteManager';
import { DEFAULT_SETTINGS } from './settingsStore';
import { answerStudyCard } from './studyRepository';

const PASSES = 100;
const FIXTURES = path.resolve(__dirname, '../test/fixtures');

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    Platform.OS = 'web';
});

function fixture(name: string): Uint8Array {
    return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

/** Everything a legacy-format package holds, without the stamps of when it was written. */
async function contents(bytes: Uint8Array) {
    const zip = await JSZip.loadAsync(bytes);
    const db = new SQL.Database(await zip.file('collection.anki21')!.async('uint8array'));
    const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];
    const [[models, decks, dconf, conf, tags]] = rows('SELECT models, decks, dconf, conf, tags FROM col') as string[][];
    const manifest: Record<string, string> = JSON.parse(await zip.file('media')!.async('text'));
    const media: Record<string, string> = {};
    for (const [index, name] of Object.entries(manifest)) media[name] = Buffer.from(await zip.file(index)!.async('uint8array')).toString('base64');
    const result = {
        models: parseAnkiJson(models), decks: parseAnkiJson(decks), dconf: parseAnkiJson(dconf), conf: parseAnkiJson(conf),
        tags: parseAnkiJson(tags), media,
        notes: rows('SELECT * FROM notes ORDER BY id'), cards: rows('SELECT * FROM cards ORDER BY id'),
        revlog: rows('SELECT * FROM revlog ORDER BY id'), graves: rows('SELECT * FROM graves ORDER BY oid'),
    };
    db.close();
    return result;
}

async function importInto(bytes: Uint8Array, kind: 'apkg' | 'colpkg', fresh = true) {
    if (fresh) {
        holder.db = createAppDb(SQL);
        holder.media.clear();
    }
    return importApkg(bytes, {
        subject: 'tus', topic: 'Anki', rolloverHour: 4, withScheduling: true, withDeckConfigs: true,
        replaceCollection: kind === 'colpkg', openReader: openSqlJsReader,
    });
}

async function exported(kind: 'apkg' | 'colpkg', legacySupport: boolean): Promise<Uint8Array> {
    return (await buildAnkiExport(kind, undefined, true, undefined, { legacySupport })).bytes!;
}

/** What the app's own tables hold, without the times rows were written. */
function appTables() {
    const rows = (sql: string) => holder.db.getAllSync(sql);
    return {
        noteTypes: rows('SELECT id, name, data FROM note_types ORDER BY id'),
        decks: rows('SELECT id, name, data FROM decks ORDER BY id'),
        deckConfigs: rows('SELECT id, data FROM deck_configs ORDER BY id'),
        notes: rows('SELECT id, data FROM notes ORDER BY id'),
        cards: rows('SELECT id, data FROM anki_cards ORDER BY id'),
        revlog: rows('SELECT * FROM revlog ORDER BY id'),
        media: [...holder.media.entries()],
    };
}

describe('package stability', () => {
    it('writes back the note types, decks and presets Anki exported, key for key', async () => {
        const anki = await contents(fixture('anki-26.09-roundtrip-legacy.apkg'));
        await importInto(fixture('anki-26.09-roundtrip.apkg'), 'apkg');
        const app = await contents(await exported('apkg', true));
        const studiedToday = ['lrnToday', 'revToday', 'newToday', 'timeToday'];
        const byName = (map: Record<string, any>, drop: string[] = []) => Object.fromEntries(Object.values(map)
            .map((entry) => [entry.name, Object.fromEntries(Object.entries(entry).filter(([key]) => !drop.includes(key)))]));
        expect(app.models).toEqual(Object.fromEntries(Object.entries(anki.models as Record<string, any>)
            .filter(([, model]) => app.models[model.id])));
        // Anki's export also carries its empty Default deck; the app writes only the decks its
        // cards use, and starts each deck's day with nothing studied (see lib/ankiSchema11.ts).
        const appDecks = byName(app.decks, studiedToday);
        expect(appDecks).toEqual(Object.fromEntries(Object.entries(byName(anki.decks, studiedToday)).filter(([name]) => appDecks[name])));
        expect(Object.keys(appDecks).sort()).toEqual(['TUS Örnek', 'TUS Örnek::Farmakoloji', 'TUS Örnek::Farmakoloji::Otonom', 'TUS Örnek::Filtre', 'TUS Örnek::Kardiyoloji']);
        expect(byName(app.dconf)).toEqual(Object.fromEntries(Object.entries(byName(anki.dconf)).filter(([name]) => byName(app.dconf)[name])));
        expect(app.notes).toEqual(anki.notes);
        expect(app.revlog).toEqual(anki.revlog);
        // Review due dates count from the collection's creation day, which differs between the two.
        expect(app.cards.map((card) => [...card.slice(0, 8), ...card.slice(9)])).toEqual(anki.cards.map((card) => [...card.slice(0, 8), ...card.slice(9)]));
        expect(app.media).toEqual(anki.media);
    });

    for (const kind of ['apkg', 'colpkg'] as const) {
        it(`writes the same .${kind} on each of ${PASSES} passes through the app`, async () => {
            await importInto(fixture('anki-26.09-roundtrip.apkg'), 'apkg');
            let current = await exported(kind, false);
            const first = await contents(await exported(kind, true));
            for (let pass = 1; pass <= PASSES; pass++) {
                await importInto(current, kind);
                const legacy = await exported(kind, true);
                const { conf, ...rest } = await contents(legacy);
                const { conf: firstConf, ...firstRest } = first;
                expect(rest, `pass ${pass}`).toEqual(firstRest);
                expect(conf, `pass ${pass}`).toEqual(firstConf);
                current = pass % 2 ? await exported(kind, false) : legacy;
            }
        }, 120_000);
    }

    it('changes nothing when the same package is imported again', async () => {
        const bytes = fixture('anki-26.09-roundtrip.apkg');
        const first = await importInto(bytes, 'apkg');
        const before = appTables();
        const again = await importInto(bytes, 'apkg', false);
        expect(again.added).toBe(0);
        expect(again.updated ?? 0).toBe(0);
        expect(again.duplicates).toBe(first.added);
        expect(appTables()).toEqual(before);
    });

    it('adds nothing of its own to what it exports', async () => {
        // A collection made in this app: its own note types, decks, presets, notes, media and reviews.
        holder.db = createAppDb(SQL);
        holder.media.clear();
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG });
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG, id: 2, name: 'Yoğun', newPerDay: 40, easyDays: [1, 1, 1, 1, 1, 0.5, 0] });
        const [basic, reversed, cloze] = [1, 2, 3].map((id) => BUILTIN_NOTE_TYPES.find((type) => type.id === id)!);
        for (const type of [basic, reversed, cloze]) saveNoteType(type);
        const parent = createDeck('Uygulama');
        const child = createDeck('Uygulama::Alt', 2);
        holder.media.set('resim.png', new Uint8Array([137, 80, 78, 71]));
        createNote(basic, ['Ön', '<img src="resim.png"> [sound:ses.mp3]'], parent.id, ['etiket']);
        createNote(reversed, ['İki yön', 'Cevap'], child.id);
        const { cards } = createNote(cloze, ['{{c1::Bir}} {{c2::iki}}', ''], child.id);
        answerStudyCard(cards[0].id, 3, { ...DEFAULT_SETTINGS }, 4000);
        answerStudyCard(cards[1].id, 1, { ...DEFAULT_SETTINGS }, 9000);

        // The keys Anki itself writes for each kind of object, read from its own export.
        const anki = await contents(fixture('anki-26.09-roundtrip-legacy.apkg'));
        const keysOf = (objects: any[]) => new Set(objects.flatMap((object) => Object.keys(object)));
        const ankiModels = Object.values(anki.models) as any[];
        const ankiKeys = {
            model: keysOf(ankiModels), field: keysOf(ankiModels.flatMap((model) => model.flds)),
            template: keysOf(ankiModels.flatMap((model) => model.tmpls)), deck: keysOf(Object.values(anki.decks)),
            preset: keysOf(Object.values(anki.dconf)),
            // Anki leaves an option at its default out of the collection settings; these are the
            // keys it writes once one is changed (measured in Anki 26.09.3 through Deck Options).
            conf: new Set([...Object.keys(anki.conf), 'rollover', 'localOffset', 'collapseTime', 'timeLim', 'fsrs',
                'fsrsShortTermWithStepsEnabled', 'applyAllParentLimits', 'newCardsIgnoreReviewLimit']),
            card: keysOf(anki.cards.map((card) => JSON.parse(String(card[17]) || '{}'))),
        };
        const extra = (allowed: Set<string>, objects: any[]) => [...keysOf(objects)].filter((key) => !allowed.has(key));
        // Words that belong to this app or to its screens, never to a learner's collection.
        const appWords = /[Tt]us[Aa]nki|TUS Kartları|ankiRaw|sourcePackageId|catalog(?:Pack|Subject|Topic)|deckOverrideId|"easyDays"|desiredRetentionExact|latexSvg|Görsel|🖼|🔊|\\u0000int/;

        for (const kind of ['apkg', 'colpkg'] as const) {
            for (const legacySupport of [true, false]) {
                const bytes = (await buildAnkiExport(kind, undefined, true, undefined, { includeScheduling: true, includeDeckConfigs: true, legacySupport })).bytes!;
                const zip = await JSZip.loadAsync(bytes);
                expect(Object.keys(zip.files).sort()).toEqual(['0', 'collection.anki2', legacySupport ? 'collection.anki21' : 'collection.anki21b', 'media', 'meta']);
                if (!legacySupport) continue;
                const app = await contents(bytes);
                const models = Object.values(app.models) as any[];
                expect(extra(ankiKeys.model, models), kind).toEqual([]);
                expect(extra(ankiKeys.field, models.flatMap((model) => model.flds)), kind).toEqual([]);
                expect(extra(ankiKeys.template, models.flatMap((model) => model.tmpls)), kind).toEqual([]);
                expect(extra(ankiKeys.deck, Object.values(app.decks)), kind).toEqual([]);
                expect(extra(ankiKeys.preset, Object.values(app.dconf)), kind).toEqual([]);
                expect(extra(ankiKeys.conf, [app.conf]), kind).toEqual([]);
                expect(extra(ankiKeys.card, app.cards.map((card) => JSON.parse(String(card[17]) || '{}'))), kind).toEqual([]);
                // Every row is exactly what the collection holds, and nothing else.
                expect(app.notes, kind).toEqual(getAllNotes().map((note) => [note.id, note.guid, note.noteTypeId, note.mod, note.usn,
                    note.tags.length ? ` ${note.tags.join(' ')} ` : '', note.fields.join('\x1f'), note.sfld, note.csum, note.flags, note.ankiData ?? '']));
                // Due dates are written as days since the collection's creation; the rest as held.
                expect(app.cards.map((card) => [...card.slice(0, 8), ...card.slice(9, 14), ...card.slice(15)]), kind).toEqual(getAllAnkiCards()
                    .map((card) => [card.id, card.noteId, card.deckId, card.ord, card.mod, card.usn, card.type, card.queue,
                        card.ivl, card.factor, card.reps, card.lapses, card.left, card.odid, card.flags, card.ankiData ?? '']));
                expect(app.revlog, kind).toEqual(holder.db.getAllSync('SELECT * FROM revlog ORDER BY id')
                    .map((row: any) => [row.id, row.cardId, row.usn, row.ease, row.ivl, row.lastIvl, row.factor, row.time, row.type]));
                expect(Object.keys(app.media)).toEqual(['resim.png']);
                const text = JSON.stringify({ ...app, media: Object.keys(app.media) });
                expect(text.match(appWords)?.[0], kind).toBeUndefined();
            }
        }
        for (const format of ['notesTxt', 'cardsTxt'] as const) {
            for (const includeHtml of [true, false]) {
                const { text } = await buildAnkiExport(format, undefined, true, undefined, { includeHtml, includeTags: true, includeDeck: true, includeNotetype: true, includeGuid: true });
                expect(text!.match(appWords)?.[0], format).toBeUndefined();
                expect(text, format).not.toMatch(/<div class="card|<style|<audio|<script/);
            }
        }
    });

    it('writes the files, tables and indexes Anki writes', async () => {
        const structure = async (bytes: Uint8Array) => {
            const zip = await JSZip.loadAsync(bytes);
            const names = Object.keys(zip.files).filter((name) => !/^\d+$/.test(name)).sort();
            const collection = zip.file('collection.anki21');
            const schema = (data: Uint8Array) => {
                const db = new SQL.Database(data);
                // Leaving out SQLite's own query-planner statistics, which ANALYZE adds.
                const objects = db.exec("SELECT type, name, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")[0].values;
                const columns = objects.filter(([type]) => type === 'table').map(([, name]) => [name, db.exec(`PRAGMA table_info(${name})`)[0].values]);
                const indexes = objects.filter(([type]) => type === 'index').map(([, name]) => [name, db.exec(`PRAGMA index_info(${name})`)[0].values.map((row) => row[2])]);
                db.close();
                return { columns, indexes };
            };
            const notice = new SQL.Database(await zip.file('collection.anki2')!.async('uint8array'));
            const noticeNote = notice.exec('SELECT flds FROM notes')[0].values;
            notice.close();
            return { names, schema: collection ? schema(await collection.async('uint8array')) : null, noticeNote };
        };
        await importInto(fixture('anki-26.09-roundtrip.apkg'), 'apkg');
        const legacyAnki = await structure(fixture('anki-26.09-roundtrip-legacy.apkg'));
        for (const [kind, legacySupport, ankiFixture] of [
            ['apkg', false, 'anki-26.09-roundtrip.apkg'], ['apkg', true, 'anki-26.09-roundtrip-legacy.apkg'], ['colpkg', false, 'anki-26.09-roundtrip.colpkg'],
        ] as const) {
            const anki = await structure(fixture(ankiFixture));
            const app = await structure(await exported(kind, legacySupport));
            expect(app.names, `${kind} ${legacySupport}`).toEqual(anki.names);
            expect(app.noticeNote).toEqual(anki.noticeNote);
            if (legacySupport) expect(app.schema).toEqual(legacyAnki.schema);
        }
    });
});
