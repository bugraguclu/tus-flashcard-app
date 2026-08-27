import initSqlJs from 'sql.js';
import JSZip from 'jszip';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any, media: new Map<string, Uint8Array>() }));

vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbUpsertFtsCard: () => {},
    dbIndexAllCards: () => {},
    dbDeleteFtsCard: () => {},
}));
vi.mock('./mediaStore', () => ({
    sanitizeMediaFilename: (name: string) => name.replace(/^.*[\\/]/, '').replace(/^\.+/, '') || 'media',
    saveMediaBytes: async (name: string, bytes: Uint8Array) => { holder.media.set(name, new Uint8Array(bytes)); },
    readMediaBytes: async (name: string) => holder.media.get(name) ?? null,
}));

import { importAnkiReaderLossless, importApkg } from './importApkg';
import { buildAnkiExport } from './exportAnkiPackage';
import { parseBackupExportSource } from './backupExport';
import { getAllAnkiCards, getAllNotes, getAllNoteTypes, saveAnkiCard, saveNote } from './noteManager';
import { createDeck, getAllDeckConfigs, getAllDecks } from './deckManager';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    db = createAppDb(SQL);
    holder.db = db;
    holder.media.clear();
    Platform.OS = 'web';
});

function openReader(bytes: Uint8Array) {
    const sqlite = new SQL.Database(bytes);
    const all = <T,>(sql: string, ...params: any[]): T[] => {
        const [result] = sqlite.exec(sql, params.length ? params : undefined);
        if (!result) return [];
        return result.values.map((values) => Object.fromEntries(result.columns.map((column, i) => [column, values[i]])) as T);
    };
    return {
        getAllSync: all,
        getFirstSync: <T,>(sql: string, ...params: any[]) => all<T>(sql, ...params)[0] ?? null,
        close: () => sqlite.close(),
    };
}

async function fixturePackage(
    answer = 'Answer',
    noteMod = 789,
    mediaBytes = new Uint8Array([137, 80, 78, 71]),
    guid = 'stable-guid',
): Promise<Uint8Array> {
    const collection = new SQL.Database();
    collection.run(`CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer,
        dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text)`);
    collection.run(`CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer,
        tags text, flds text, sfld integer, csum integer, flags integer, data text)`);
    collection.run(`CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer,
        usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer,
        lapses integer, left integer, odue integer, odid integer, flags integer, data text)`);
    collection.run(`CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer,
        ivl integer, lastIvl integer, factor integer, time integer, type integer)`);

    const model = {
        id: 1000, name: 'Professional Custom', type: 0, mod: 123, usn: -1, sortf: 0,
        css: '.card { color: rebeccapurple; }', latexPre: 'PRE', latexPost: 'POST', customKey: 'retained',
        flds: [
            { name: 'Question', ord: 0, sticky: false, rtl: false, font: 'Inter', size: 19, description: 'Q help' },
            { name: 'Answer', ord: 1, sticky: false, rtl: false, font: 'Inter', size: 19 },
            { name: 'Source', ord: 2, sticky: true, rtl: false, font: 'Inter', size: 14 },
        ],
        tmpls: [
            { name: 'Forward', ord: 0, qfmt: '{{Question}}', afmt: '{{FrontSide}}<hr>{{Answer}}', bqfmt: 'browser-q' },
            { name: 'Reverse', ord: 1, qfmt: '{{Answer}}', afmt: '{{Question}}', bafmt: 'browser-a' },
        ],
        req: [[0, 'any', [0]], [1, 'any', [1]]],
    };
    const deck = { id: 2000, name: 'Medicine::Cardiology', mod: 456, usn: -1, desc: 'Deck HTML', dyn: 0, conf: 1, customDeckKey: 42 };
    const config = {
        id: 1, name: 'Imported Options', mod: 1, usn: -1, maxTaken: 90, autoplay: true, timer: 1,
        stopTimerOnAnswer: true, secondsToShowQuestion: 12, secondsToShowAnswer: 8,
        questionAction: 1, answerAction: 2, waitForAudio: false,
        new: { perDay: 30, delays: [2, 12], ints: [2, 5], initialFactor: 2400, order: 1, bury: true },
        rev: { perDay: 300, ease4: 1.4, hardFactor: 1.15, ivlFct: 0.95, maxIvl: 20000, bury: true },
        lapse: { delays: [15], minInt: 2, leechFails: 6, leechAction: 0, mult: 0.2 },
        desiredRetention: 0.91,
    };
    collection.run('INSERT INTO col VALUES (1, ?, 0, 0, 11, 0, 0, 0, ?, ?, ?, ?, ?)', [
        Math.floor(Date.now() / 1000) - 100 * 86400, '{}', JSON.stringify({ 1000: model }),
        JSON.stringify({ 2000: deck }), JSON.stringify({ 1: config }), '{}',
    ]);
    collection.run('INSERT INTO notes VALUES (3000, ?, 1000, ?, -1, ?, ?, ?, 12345, 2, ?)', [
        guid, noteMod, ' cardio important marked leech ', `Question<img src="image.png">\x1f${answer}\x1fJournal`, 'Question', '{"note":"opaque"}',
    ]);
    collection.run('INSERT INTO cards VALUES (4000, 3000, 2000, 0, 790, -1, 2, 2, 105, 30, 2450, 9, 1, 0, 0, 0, 3, ?)', ['{"card":"opaque"}']);
    collection.run('INSERT INTO cards VALUES (4001, 3000, 2000, 1, 790, -1, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, ?)', ['']);
    collection.run('INSERT INTO revlog VALUES (1700000000000, 4000, -1, 3, 30, 15, 2450, 3210, 1)');

    const zip = new JSZip();
    zip.file('collection.anki21', collection.export());
    zip.file('media', JSON.stringify({ 0: 'image.png' }));
    zip.file('0', mediaBytes);
    zip.file('meta', new Uint8Array([8, 2]));
    collection.close();
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function pbVarint(field: number, value: number): Uint8Array {
    const output = [field * 8];
    let remaining = Math.max(0, Math.trunc(value));
    while (remaining >= 128) {
        output.push((remaining & 127) | 128);
        remaining = Math.floor(remaining / 128);
    }
    output.push(remaining);
    return new Uint8Array(output);
}

function pbBytes(field: number, value: Uint8Array | string): Uint8Array {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    return new Uint8Array([field * 8 + 2, bytes.length, ...bytes]);
}

function pbFloat(field: number, value: number): Uint8Array {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setFloat32(0, value, true);
    return new Uint8Array([field * 8 + 5, ...bytes]);
}

function pb(...parts: Uint8Array[]): Uint8Array {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
}

describe('lossless Anki package roundtrip', () => {
    it('rejects even a one-note fragment copied from the paid catalog before writing anything', async () => {
        const { BKA_MANIFEST } = await import('./bkaManifest');
        const input = await fixturePackage('Copied paid answer', 789, new Uint8Array([1]), BKA_MANIFEST.protectedNoteGuids[0]);

        await expect(importApkg(input, {
            subject: 'medicine',
            openReader: async (bytes) => openReader(bytes),
        })).rejects.toMatchObject({ code: 'PAID_CATALOG_PROTECTED' });
        expect(getAllNotes()).toHaveLength(0);
        expect(getAllDecks()).toHaveLength(0);
    });

    it('reads normalized modern Anki protobuf metadata without flattening', () => {
        const modern = new SQL.Database();
        modern.run(`CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer,
            dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text)`);
        modern.run('CREATE TABLE notetypes (id integer primary key, name text, mtime_secs integer, usn integer, config blob)');
        modern.run('CREATE TABLE fields (ntid integer, ord integer, name text, config blob)');
        modern.run('CREATE TABLE templates (ntid integer, ord integer, name text, mtime_secs integer, usn integer, config blob)');
        modern.run('CREATE TABLE decks (id integer primary key, name text, mtime_secs integer, usn integer, common blob, kind blob)');
        modern.run('CREATE TABLE deck_config (id integer primary key, name text, mtime_secs integer, usn integer, config blob)');
        modern.run(`CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer,
            tags text, flds text, sfld integer, csum integer, flags integer, data text)`);
        modern.run(`CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer,
            usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer,
            lapses integer, left integer, odue integer, odid integer, flags integer, data text)`);
        modern.run('CREATE TABLE revlog (id integer, cid integer, usn integer, ease integer, ivl integer, lastIvl integer, factor integer, time integer, type integer)');
        modern.run('INSERT INTO col VALUES (1, 1700000000, 0, 0, 18, 0, 0, 0, ?, ?, ?, ?, ?)', ['{}', '{}', '{}', '{}', '{}']);
        modern.run('INSERT INTO notetypes VALUES (100, ?, 20, -1, ?)', ['Modern Type', pb(pbVarint(1, 0), pbVarint(2, 0), pbBytes(3, '.card{color:blue}'))]);
        modern.run('INSERT INTO fields VALUES (100, 0, ?, ?)', ['Prompt', pb(pbBytes(3, 'Arial'), pbVarint(4, 20))]);
        modern.run('INSERT INTO fields VALUES (100, 1, ?, ?)', ['Response', pb(pbBytes(3, 'Arial'), pbVarint(4, 20))]);
        modern.run('INSERT INTO templates VALUES (100, 0, ?, 20, -1, ?)', ['Card 1', pb(pbBytes(1, '{{Prompt}}'), pbBytes(2, '{{FrontSide}}<hr id=answer>{{Response}}'))]);
        modern.run('INSERT INTO deck_config VALUES (1, ?, 20, -1, ?)', ['Modern Preset', pb(pbVarint(9, 30), pbVarint(10, 300), pbFloat(11, 2.5), pbFloat(12, 1.3))]);
        const normal = pb(pbVarint(1, 1), pbBytes(4, 'Modern description'));
        modern.run('INSERT INTO decks VALUES (200, ?, 20, -1, ?, ?)', ['Modern::Child', pb(pbVarint(1, 1)), pbBytes(1, normal)]);
        modern.run('INSERT INTO notes VALUES (300, ?, 100, 30, -1, ?, ?, ?, 1, 0, ?)', ['modern-guid', ' tag ', 'Question\x1fAnswer', 'Question', '']);
        modern.run('INSERT INTO cards VALUES (400, 300, 200, 0, 30, -1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, ?)', ['']);

        const reader = openReader(modern.export());
        const result = importAnkiReaderLossless(reader, { subject: 'ignored', withScheduling: true }, 'modern-package');
        expect(result).toMatchObject({ added: 1, cardsImported: 1, structurePreserved: true });
        expect(getAllNoteTypes().find((type) => type.name === 'Modern Type')).toMatchObject({ css: '.card{color:blue}' });
        expect(getAllDecks().map((deck) => deck.name)).toEqual(expect.arrayContaining(['Modern', 'Modern::Child']));
        reader.close();
        modern.close();
    });

    it('preserves original bytes while pristine and reconstructs all source structure after an edit', async () => {
        const input = await fixturePackage();
        const imported = await importApkg(input, {
            subject: 'medicine', topic: 'Imported', fileName: 'professional.apkg',
            openReader: async (bytes) => openReader(bytes),
        });
        expect(imported).toMatchObject({
            totalNotes: 1, added: 1, cardsImported: 2, structurePreserved: true,
            progressCards: 1, progressReviews: 1, mediaImported: 1, mediaSkipped: 0,
        });
        expect(getAllNotes()[0].fields).toHaveLength(3);
        expect(getAllNoteTypes().find((type) => type.name === 'Professional Custom')?.templates).toHaveLength(2);
        expect(getAllDecks().map((deck) => deck.name)).toContain('Medicine::Cardiology');
        expect(getAllDecks().map((deck) => deck.name)).toContain('Medicine');
        expect(getAllDeckConfigs()[0]).toMatchObject({
            stopTimerOnAnswer: true,
            secondsToShowQuestion: 12,
            secondsToShowAnswer: 8,
            questionAction: 'showReminder',
            answerAction: 'good',
            waitForAudio: false,
        });

        const pristine = await buildAnkiExport('apkg', undefined, true);
        expect(pristine.fileName).toBe('professional.apkg');
        expect(Buffer.compare(Buffer.from(pristine.bytes!), Buffer.from(input))).toBe(0);

        const note = getAllNotes()[0];
        saveNote({ ...note, fields: [note.fields[0], 'Edited answer', note.fields[2]] });
        const rebuilt = await buildAnkiExport('apkg', undefined, true);
        expect(Buffer.compare(Buffer.from(rebuilt.bytes!), Buffer.from(input))).not.toBe(0);

        const rebuiltZip = await JSZip.loadAsync(rebuilt.bytes!);
        expect(rebuiltZip.file('meta')).not.toBeNull();
        expect(JSON.parse(await rebuiltZip.file('media')!.async('text'))).toEqual({ 0: 'image.png' });
        const reader = openReader(await rebuiltZip.file('collection.anki21')!.async('uint8array'));
        expect(reader.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM notes')?.n).toBe(1);
        expect(reader.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM cards')?.n).toBe(2);
        expect(reader.getFirstSync<{ data: string }>('SELECT data FROM notes')?.data).toBe('{"note":"opaque"}');
        expect(reader.getFirstSync<{ data: string }>('SELECT data FROM cards WHERE id = 4000')?.data).toBe('{"card":"opaque"}');
        const models = JSON.parse(reader.getFirstSync<{ models: string }>('SELECT models FROM col')!.models);
        expect(models['1000'].flds).toHaveLength(3);
        expect(models['1000'].tmpls).toHaveLength(2);
        expect(models['1000'].customKey).toBe('retained');
        expect(models['1000'].flds[0].description).toBe('Q help');
        const deckConfigs = JSON.parse(reader.getFirstSync<{ dconf: string }>('SELECT dconf FROM col')!.dconf);
        expect(deckConfigs['1']).toMatchObject({
            stopTimerOnAnswer: true,
            secondsToShowQuestion: 12,
            secondsToShowAnswer: 8,
            questionAction: 1,
            answerAction: 2,
            waitForAudio: false,
        });
        reader.close();
    });

    it('matches Anki shareable-deck export by stripping scheduling and system markers', async () => {
        const input = await fixturePackage();
        await importApkg(input, {
            subject: 'medicine', topic: 'Imported', fileName: 'professional.apkg',
            openReader: async (bytes) => openReader(bytes),
        });

        const artifact = await buildAnkiExport('apkg', 'Medicine', true, undefined, {
            includeScheduling: false,
            includeDeckConfigs: false,
        });
        const zip = await JSZip.loadAsync(artifact.bytes!);
        const reader = openReader(await zip.file('collection.anki21')!.async('uint8array'));
        const cards = reader.getAllSync<any>('SELECT type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags FROM cards ORDER BY id');
        expect(cards).toHaveLength(2);
        expect(cards.every((card) => card.type === 0 && card.queue === 0)).toBe(true);
        expect(cards.map((card) => card.due)).toEqual([1, 2]);
        expect(cards.every((card) => (
            card.ivl === 0 && card.factor === 0 && card.reps === 0 && card.lapses === 0
            && card.left === 0 && card.odue === 0 && card.odid === 0 && card.flags === 0
        ))).toBe(true);
        expect(reader.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM revlog')?.count).toBe(0);
        expect(reader.getFirstSync<{ tags: string }>('SELECT tags FROM notes')?.tags).toBe(' cardio important ');
        expect(JSON.parse(reader.getFirstSync<{ dconf: string }>('SELECT dconf FROM col')!.dconf)).toEqual({});
        const decks = Object.values(JSON.parse(reader.getFirstSync<{ decks: string }>('SELECT decks FROM col')!.decks)) as any[];
        expect(decks.map((deck) => deck.name)).toEqual(expect.arrayContaining(['Medicine', 'Medicine::Cardiology']));
        expect(decks.every((deck) => deck.conf === 1)).toBe(true);
        reader.close();
    });

    it('exports only cards from the exact deck ids selected in the deck tree', async () => {
        await importApkg(await fixturePackage(), {
            subject: 'medicine', topic: 'Imported', fileName: 'professional.apkg',
            openReader: async (bytes) => openReader(bytes),
        });
        const decks = getAllDecks();
        const parent = decks.find((deck) => deck.name === 'Medicine')!;
        const child = decks.find((deck) => deck.name === 'Medicine::Cardiology')!;
        const sibling = createDeck('Medicine::Neurology');
        const reverseCard = getAllAnkiCards().find((card) => card.ord === 1)!;
        saveAnkiCard({ ...reverseCard, deckId: sibling.id });
        expect(getAllAnkiCards().find((card) => card.id === reverseCard.id)?.deckId).toBe(sibling.id);

        const parentOnly = await buildAnkiExport('apkg', undefined, false, undefined, {
            selectedDeckIds: [parent.id],
            includeScheduling: false,
        });
        const parentZip = await JSZip.loadAsync(parentOnly.bytes!);
        const parentReader = openReader(await parentZip.file('collection.anki21')!.async('uint8array'));
        expect(parentReader.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM cards')?.count).toBe(0);
        parentReader.close();

        const childOnly = await buildAnkiExport('apkg', undefined, false, undefined, {
            selectedDeckIds: [child.id],
            includeScheduling: false,
        });
        const childZip = await JSZip.loadAsync(childOnly.bytes!);
        const childReader = openReader(await childZip.file('collection.anki21')!.async('uint8array'));
        expect(childReader.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM cards')?.count).toBe(1);
        const exportedDecks = Object.values(JSON.parse(childReader.getFirstSync<{ decks: string }>('SELECT decks FROM col')!.decks)) as any[];
        expect(exportedDecks.map((deck) => deck.name)).toEqual(expect.arrayContaining(['Medicine', 'Medicine::Cardiology']));
        expect(exportedDecks).toHaveLength(2);
        childReader.close();
    });

    it('builds a backup export from the snapshot instead of the live collection', async () => {
        await importApkg(await fixturePackage(), {
            subject: 'medicine', topic: 'Imported', fileName: 'professional.apkg',
            openReader: async (bytes) => openReader(bytes),
        });
        const snapshot = JSON.stringify({
            version: 6,
            canonical: true,
            exportDate: '2026-08-25T20:14:00.000Z',
            settings: { dayRolloverHour: 4 },
            tables: {
                note_types: db.getAllSync('SELECT * FROM note_types ORDER BY id'),
                notes: db.getAllSync('SELECT * FROM notes ORDER BY id'),
                anki_cards: db.getAllSync('SELECT * FROM anki_cards ORDER BY id'),
                decks: db.getAllSync('SELECT * FROM decks ORDER BY id'),
                deck_configs: db.getAllSync('SELECT * FROM deck_configs ORDER BY id'),
                revlog: db.getAllSync('SELECT * FROM revlog ORDER BY id'),
                graves: db.getAllSync('SELECT * FROM graves'),
                session_stats: [],
            },
        });
        const source = parseBackupExportSource(snapshot, 'tus-backup-2026-08-25-231400000.json');
        const selectedDeck = source.decks.find((deck) => deck.name === 'Medicine::Cardiology')!;

        // If the exporter accidentally consults the live collection, this empty replacement DB
        // will produce an empty package. The selected snapshot must remain the sole data source.
        db = createAppDb(SQL);
        holder.db = db;

        const artifact = await buildAnkiExport('apkg', undefined, false, undefined, {
            selectedDeckIds: [selectedDeck.id],
            includeScheduling: true,
            includeDeckConfigs: true,
        }, source);
        const zip = await JSZip.loadAsync(artifact.bytes!);
        const reader = openReader(await zip.file('collection.anki21')!.async('uint8array'));
        expect(reader.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM notes')?.count).toBe(1);
        expect(reader.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM cards')?.count).toBe(2);
        expect(reader.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM revlog')?.count).toBe(1);
        reader.close();
    });

    it('denies explicit export when a selected deck contains a paid catalog note', async () => {
        const input = await fixturePackage();
        await importApkg(input, {
            subject: 'medicine', topic: 'Imported', openReader: async (bytes) => openReader(bytes),
        });
        const note = getAllNotes()[0];
        db.runSync(
            'UPDATE notes SET data = ? WHERE id = ?',
            JSON.stringify({ ...note, catalogPack: 'bka-tus' }),
            note.id,
        );

        await expect(buildAnkiExport('apkg', 'Medicine', true)).rejects
            .toMatchObject({ code: 'PAID_CATALOG_PROTECTED' });
    });

    it('updates a matching guid only when the incoming Anki note is newer', async () => {
        await importApkg(await fixturePackage('Original', 700), {
            subject: 'medicine', topic: 'Imported', openReader: async (bytes) => openReader(bytes),
        });
        const updated = await importApkg(await fixturePackage('Updated', 900, new Uint8Array([1, 2, 3, 4])), {
            subject: 'medicine', topic: 'Imported', updateNotes: 'ifNewer',
            openReader: async (bytes) => openReader(bytes),
        });
        expect(updated).toMatchObject({ added: 0, updated: 1, duplicates: 0, cardsImported: 0, mediaRenamed: 1 });
        expect(getAllNotes()).toHaveLength(1);
        expect(getAllNotes()[0].fields[1]).toBe('Updated');
        expect(getAllNotes()[0].fields[0]).toContain('src="image-12dada1fff4d4787ade3333147202c3b443e376f.png"');

        const older = await importApkg(await fixturePackage('Stale', 800), {
            subject: 'medicine', topic: 'Imported', updateNotes: 'ifNewer',
            openReader: async (bytes) => openReader(bytes),
        });
        expect(older).toMatchObject({ added: 0, updated: 0, duplicates: 1, cardsImported: 0 });
        expect(getAllNotes()[0].fields[1]).toBe('Updated');
    });

    it('imports a collection package with Anki replacement semantics', async () => {
        db.runSync(
            'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (99, ?, ?, 0, -1, 0)',
            'Local Only', JSON.stringify({ id: 99, name: 'Local Only', configId: 1, isFiltered: false }),
        );

        const result = await importApkg(await fixturePackage(), {
            subject: 'ignored',
            fileName: 'collection.colpkg',
            replaceCollection: true,
            withScheduling: true,
            withDeckConfigs: true,
            openReader: async (bytes) => openReader(bytes),
        });

        expect(result).toMatchObject({ added: 1, cardsImported: 2, progressReviews: 1 });
        expect(getAllDecks().map((deck) => deck.name)).not.toContain('Local Only');
        expect(getAllDecks().map((deck) => deck.name)).toEqual(expect.arrayContaining(['Medicine', 'Medicine::Cardiology']));
        expect(db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM revlog')?.count).toBe(1);
    });
});
