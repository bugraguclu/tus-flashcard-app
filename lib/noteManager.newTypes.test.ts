// Integration tests (real in-memory SQLite) for the round-2 additions: reversed-card
// generation via createTusCard, and the Empty Cards checker/single-card delete.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
    buildFtsPrefixQuery: () => '',
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
    dbDeleteFtsCard: () => {},
    dbSearchCards: () => [],
}));

import {
    createTusCard,
    deleteAnkiCardOnly,
    findEmptyCards,
    getCardsForNote,
    getNote,
    saveNoteType,
} from './noteManager';
import { saveDeck } from './deckManager';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    db = createAppDb(SQL);
    dbHolder.db = db;
    saveDeck({ id: 1, name: 'Test', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
});

afterEach(() => db.close());

describe('createTusCard: reversed note type (id 6)', () => {
    it('creates two sibling cards from one note', () => {
        const { note, cards } = createTusCard({
            subject: 'anatomy',
            topic: 'Kalp',
            question: 'Soru metni',
            answer: 'Cevap metni',
            deckId: 1,
            noteTypeId: 6,
        });

        expect(cards).toHaveLength(2);
        expect(cards.map((c) => c.ord).sort()).toEqual([0, 1]);
        expect(getCardsForNote(note.id)).toHaveLength(2);
    });

    it('stores a blank TersCevap by default (card 2 falls back to Soru at render time)', () => {
        const { note } = createTusCard({
            subject: 'anatomy',
            topic: 'Kalp',
            question: 'Soru metni',
            answer: 'Cevap metni',
            deckId: 1,
            noteTypeId: 6,
        });

        const saved = getNote(note.id)!;
        expect(saved.fields[3]).toBe('');
    });

    it('stores a custom TersCevap when provided', () => {
        const { note } = createTusCard({
            subject: 'anatomy',
            topic: 'Kalp',
            question: 'Soru metni',
            answer: 'Cevap metni',
            deckId: 1,
            noteTypeId: 6,
            reverseAnswer: 'Özel ters cevap',
        });

        const saved = getNote(note.id)!;
        expect(saved.fields[3]).toBe('Özel ters cevap');
    });
});

describe('createTusCard: type-answer note type (id 5)', () => {
    it('creates exactly one card, same shape as the basic TUS card', () => {
        const { cards } = createTusCard({
            subject: 'anatomy',
            topic: 'Kalp',
            question: 'Soru metni',
            answer: 'Cevap metni',
            deckId: 1,
            noteTypeId: 5,
        });

        expect(cards).toHaveLength(1);
    });
});

describe('findEmptyCards / deleteAnkiCardOnly', () => {
    it('finds no empty cards for a freshly created reversed note', () => {
        createTusCard({
            subject: 'anatomy', topic: 'Kalp', question: 'Q', answer: 'A', deckId: 1, noteTypeId: 6,
        });

        expect(findEmptyCards()).toHaveLength(0);
    });

    it('flags an orphaned card whose template ordinal no longer exists on the note type', () => {
        const { note } = createTusCard({
            subject: 'anatomy', topic: 'Kalp', question: 'Q', answer: 'A', deckId: 1, noteTypeId: 6,
        });

        // Simulate a note-type edit that dropped the second template (Card 2 still exists in the DB).
        const noteType = {
            id: 6,
            name: 'TUS Çift Taraflı',
            kind: 'standard' as const,
            fields: [
                { name: 'Soru', ord: 0, sticky: false, rtl: false },
                { name: 'Cevap', ord: 1, sticky: false, rtl: false },
            ],
            templates: [{ name: 'Soru → Cevap', ord: 0, qfmt: '{{Soru}}', afmt: '{{Cevap}}' }],
            css: '',
            sortFieldIdx: 0,
            mod: 0,
        };
        saveNoteType(noteType);

        const empty = findEmptyCards();
        expect(empty).toHaveLength(1);
        expect(empty[0].noteId).toBe(note.id);
        expect(empty[0].reason).toContain('Şablon');
    });

    it('deleteAnkiCardOnly removes just that card, leaving the note and its sibling intact', () => {
        const { note, cards } = createTusCard({
            subject: 'anatomy', topic: 'Kalp', question: 'Q', answer: 'A', deckId: 1, noteTypeId: 6,
        });
        const [card1, card2] = cards;

        deleteAnkiCardOnly(card2.id);

        expect(getCardsForNote(note.id).map((c) => c.id)).toEqual([card1.id]);
        expect(getNote(note.id)).not.toBeNull();
    });
});
