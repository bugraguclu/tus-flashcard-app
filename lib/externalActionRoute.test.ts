// Behaviour reference: AnkiMobile's x-callback add-note request
// (https://docs.ankimobile.net/url-schemes.html): type, deck and fld<Name> values open the Add
// screen. TusAnkiM refuses one it cannot serve with its reason, so the learner can be told.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbUpsertFtsCard: () => {} }));
import { createDeck, saveDeck } from './deckStore';
import { parseExternalAppUrl, type ExternalAppAction } from './externalLinking';
import { externalActionRoute } from './externalActionRoute';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());

const action = (query: string): ExternalAppAction => {
    const parsed = parseExternalAppUrl(`tusankim://x-callback-url/addnote?${query}`);
    if (!parsed) throw new Error('test request did not parse');
    return parsed;
};
const fieldValues = (result: ReturnType<typeof externalActionRoute>) => {
    if ('rejected' in result) throw new Error(`refused: ${result.rejected.reason}`);
    return JSON.parse(result.params.fieldValues) as string[];
};

describe('externalActionRoute', () => {
    it('opens the editor with the named fields', () => {
        const deck = createDeck('Farmakoloji');
        const result = externalActionRoute(action('type=Basic&deck=Farmakoloji&fldFront=Aspirin&fldBack=COX'));
        expect(result).toMatchObject({ pathname: '/editor', params: { deckId: String(deck.id) } });
        expect(fieldValues(result)).toEqual(['Aspirin', 'COX']);
    });

    it('finds a field written in another case or by its Turkish label, and a type by its Turkish name', () => {
        createDeck('Farmakoloji');
        expect(fieldValues(externalActionRoute(action('type=Basic&deck=Farmakoloji&fldfront=Aspirin&fldBACK=COX')))).toEqual(['Aspirin', 'COX']);
        expect(fieldValues(externalActionRoute(action('type=Temel&deck=Farmakoloji&fld%C3%96n=Aspirin&fldArka=COX')))).toEqual(['Aspirin', 'COX']);
    });

    it('refuses, with the reason, a note type or deck the collection lacks', () => {
        createDeck('Farmakoloji');
        expect(externalActionRoute(action('type=Yok&deck=Farmakoloji&fldFront=a'))).toEqual({ rejected: { reason: 'noteTypeNotFound', noteTypeName: 'Yok' } });
        expect(externalActionRoute(action('type=Basic&deck=Dahiliye&fldFront=a'))).toEqual({ rejected: { reason: 'deckNotFound', deckName: 'Dahiliye' } });
    });

    it('refuses a filtered or catalog deck instead of filing the note elsewhere', () => {
        const filtered = createDeck('Tekrar');
        saveDeck({ ...filtered, isFiltered: true });
        expect(externalActionRoute(action('type=Basic&deck=Tekrar&fldFront=a'))).toEqual({ rejected: { reason: 'filteredDeck', deckName: 'Tekrar' } });
        const catalog = createDeck('TUS Kartları');
        db.runSync('UPDATE decks SET data = ? WHERE id = ?', JSON.stringify({ ...catalog, catalogPack: 'bka-tus' }), catalog.id);
        expect(externalActionRoute(action('type=Basic&deck=TUS%20Kartlar%C4%B1&fldFront=a'))).toEqual({ rejected: { reason: 'catalogDeck', deckName: 'TUS Kartları' } });
    });

    it('refuses a request none of whose fields the note type has, rather than opening an empty editor', () => {
        createDeck('Farmakoloji');
        expect(externalActionRoute(action('type=Basic&deck=Farmakoloji&fldSoru=a'))).toEqual({
            rejected: { reason: 'noMatchingFields', noteTypeName: 'Basic', fieldNames: ['Front', 'Back'] },
        });
    });
});
