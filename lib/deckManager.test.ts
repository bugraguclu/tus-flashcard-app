import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deck } from './models';

const state = vi.hoisted(() => ({
    decks: [] as { id: number; name: string }[],
    configs: [] as { id: number; data: string }[],
    cards: [] as { id: number; noteId: number; deckId: number }[],
    notes: [] as { id: number }[],
    revlog: [] as number[],
    fts: [] as string[],
    graves: [] as { oid: number; type: number }[],
}));

function unescapePrefix(pattern: string): string {
    return pattern.replace(/%$/, '').replace(/\\(.)/g, '$1');
}

const fakeDb = {
    execSync: () => {},
    getFirstSync(sql: string, ...params: any[]) {
        if (sql.includes('FROM decks WHERE id = ?')) {
            const deck = state.decks.find((d) => d.id === params[0]);
            return deck ? { data: JSON.stringify(deck) } : null;
        }
        if (sql.includes('FROM decks WHERE name = ?')) {
            const deck = state.decks.find((d) => d.name === params[0]);
            return deck ? { data: JSON.stringify(deck) } : null;
        }
        if (sql.includes('FROM deck_configs WHERE id = ?')) {
            return state.configs.find((config) => config.id === params[0]) ?? null;
        }
        if (sql.includes('COUNT(*) AS cnt FROM anki_cards WHERE noteId = ?')) {
            return { cnt: state.cards.filter((c) => c.noteId === params[0]).length };
        }
        return null;
    },
    getAllSync(sql: string, ...params: any[]) {
        if (sql.includes('FROM decks WHERE id = ? OR name LIKE ?')) {
            const prefix = unescapePrefix(String(params[1]));
            return state.decks
                .filter((d) => d.id === params[0] || d.name.startsWith(prefix))
                .map((d) => ({ id: d.id }));
        }
        if (sql.includes('SELECT id, noteId FROM anki_cards WHERE deckId IN')) {
            return state.cards
                .filter((c) => params.includes(c.deckId))
                .map((c) => ({ id: c.id, noteId: c.noteId }));
        }
        return [];
    },
    runSync(sql: string, ...params: any[]) {
        if (sql.startsWith('DELETE FROM revlog')) {
            state.revlog = state.revlog.filter((id) => !params.includes(id));
        } else if (sql.startsWith('DELETE FROM cards_fts')) {
            state.fts = state.fts.filter((id) => !params.includes(id));
        } else if (sql.startsWith('DELETE FROM anki_cards')) {
            state.cards = state.cards.filter((c) => !params.includes(c.id));
        } else if (sql.startsWith('DELETE FROM notes')) {
            state.notes = state.notes.filter((n) => n.id !== params[0]);
        } else if (sql.startsWith('DELETE FROM decks')) {
            state.decks = state.decks.filter((d) => d.id !== params[0]);
        } else if (sql.startsWith('INSERT INTO graves')) {
            const type = Number(sql.match(/VALUES\s*\(\?,\s*(\d+),/)?.[1] ?? -1);
            state.graves.push({ oid: params[0], type });
        } else if (sql.startsWith('INSERT OR REPLACE INTO decks')) {
            // saveDeck: params = [id, name, data, ...]
            state.decks = state.decks.filter((d) => d.id !== params[0]);
            state.decks.push({ id: params[0], name: params[1] });
        } else if (sql.startsWith('INSERT OR REPLACE INTO deck_configs')) {
            state.configs = state.configs.filter((config) => config.id !== params[0]);
            state.configs.push({ id: params[0], data: params[1] });
        }
    },
};

vi.mock('./db', () => ({ getDB: () => fakeDb }));
vi.mock('./noteManager', () => ({ saveAnkiCard: vi.fn() }));

import { createDeck, deleteDeck, renameDeck, renamePreset } from './deckManager';

describe('deckManager', () => {
    beforeEach(() => {
        state.decks = [];
        state.configs = [];
        state.cards = [];
        state.notes = [];
        state.revlog = [];
        state.fts = [];
        state.graves = [];
    });

    it('P1: deleting a deck cascades to subdecks, their cards, and fully-orphaned notes', () => {
        state.decks = [
            { id: 1, name: 'TUS' },
            { id: 2, name: 'TUS::Anatomi' },
            { id: 99, name: 'Other' },
        ];
        // note 100 lives entirely in TUS::Anatomi; note 200 also has a card in "Other".
        state.cards = [
            { id: 10, noteId: 100, deckId: 2 },
            { id: 11, noteId: 100, deckId: 2 },
            { id: 12, noteId: 200, deckId: 2 },
            { id: 13, noteId: 200, deckId: 99 },
        ];
        state.notes = [{ id: 100 }, { id: 200 }];

        deleteDeck(1);

        // Cards in TUS + subdecks gone; the card in "Other" survives.
        expect(state.cards.map((c) => c.id)).toEqual([13]);
        // Note 100 had no cards left -> deleted; note 200 still has card 13 -> kept.
        expect(state.notes.map((n) => n.id)).toEqual([200]);
        // Decks TUS and TUS::Anatomi removed; "Other" remains.
        expect(state.decks.map((d) => d.id)).toEqual([99]);

        // Tombstones: cards (type 0), the orphaned note (type 1), decks (type 2).
        expect(state.graves.filter((g) => g.type === 0).map((g) => g.oid).sort()).toEqual([10, 11, 12]);
        expect(state.graves.filter((g) => g.type === 1).map((g) => g.oid)).toEqual([100]);
        expect(state.graves.filter((g) => g.type === 2).map((g) => g.oid).sort()).toEqual([1, 2]);
    });

    it('P2: createDeck is idempotent on name', () => {
        state.decks = [{ id: 5, name: 'Existing' }];
        const deck = createDeck('Existing');
        expect(deck.id).toBe(5);                 // returns the existing deck
        expect(state.decks).toHaveLength(1);     // no duplicate created
    });

    it('P5: renameDeck refuses to collide with an existing deck', () => {
        state.decks = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
        expect(() => renameDeck(1, 'B')).toThrow(/already exists/);
        // A rename to its own name is a no-op (no throw).
        expect(() => renameDeck(1, 'A')).not.toThrow();
    });

    it('does not replace a preset with a blank name and preserves its config id', () => {
        state.configs = [{ id: 7, data: JSON.stringify({ id: 7, name: 'Preset A' }) }];

        expect(() => renamePreset(7, '  ')).toThrow(/cannot be empty/);
        expect(JSON.parse(state.configs[0].data)).toMatchObject({ id: 7, name: 'Preset A' });

        renamePreset(7, '  Preset B  ');
        expect(JSON.parse(state.configs[0].data)).toMatchObject({ id: 7, name: 'Preset B' });
    });
});
