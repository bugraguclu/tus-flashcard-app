import { describe, expect, it, vi } from 'vitest';
import type { BkaCatalogSnapshot } from './bkaCatalog';

const fixture = vi.hoisted(() => ({
    rows: new Map<string, Array<{ data: string }>>(),
    subjects: '[]',
    db: {
        getAllSync: vi.fn((sql: string) => {
            const table = sql.match(/FROM\s+(\w+)/i)?.[1] ?? '';
            return fixture.rows.get(table) ?? [];
        }),
        getFirstSync: vi.fn(() => ({ value: fixture.subjects })),
    },
}));

vi.mock('expo-asset', () => ({ Asset: { fromModule: vi.fn() } }));
vi.mock('./db', () => ({ getDB: () => fixture.db }));

import { mergePreservedUserContent } from './bkaCatalog';

const stored = (entries: unknown[]) => entries.map((entry) => ({ data: JSON.stringify(entry) }));

function catalogSnapshot(cardIds: number[]): BkaCatalogSnapshot {
    return {
        noteTypes: [{ id: 10 } as any],
        deckConfigs: [{ id: 20 } as any],
        decks: [{ id: 30, name: 'Anatomi BKA' } as any],
        notes: [{ id: 40, noteTypeId: 10 } as any],
        cards: cardIds.map((id) => ({ id, noteId: 40, deckId: 30 } as any)),
        subjects: [{ id: 'bka-anatomi', name: 'Anatomi', deckId: 30 } as any],
    };
}

describe('BKA tier replacement preserves free Anki content', () => {
    it('keeps learner-created types, decks, notes, cards and subjects while excluding catalog rows', () => {
        const full = catalogSnapshot([50, 51]);
        const trial = catalogSnapshot([50]);
        const userType = { id: 110, name: 'Kişisel tip' };
        const userConfig = { id: 120, name: 'Kişisel ayar' };
        const userDeck = { id: 130, name: 'Kendi destem' };
        const userNote = { id: 140, noteTypeId: 110, fields: ['Soru', 'Cevap'] };
        const userCard = { id: 150, noteId: 140, deckId: 130 };

        fixture.rows = new Map([
            ['note_types', stored([full.noteTypes[0], userType])],
            ['deck_configs', stored([full.deckConfigs[0], userConfig])],
            ['decks', stored([full.decks[0], userDeck])],
            ['notes', stored([full.notes[0], userNote])],
            [
                'anki_cards',
                stored([
                    full.cards[0],
                    userCard,
                    { id: 151, noteId: 999, deckId: 130 }, // orphaned user card must not survive
                ]),
            ],
        ]);
        fixture.subjects = JSON.stringify([
            full.subjects[0],
            { id: 'kisisel', name: 'Kişisel', deckId: 130 },
        ]);

        const merged = mergePreservedUserContent(full, trial);

        expect(merged.noteTypes.map((entry) => entry.id)).toEqual([10, 110]);
        expect(merged.deckConfigs.map((entry) => entry.id)).toEqual([20, 120]);
        expect(merged.decks.map((entry) => entry.id)).toEqual([30, 130]);
        expect(merged.notes.map((entry) => entry.id)).toEqual([40, 140]);
        expect(merged.cards.map((entry) => entry.id)).toEqual([50, 150]);
        expect(merged.subjects.map((entry) => entry.id)).toEqual(['bka-anatomi', 'kisisel']);
    });
});
