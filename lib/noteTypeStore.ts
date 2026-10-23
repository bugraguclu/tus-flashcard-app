import { captureDeletion, deleteCardRows, type DeletionUndo } from './noteDeletion';
import { mapNoteTypeFields, mapNoteTypeCardOrd, NoteTypeChangeConfirmationRequired } from './noteTypeChange';
import {
    checksumField,
    BUILTIN_NOTE_TYPES,
    subjectToDeckId,
    type Note,
    type NoteType,
    type AnkiCard,
} from './models';
import { clozeNumbersForNote, shouldGenerateCard } from './templates';
import { dbUpsertFtsCard, getDB } from './db';
import { resolveSubjectDeckId } from './subjects';
import { markSourcePackageDirty } from './ankiPackageArchive';
import {
    assertCatalogNoteNotDuplicable,
    assertCatalogNoteTypeNotChangeable,
    assertCatalogNoteTypeMutable,
} from './catalogProtection';
import {
    createCardForNote,
    createNote,
    getCardsForNote,
    getNote,
    saveAnkiCard,
    saveNote,
    searchIndexCardFromNote,
} from './noteStore';

/**
 * Note types, and the note operations that read their templates: changing a note's type,
 * Anki's Empty Cards check, and duplicating a note.
 */

export function getAllNoteTypes(): NoteType[] {
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>('SELECT data FROM note_types ORDER BY id');

    // Merge built-ins with stored types so the built-ins never disappear once a custom type is
    // added; a stored row overrides the built-in of the same id (consistent with getNoteType).
    const byId = new Map<number, NoteType>();
    for (const nt of BUILTIN_NOTE_TYPES) byId.set(nt.id, nt);
    for (const row of rows) {
        const nt = JSON.parse(row.data) as NoteType;
        byId.set(nt.id, nt);
    }
    return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function getNoteType(id: number): NoteType | null {
    // Prefer the stored row so edits to a built-in note type take effect; the hardcoded
    // definition is only a fallback for the initial state before anything is seeded.
    const db = getDB();
    const row = db.getFirstSync<{ data: string }>('SELECT data FROM note_types WHERE id = ?', id);
    if (row) return JSON.parse(row.data);

    return BUILTIN_NOTE_TYPES.find(nt => nt.id === id) ?? null;
}

export function saveNoteType(nt: NoteType): void {
    assertCatalogNoteTypeMutable(nt);
    const db = getDB();
    const existing = db.getFirstSync<{ data: string }>('SELECT data FROM note_types WHERE id = ?', nt.id);
    if (existing?.data) {
        try {
            markSourcePackageDirty((JSON.parse(existing.data) as NoteType).sourcePackageId);
        } catch { /* malformed legacy blobs are replaced below */ }
    }
    db.runSync(
        `INSERT OR REPLACE INTO note_types (id, name, data, updated_at, usn, tombstone)
         VALUES (?, ?, ?, ?, ?, ?)`,
        nt.id,
        nt.name,
        JSON.stringify(nt),
        Date.now(),
        -1,
        0,
    );
}

/** Read-only preflight for the browser's destructive confirmation. */
export function getNoteTypeChangeDeletionCount(noteIds: number[], targetNoteTypeId: number): number {
    const target = getNoteType(targetNoteTypeId);
    if (!target) return 0;
    let count = 0;
    for (const id of new Set(noteIds)) {
        const note = getNote(id);
        if (!note || note.noteTypeId === targetNoteTypeId) continue;
        const source = getNoteType(note.noteTypeId);
        if (!source) continue;
        count += getCardsForNote(id).filter(card => mapNoteTypeCardOrd(source, target, card.ord) === null).length;
    }
    return count;
}

/**
 * Convert notes to another note type while preserving the scheduling of every card that can be
 * mapped to a target template. Fields and standard templates map by name first, then each
 * still-unused source slot by position (Anki's default mapping); converting into a cloze type
 * keeps every card, cloze → standard keeps the ordinals the target has templates for. Only
 * explicitly confirmed unmapped cards are removed, with their review history retained.
 */
export function changeNotesType(noteIds: number[], targetNoteTypeId: number, options: { allowCardDeletion?: boolean } = {}): number {
    return changeNotesTypeUndoable(noteIds, targetNoteTypeId, options).changed;
}

export interface NoteTypeChangeResult extends DeletionUndo {
    /** Notes converted. `cardCount` is the number of cards removed. */
    changed: number;
}

/** As changeNotesType, plus a one-shot undo that restores the notes and cards as they were. */
export function changeNotesTypeUndoable(noteIds: number[], targetNoteTypeId: number, options: { allowCardDeletion?: boolean } = {}): NoteTypeChangeResult {
    const targetType = getNoteType(targetNoteTypeId);
    if (!targetType) return { changed: 0, cardCount: 0, undo() {} };

    const uniqueNoteIds = [...new Set(noteIds)];
    for (const noteId of uniqueNoteIds) {
        assertCatalogNoteTypeNotChangeable(noteId);
    }

    const cardsToDelete = getNoteTypeChangeDeletionCount(uniqueNoteIds, targetNoteTypeId);
    if (cardsToDelete && !options.allowCardDeletion) throw new NoteTypeChangeConfirmationRequired(cardsToDelete);
    const db = getDB();
    let changed = 0;
    let removed = 0;
    const createdCardIds: number[] = [];
    const existingCardIds = uniqueNoteIds.flatMap((noteId) => getCardsForNote(noteId).map((card) => card.id));
    const finishCapture = captureDeletion({ noteIds: uniqueNoteIds, cardIds: existingCardIds });

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const noteId of uniqueNoteIds) {
            const note = getNote(noteId);
            const sourceType = note ? getNoteType(note.noteTypeId) : null;
            if (!note || !sourceType || note.noteTypeId === targetNoteTypeId) continue;

            const fields = mapNoteTypeFields(sourceType, targetType, note.fields);
            const existingCards = getCardsForNote(note.id).sort((a, b) => a.ord - b.ord || a.id - b.id);
            const mapped = existingCards.map(card => ({ card, ord: mapNoteTypeCardOrd(sourceType, targetType, card.ord) }));

            note.noteTypeId = targetType.id;
            note.fields = fields;
            note.sfld = fields[targetType.sortFieldIdx] || fields[0] || '';
            note.csum = checksumField(fields[0] ?? '');
            note.mod = Math.floor(Date.now() / 1000);
            note.usn = -1;
            saveNote(note);

            const requiredOrds = targetType.kind === 'cloze'
                ? clozeNumbersForNote(targetType, note).map((number) => number - 1)
                : targetType.templates
                    .filter((template) => shouldGenerateCard(targetType, note, template.ord))
                    .map((template) => template.ord);
            const destinationDeckId = existingCards[0]?.deckId ?? resolveSubjectDeckId('custom');

            const keptOrds = new Set<number>();
            for (const { card, ord } of mapped) {
                if (ord === null) {
                    removed += deleteCardRows([card.id]);
                } else {
                    keptOrds.add(ord);
                    saveAnkiCard({ ...card, ord, mod: Math.floor(Date.now() / 1000), usn: -1 });
                }
            }
            if (!requiredOrds.length && !keptOrds.size) requiredOrds.push(0);
            for (const ord of requiredOrds) {
                if (!keptOrds.has(ord)) createdCardIds.push(createCardForNote(note, destinationDeckId, ord).id);
            }

            for (const card of getCardsForNote(note.id)) {
                dbUpsertFtsCard(searchIndexCardFromNote(note, card.id));
            }
            changed += 1;
        }
        const undo = finishCapture(createdCardIds);
        db.execSync('COMMIT;');
        return { changed, cardCount: removed, undo: () => undo.undo() };
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

export interface EmptyCardEntry {
    cardId: number;
    noteId: number;
    /** First field, for display — same convention as the search index. */
    question: string;
    reason: string;
}

/**
 * Cards whose generation condition no longer holds: a cloze ordinal missing from its field,
 * a template the note type no longer defines, or (for standard note types) a blank first field.
 * Mirrors Anki's "Find Empty Cards" tool — these are safe to delete without touching the note
 * itself or its other, still-valid, sibling cards.
 */
export function findEmptyCards(): EmptyCardEntry[] {
    const db = getDB();
    const rows = db.getAllSync<{ cardId: number; ord: number; noteData: string }>(
        `SELECT c.id AS cardId, c.ord AS ord, n.data AS noteData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId`,
    );

    const noteTypeCache = new Map<number, NoteType | null>();
    const results: EmptyCardEntry[] = [];

    for (const row of rows) {
        let note: Note;
        try {
            note = JSON.parse(row.noteData);
        } catch {
            continue;
        }

        let noteType = noteTypeCache.get(note.noteTypeId);
        if (noteType === undefined) {
            noteType = getNoteType(note.noteTypeId);
            noteTypeCache.set(note.noteTypeId, noteType);
        }
        if (!noteType) continue; // orphaned note type is a different problem; leave its cards alone

        const question = note.fields[0] || note.sfld || '';

        if (noteType.kind === 'cloze') {
            if (!clozeNumbersForNote(noteType, note).includes(row.ord + 1)) {
                results.push({ cardId: row.cardId, noteId: note.id, question, reason: 'Kapama numarası artık metinde yok' });
            }
            continue;
        }

        const template = noteType.templates[row.ord];
        if (!template) {
            results.push({ cardId: row.cardId, noteId: note.id, question, reason: 'Şablon artık mevcut değil' });
            continue;
        }
        if (!shouldGenerateCard(noteType, note, row.ord)) {
            results.push({ cardId: row.cardId, noteId: note.id, question, reason: 'Gerekli alan boş' });
        }
    }

    return results;
}

/** Duplicates a note (fields + tags) into a fresh note, generating cards in the same deck. */
export function duplicateNote(noteId: number): { note: Note; cards: AnkiCard[] } | null {
    assertCatalogNoteNotDuplicable(noteId);
    const note = getNote(noteId);
    if (!note) return null;

    const noteType = getNoteType(note.noteTypeId);
    if (!noteType) return null;

    const existingCards = getCardsForNote(noteId);
    const deckId = existingCards[0]?.deckId ?? subjectToDeckId('anatomy');

    return createNote(noteType, [...note.fields], deckId, [...note.tags]);
}
