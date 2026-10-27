import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as SyncDb | null }));
vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbUpsertFtsCard: () => {},
}));

import { CATALOG_INSTALL_KEY, CATALOG_PACK_ID } from './catalogRows';
import { PaidCatalogProtectionError } from './catalogProtection';
import {
    createTusCard, getCardsForNote, getNote, saveAnkiCard, saveNote,
    updateTusCardByCardId,
} from './noteManager';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL);
    holder.db = db;
    db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', CATALOG_INSTALL_KEY, 'full');
});
afterEach(() => { db.close(); holder.db = null; });

function catalogNote(noteTypeId = 1, fieldValues = ['Soru', 'Cevap']) {
    const created = createTusCard({ question: '', answer: '', deckId: 10, noteTypeId, fieldValues });
    const note = { ...created.note, catalogPack: CATALOG_PACK_ID };
    db.runSync('UPDATE notes SET data = ? WHERE id = ?', JSON.stringify(note), note.id);
    return { ...created, note };
}

function update(cardId: number, fieldValues: string[], tags = ['kendi-etiketim']) {
    return updateTusCardByCardId(cardId, { question: '', answer: '', fieldValues, tags, deckId: 10 });
}

describe('purchased catalog note editing', () => {
    it.each(['full', 'true'])('saves every field, formatting and media with the %s unlock marker', (tier) => {
        const { note, card, cards } = catalogNote(7, ['Soru', 'Cevap', 'Ters cevap']);
        db.runSync('UPDATE settings SET value = ? WHERE key = ?', tier, CATALOG_INSTALL_KEY);
        const fields = ['<b>Yeni soru</b>', 'Yeni cevap<img src="kendi-resmim.png">', '[sound:kendi-sesim.m4a]'];

        update(card.id, fields);

        expect(getNote(note.id)).toMatchObject({
            guid: note.guid, noteTypeId: note.noteTypeId, catalogPack: CATALOG_PACK_ID,
            fields, tags: ['kendi-etiketim'], sfld: 'Yeni soru', // Anki's sort field is the HTML-stripped text (EDT-9)
        });
        expect(getCardsForNote(note.id).map((sibling) => sibling.id)).toEqual(cards.map((sibling) => sibling.id));
    });

    it('keeps every existing sibling while cloze edits add missing ordinals', () => {
        const { note, cards } = catalogNote(3, ['{{c1::İlk}} ve {{c2::ikinci}}', 'Ek']);
        const reviewed = { ...cards[0], type: 2 as const, queue: 2 as const, reps: 9, ivl: 21, due: 50 };
        saveAnkiCard(reviewed);
        db.runSync('INSERT INTO revlog (id, cardId, ease) VALUES (?, ?, ?)', 1, reviewed.id, 3);

        update(reviewed.id, ['{{c1::Değişti}} ve {{c3::yeni}}', 'Yeni ek']);

        expect(getCardsForNote(note.id).map((sibling) => sibling.ord)).toEqual([0, 1, 2]);
        expect(getCardsForNote(note.id)[0]).toMatchObject({ id: reviewed.id, reps: 9, ivl: 21, due: 50 });
        expect(db.getFirstSync('SELECT id FROM revlog WHERE cardId = ?', reviewed.id)).not.toBeNull();
        expect(db.getFirstSync('SELECT id FROM anki_cards WHERE id = ?', cards[1].id)).not.toBeNull();
    });

    it.each(['trial', null])('rejects field edits without a full unlock (%s) and leaves rows intact', (tier) => {
        const { note, card } = catalogNote();
        if (tier) db.runSync('UPDATE settings SET value = ? WHERE key = ?', tier, CATALOG_INSTALL_KEY);
        else db.runSync('DELETE FROM settings WHERE key = ?', CATALOG_INSTALL_KEY);

        expect(() => update(card.id, ['Değişti', 'Cevap'])).toThrow(PaidCatalogProtectionError);
        expect(getNote(note.id)).toEqual(note);
    });

    it('preserves catalog identity and rejects stripping ownership on a content save', () => {
        const { note } = catalogNote();
        expect(() => saveNote({ ...note, fields: ['Değişti', 'Cevap'], catalogPack: undefined })).toThrow(PaidCatalogProtectionError);
        expect(() => saveNote({ ...note, guid: 'baska-kimlik' })).toThrow(PaidCatalogProtectionError);
        expect(getNote(note.id)).toEqual(note);
    });
});
