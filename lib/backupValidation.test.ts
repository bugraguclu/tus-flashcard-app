import { describe, expect, it } from 'vitest';
import { validateCanonicalBackupData } from './backupValidation';

function validBackup() {
    return {
        version: 6,
        canonical: true,
        tables: {
            note_types: [{ id: 1, name: 'Basic', data: '{}' }],
            notes: [{ id: 10, noteTypeId: 1, sfld: 'Q', csum: 1, tags: '', data: '{}' }],
            anki_cards: [{ id: 20, noteId: 10, deckId: 30, ord: 0, type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, flags: 0, data: '{}' }],
            decks: [{ id: 30, name: 'Deck', data: '{}' }],
            deck_configs: [{ id: 1, data: '{}' }],
            revlog: [], graves: [], session_stats: [],
        },
    };
}

describe('canonical backup validation', () => {
    it('accepts a valid, internally consistent snapshot', () => {
        expect(validateCanonicalBackupData(validBackup())).toEqual({ valid: true });
    });

    it('rejects malformed JSON rows, duplicate ids and orphan references', () => {
        const malformed = validBackup();
        malformed.tables.notes[0].data = '{';
        expect(validateCanonicalBackupData(malformed)).toEqual({ valid: false, reason: 'invalid-row:notes' });

        const duplicate = validBackup();
        duplicate.tables.note_types.push({ ...duplicate.tables.note_types[0] });
        expect(validateCanonicalBackupData(duplicate)).toEqual({ valid: false, reason: 'invalid-id:note_types' });

        const orphan = validBackup();
        orphan.tables.anki_cards[0].noteId = 999;
        expect(validateCanonicalBackupData(orphan)).toEqual({ valid: false, reason: 'orphan-card' });
    });
});
