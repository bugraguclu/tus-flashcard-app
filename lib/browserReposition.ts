/**
 * The browser's Reposition, as Anki's `sort_cards` behaves (rslib scheduler/new.rs, behaviour
 * only; https://docs.ankiweb.net/browsing.html#cards):
 *
 * - only new cards move; siblings of one note share one position;
 * - notes keep the order they were selected in, or a random one with "Randomize order";
 * - note i gets `start + i × step`;
 * - "Shift position of existing cards" first moves every other new card at or after `start` on
 *   by `step × the number of selected cards` (Anki counts cards, not notes);
 * - all of it is one transaction, and the last reposition can be undone.
 */
import type { AnkiCard } from './models';
import { getDB } from './db';
import { getAllAnkiCards, getAnkiCard, saveAnkiCard } from './noteManager';

export interface RepositionOptions {
    randomize?: boolean;
    random?: () => number;
}

interface PositionSnapshot { id: number; due: number; mod: number; usn: number }

let lastReposition: PositionSnapshot[] = [];

function inTransaction<T>(work: () => T): T {
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        const result = work();
        db.execSync('COMMIT;');
        return result;
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

export function repositionSelectedNewCards(
    cardIds: number[],
    start: number,
    step: number,
    shiftExisting: boolean,
    options: RepositionOptions = {},
): number {
    const normalizedStart = Math.max(1, Math.floor(start) || 1);
    const normalizedStep = Math.max(1, Math.floor(step) || 1);
    const selected = [...new Set(cardIds)]
        .map((cardId) => getAnkiCard(cardId))
        .filter((card): card is AnkiCard => card !== null);
    const cards = selected.filter((card) => card.type === 0);
    if (cards.length === 0) return 0;
    const selectedIds = new Set(cards.map((card) => card.id));

    const noteOrder: number[] = [];
    for (const card of cards) if (!noteOrder.includes(card.noteId)) noteOrder.push(card.noteId);
    if (options.randomize) {
        const random = options.random ?? Math.random;
        for (let index = noteOrder.length - 1; index > 0; index--) {
            const swap = Math.floor(random() * (index + 1));
            [noteOrder[index], noteOrder[swap]] = [noteOrder[swap], noteOrder[index]];
        }
    }
    const notePositions = new Map(noteOrder.map((noteId, index) => [noteId, normalizedStart + index * normalizedStep]));
    const mod = Math.floor(Date.now() / 1000);

    const snapshot: PositionSnapshot[] = [];
    inTransaction(() => {
        if (shiftExisting) {
            const shift = selected.length * normalizedStep;
            const displaced = getAllAnkiCards()
                .filter((card) => card.type === 0 && !selectedIds.has(card.id) && card.due >= normalizedStart)
                .sort((a, b) => b.due - a.due || b.id - a.id);
            for (const card of displaced) {
                snapshot.push({ id: card.id, due: card.due, mod: card.mod, usn: card.usn });
                saveAnkiCard({ ...card, due: card.due + shift, mod, usn: -1 });
            }
        }
        for (const card of cards) {
            snapshot.push({ id: card.id, due: card.due, mod: card.mod, usn: card.usn });
            saveAnkiCard({ ...card, due: notePositions.get(card.noteId)!, mod, usn: -1 });
        }
    });
    lastReposition = snapshot;
    return cards.length;
}

export function canUndoLastReposition(): boolean {
    return lastReposition.length > 0;
}

/**
 * Put back the positions the last reposition replaced, for cards that are still new; one that
 * has been studied since keeps its new state. Returns how many cards moved back.
 */
export function undoLastReposition(): number {
    const snapshot = lastReposition;
    if (snapshot.length === 0) return 0;
    let restored = 0;
    inTransaction(() => {
        for (const entry of snapshot) {
            const card = getAnkiCard(entry.id);
            if (!card || card.type !== 0) continue;
            saveAnkiCard({ ...card, due: entry.due, mod: entry.mod, usn: entry.usn });
            restored++;
        }
    });
    lastReposition = [];
    return restored;
}
