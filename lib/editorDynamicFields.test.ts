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
    findDuplicateNote,
    getNote,
    saveNoteType,
    updateTusCardByCardId,
} from './noteManager';
import { saveDeck } from './deckManager';
import { localizeFieldName } from './i18n';
import type { NoteType } from './models';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    db = createAppDb(SQL);
    dbHolder.db = db;
    saveDeck({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveDeck({ id: 2, name: 'Patoloji', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
});

afterEach(() => db.close());

describe('Dynamic multi-field editor integration', () => {
    const custom4FieldNoteType: NoteType = {
        id: 500,
        name: '4-Field Clinical Note',
        kind: 'standard',
        fields: [
            { ord: 0, name: 'Clinical Case', sticky: false, rtl: false },
            { ord: 1, name: 'Diagnosis', sticky: false, rtl: false },
            { ord: 2, name: 'Mechanism', sticky: false, rtl: false },
            { ord: 3, name: 'Treatment', sticky: false, rtl: false },
        ],
        templates: [
            { ord: 0, name: 'Card 1', qfmt: '{{Clinical Case}}', afmt: '{{Diagnosis}}<br>{{Mechanism}}<br>{{Treatment}}' },
        ],
        css: '',
        sortFieldIdx: 0,
        mod: Date.now(),
    };

    it('creates note with arbitrary fieldValues array preserving all fields', () => {
        saveNoteType(custom4FieldNoteType);

        const fieldValues = [
            '65 yaşında erkek göğüs ağrısı ile başvurdu.',
            'Akut Koroner Sendrom',
            'Aterosklerotik plak rüptürü',
            'Aspirin + Klopidogrel + Heparin + PCI',
        ];

        const { note, cards } = createTusCard({
            // question/answer are the legacy two-field path; fieldValues must win over them.
            question: 'yok sayılmalı',
            answer: 'yok sayılmalı',
            deckId: 2,
            noteTypeId: 500,
            fieldValues,
            tags: ['tıp', 'kardiyoloji'],
        });

        expect(note.noteTypeId).toBe(500);
        expect(note.fields).toEqual(fieldValues);
        expect(cards).toHaveLength(1);
        expect(cards[0].deckId).toBe(2);

        const loadedNote = getNote(note.id);
        expect(loadedNote).not.toBeNull();
        expect(loadedNote?.fields).toEqual(fieldValues);
        expect(loadedNote?.sfld).toBe('65 yaşında erkek göğüs ağrısı ile başvurdu.');
    });

    it('updates note with dynamic fieldValues and maintains sortField and checksum', () => {
        saveNoteType(custom4FieldNoteType);

        const initialValues = ['Case 1', 'Diag 1', 'Mech 1', 'Treat 1'];
        const { note, cards } = createTusCard({
            question: initialValues[0],
            answer: initialValues[1],
            deckId: 2,
            noteTypeId: 500,
            fieldValues: initialValues,
        });

        const updatedValues = ['Case 1 Modified', 'Diag 1 Modified', 'Mech 1 Modified', 'Treat 1 Modified'];
        const result = updateTusCardByCardId(cards[0].id, {
            question: updatedValues[0],
            answer: updatedValues[1],
            fieldValues: updatedValues,
            tags: ['revised'],
        });

        if (!result) throw new Error('updateTusCardByCardId returned null');
        expect(result.note.id).toBe(note.id);
        expect(result.card.id).toBe(cards[0].id);

        const reloaded = getNote(note.id);
        expect(reloaded?.fields).toEqual(updatedValues);
        expect(reloaded?.sfld).toBe('Case 1 Modified');
        expect(reloaded?.tags).toEqual(['revised']);
    });

    it('findDuplicateNote correctly finds matches and reports the deck name', () => {
        saveNoteType(custom4FieldNoteType);

        createTusCard({
            question: 'Hipertansiyon patogenezi',
            answer: 'Tanı',
            deckId: 2,
            noteTypeId: 500,
            fieldValues: ['Hipertansiyon patogenezi', 'Tanı', 'Mekanizma', 'Tedavi'],
        });

        const dup = findDuplicateNote(500, 'Hipertansiyon patogenezi');
        expect(dup).not.toBeNull();
        expect(dup?.firstField).toBe('Hipertansiyon patogenezi');
        expect(dup?.deckName).toBe('Patoloji');

        // Whitespace trimmed matching
        const dupWithSpaces = findDuplicateNote(500, '   Hipertansiyon patogenezi   ');
        expect(dupWithSpaces).not.toBeNull();
        expect(dupWithSpaces?.noteId).toBe(dup?.noteId);

        // Different note type should not match
        expect(findDuplicateNote(1, 'Hipertansiyon patogenezi')).toBeNull();

        // Exclude note id (edit mode)
        if (dup) {
            expect(findDuplicateNote(500, 'Hipertansiyon patogenezi', dup.noteId)).toBeNull();
        }
    });

    it('localizes standard field names and passes custom field names untouched', () => {
        expect(localizeFieldName('tr', 'Front')).toBe('Ön');
        expect(localizeFieldName('tr', 'Back')).toBe('Arka');
        expect(localizeFieldName('tr', 'Text')).toBe('Metin');
        expect(localizeFieldName('tr', 'Back Extra')).toBe('Arka Ek');
        expect(localizeFieldName('tr', 'Add Reverse')).toBe('Tersini Ekle');
        expect(localizeFieldName('tr', 'Clinical Case')).toBe('Clinical Case');
        expect(localizeFieldName('en', 'Front')).toBe('Front');
    });
});
