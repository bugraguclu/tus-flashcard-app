// ============================================================
// TUS Flashcard - Note Manager
// Note CRUD + automatic Card generation (Anki-compatible)
// ============================================================

import type { Note, NoteType, AnkiCard, CardType, CardQueue, CardFlag } from './models';
import { generateGuid, checksumField, BUILTIN_NOTE_TYPES, subjectToDeckId } from './models';
import { extractClozeNumbers, shouldGenerateCard } from './templates';
import { getDB } from './db';
import { TUS_CARDS } from './data';

// ---- Note CRUD ----

export function getAllNotes(): Note[] {
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>('SELECT data FROM notes ORDER BY id');
    return rows.map(r => JSON.parse(r.data));
}

export function getNote(id: number): Note | null {
    const db = getDB();
    const row = db.getFirstSync<{ data: string }>('SELECT data FROM notes WHERE id = ?', id);
    return row ? JSON.parse(row.data) : null;
}

export function saveNote(note: Note): void {
    const db = getDB();
    db.runSync(
        'INSERT OR REPLACE INTO notes (id, noteTypeId, sfld, csum, tags, data) VALUES (?, ?, ?, ?, ?, ?)',
        note.id, note.noteTypeId, note.sfld, note.csum,
        note.tags.join(' '), JSON.stringify(note)
    );
}

export function deleteNote(id: number): void {
    const db = getDB();
    // Delete all cards for this note first
    db.runSync('DELETE FROM anki_cards WHERE noteId = ?', id);
    db.runSync('DELETE FROM notes WHERE id = ?', id);
}

/** Create a new note and generate its cards */
export function createNote(
    noteType: NoteType,
    fields: string[],
    deckId: number,
    tags: string[] = []
): { note: Note; cards: AnkiCard[] } {
    const now = Date.now();
    const sfld = fields[noteType.sortFieldIdx] || fields[0] || '';

    const note: Note = {
        id: now,
        guid: generateGuid(),
        noteTypeId: noteType.id,
        mod: Math.floor(now / 1000),
        usn: -1,
        tags,
        fields,
        sfld,
        csum: checksumField(sfld),
        flags: 0,
    };

    saveNote(note);
    const cards = generateCardsForNote(note, noteType, deckId);
    return { note, cards };
}

/** Generate cards for a note based on its note type */
export function generateCardsForNote(note: Note, noteType: NoteType, deckId: number): AnkiCard[] {
    const cards: AnkiCard[] = [];
    const now = Date.now();

    if (noteType.kind === 'cloze') {
        // One card per cloze number
        const textFieldIdx = noteType.fields.findIndex(f => f.name === 'Text') ?? 0;
        const text = note.fields[textFieldIdx] || '';
        const clozeNumbers = extractClozeNumbers(text);

        for (const clozeNum of clozeNumbers) {
            const card = createCardForNote(note, deckId, clozeNum - 1, now);
            cards.push(card);
        }
    } else {
        // Standard: one card per template
        for (let i = 0; i < noteType.templates.length; i++) {
            if (shouldGenerateCard(noteType, note, i)) {
                const card = createCardForNote(note, deckId, i, now);
                cards.push(card);
            }
        }
    }

    return cards;
}

function createCardForNote(note: Note, deckId: number, ord: number, now: number): AnkiCard {
    const card: AnkiCard = {
        id: now + ord, // slightly offset IDs
        noteId: note.id,
        deckId,
        ord,
        mod: Math.floor(now / 1000),
        usn: -1,
        type: 0,     // new
        queue: 0,     // new
        due: 0,       // position (will be set later)
        ivl: 0,
        factor: 0,
        reps: 0,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0 as CardFlag,
        stability: 0,
        difficulty: 0,
        lastReview: 0,
    };

    saveAnkiCard(card);
    return card;
}

// ---- AnkiCard CRUD ----

export function getAllAnkiCards(): AnkiCard[] {
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>('SELECT data FROM anki_cards ORDER BY id');
    return rows.map(r => JSON.parse(r.data));
}

export function getAnkiCard(id: number): AnkiCard | null {
    const db = getDB();
    const row = db.getFirstSync<{ data: string }>('SELECT data FROM anki_cards WHERE id = ?', id);
    return row ? JSON.parse(row.data) : null;
}

export function getCardsForNote(noteId: number): AnkiCard[] {
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>(
        'SELECT data FROM anki_cards WHERE noteId = ? ORDER BY ord',
        noteId
    );
    return rows.map(r => JSON.parse(r.data));
}

export function getCardsForDeck(deckId: number): AnkiCard[] {
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>(
        'SELECT data FROM anki_cards WHERE deckId = ?',
        deckId
    );
    return rows.map(r => JSON.parse(r.data));
}

export function saveAnkiCard(card: AnkiCard): void {
    const db = getDB();
    db.runSync(
        `INSERT OR REPLACE INTO anki_cards
         (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, flags, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        card.id, card.noteId, card.deckId, card.ord,
        card.type, card.queue, card.due, card.ivl,
        card.factor, card.reps, card.lapses, card.flags,
        JSON.stringify(card)
    );
}

export function suspendCard(cardId: number): void {
    const card = getAnkiCard(cardId);
    if (!card) return;
    card.queue = -1;
    card.mod = Math.floor(Date.now() / 1000);
    saveAnkiCard(card);
}

export function unsuspendCard(cardId: number): void {
    const card = getAnkiCard(cardId);
    if (!card) return;
    // Restore queue based on type
    if (card.type === 0) card.queue = 0;
    else if (card.type === 1) card.queue = 1;
    else if (card.type === 2) card.queue = 2;
    else if (card.type === 3) card.queue = 1;
    card.mod = Math.floor(Date.now() / 1000);
    saveAnkiCard(card);
}

export function buryCard(cardId: number, schedulerBury = false): void {
    const card = getAnkiCard(cardId);
    if (!card) return;
    card.queue = schedulerBury ? -3 : -2;
    card.mod = Math.floor(Date.now() / 1000);
    saveAnkiCard(card);
}

export function setCardFlag(cardId: number, flag: CardFlag): void {
    const card = getAnkiCard(cardId);
    if (!card) return;
    card.flags = flag;
    card.mod = Math.floor(Date.now() / 1000);
    saveAnkiCard(card);
}

/** Bury all sibling cards of a given card (same note, different ord) */
export function burySiblings(card: AnkiCard): number {
    const siblings = getCardsForNote(card.noteId);
    let buriedCount = 0;
    for (const sibling of siblings) {
        if (sibling.id !== card.id && sibling.queue >= 0) {
            buryCard(sibling.id, true);
            buriedCount++;
        }
    }
    return buriedCount;
}

/** Unbury all scheduler-buried cards */
export function unburyAllCards(): number {
    const db = getDB();
    const buried = db.getAllSync<{ data: string }>(
        'SELECT data FROM anki_cards WHERE queue = -3'
    );
    let count = 0;
    for (const row of buried) {
        const card: AnkiCard = JSON.parse(row.data);
        if (card.type === 0) card.queue = 0;
        else if (card.type === 1) card.queue = 1;
        else if (card.type === 2) card.queue = 2;
        else if (card.type === 3) card.queue = 1;
        saveAnkiCard(card);
        count++;
    }
    return count;
}

// ---- Leech Detection ----

export function isLeech(card: AnkiCard, threshold: number = 8): boolean {
    return card.lapses >= threshold;
}

export function handleLeech(card: AnkiCard, action: 'suspend' | 'tag' = 'suspend'): void {
    if (action === 'suspend') {
        suspendCard(card.id);
    }
    // Tag the note
    const note = getNote(card.noteId);
    if (note && !note.tags.includes('leech')) {
        note.tags.push('leech');
        note.mod = Math.floor(Date.now() / 1000);
        saveNote(note);
    }
}

// ---- Note Type Management ----

export function getAllNoteTypes(): NoteType[] {
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>('SELECT data FROM note_types ORDER BY id');
    if (rows.length === 0) return [...BUILTIN_NOTE_TYPES];
    return rows.map(r => JSON.parse(r.data));
}

export function getNoteType(id: number): NoteType | null {
    // Check built-in first
    const builtin = BUILTIN_NOTE_TYPES.find(nt => nt.id === id);
    if (builtin) return builtin;

    const db = getDB();
    const row = db.getFirstSync<{ data: string }>('SELECT data FROM note_types WHERE id = ?', id);
    return row ? JSON.parse(row.data) : null;
}

export function saveNoteType(nt: NoteType): void {
    const db = getDB();
    db.runSync(
        'INSERT OR REPLACE INTO note_types (id, name, data) VALUES (?, ?, ?)',
        nt.id, nt.name, JSON.stringify(nt)
    );
}

// ---- Migration: Convert old TUS cards to Notes ----

export function migrateTusCardsToNotes(): { notesCreated: number; cardsCreated: number } {
    const db = getDB();

    // Check if already migrated
    const existingCount = db.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM notes');
    if (existingCount && existingCount.cnt > 0) {
        return { notesCreated: 0, cardsCreated: 0 };
    }

    let notesCreated = 0;
    let cardsCreated = 0;

    // Get TUS note type
    const tusNoteType = BUILTIN_NOTE_TYPES.find(nt => nt.id === 4)!;

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const oldCard of TUS_CARDS) {
            const deckId = subjectToDeckId(oldCard.subject);
            const fields = [oldCard.question, oldCard.answer, oldCard.topic];
            const sfld = fields[0];

            const note: Note = {
                id: oldCard.id * 1000, // avoid collisions
                guid: generateGuid(),
                noteTypeId: tusNoteType.id,
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
            for (let ord = 0; ord < tusNoteType.templates.length; ord++) {
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
                    factor: 2500,
                    reps: 0,
                    lapses: 0,
                    left: 0,
                    odue: 0,
                    odid: 0,
                    flags: 0,
                    stability: 0,
                    difficulty: 0,
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

// ---- Tag Management ----

export function getAllTags(): string[] {
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>('SELECT data FROM notes');
    const tagSet = new Set<string>();
    for (const row of rows) {
        const note: Note = JSON.parse(row.data);
        for (const tag of note.tags) {
            tagSet.add(tag);
        }
    }
    return Array.from(tagSet).sort();
}

export function addTagToNote(noteId: number, tag: string): void {
    const note = getNote(noteId);
    if (!note) return;
    if (!note.tags.includes(tag)) {
        note.tags.push(tag);
        note.mod = Math.floor(Date.now() / 1000);
        saveNote(note);
    }
}

export function removeTagFromNote(noteId: number, tag: string): void {
    const note = getNote(noteId);
    if (!note) return;
    note.tags = note.tags.filter(t => t !== tag);
    note.mod = Math.floor(Date.now() / 1000);
    saveNote(note);
}

// ---- Search (Anki query language subset) ----

export function searchNotes(query: string): Note[] {
    const allNotes = getAllNotes();
    const q = query.trim().toLowerCase();
    if (!q) return allNotes;

    return allNotes.filter(note => {
        // Simple text search across fields and tags
        const fieldsText = note.fields.join(' ').toLowerCase();
        const tagsText = note.tags.join(' ').toLowerCase();

        // Parse simple query syntax
        if (q.startsWith('tag:')) {
            const tagQuery = q.slice(4);
            return tagsText.includes(tagQuery);
        }
        if (q.startsWith('is:new') || q.startsWith('is:learn') || q.startsWith('is:review') || q.startsWith('is:suspended')) {
            // Would need to check cards - simplified for now
            return true;
        }
        if (q.startsWith('deck:')) {
            // Would need to check cards' deckId
            return true;
        }

        return fieldsText.includes(q) || tagsText.includes(q);
    });
}
