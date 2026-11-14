import { getDB } from './db';
import { deleteCardRows } from './noteDeletion';
import { assertCatalogCardMutable, isCatalogNote } from './catalogProtection';

/**
 * Deleting cards without their notes, for Empty Cards: which cards go, which stay so a note keeps
 * a card (Keep Notes, or a catalog note), and which notes go with their last card. Split out of
 * noteStore.ts, which re-exports it; it reads the card rows itself so it never imports noteStore.
 */

/**
 * Deletes a single card without touching its note or any sibling cards — unlike
 * deleteTusCardByCardId, which deletes the whole note. For orphaned cards found by
 * findEmptyCards(), where the note (and its other cards) may still be perfectly valid.
 */
export function deleteAnkiCardOnly(cardId: number, options?: { preserveNotes?: boolean }): CardOnlyDeletion {
    return deleteAnkiCardsOnly([cardId], options);
}

export interface CardOnlyDeletion {
    /** Cards removed, by id. */
    deleted: number[];
    /** Selected cards left in place: with Keep Notes, the first card of a note whose cards were all selected. */
    kept: number[];
    /**
     * Notes removed with their last card. With Keep Notes off, a note whose cards are all selected
     * goes too, as Anki's Empty Cards removes the notes it leaves without cards
     * (`remove_cards_and_orphaned_notes`); a note left with no card would only come back as
     * "Kartsız not" in Check Database. A catalog note is never removed: it keeps its first card,
     * as with Keep Notes.
     */
    deletedNotes: number[];
}

/**
 * What `deleteAnkiCardsOnly` does with these cards, without doing it. A card that no longer
 * exists is in neither list. Empty Cards marks the kept rows with it.
 */
export function planCardOnlyDeletion(cardIds: readonly number[], options: { preserveNotes?: boolean } = {}): CardOnlyDeletion {
    const unique = [...new Set(cardIds)];
    if (unique.length === 0) return { deleted: [], kept: [], deletedNotes: [] };
    const existing = getDB().getAllSync<{ id: number }>(
        'SELECT id FROM anki_cards WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id', JSON.stringify(unique),
    ).map((row) => Number(row.id));
    const selected = new Set(existing);
    const kept: number[] = [];
    const deletedNotes: number[] = [];
    const keepNotes = options.preserveNotes !== false;
    const noteIds = new Set(getDB().getAllSync<{ noteId: number }>(
        'SELECT DISTINCT noteId FROM anki_cards WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(existing),
    ).map((row) => Number(row.noteId)));
    for (const noteId of noteIds) {
        const siblings = getDB().getAllSync<{ id: number; ord: number }>(
            'SELECT id, ord FROM anki_cards WHERE noteId = ? ORDER BY ord, id', noteId,
        ).map((row) => ({ id: Number(row.id), ord: Number(row.ord) }));
        if (!siblings.length || !siblings.every(c => selected.has(c.id))) continue;
        if (keepNotes || isCatalogNote(noteId)) {
            selected.delete(siblings[0].id);
            kept.push(siblings[0].id);
        } else {
            deletedNotes.push(noteId);
        }
    }
    return { deleted: [...selected], kept, deletedNotes: deletedNotes.sort((a, b) => a - b) };
}

/**
 * Delete empty cards as one transaction so a failed bulk operation cannot partially apply. With
 * Keep Notes off, the notes left without a card are deleted in it too, with their graves.
 */
export function deleteAnkiCardsOnly(cardIds: number[], options: { preserveNotes?: boolean } = {}): CardOnlyDeletion {
    if (cardIds.length === 0) return { deleted: [], kept: [], deletedNotes: [] };
    // Editing cloze fields can remove a generated sibling after the catalog is unlocked.
    for (const cardId of cardIds) assertCatalogCardMutable(cardId);
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        const outcome = planCardOnlyDeletion(cardIds, options);
        deleteCardRows(outcome.deleted);
        if (outcome.deletedNotes.length > 0) {
            const noteIds = JSON.stringify(outcome.deletedNotes);
            db.runSync('DELETE FROM notes WHERE id IN (SELECT value FROM json_each(?))', noteIds);
            db.runSync('INSERT INTO graves (oid, type, usn) SELECT value, 1, -1 FROM json_each(?)', noteIds);
        }
        db.execSync('COMMIT;');
        return outcome;
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}
