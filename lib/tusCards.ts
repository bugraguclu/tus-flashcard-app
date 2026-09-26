import {
    generateGuid,
    checksumField,
    BUILTIN_NOTE_TYPES,
    subjectToDeckId,
    type Note,
    type AnkiCard,
} from './models';
import { clozeFieldIndex, extractClozeNumbers, shouldGenerateCard } from './templates';
import { getDB } from './db';
import { TUS_CARDS } from './data';
import { resolveSubjectDeckId } from './subjects';
import { isCatalogCard, isCatalogNote, PaidCatalogProtectionError } from './catalogProtection';
import { getNoteType } from './noteTypeStore';
import {
    createCardForNote,
    createNote,
    deleteAnkiCardOnly,
    deleteNote,
    getAnkiCard,
    getCardsForNote,
    getNote,
    saveAnkiCard,
    saveNote,
} from './noteStore';

/**
 * TUS-card shaped note writes: the note editor's create, update and delete path, the first-field
 * lookup the legacy importer dedupes by, and the one-time migration of the bundled TUS cards.
 */

/** Converts the original bundled TUS cards into notes. */
export function migrateTusCardsToNotes(): { notesCreated: number; cardsCreated: number } {
    const db = getDB();

    // Check if already migrated
    const existingCount = db.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM notes');
    if (existingCount && existingCount.cnt > 0) {
        return { notesCreated: 0, cardsCreated: 0 };
    }

    let notesCreated = 0;
    let cardsCreated = 0;

    // Legacy bundled questions now enter the collection as Anki's stock Basic type.
    const basicNoteType = getNoteType(1) ?? BUILTIN_NOTE_TYPES.find(nt => nt.id === 1)!;

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const oldCard of TUS_CARDS) {
            const deckId = subjectToDeckId(oldCard.subject);
            const fields = [oldCard.question, oldCard.answer];
            const sfld = fields[0];

            const note: Note = {
                id: oldCard.id * 1000, // avoid collisions
                guid: generateGuid(),
                noteTypeId: basicNoteType.id,
                mod: Math.floor(Date.now() / 1000),
                usn: -1,
                tags: [oldCard.subject, oldCard.topic.replace(/\s+/g, '-')],
                fields,
                sfld,
                csum: checksumField(sfld),
                flags: 0,
            };

            saveNote(note);
            notesCreated++;

            // Create one card per template
            for (let ord = 0; ord < basicNoteType.templates.length; ord++) {
                const ankiCard: AnkiCard = {
                    id: note.id + ord,
                    noteId: note.id,
                    deckId,
                    ord,
                    mod: note.mod,
                    usn: -1,
                    type: 0,
                    queue: 0,
                    due: oldCard.id, // position
                    ivl: 0,
                    factor: 0,       // new cards have no ease until they graduate
                    reps: 0,
                    lapses: 0,
                    left: 0,
                    odue: 0,
                    odid: 0,
                    flags: 0,
                    lastReview: 0,
                };
                saveAnkiCard(ankiCard);
                cardsCreated++;
            }
        }
        db.execSync('COMMIT;');
    } catch (e) {
        db.execSync('ROLLBACK;');
        throw e;
    }

    return { notesCreated, cardsCreated };
}

/**
 * Find an existing bundled/basic card by its question (first field), matching how Anki dedupes text imports
 * (first field within a note type). Returns the primary card id of the first match, or null.
 * The `csum` filter narrows candidates in SQL; the exact trimmed compare then rejects hash
 * collisions, exactly like `firstFieldExists` in the import path.
 */
export function findTusCardIdByFirstField(question: string): number | null {
    const db = getDB();
    const target = question.trim();
    const rows = db.getAllSync<{ cardId: number; noteData: string }>(
        `SELECT c.id AS cardId, n.data AS noteData
         FROM notes n
         JOIN anki_cards c ON c.noteId = n.id
         WHERE n.csum = ? AND n.noteTypeId IN (1, 4)
         ORDER BY c.ord`,
        checksumField(question),
    );

    for (const row of rows) {
        try {
            const field0 = (JSON.parse(row.noteData) as { fields?: string[] }).fields?.[0];
            if (typeof field0 === 'string' && field0.trim() === target) {
                return row.cardId;
            }
        } catch {
            // Skip a note row whose data blob will not parse.
        }
    }

    return null;
}

export function createTusCard(input: {
    /** Legacy grouping metadata. New Anki-style editor cards use deckId instead. */
    subject?: string;
    topic?: string;
    tags?: string[];
    question: string;
    answer: string;
    /** Explicit target deck (Anki's add-dialog deck picker); legacy calls may omit it. */
    deckId?: number;
    /** Anki stock note type id. Defaults to Basic (1). */
    noteTypeId?: number;
    /** Value for Anki's Add Reverse field (type 7); legacy type 6 keeps its old override. */
    reverseAnswer?: string;
    /** Complete field list supplied by an external add-note integration or dynamic editor. */
    fieldValues?: string[];
}): { note: Note; card: AnkiCard; cards: AnkiCard[] } {
    const noteTypeId = input.noteTypeId ?? 1;
    const noteType = getNoteType(noteTypeId) ?? BUILTIN_NOTE_TYPES.find((entry) => entry.id === noteTypeId);
    if (!noteType) throw new Error(`Unknown note type: ${noteTypeId}`);
    const topic = input.topic?.trim() ?? '';
    const deckId = input.deckId ?? (input.subject ? resolveSubjectDeckId(input.subject) : 1);
    const tags = input.tags ?? [
        input.subject,
        topic ? topic.replace(/\s+/g, '-') : undefined,
    ].filter((tag): tag is string => Boolean(tag));

    const fields = noteType.fields.map((_, index) => input.fieldValues?.[index] ?? '');
    if (Array.isArray(input.fieldValues) && input.fieldValues.length > 0) {
        input.fieldValues.forEach((val, index) => {
            if (index < fields.length) fields[index] = val;
        });
    } else {
        fields[0] = input.question;
        if (fields.length > 1) fields[1] = input.answer;
        if (noteTypeId === 7 && fields.length > 2) fields[2] = (input.reverseAnswer ?? '').trim();
        if ([4, 5, 6].includes(noteTypeId) && fields.length > 2) fields[2] = topic;
        if (noteTypeId === 6 && fields.length > 3) fields[3] = (input.reverseAnswer ?? '').trim();
    }

    const { note, cards } = createNote(noteType, fields, deckId, tags);

    return { note, card: cards[0], cards };
}

export function updateTusCardByCardId(
    cardId: number,
    input: {
        subject?: string;
        topic?: string;
        tags?: string[];
        question: string;
        answer: string;
        reverseAnswer?: string;
        deckId?: number;
        fieldValues?: string[];
    },
): { note: Note; card: AnkiCard } | null {
    const card = getAnkiCard(cardId);
    if (!card) return null;

    const note = getNote(card.noteId);
    if (!note) return null;

    if (isCatalogCard(card) || isCatalogNote(note)) {
        if (input.deckId !== undefined && input.deckId !== card.deckId) {
            throw new PaidCatalogProtectionError('Ücretli katalog kartları başka bir desteye taşınamaz.');
        }
        if (input.subject !== undefined && resolveSubjectDeckId(input.subject) !== card.deckId) {
            throw new PaidCatalogProtectionError('Ücretli katalog kartları başka bir desteye taşınamaz.');
        }
    }

    const noteType = getNoteType(note.noteTypeId);
    const fieldCount = Math.max(
        noteType?.fields.length ?? 2,
        note.fields.length,
        input.fieldValues?.length ?? 0,
        2,
    );
    const fields = [...note.fields];
    fields.length = fieldCount;
    for (let i = 0; i < fieldCount; i++) fields[i] = fields[i] ?? '';

    if (Array.isArray(input.fieldValues) && input.fieldValues.length > 0) {
        input.fieldValues.forEach((val, i) => {
            fields[i] = val;
        });
    } else {
        fields[0] = input.question;
        fields[1] = input.answer;
        if (input.topic !== undefined && (note.noteTypeId === 4 || note.noteTypeId === 5 || note.noteTypeId === 6)) {
            fields[2] = input.topic;
        }
        if (note.noteTypeId === 6 && input.reverseAnswer !== undefined) fields[3] = input.reverseAnswer.trim();
        if (note.noteTypeId === 7 && input.reverseAnswer !== undefined) fields[2] = input.reverseAnswer.trim();
    }

    note.fields = fields;
    note.sfld = fields[noteType?.sortFieldIdx ?? 0] || fields[0];
    note.csum = checksumField(fields[0]);
    if (input.tags) {
        note.tags = input.tags;
    } else if (input.subject !== undefined || input.topic !== undefined) {
        note.tags = [
            input.subject,
            input.topic?.trim() ? input.topic.trim().replace(/\s+/g, '-') : undefined,
        ].filter((tag): tag is string => Boolean(tag));
    }
    note.mod = Math.floor(Date.now() / 1000);
    note.usn = -1;
    saveNote(note);

    const destinationDeckId = input.deckId
        ?? (input.subject ? resolveSubjectDeckId(input.subject) : card.deckId);

    // Optional reverse and Cloze fields can add/remove generated cards. Keep existing cards'
    // scheduling by ordinal, create only missing ordinals, and delete only now-invalid siblings.
    if (noteType) {
        const requiredOrds = noteType.kind === 'cloze'
            ? extractClozeNumbers(fields[clozeFieldIndex(noteType)] || '').map((number) => number - 1)
            : noteType.templates
                .filter((template) => shouldGenerateCard(noteType, note, template.ord))
                .map((template) => template.ord);
        const existingByOrd = new Map(getCardsForNote(note.id).map((sibling) => [sibling.ord, sibling]));

        for (const ord of requiredOrds) {
            if (!existingByOrd.has(ord)) createCardForNote(note, destinationDeckId, ord);
        }
        for (const [ord, sibling] of existingByOrd) {
            if (!requiredOrds.includes(ord)) deleteAnkiCardOnly(sibling.id);
        }
    }

    for (const sibling of getCardsForNote(note.id)) {
        sibling.deckId = destinationDeckId;
        sibling.mod = Math.floor(Date.now() / 1000);
        sibling.usn = -1;
        saveAnkiCard(sibling);
    }
    const updatedCard = getAnkiCard(cardId) ?? getCardsForNote(note.id)[0] ?? card;
    updatedCard.deckId = destinationDeckId;

    return { note, card: updatedCard };
}

export function deleteTusCardByCardId(cardId: number): void {
    const card = getAnkiCard(cardId);
    if (!card) return;
    deleteNote(card.noteId);
}
