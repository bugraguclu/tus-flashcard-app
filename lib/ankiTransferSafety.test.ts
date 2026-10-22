// Independently derived interchange regressions: https://docs.ankiweb.net/importing/packaged-decks.html
// Text mapping: https://docs.ankiweb.net/importing/text-files.html
import initSqlJs from 'sql.js';
import JSZip from 'jszip';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { createAppDb } from '../test/sqljsHarness';
const h = vi.hoisted(() => ({ db: null as any, media: new Map<string, Uint8Array>() }));
vi.mock('./db', () => ({ getDB: () => h.db, dbUpsertFtsCard: () => {}, dbIndexAllCards: () => {}, dbDeleteFtsCard: () => {} }));
vi.mock('./mediaStore', () => ({
    sanitizeMediaFilename: (name: string) => name,
    saveMediaBytes: async (name: string, bytes: Uint8Array) => { h.media.set(name, bytes); },
    readMediaBytes: async (name: string) => h.media.get(name) ?? null,
}));
import { buildAnkiExport, type ExportCollectionSource } from './exportAnkiPackage';
import { importApkg } from './importApkg';
import { openSqlJsReader } from './webDb';
import { BUILTIN_NOTE_TYPES, DEFAULT_DECK_CONFIG, checksumField, type AnkiCard } from './models';
import { getAllNotes, getAllAnkiCards } from './noteManager';
import { importDelimitedNotes, previewDelimitedNotes } from './importNotes';
import { parseDelimited } from './importDelimited';
import { localDayNumber } from './ankiState';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { h.db = createAppDb(SQL); h.media.clear(); Platform.OS = 'web'; });
function source(): ExportCollectionSource {
    const nt = { ...BUILTIN_NOTE_TYPES[0], id: 700, name: 'Transfer', fields: [...BUILTIN_NOTE_TYPES[0].fields, { name: 'Extra', ord: 2, sticky: false, rtl: false }] };
    return {
        notes: [{ id: 701, guid: 'transfer-guid', noteTypeId: nt.id, mod: 100, usn: -1, fields: ['Heart', '<img src="heart.png">', 'Keep me'], tags: ['important'], sfld: 'Heart', csum: checksumField('Heart'), flags: 0 }],
        cards: [{ id: 702, noteId: 701, deckId: 703, ord: 0, mod: 100, usn: -1, type: 0, queue: 0, due: 1, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0 }],
        decks: [{ id: 703, name: 'Transfer', configId: 1, mod: 100, usn: -1, description: '', collapsed: false, isFiltered: false }],
        noteTypes: [nt], deckConfigs: [{ ...DEFAULT_DECK_CONFIG }], revlog: [], graves: [], rolloverHour: 4,
    };
}
async function pkg(data = source()) {
    h.media.set('heart.png', new Uint8Array([1, 2, 3]));
    return (await buildAnkiExport('apkg', undefined, true, undefined, {}, data)).bytes!;
}
const options = { subject: 'tus' as const, openReader: openSqlJsReader };
describe('package update safety', () => {
    it('adds a missing card of an unchanged note and repairs its missing media without a post-commit crash', async () => {
        const bytes = await pkg();
        await importApkg(bytes, options);
        h.db.execSync('DELETE FROM anki_cards');
        h.media.clear();
        const result = await importApkg(bytes, options);
        expect(result).toMatchObject({ added: 0, updated: 0, duplicates: 1, cardsImported: 1, mediaImported: 1 });
        expect(result.indexed.map((row) => row.id)).toEqual([702]);
        expect(h.media.get('heart.png')).toEqual(new Uint8Array([1, 2, 3]));
        expect(getAllNotes()).toHaveLength(1);
    });
    it('skips every card of a schema-conflicting matched note', async () => {
        await importApkg(await pkg(), options);
        const changed = source();
        changed.noteTypes[0].templates.push({ ...changed.noteTypes[0].templates[0], ord: 1, name: 'Reverse' });
        changed.cards.push({ ...changed.cards[0], id: 704, ord: 1 });
        const result = await importApkg(await pkg(changed), options);
        expect(result.cardsImported).toBe(0);
        expect(getAllAnkiCards().map((card) => card.ord)).toEqual([0]);
    });
});
describe('scheduled package due units', () => {
    it.each([
        [2, 2, -10], [1, 3, 3], [1, -1, 3], [1, -2, 3], [3, -3, 3], [2, -1, -10],
    ])('preserves type %i / queue %i day due offset %i, including overdue days', async (type, queue, offset) => {
        const data = source();
        data.cards[0] = { ...data.cards[0], type, queue, due: localDayNumber(Date.now(), 4) + offset, ivl: 5 } as AnkiCard;
        const zip = await JSZip.loadAsync(await pkg(data));
        const reader = await openSqlJsReader(await zip.file('collection.anki21')!.async('uint8array'));
        expect(reader.getFirstSync<any>('SELECT due FROM cards')!.due).toBe(offset);
        reader.close();
        await importApkg(await pkg(data), options);
        expect(getAllAnkiCards()[0].due).toBe(data.cards[0].due);
    });
    it.each([1, -1, -2, -3])('preserves intraday learning timestamps in queue %i', async (queue) => {
        const data = source();
        const due = Math.floor(Date.now() / 1000) * 1000 + 60000;
        data.cards[0] = { ...data.cards[0], type: 1, queue, due } as AnkiCard;
        await importApkg(await pkg(data), options);
        expect(getAllAnkiCards()[0].due).toBe(due);
    });
});
describe('text update and export safety', () => {
    it('preserves unmapped fields and existing tags, with matching preview counts', async () => {
        const data = source();
        await importApkg(await pkg(data), options);
        const opts = { noteType: data.noteTypes[0], deckId: 703, fieldColumns: [0, 1, -1], tags: ['batch'] };
        expect(previewDelimitedNotes('Heart\tNew', opts)).toMatchObject({ updated: 1 });
        expect(importDelimitedNotes('Heart\tNew', opts)).toMatchObject({ updated: 1 });
        expect(getAllNotes()[0]).toMatchObject({ fields: ['Heart', 'New', 'Keep me'], tags: ['important', 'batch'] });
        expect(previewDelimitedNotes('Heart\tNew', opts)).toMatchObject({ updated: 0, duplicates: 1 });
    });
    it('a mapped empty tag column explicitly clears tags and a mapped empty field clears content', async () => {
        const data = source();
        await importApkg(await pkg(data), options);
        importDelimitedNotes('Heart\t\t', { noteType: data.noteTypes[0], deckId: 703, fieldColumns: [0, 1, -1], tagsColumn: 3 });
        expect(getAllNotes()[0]).toMatchObject({ fields: ['Heart', '', 'Keep me'], tags: [] });
    });
    it.each([true, false])('quotes # in a first-column GUID or field (with GUID: %s)', async (includeGuid) => {
        const data = source();
        data.notes[0].guid = '#stable'; data.notes[0].fields[0] = '#1 question';
        const artifact = await buildAnkiExport('notesTxt', undefined, false, undefined, { includeGuid, includeDeck: false, includeNotetype: false }, data);
        const rows = parseDelimited(artifact.text!).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0][0]).toBe(includeGuid ? '#stable' : '#1 question');
    });
});
