/**
 * The cards a note type's notes gain when the type changes. Anki creates the cards its notes are
 * now missing whenever a note type is saved with a changed front template or a new card type, and
 * leaves the cards that became empty to Empty Cards
 * (https://docs.ankiweb.net/manual/templates/generation#card-generation-%26-deletion). The details
 * follow Anki 26.09.3 as scripts/anki-oracle/notetype_card_generation.py prints them: only a
 * changed front or a new card type starts it, the card joins its siblings' home deck, shares a
 * new sibling's position or takes a fresh one for its note, a note without cards gets none, and a
 * cloze note gets a card only for a cloze number that has none. One difference is deliberate:
 * when the siblings sit in different decks Anki puts the card in the Default deck, and here it
 * joins the note's first card, so it is found beside the note's other cards.
 */

import { dbUpsertFtsCard, getDB } from './db';
import type { AnkiCard, Note, NoteType } from './models';
import { clozeNumbersForNote, shouldGenerateCard } from './templates';
import { assertCatalogNoteMutable, PaidCatalogProtectionError } from './catalogProtection';
import { createCardForNote, nextNewCardPosition, notePositionForPass, searchIndexCardFromNote } from './noteStore';

/** What makes Anki look for missing cards when a note type is saved: its card types and fronts. */
function generationInputs(noteType: NoteType): string {
    return JSON.stringify([
        noteType.kind,
        noteType.templates.map((template) => [template.ord, template.qfmt]),
    ]);
}

/**
 * Whether saving the type gives its notes the cards they are missing, as Anki 26.09.3 does: a
 * front changed or a card type was added, a field rename or removal that rewrote a front
 * included. A name, a field added or moved, a field no front uses, a back template, the styling
 * and a card type's name never do (scripts/anki-oracle/notetype_card_generation.py, part 7), so a
 * card missing for another reason is not brought back by them.
 */
export function changesCardGeneration(before: NoteType, after: NoteType): boolean {
    return generationInputs(before) !== generationInputs(after);
}

interface SiblingRow { noteId: number; ord: number; data: string }

/**
 * The cards of every note of the type that has one, each note's in ordinal order. The unary plus
 * keeps SQLite on the note type index: every note has tombstone 0, and its index, chosen instead
 * (as it is without ANALYZE statistics), walks the whole collection.
 */
function siblingRowsByNote(noteTypeId: number): Map<number, SiblingRow[]> {
    const rows = getDB().getAllSync<SiblingRow>(
        `SELECT c.noteId AS noteId, c.ord AS ord, c.data AS data
         FROM notes n
         JOIN anki_cards c ON c.noteId = n.id
         WHERE n.noteTypeId = ? AND +n.tombstone = 0
         ORDER BY c.noteId, c.ord, c.id`,
        noteTypeId,
    );
    const byNote = new Map<number, SiblingRow[]>();
    for (const row of rows) {
        const siblings = byNote.get(row.noteId);
        if (siblings) siblings.push(row);
        else byNote.set(row.noteId, [row]);
    }
    return byNote;
}

/** A standard note with a card for every card type lacks none, whatever its fields hold. */
function mayLackCard(noteType: NoteType, siblings: readonly SiblingRow[]): boolean {
    if (noteType.kind === 'cloze') return true;
    const ords = new Set(siblings.map((row) => Number(row.ord)));
    return noteType.templates.some((template) => !ords.has(template.ord));
}

const NOTE_BATCH = 500;

/** The stored notes, read a batch at a time so a large type is never in memory at once. */
function* noteRows(noteIds: readonly number[]): Generator<{ id: number; data: string }> {
    const db = getDB();
    for (let start = 0; start < noteIds.length; start += NOTE_BATCH) {
        yield* db.getAllSync<{ id: number; data: string }>(
            'SELECT id, data FROM notes WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id',
            JSON.stringify(noteIds.slice(start, start + NOTE_BATCH)),
        );
    }
}

/** A note and its cards as stored, or null when either cannot be read: such a note is left alone. */
function readNoteWithCards(noteData: string, siblings: readonly SiblingRow[]): { note: Note; cards: AnkiCard[] } | null {
    try {
        const note = JSON.parse(noteData) as Note;
        if (!Array.isArray(note?.fields) || !Array.isArray(note.tags)) return null;
        return { note, cards: siblings.map((row) => JSON.parse(row.data) as AnkiCard) };
    } catch {
        return null;
    }
}

/** The ordinals the note should have a card for and has none. */
function missingOrds(noteType: NoteType, note: Note, cards: readonly AnkiCard[]): number[] {
    const existing = new Set(cards.map((card) => card.ord));
    const wanted = noteType.kind === 'cloze'
        ? clozeNumbersForNote(noteType, note).map((number) => number - 1)
        : noteType.templates.map((template) => template.ord);
    return wanted.filter((ord) => !existing.has(ord)
        && (noteType.kind === 'cloze' || shouldGenerateCard(noteType, note, ord)));
}

/** A note of the catalog that is not bought is not the learner's to change: it keeps its cards. */
function isLockedByCatalog(note: Note): boolean {
    try {
        assertCatalogNoteMutable(note);
        return false;
    } catch (error) {
        if (error instanceof PaidCatalogProtectionError) return true;
        throw error;
    }
}

/**
 * Create the cards the notes of `noteType` are missing, in one transaction, and return how many.
 * Call it after the note type is saved. No card is removed, moved or rescheduled: a card that
 * became empty stays for Empty Cards. A new card goes to the home deck of the note's first card
 * (Anki uses the siblings' deck when they share one, and the Default deck when they do not), as
 * a new card on a new sibling's position, or on one fresh position for its note. A note without any card, a note the catalog locks and a
 * note whose stored data cannot be read are left as they are.
 */
export function generateMissingCardsForNoteType(noteType: NoteType): number {
    const siblingsByNote = siblingRowsByNote(noteType.id);
    const candidates = [...siblingsByNote.keys()].filter((noteId) => mayLackCard(noteType, siblingsByNote.get(noteId)!));
    if (candidates.length === 0) return 0;

    // Fresh positions are counted from the table's highest once: asking it again for every note
    // would read every new card each time.
    let nextFresh: number | undefined;
    const freshPosition = () => {
        nextFresh ??= nextNewCardPosition();
        return nextFresh++;
    };

    const db = getDB();
    let created = 0;
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const row of noteRows(candidates)) {
            const stored = readNoteWithCards(row.data, siblingsByNote.get(Number(row.id)) ?? []);
            if (!stored || stored.cards.length === 0) continue;
            const { note, cards } = stored;
            const missing = missingOrds(noteType, note, cards);
            if (missing.length === 0 || isLockedByCatalog(note)) continue;

            const homeDeckId = cards[0].odid || cards[0].deckId;
            const position = notePositionForPass(cards, freshPosition);
            for (const ord of missing) {
                const card = createCardForNote(note, homeDeckId, ord, position());
                dbUpsertFtsCard(searchIndexCardFromNote(note, card.id));
                created += 1;
            }
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
    return created;
}
