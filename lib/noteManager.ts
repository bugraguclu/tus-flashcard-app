// ============================================================
// TUS Flashcard - Note Manager
// Note CRUD + automatic Card generation (Anki-compatible)
// ============================================================

import type { Note, NoteType, AnkiCard, CardFlag } from './models';
import { generateGuid, checksumField, uniqueId, BUILTIN_NOTE_TYPES, subjectToDeckId } from './models';
import { extractClozeNumbers, shouldGenerateCard } from './templates';
import { restoreQueueFromType } from './ankiState';
import { buildFtsPrefixQuery, getDB } from './db';
import { TUS_CARDS, TUS_SUBJECTS } from './data';

const SUBJECT_TAGS = new Set(TUS_SUBJECTS.map((subject) => subject.id));

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
        `INSERT OR REPLACE INTO notes
         (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        note.id,
        note.noteTypeId,
        note.sfld,
        note.csum,
        note.tags.join(' '),
        JSON.stringify(note),
        Date.now(),
        note.usn ?? -1,
        0,
    );
}

export function deleteNote(id: number): void {
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        const cardRows = db.getAllSync<{ id: number }>('SELECT id FROM anki_cards WHERE noteId = ?', id);
        const cardIds = cardRows.map((row) => row.id);

        if (cardIds.length > 0) {
            const numericPlaceholders = cardIds.map(() => '?').join(', ');
            const textPlaceholders = cardIds.map(() => '?').join(', ');
            db.runSync(`DELETE FROM revlog WHERE cardId IN (${numericPlaceholders})`, ...cardIds);
            db.runSync(`DELETE FROM cards_fts WHERE card_id IN (${textPlaceholders})`, ...cardIds.map(String));
        }

        db.runSync('DELETE FROM anki_cards WHERE noteId = ?', id);
        db.runSync('DELETE FROM notes WHERE id = ?', id);
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

/** Create a new note and generate its cards */
export function createNote(
    noteType: NoteType,
    fields: string[],
    deckId: number,
    tags: string[] = []
): { note: Note; cards: AnkiCard[] } {
    const now = uniqueId();
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

    if (noteType.kind === 'cloze') {
        // One card per cloze number
        const textFieldIdx = noteType.fields.findIndex(f => f.name === 'Text') ?? 0;
        const text = note.fields[textFieldIdx] || '';
        const clozeNumbers = extractClozeNumbers(text);

        for (const clozeNum of clozeNumbers) {
            const card = createCardForNote(note, deckId, clozeNum - 1);
            cards.push(card);
        }
    } else {
        // Standard: one card per template
        for (let i = 0; i < noteType.templates.length; i++) {
            if (shouldGenerateCard(noteType, note, i)) {
                const card = createCardForNote(note, deckId, i);
                cards.push(card);
            }
        }
    }

    return cards;
}

const MAX_CARD_ID_ATTEMPTS = 512;

function generateUniqueCardId(): number {
    const db = getDB();
    let candidate = uniqueId();

    for (let attempt = 0; attempt < MAX_CARD_ID_ATTEMPTS; attempt++) {
        const exists = db.getFirstSync<{ id: number }>(
            'SELECT id FROM anki_cards WHERE id = ? LIMIT 1',
            candidate,
        );

        if (!exists) {
            return candidate;
        }

        candidate += 1;
    }

    console.error(`[NoteManager] Failed to generate unique card id after ${MAX_CARD_ID_ATTEMPTS} attempts.`);
    throw new Error('Unable to generate a unique card id. Please retry.');
}

function createCardForNote(note: Note, deckId: number, ord: number): AnkiCard {
    const id = generateUniqueCardId();
    const card: AnkiCard = {
        id,
        noteId: note.id,
        deckId,
        ord,
        mod: Math.floor(id / 1000),
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
    const nowMs = Date.now();
    const existing = db.getFirstSync<{ data: string }>('SELECT data FROM anki_cards WHERE id = ?', card.id);

    let serializedData = JSON.stringify(card);
    let dataChanged = true;

    if (existing?.data) {
        try {
            const existingParsed = JSON.parse(existing.data) as Record<string, unknown>;
            serializedData = JSON.stringify({ ...existingParsed, ...card });
            dataChanged = serializedData !== existing.data;
        } catch (e) {
            console.warn('[NoteManager] operation failed:', e);
            serializedData = JSON.stringify(card);
            dataChanged = true;
        }
    }

    if (!existing) {
        db.runSync(
            `INSERT INTO anki_cards
             (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, flags, data, updated_at, usn, tombstone)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            card.id,
            card.noteId,
            card.deckId,
            card.ord,
            card.type,
            card.queue,
            card.due,
            card.ivl,
            card.factor,
            card.reps,
            card.lapses,
            card.flags,
            serializedData,
            nowMs,
            card.usn ?? -1,
            0,
        );
        return;
    }

    if (dataChanged) {
        db.runSync(
            `UPDATE anki_cards
             SET noteId = ?, deckId = ?, ord = ?, type = ?, queue = ?, due = ?, ivl = ?, factor = ?,
                 reps = ?, lapses = ?, flags = ?, data = ?, updated_at = ?, usn = ?, tombstone = 0
             WHERE id = ?`,
            card.noteId,
            card.deckId,
            card.ord,
            card.type,
            card.queue,
            card.due,
            card.ivl,
            card.factor,
            card.reps,
            card.lapses,
            card.flags,
            serializedData,
            nowMs,
            card.usn ?? -1,
            card.id,
        );
        return;
    }

    db.runSync(
        `UPDATE anki_cards
         SET noteId = ?, deckId = ?, ord = ?, type = ?, queue = ?, due = ?, ivl = ?, factor = ?,
             reps = ?, lapses = ?, flags = ?, updated_at = ?, usn = ?, tombstone = 0
         WHERE id = ?`,
        card.noteId,
        card.deckId,
        card.ord,
        card.type,
        card.queue,
        card.due,
        card.ivl,
        card.factor,
        card.reps,
        card.lapses,
        card.flags,
        nowMs,
        card.usn ?? -1,
        card.id,
    );
}

export function suspendCard(cardId: number): void {
    const card = getAnkiCard(cardId);
    if (!card) return;
    card.queue = -1;
    card.mod = Math.floor(Date.now() / 1000);
    saveAnkiCard(card);
}


export function unsuspendCard(cardId: number, rolloverHour: number = 4): void {
    const card = getAnkiCard(cardId);
    if (!card) return;
    card.queue = restoreQueueFromType(card, rolloverHour);
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

/** Unbury all buried cards for the new day rollover. */
export function unburyAllCards(rolloverHour: number = 4): number {
    const db = getDB();
    const buried = db.getAllSync<{ data: string }>(
        'SELECT data FROM anki_cards WHERE queue IN (-2, -3)'
    );
    let count = 0;
    for (const row of buried) {
        const card: AnkiCard = JSON.parse(row.data);
        card.queue = restoreQueueFromType(card, rolloverHour);
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

export interface SearchIndexCard {
    id: number;
    question: string;
    answer: string;
    topic: string;
    subject: string;
}

export function getSearchIndexCards(): SearchIndexCard[] {
    const db = getDB();
    const rows = db.getAllSync<{ cardId: number; noteData: string }>(
        `SELECT c.id AS cardId, n.data AS noteData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId`
    );

    return rows.map((row) => {
        const note: Note = JSON.parse(row.noteData);
        const subject = note.tags.find((tag) => SUBJECT_TAGS.has(tag)) ?? 'custom';
        const topic = note.fields[2] || note.tags.find((tag) => tag !== subject) || 'General';
        const question = note.fields[0] || note.sfld || '';
        const answer = note.fields[1] || '';

        return {
            id: row.cardId,
            subject,
            topic,
            question,
            answer,
        };
    });
}

export function createTusCard(input: {
    subject: string;
    topic: string;
    question: string;
    answer: string;
}): { note: Note; card: AnkiCard } {
    const noteType = getNoteType(4) || BUILTIN_NOTE_TYPES.find((entry) => entry.id === 4)!;
    const deckId = subjectToDeckId(input.subject);
    const tags = [input.subject, input.topic.replace(/\s+/g, '-')];

    const { note, cards } = createNote(
        noteType,
        [input.question, input.answer, input.topic],
        deckId,
        tags,
    );

    return { note, card: cards[0] };
}

export function updateTusCardByCardId(
    cardId: number,
    input: { subject: string; topic: string; question: string; answer: string },
): { note: Note; card: AnkiCard } | null {
    const card = getAnkiCard(cardId);
    if (!card) return null;

    const note = getNote(card.noteId);
    if (!note) return null;

    note.fields = [input.question, input.answer, input.topic];
    note.sfld = input.question;
    note.csum = checksumField(input.question);
    note.tags = [input.subject, input.topic.replace(/\s+/g, '-')];
    note.mod = Math.floor(Date.now() / 1000);
    note.usn = -1;
    saveNote(note);

    card.deckId = subjectToDeckId(input.subject);
    card.mod = Math.floor(Date.now() / 1000);
    card.usn = -1;
    saveAnkiCard(card);

    return { note, card };
}

export function deleteTusCardByCardId(cardId: number): void {
    const card = getAnkiCard(cardId);
    if (!card) return;
    deleteNote(card.noteId);
}

// ---- Tag Management ----

export function getAllTags(): string[] {
    const db = getDB();

    // Extract distinct space-separated tags fully in SQL to avoid JS-side full-table splitting.
    const rows = db.getAllSync<{ tag: string }>(
        `WITH RECURSIVE split(tag, rest) AS (
            SELECT '', TRIM(tags) || ' '
            FROM notes
            WHERE tags IS NOT NULL AND TRIM(tags) != ''
            UNION ALL
            SELECT
                TRIM(SUBSTR(rest, 1, INSTR(rest, ' ') - 1)),
                LTRIM(SUBSTR(rest, INSTR(rest, ' ') + 1))
            FROM split
            WHERE rest != ''
        )
        SELECT DISTINCT tag
        FROM split
        WHERE tag != ''
        ORDER BY tag COLLATE NOCASE`,
    );

    return rows.map((row) => row.tag);
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

// ---- Search (uses FTS5 index when available) ----

export function searchNotes(query: string): Note[] {
    const db = getDB();
    const raw = query.trim();
    const lower = raw.toLowerCase();

    if (!raw) {
        const rows = db.getAllSync<{ data: string }>('SELECT data FROM notes ORDER BY id');
        return rows.map((row) => JSON.parse(row.data) as Note);
    }

    if (lower.startsWith('tag:')) {
        const tagQuery = lower.slice(4).trim();
        if (!tagQuery) {
            const rows = db.getAllSync<{ data: string }>('SELECT data FROM notes ORDER BY id');
            return rows.map((row) => JSON.parse(row.data) as Note);
        }

        const rows = db.getAllSync<{ data: string }>(
            'SELECT data FROM notes WHERE LOWER(tags) LIKE ? ORDER BY id',
            `%${tagQuery}%`,
        );
        return rows.map((row) => JSON.parse(row.data) as Note);
    }

    const searchTerms = buildFtsPrefixQuery(raw);
    if (!searchTerms) {
        const rows = db.getAllSync<{ data: string }>('SELECT data FROM notes ORDER BY id');
        return rows.map((row) => JSON.parse(row.data) as Note);
    }

    try {
        const rows = db.getAllSync<{ noteData: string }>(
            `SELECT DISTINCT n.data AS noteData
             FROM notes n
             JOIN anki_cards c ON c.noteId = n.id
             JOIN cards_fts f ON f.card_id = CAST(c.id AS TEXT)
             WHERE cards_fts MATCH ?
             ORDER BY bm25(cards_fts)`,
            searchTerms,
        );

        return rows.map((row) => JSON.parse(row.noteData) as Note);
    } catch (e) {
        console.warn('[NoteManager] operation failed:', e);
        const like = `%${lower}%`;
        const rows = db.getAllSync<{ data: string }>(
            `SELECT data FROM notes
             WHERE LOWER(sfld) LIKE ? OR LOWER(data) LIKE ? OR LOWER(tags) LIKE ?
             ORDER BY id`,
            like,
            like,
            like,
        );

        return rows.map((row) => JSON.parse(row.data) as Note);
    }
}
