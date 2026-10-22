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

/**
 * Convert notes to another note type while preserving the scheduling of every card that can be
 * mapped to a target template. Fields with the same name are mapped first; remaining fields fall
 * back to their ordinal. Existing cards are reused in order, surplus cards are removed, and only
 * genuinely new target cards start with new scheduling.
 */
export function changeNotesType(noteIds: number[], targetNoteTypeId: number, options: { allowCardDeletion?: boolean } = {}): number {
    const targetType = getNoteType(targetNoteTypeId);
    if (!targetType) return 0;

    const uniqueNoteIds = [...new Set(noteIds)];
    for (const noteId of uniqueNoteIds) {
        assertCatalogNoteTypeNotChangeable(noteId);
    }

    const db = getDB();
    let changed = 0;

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const noteId of uniqueNoteIds) {
            const note = getNote(noteId);
            const sourceType = note ? getNoteType(note.noteTypeId) : null;
            if (!note || !sourceType || note.noteTypeId === targetNoteTypeId) continue;

            const fields = mapNoteTypeFields(sourceType, targetType, note.fields);
            const existingCards = getCardsForNote(note.id).sort((a, b) => a.ord - b.ord || a.id - b.id);
            const mapped = existingCards.map(card => ({ card, ord: mapNoteTypeCardOrd(sourceType, targetType, card.ord) }));
            const removed = mapped.filter(entry => entry.ord === null);
            if (removed.length && !options.allowCardDeletion) throw new NoteTypeChangeConfirmationRequired(removed.length);

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
                    db.runSync('DELETE FROM cards_fts WHERE card_id = ?', String(card.id));
                    db.runSync('DELETE FROM anki_cards WHERE id = ?', card.id);
                    db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 0, -1)', card.id);
                } else {
                    keptOrds.add(ord);
                    saveAnkiCard({ ...card, ord, mod: Math.floor(Date.now() / 1000), usn: -1 });
                }
            }
            if (!requiredOrds.length && !keptOrds.size) requiredOrds.push(0);
            for (const ord of requiredOrds) if (!keptOrds.has(ord)) createCardForNote(note, destinationDeckId, ord);

            for (const card of getCardsForNote(note.id)) {
                dbUpsertFtsCard(searchIndexCardFromNote(note, card.id));
            }
            changed += 1;
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return changed;
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
