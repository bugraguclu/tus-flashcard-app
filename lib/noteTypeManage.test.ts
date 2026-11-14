// Behaviour reference: Anki's Manage Note Types › Add offers each stock type ("Add: Basic") and a
// copy of each existing type ("Clone: …"), then asks for the name
// (https://docs.ankiweb.net/editing.html#adding-a-note-type).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbUpsertFtsCard: () => {} }));
import { BUILTIN_NOTE_TYPES } from './models';
import { getNoteType, saveNoteType } from './noteTypeStore';
import { cloneableNoteTypes, createNoteTypeFrom, freeNoteTypeName, newNoteTypeNameProblem, stockNoteTypes } from './noteTypeManage';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());

describe('adding a note type', () => {
    it('offers the stock types fresh, whatever the learner did to them', () => {
        const basic = BUILTIN_NOTE_TYPES.find((type) => type.id === 1)!;
        saveNoteType({ ...basic, css: '.card { color: red; }' });
        const stock = stockNoteTypes();
        expect(stock.map((type) => type.name)).toEqual(expect.arrayContaining(['Basic', 'Cloze', 'Image Occlusion']));
        expect(stock.find((type) => type.id === 1)?.css).toBe(basic.css);
        // The copy list shows the learner's version.
        expect(cloneableNoteTypes().find((type) => type.id === 1)?.css).toBe('.card { color: red; }');
    });

    it('saves a copy under a fresh id and the given name, owned by the learner', () => {
        const cloze = BUILTIN_NOTE_TYPES.find((type) => type.id === 3)!;
        const imported = { ...cloze, id: 4242, name: 'AnKing', sourcePackageId: 'pkg', catalogPack: undefined, ankiRaw: { id: 4242, originalStockKind: 5 } };
        saveNoteType(imported);
        const copy = createNoteTypeFrom(imported, '  Farmakoloji boşlukları ', 1_800_000_000_000);
        expect(copy.id).not.toBe(4242);
        expect(copy).toMatchObject({ name: 'Farmakoloji boşlukları', kind: 'cloze', mod: 1_800_000_000 });
        expect(copy.sourcePackageId).toBeUndefined();
        expect(copy.templates).toEqual(imported.templates);
        expect(getNoteType(copy.id)?.name).toBe('Farmakoloji boşlukları');
        // The source is untouched.
        expect(getNoteType(4242)?.name).toBe('AnKing');
    });

    it('suggests a free name and refuses a blank or taken one', () => {
        expect(freeNoteTypeName('Basic', ['Basic', 'basic 2'])).toBe('Basic 3');
        expect(freeNoteTypeName('Yeni', ['Basic'])).toBe('Yeni');
        expect(newNoteTypeNameProblem('  ', ['Basic'])).toBe('empty');
        expect(newNoteTypeNameProblem('BASIC', ['Basic'])).toBe('duplicate');
        expect(newNoteTypeNameProblem('Farmakoloji', ['Basic'])).toBeNull();
    });
});
