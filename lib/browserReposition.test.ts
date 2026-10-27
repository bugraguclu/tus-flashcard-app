// Reposition, independently implemented from Anki's behaviour (https://docs.ankiweb.net/browsing.html).
import { beforeEach, expect, it, vi } from 'vitest';
import type { AnkiCard } from './models';
const h = vi.hoisted(() => ({ cards: new Map<number, AnkiCard>(), sql: [] as string[], failOn: 0 }));
vi.mock('./db', () => ({ getDB: () => ({ execSync: (sql: string) => { h.sql.push(sql.trim()); } }) }));
vi.mock('./noteManager', () => ({
    getAllAnkiCards: () => [...h.cards.values()],
    getAnkiCard: (id: number) => h.cards.get(id) ?? null,
    saveAnkiCard: (card: AnkiCard) => { if (card.id === h.failOn) throw new Error('disk full'); h.cards.set(card.id, { ...card }); },
}));
import { canUndoLastReposition, getNewQueuePositionRange, repositionSelectedNewCards, undoLastReposition } from './browserReposition';

const card = (id: number, overrides: Partial<AnkiCard> = {}): AnkiCard => ({
    id, noteId: id, deckId: 1, ord: 0, mod: 0, usn: 0, type: 0, queue: 0, due: id, ivl: 0, factor: 0,
    reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0, ...overrides,
} as AnkiCard);
beforeEach(() => { h.cards.clear(); h.sql = []; h.failOn = 0; });
const dues = () => [...h.cards.values()].map((entry) => entry.due);

it('gives two notes of two cards each positions 1, 1, 2, 2', () => {
    for (const [id, noteId] of [[1, 10], [2, 10], [3, 20], [4, 20]]) h.cards.set(id, card(id, { noteId, due: 50 + id }));
    expect(repositionSelectedNewCards([1, 2, 3, 4], 1, 1, false)).toBe(4);
    expect(dues()).toEqual([1, 1, 2, 2]);
    expect(h.sql).toEqual(['BEGIN TRANSACTION;', 'COMMIT;']);
});

it('randomizes the note order when asked', () => {
    for (const id of [1, 2, 3]) h.cards.set(id, card(id, { due: 10 + id }));
    repositionSelectedNewCards([1, 2, 3], 1, 1, false, { randomize: true, random: () => 0 });
    expect(dues()).toEqual([3, 1, 2]);
});

it('counts every selected card in the shift, and undoes the whole operation', () => {
    h.cards.set(1, card(1, { due: 1 })); h.cards.set(2, card(2, { due: 2 }));
    h.cards.set(3, card(3, { type: 2, queue: 2, due: 99 })); h.cards.set(4, card(4, { due: 4 }));
    // Card 3 is not new: it is not moved, but it still counts toward the shift.
    repositionSelectedNewCards([1, 3], 2, 1, true);
    expect(dues()).toEqual([2, 4, 99, 6]);
    expect(canUndoLastReposition()).toBe(true);
    expect(undoLastReposition()).toBe(3);
    expect(dues()).toEqual([1, 2, 99, 4]);
    expect(canUndoLastReposition()).toBe(false);
});

it('rolls back when a write fails', () => {
    h.cards.set(1, card(1)); h.cards.set(2, card(2));
    h.failOn = 2;
    expect(() => repositionSelectedNewCards([1, 2], 5, 1, false)).toThrow('disk full');
    expect(h.sql).toEqual(['BEGIN TRANSACTION;', 'ROLLBACK;']);
});

it('accepts Anki\'s start of 0 and caps start and step at the dialog bounds', () => {
    h.cards.set(1, card(1, { noteId: 1, due: 9 })); h.cards.set(2, card(2, { noteId: 2, due: 9 }));
    repositionSelectedNewCards([1, 2], 0, 1, false);
    expect(dues()).toEqual([0, 1]);
    repositionSelectedNewCards([1, 2], 5_000_000, 50_000, false);
    expect(dues()).toEqual([1_000_000, 1_010_000]);
});

it('moves a filtered card\'s home position and leaves its filtered-deck due alone', () => {
    h.cards.set(1, card(1, { odid: 7, odue: 40, due: -100_000 }));
    repositionSelectedNewCards([1], 3, 1, false);
    expect(h.cards.get(1)).toMatchObject({ due: -100_000, odue: 3 });
    undoLastReposition();
    expect(h.cards.get(1)).toMatchObject({ due: -100_000, odue: 40 });
});

it('reports the new queue\'s top and bottom without filtered cards', () => {
    h.cards.set(1, card(1, { due: 4 })); h.cards.set(2, card(2, { due: 12 }));
    h.cards.set(3, card(3, { odid: 7, due: -5 })); h.cards.set(4, card(4, { type: 2, queue: 2, due: 900 }));
    expect(getNewQueuePositionRange()).toEqual({ top: 4, bottom: 12 });
});
