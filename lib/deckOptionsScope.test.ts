import { describe, expect, it } from 'vitest';
import { getDeckOptionsScopes } from './deckOptionsScope';
import type { Deck } from './models';

function deck(id: number, name: string, options: Partial<Deck> = {}): Deck {
    return {
        id,
        name,
        configId: 1,
        mod: 0,
        usn: 0,
        description: '',
        collapsed: false,
        isFiltered: false,
        ...options,
    };
}

describe('deck options scope picker', () => {
    it('lists real decks and subdecks even when they share the same preset', () => {
        const scopes = getDeckOptionsScopes([
            deck(1, 'TUS Kartları'),
            deck(2, 'TUS Kartları::FHE'),
            deck(3, 'TUS Kartları::FHE::Kardiyoloji'),
            deck(4, 'TUS Kartları::Anatomi'),
        ]);

        expect(scopes.map((scope) => ({
            id: scope.deck.id,
            depth: scope.depth,
            label: scope.displayName,
        }))).toEqual([
            { id: 1, depth: 0, label: 'TUS Kartları' },
            { id: 4, depth: 1, label: 'Anatomi' },
            { id: 2, depth: 1, label: 'FHE' },
            { id: 3, depth: 2, label: 'Kardiyoloji' },
        ]);
        expect(scopes[3].pathLabel).toBe('TUS Kartları › FHE › Kardiyoloji');
    });

    it('uses persisted sibling order and excludes filtered decks', () => {
        const scopes = getDeckOptionsScopes([
            deck(1, 'TUS Kartları'),
            deck(2, 'TUS Kartları::İkinci', { sortOrder: 1 }),
            deck(3, 'TUS Kartları::Birinci', { sortOrder: 0 }),
            deck(4, 'Geçici Çalışma', { isFiltered: true }),
        ]);

        expect(scopes.map((scope) => scope.deck.id)).toEqual([1, 3, 2]);
    });
});
