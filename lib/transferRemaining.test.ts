// Remaining import/export behaviour. Independently derived from
// https://docs.ankiweb.net/importing/text-files.html and https://docs.ankiweb.net/importing/packaged-decks.html
// (CSV defaults also from rslib text/csv/metadata.rs, behaviour only).
import initSqlJs from 'sql.js';
import JSZip from 'jszip';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { createAppDb } from '../test/sqljsHarness';
const h = vi.hoisted(() => ({ db: null as any, media: new Map<string, Uint8Array>() }));
vi.mock('./db', () => ({ getDB: () => h.db, dbUpsertFtsCard: () => {}, dbIndexAllCards: () => {} }));
vi.mock('./mediaStore', () => ({
    sanitizeMediaFilename: (name: string) => name,
    saveMediaBytes: async (name: string, bytes: Uint8Array) => { h.media.set(name, bytes); },
    readMediaBytes: async (name: string) => h.media.get(name) ?? null,
}));
import { buildAnkiExport, type ExportCollectionSource } from './exportAnkiPackage';
import { importApkg } from './importApkg';
import { openSqlJsReader } from './webDb';
import { BUILTIN_NOTE_TYPES, DEFAULT_DECK_CONFIG, checksumField, type AnkiCard, type Deck } from './models';
import { getAllAnkiCards, getAllNotes } from './noteManager';
import { importDelimitedNotes } from './importNotes';
import { defaultDelimitedMapping, parseDelimited } from './importDelimited';
import { getAllDecks, saveDeck } from './deckManager';
import { getNoteIdsInDeck } from './exportNotes';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { h.db = createAppDb(SQL); h.media.clear(); Platform.OS = 'web'; });

const noteType = () => ({ ...structuredClone(BUILTIN_NOTE_TYPES[0]), id: 700, name: 'Transfer', fields: [...BUILTIN_NOTE_TYPES[0].fields, { name: 'Extra', ord: 2, sticky: false, rtl: false }] });
function deck(id: number, name: string, extra: Partial<Deck> = {}): Deck {
    return { id, name, configId: 1, mod: 100, usn: -1, description: '', collapsed: false, isFiltered: false, ...extra };
}
function source(decks: Deck[] = [deck(703, 'Transfer')], cardDeckId = 703): ExportCollectionSource {
    const nt = noteType();
    return {
        notes: [{ id: 701, guid: 'transfer-guid', noteTypeId: nt.id, mod: 100, usn: -1, fields: ['Heart', 'Pump', 'Keep me'], tags: ['important', 'Ünite::Bir'], sfld: 'Heart', csum: checksumField('Heart'), flags: 0 }],
        cards: [{ id: 702, noteId: 701, deckId: cardDeckId, ord: 0, mod: 100, usn: -1, type: 0, queue: 0, due: 7, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0 }],
        decks, noteTypes: [nt], deckConfigs: [{ ...DEFAULT_DECK_CONFIG }], revlog: [], graves: [], rolloverHour: 4,
    };
}
const pkg = async (data: ExportCollectionSource, format: 'apkg' | 'colpkg' = 'apkg') => (await buildAnkiExport(format, undefined, false, undefined, {}, data)).bytes!;
const options = { subject: 'tus' as const, openReader: openSqlJsReader };
async function packageCol(bytes: Uint8Array) {
    const zip = await JSZip.loadAsync(bytes);
    const reader = await openSqlJsReader(await zip.file('collection.anki21')!.async('uint8array'));
    const col = reader.getFirstSync<any>('SELECT conf, tags, decks FROM col')!;
    const revlog = reader.getAllSync<any>('SELECT id, cid FROM revlog');
    reader.close();
    return { conf: JSON.parse(col.conf), tags: JSON.parse(col.tags), decks: Object.values(JSON.parse(col.decks)) as any[], revlog };
}

describe('CSV defaults (AKT-7, AKT-8)', () => {
    it('guesses the delimiter in Anki order, so a semicolon wins over commas inside fields', () => {
        expect(parseDelimited('Kalbin, akciğerin…?;Pompa, solunum').delimiter).toBe(';');
        expect(parseDelimited('a\tb,c').delimiter).toBe('\t');
        expect(parseDelimited('a|b,c').delimiter).toBe('|');
        expect(parseDelimited('a,b').delimiter).toBe(',');
        expect(parseDelimited('#separator:comma\na;b').delimiter).toBe(',');
    });

    it('reads #if matches, #match scope and the legacy tags: line', () => {
        const parsed = parseDelimited('tags:one two\n#if matches:keep current\n#match scope:notetype + deck\na,b');
        expect(parsed.metadata).toMatchObject({ tags: ['one', 'two'], ifMatches: 'preserve', matchScope: 'notetypeAndDeck' });
        expect(parsed.rows).toEqual([['a', 'b']]);
    });

    it('maps fields by #columns names and takes the next free column as tags', () => {
        const parsed = parseDelimited('#separator:tab\n#columns:Back\tFront\tLabels\nb\tf\tt1 t2');
        expect(defaultDelimitedMapping(parsed.metadata, 3, ['Front', 'Back', 'Extra'])).toEqual({ fieldColumns: [1, 0, -1], tagsColumn: 3 });
        expect(defaultDelimitedMapping(parseDelimited('q,a,t').metadata, 3, ['Front', 'Back'])).toEqual({ fieldColumns: [0, 1], tagsColumn: 3 });
        expect(defaultDelimitedMapping(parseDelimited('q,a').metadata, 2, ['Front', 'Back'])).toEqual({ fieldColumns: [0, 1] });
    });

    it('imports with those defaults', async () => {
        await importApkg(await pkg(source()), options);
        importDelimitedNotes('#separator:tab\n#columns:Back\tFront\nNew pump\tHeart', { noteType: noteType(), deckId: 703 });
        expect(getAllNotes()[0].fields).toEqual(['Heart', 'New pump', 'Keep me']);
        importDelimitedNotes('Lung,Air,x,anatomy resp', { noteType: noteType(), deckId: 703 });
        expect(getAllNotes().find((note) => note.fields[0] === 'Lung')!.tags.sort()).toEqual(['anatomy', 'resp']);
    });
});

describe('text update with a note type column (B12)', () => {
    it('keeps a field a short row does not reach', async () => {
        await importApkg(await pkg(source()), options);
        importDelimitedNotes('#separator:tab\n#notetype column:1\nTransfer\tHeart\tNew pump', { noteType: noteType(), deckId: 703 });
        expect(getAllNotes()[0].fields).toEqual(['Heart', 'New pump', 'Keep me']);
    });
});

describe('package deck names', () => {
    it('joins an existing deck whose name differs only in case (B13)', async () => {
        saveDeck(deck(50, 'Medicine'));
        await importApkg(await pkg(source([deck(703, 'medicine'), deck(704, 'medicine::Cardio')], 704)), options);
        const names = getAllDecks().map((entry) => entry.name).filter((name) => /medicine/i.test(name)).sort();
        expect(names).toEqual(['Medicine', 'Medicine::Cardio']);
        expect(getAllAnkiCards()[0].deckId).toBe(getAllDecks().find((entry) => entry.name === 'Medicine::Cardio')!.id);
    });

    it('moves the subdecks of a deck renamed for an incompatible name', async () => {
        saveDeck(deck(50, 'Medicine', { isFiltered: true }));
        await importApkg(await pkg(source([deck(703, 'Medicine'), deck(704, 'Medicine::Cardio')], 704)), options);
        const names = getAllDecks().map((entry) => entry.name).sort();
        expect(names).toContain('Medicine (Imported)::Cardio');
        expect(names).not.toContain('Medicine::Cardio');
    });
});

describe('package review history', () => {
    it('skips a review id the collection already has instead of rekeying it to now', async () => {
        const data = source();
        data.cards[0] = { ...data.cards[0], type: 2, queue: 2, ivl: 3, reps: 1 } as AnkiCard;
        data.revlog = [{ id: 1_600_000_000_000, cardId: 702, usn: -1, ease: 3, ivl: 3, lastIvl: 0, factor: 2500, time: 1000, type: 0 }];
        h.db.runSync('INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (1600000000000, 9, -1, 3, 1, 0, 2500, 100, 0)');
        await importApkg(await pkg(data), options);
        expect(h.db.getAllSync('SELECT id, cardId FROM revlog')).toEqual([{ id: 1_600_000_000_000, cardId: 9 }]);
    });

    it('upgrades a v1 relearning card (type 2 in a learning queue) to type 3', async () => {
        const data = source();
        data.cards[0] = { ...data.cards[0], type: 2, queue: 1, due: Math.floor(Date.now() / 1000) * 1000 + 60_000, ivl: 3, lapses: 1, reps: 4 } as AnkiCard;
        await importApkg(await pkg(data), options);
        expect(getAllAnkiCards()[0]).toMatchObject({ type: 3, queue: 1 });
    });
});

describe('collection package (AKT-12, B14)', () => {
    it('carries the tag registry, collection config, filtered decks and orphan review history', async () => {
        const data = source([deck(703, 'Transfer'), deck(705, 'Session', { isFiltered: true, searchQuery: 'deck:Transfer', searchLimit: 50, searchOrder: 1 })]);
        data.revlog = [
            { id: 1_600_000_000_000, cardId: 702, usn: -1, ease: 3, ivl: 1, lastIvl: 0, factor: 2500, time: 1000, type: 0 },
            { id: 1_600_000_000_001, cardId: 999, usn: -1, ease: 1, ivl: 0, lastIvl: 0, factor: 2500, time: 1000, type: 0 },
        ];
        const col = await packageCol(await pkg(data, 'colpkg'));
        expect(col.tags).toEqual({ important: 0, 'Ünite::Bir': 0 });
        expect(col.conf).toMatchObject({ schedVer: 2, sched2021: true, rollover: 4, nextPos: 8, curDeck: 1 });
        expect(col.decks.find((entry) => entry.name === 'Session')).toMatchObject({ dyn: 1, terms: [['deck:Transfer', 50, 1]] });
        expect(col.revlog.map((row) => row.cid).sort()).toEqual([702, 999]);

        // The package imports back as a collection replacement with the filtered deck's terms.
        await importApkg(await pkg(data, 'colpkg'), { ...options, fileName: 'c.colpkg', replaceCollection: true, withScheduling: true, withDeckConfigs: true });
        expect(getAllDecks().find((entry) => entry.name === 'Session')).toMatchObject({ isFiltered: true, searchQuery: 'deck:Transfer', searchLimit: 50 });
        expect(h.db.getFirstSync('SELECT COUNT(*) AS n FROM revlog').n).toBe(2);

        const apkg = await packageCol(await pkg(data));
        expect(apkg.decks.map((entry) => entry.name)).not.toContain('Session');
        expect(apkg.revlog.map((row) => row.cid)).toEqual([702]);
    });
});

describe('note text export scope (B13)', () => {
    it('scopes a deck subtree by exact case', async () => {
        await importApkg(await pkg(source([deck(703, 'TUS::Dahiliye')])), options);
        expect(getNoteIdsInDeck('tus').size).toBe(0);
        expect(getNoteIdsInDeck('TUS').size).toBe(1);
    });
});

describe('sort field and template deck override', () => {
    it('stores the sort field without formatting when a text import updates a note (EDT-9)', async () => {
        importDelimitedNotes('#html:true\n#separator:tab\n<b>Kalp</b>\tbir', { noteType: noteType(), deckId: 1 });
        importDelimitedNotes('#html:true\n#separator:tab\n<b>Kalp</b>\t<i>iki</i>', { noteType: noteType(), deckId: 1 });
        const note = getAllNotes().find((entry) => entry.fields[0] === '<b>Kalp</b>')!;
        expect(note.fields[1]).toBe('<i>iki</i>');
        expect(h.db.getFirstSync('SELECT sfld FROM notes WHERE id = ?', note.id).sfld).toBe('Kalp');
    });

    it('remaps a template deck override to the local deck on import and keeps it on export (EDT-4)', async () => {
        saveDeck(deck(704, 'Local deck with the same id'));
        const data = source([deck(703, 'Transfer'), deck(704, 'Transfer::Target')]);
        data.noteTypes[0].templates[0] = { ...data.noteTypes[0].templates[0], deckOverrideId: 704 };
        data.cards.push({ ...data.cards[0], id: 705, deckId: 704, ord: 0, noteId: 701 } as AnkiCard);
        data.cards = [data.cards[1]];
        const exported = await packageCol(await pkg(data));
        expect(exported.decks.find((entry) => entry.name === 'Transfer::Target')).toBeTruthy();
        await importApkg(await pkg(data), options);
        const target = getAllDecks().find((entry) => entry.name === 'Transfer::Target')!;
        expect(target.id).not.toBe(704);
        const stored = JSON.parse(h.db.getFirstSync('SELECT data FROM note_types WHERE name = ?', 'Transfer').data);
        expect(stored.templates[0].deckOverrideId).toBe(target.id);

        const reexport = await JSZip.loadAsync((await buildAnkiExport('apkg', undefined, false)).bytes!);
        const reader = await openSqlJsReader(await reexport.file('collection.anki21')!.async('uint8array'));
        const models = Object.values(JSON.parse(reader.getFirstSync<any>('SELECT models FROM col')!.models)) as any[];
        reader.close();
        expect(models.find((model) => model.name === 'Transfer').tmpls[0].did).toBe(target.id);
    });

    it('never carries an override for a deck outside the package', async () => {
        const data = source();
        data.noteTypes[0].templates[0] = { ...data.noteTypes[0].templates[0], deckOverrideId: 999 };
        await importApkg(await pkg(data), options);
        const stored = JSON.parse(h.db.getFirstSync('SELECT data FROM note_types WHERE name = ?', 'Transfer').data);
        expect(stored.templates[0].deckOverrideId).toBeUndefined();
    });
});
