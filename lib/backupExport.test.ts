import { describe, expect, it } from 'vitest';
import { parseBackupExportSource } from './backupExport';

function canonicalBackup() {
    const noteType = { id: 10, name: 'Basic', fields: [], templates: [], css: '', sortFieldIdx: 0, mod: 0 };
    const note = { id: 20, guid: 'guid', noteTypeId: 10, mod: 0, usn: -1, tags: [], fields: ['Q'], sfld: 'Q', csum: 1, flags: 0 };
    const deck = { id: 30, name: 'Snapshot Deck', configId: 1, mod: 0, usn: -1, description: '', collapsed: false, isFiltered: false };
    const card = { id: 40, noteId: 20, deckId: 30, ord: 0, mod: 0, usn: -1, type: 0, queue: 0, due: 1, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0 };
    return JSON.stringify({
        version: 6,
        canonical: true,
        exportDate: '2026-08-25T20:14:00.000Z',
        settings: { dayRolloverHour: 6 },
        tables: {
            note_types: [{ id: 10, name: 'Basic', data: JSON.stringify(noteType), updated_at: 0, usn: -1, tombstone: 0 }],
            notes: [{ id: 20, noteTypeId: 10, sfld: 'Q', csum: 1, tags: '', data: JSON.stringify(note), updated_at: 0, usn: -1, tombstone: 0 }],
            anki_cards: [{ id: 40, noteId: 20, deckId: 30, ord: 0, type: 0, queue: 0, due: 1, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, flags: 0, data: JSON.stringify(card), updated_at: 0, created_at: 0, usn: -1, tombstone: 0 }],
            decks: [{ id: 30, name: 'Snapshot Deck', data: JSON.stringify(deck), updated_at: 0, usn: -1, tombstone: 0 }],
            deck_configs: [], revlog: [], graves: [], session_stats: [],
        },
    });
}

describe('parseBackupExportSource', () => {
    it('hydrates a validated canonical snapshot without application state', () => {
        const source = parseBackupExportSource(canonicalBackup(), 'tus-backup-2026-08-25-231400000.json');

        expect(source.decks.map((deck) => deck.name)).toEqual(['Snapshot Deck']);
        expect(source.notes[0].fields).toEqual(['Q']);
        expect(source.cards[0].deckId).toBe(30);
        expect(source.rolloverHour).toBe(6);
        expect(source.backupName).toBe('tus-backup-2026-08-25-231400000.json');
    });

    it('rejects legacy and malformed JSON backups for package export', () => {
        expect(() => parseBackupExportSource(JSON.stringify({ version: 5, customCards: [] }), 'legacy.json'))
            .toThrowError(/canonical/i);
        expect(() => parseBackupExportSource('{', 'broken.json')).toThrowError(/invalid/i);
    });
});
