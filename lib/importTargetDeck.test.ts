import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
}));

import { createDeck, getAllDecks, getDeck, getDeckByName, saveDeck } from './deckManager';
import { BUILTIN_NOTE_TYPES, DEFAULT_DECKS } from './models';
import { parseDelimited } from './importDelimited';
import { newDeckPickerEntries, resolveInitialTargetDeckId, textImportHeaderPresets } from './importTargetDeck';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    db = createAppDb(SQL);
    dbHolder.db = db;
    // Seed default deck as an initial launch does
    for (const d of DEFAULT_DECKS) {
        saveDeck(d);
    }
});

afterEach(() => {
    db.close();
});

describe('import target deck resolution and picker selection', () => {
    it('defaults to Varsayılan (deck id: 1) on standard import without parameters', () => {
        const resolvedId = resolveInitialTargetDeckId();
        expect(resolvedId).toBe(1);

        const deck = getDeck(resolvedId);
        expect(deck).not.toBeNull();
        expect(deck?.name).toBe('Varsayılan');
    });

    it('honours explicit deckId or deckName route parameters', () => {
        const customDeck = createDeck('Özel Deste');

        expect(resolveInitialTargetDeckId({ deckId: String(customDeck.id) })).toBe(customDeck.id);
        expect(resolveInitialTargetDeckId({ deckName: 'Özel Deste' })).toBe(customDeck.id);
        expect(resolveInitialTargetDeckId({ deck: 'Özel Deste' })).toBe(customDeck.id);
    });

    it('immediately retrieves a newly created deck with getDeckByName before React state updates', () => {
        // Simulating the scenario where the deck picker prop array is stale:
        const staleDeckPickerDecks = getAllDecks().filter((d) => !d.isFiltered);
        expect(staleDeckPickerDecks.find((d) => d.name === 'Yeni Eklenen Deste')).toBeUndefined();

        // User taps "+ Yeni Deste" in DeckPickerModal:
        const created = createDeck('Yeni Eklenen Deste');
        expect(created.name).toBe('Yeni Eklenen Deste');

        // Old buggy behavior would fail:
        const oldLookup = staleDeckPickerDecks.find((d) => d.name === created.name);
        expect(oldLookup).toBeUndefined();

        // Fixed behavior immediately resolves from DB via getDeckByName:
        const newLookup = getDeckByName(created.name) ?? staleDeckPickerDecks.find((d) => d.name === created.name);
        expect(newLookup).toBeDefined();
        expect(newLookup?.id).toBe(created.id);
        expect(newLookup?.name).toBe('Yeni Eklenen Deste');
    });
});

/**
 * Anki 25.07+ reads `#deck:` and `#notetype:` before its import screen opens: an existing deck or
 * note type (by id, or by name in any case) is preselected, an unknown note type leaves the
 * default, and an unknown deck name is offered as "A new deck will be created" and made only when
 * the import runs (rslib text/csv/metadata.rs, behaviour only; checked against Anki 26.09.3).
 * https://docs.ankiweb.net/importing/text-files.html#file-headers
 */
describe('text file header presets', () => {
    const noteTypes = BUILTIN_NOTE_TYPES;
    const presets = (text: string) => textImportHeaderPresets(parseDelimited(text).metadata, getAllDecks(), noteTypes);

    it('preselects an existing deck by name in any case and spacing, or by id', () => {
        const anatomy = createDeck('Anatomi::Kemikler');
        expect(presets('#deck:anatomi::KEMIKLER\nq,a').deck).toEqual({ kind: 'existing', deckId: anatomy.id });
        expect(presets('#deck: Anatomi :: Kemikler \nq,a').deck).toEqual({ kind: 'existing', deckId: anatomy.id });
        expect(presets(`#deck:${anatomy.id}\nq,a`).deck).toEqual({ kind: 'existing', deckId: anatomy.id });
    });

    it('reads a number that is no deck id as a deck name', () => {
        const numeric = createDeck('2024');
        expect(presets('#deck:2024\nq,a').deck).toEqual({ kind: 'existing', deckId: numeric.id });
        expect(presets('#deck:1234\nq,a').deck).toEqual({ kind: 'new', name: '1234' });
    });

    it('offers a missing deck as one the import will create, without creating it', () => {
        const before = getAllDecks().map((deck) => deck.name);
        expect(presets('#separator:tab\n#html:false\n#deck:Import Testi\n#notetype:Basic\nSoru 1\tCevap 1').deck)
            .toEqual({ kind: 'new', name: 'Import Testi' });
        expect(getAllDecks().map((deck) => deck.name)).toEqual(before);
    });

    it('writes a new subdeck under the stored spelling of its existing parent', () => {
        createDeck('Anatomi');
        expect(presets('#deck:anatomi::Yeni Konu\nq,a').deck).toEqual({ kind: 'new', name: 'Anatomi::Yeni Konu' });
    });

    it('leaves the deck alone when the header cannot name an import target', () => {
        saveDeck({ id: 5000, name: 'Filtre', configId: 1, mod: 0, usn: -1, description: '', collapsed: false, isFiltered: true });
        expect(presets('#deck:Filtre\nq,a').deck).toBeNull();
        expect(presets('#deck:5000\nq,a').deck).toBeNull();
        // A filtered deck cannot have subdecks, so the import could not create this one.
        expect(presets('#deck:Filtre::Alt\nq,a').deck).toBeNull();
        expect(presets('#deck:\nq,a').deck).toBeNull();
        expect(presets('q,a').deck).toBeNull();
        // Each row names its own deck; the column, not the header, decides.
        expect(presets('#deck:Import Testi\n#deck column:3\nq,a,Başka').deck).toBeNull();
    });

    it('preselects an existing note type by name in any case or by id, and ignores an unknown one', () => {
        expect(presets('#notetype:Basic\nq,a').noteTypeId).toBe(1);
        expect(presets('#notetype:basic (and reversed card)\nq,a').noteTypeId).toBe(2);
        expect(presets('#notetype:7\nq,a').noteTypeId).toBe(7);
        expect(presets('#notetype:Yok Böyle Bir Tür\nq,a').noteTypeId).toBeNull();
        expect(presets('q,a').noteTypeId).toBeNull();
        expect(presets('#notetype:Basic\n#notetype column:1\nBasic,q,a').noteTypeId).toBeNull();
    });

    it('lists the missing decks of a new path as picker entries, existing parents excluded', () => {
        createDeck('Anatomi');
        const decks = getAllDecks();
        const entries = newDeckPickerEntries('Anatomi::Yeni::Alt', decks);
        expect(entries.map((deck) => deck.name)).toEqual(['Anatomi::Yeni', 'Anatomi::Yeni::Alt']);
        // Entries are never real decks: their ids cannot collide with a stored one.
        expect(entries.every((deck) => deck.id < 0 && !deck.isFiltered)).toBe(true);
        expect(newDeckPickerEntries('Anatomi', decks)).toEqual([]);
    });
});
