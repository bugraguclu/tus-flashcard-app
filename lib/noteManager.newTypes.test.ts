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
    changeNotesType,
    createTusCard,
    deleteAnkiCardOnly,
    findEmptyCards,
    getCardsForNote,
    getNote,
    saveAnkiCard,
    saveNoteType,
    updateTusCardByCardId,
    updateNotesTags,
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

describe('createTusCard: Anki reversed note types', () => {
    it('creates two sibling cards from one note', () => {
        const { note, cards } = createTusCard({
            subject: 'anatomy',
            topic: 'Kalp',
            question: 'Soru metni',
            answer: 'Cevap metni',
            deckId: 1,
            noteTypeId: 2,
        });

        expect(cards).toHaveLength(2);
        expect(cards.map((c) => c.ord).sort()).toEqual([0, 1]);
        expect(getCardsForNote(note.id)).toHaveLength(2);
    });

    it('does not create the optional reverse card while Add Reverse is blank', () => {
        const { note, cards } = createTusCard({
            subject: 'anatomy',
            topic: 'Kalp',
            question: 'Soru metni',
            answer: 'Cevap metni',
            deckId: 1,
            noteTypeId: 7,
        });

        const saved = getNote(note.id)!;
        expect(saved.fields[2]).toBe('');
        expect(cards).toHaveLength(1);
    });

    it('creates the optional reverse card when Add Reverse contains text', () => {
        const { note, cards } = createTusCard({
            subject: 'anatomy',
            topic: 'Kalp',
            question: 'Soru metni',
            answer: 'Cevap metni',
            deckId: 1,
            noteTypeId: 7,
            reverseAnswer: '1',
        });

        const saved = getNote(note.id)!;
        expect(saved.fields[2]).toBe('1');
        expect(cards).toHaveLength(2);
    });

    it('adds and removes the optional reverse card when the field changes', () => {
        const { note, card } = createTusCard({
            question: 'Soru metni', answer: 'Cevap metni', deckId: 1, noteTypeId: 7,
        });
        expect(getCardsForNote(note.id)).toHaveLength(1);

        updateTusCardByCardId(card.id, {
            question: 'Soru metni', answer: 'Cevap metni', deckId: 1, reverseAnswer: '1',
        });
        expect(getCardsForNote(note.id)).toHaveLength(2);

        updateTusCardByCardId(card.id, {
            question: 'Soru metni', answer: 'Cevap metni', deckId: 1, reverseAnswer: '',
        });
        expect(getCardsForNote(note.id)).toHaveLength(1);
    });
});

describe('createTusCard: type-answer note type (id 8)', () => {
    it('creates exactly one card', () => {
        const { cards } = createTusCard({
            subject: 'anatomy',
            topic: 'Kalp',
            question: 'Soru metni',
            answer: 'Cevap metni',
            deckId: 1,
            noteTypeId: 8,
        });

        expect(cards).toHaveLength(1);
    });
});

describe('createTusCard: external field values', () => {
    it('preserves fields that are not exposed by the compact editor', () => {
        saveNoteType({
            id: 99,
            name: 'External',
            kind: 'standard',
            fields: [
                { name: 'Front', ord: 0, sticky: false, rtl: false },
                { name: 'Back', ord: 1, sticky: false, rtl: false },
                { name: 'Source', ord: 2, sticky: false, rtl: false },
            ],
            templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}<br>{{Source}}' }],
            css: '', sortFieldIdx: 0, mod: 0,
        });

        const { note } = createTusCard({
            question: 'Q', answer: 'A', deckId: 1, noteTypeId: 99,
            fieldValues: ['Q', 'A', 'External source'],
        });

        expect(getNote(note.id)?.fields).toEqual(['Q', 'A', 'External source']);
    });
});

describe('findEmptyCards / deleteAnkiCardOnly', () => {
    it('finds no empty cards for a freshly created reversed note', () => {
        createTusCard({
            subject: 'anatomy', topic: 'Kalp', question: 'Q', answer: 'A', deckId: 1, noteTypeId: 2,
        });

        expect(findEmptyCards()).toHaveLength(0);
    });

    it('flags an orphaned card whose template ordinal no longer exists on the note type', () => {
        const { note } = createTusCard({
            subject: 'anatomy', topic: 'Kalp', question: 'Q', answer: 'A', deckId: 1, noteTypeId: 2,
        });

        // Simulate a note-type edit that dropped the second template (Card 2 still exists in the DB).
        const noteType = {
            id: 2,
            name: 'Basic (and reversed card)',
            kind: 'standard' as const,
            fields: [
                { name: 'Front', ord: 0, sticky: false, rtl: false },
                { name: 'Back', ord: 1, sticky: false, rtl: false },
            ],
            templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }],
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
            subject: 'anatomy', topic: 'Kalp', question: 'Q', answer: 'A', deckId: 1, noteTypeId: 2,
        });
        const [card1, card2] = cards;

        deleteAnkiCardOnly(card2.id);

        expect(getCardsForNote(note.id).map((c) => c.id)).toEqual([card1.id]);
        expect(getNote(note.id)).not.toBeNull();
    });
});

describe('browser bulk note operations', () => {
    it('changes note type while preserving the existing card schedule', () => {
        const { note, card } = createTusCard({
            subject: 'anatomy', topic: 'Kalp', question: 'Q', answer: 'A', deckId: 1, noteTypeId: 1,
        });
        saveAnkiCard({ ...card, type: 2, queue: 2, due: 123, ivl: 30, reps: 8 });

        expect(changeNotesType([note.id], 2)).toBe(1);

        const converted = getNote(note.id)!;
        const cards = getCardsForNote(note.id).sort((a, b) => a.ord - b.ord);
        expect(converted.noteTypeId).toBe(2);
        expect(converted.fields.slice(0, 2)).toEqual(['Q', 'A']);
        expect(cards).toHaveLength(2);
        expect(cards[0]).toMatchObject({ id: card.id, type: 2, queue: 2, due: 123, ivl: 30, reps: 8 });
        expect(cards[1]).toMatchObject({ type: 0, queue: 0, ord: 1 });
    });

    it('applies tag deltas without erasing tags unique to each note', () => {
        const first = createTusCard({ subject: 'anatomy', topic: 'A', question: 'Q1', answer: 'A1', deckId: 1 }).note;
        const second = createTusCard({ subject: 'anatomy', topic: 'B', question: 'Q2', answer: 'A2', deckId: 1 }).note;

        expect(updateNotesTags([first.id, second.id], ['ortak'], ['anatomy'])).toBe(2);
        expect(getNote(first.id)?.tags).toEqual(expect.arrayContaining(['A', 'ortak']));
        expect(getNote(second.id)?.tags).toEqual(expect.arrayContaining(['B', 'ortak']));
        expect(getNote(first.id)?.tags).not.toContain('anatomy');
    });
});
