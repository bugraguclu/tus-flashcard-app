// Note and card storage: CRUD, card generation, status (suspend/bury/flag), leech, tags, search.

import type { Note, NoteType, AnkiCard, CardFlag } from './models';
import { generateGuid, checksumField, uniqueId, BUILTIN_NOTE_TYPES, subjectToDeckId } from './models';
import { clozeFieldIndex, extractClozeNumbers, shouldGenerateCard } from './templates';
import { restoreQueueFromType } from './ankiState';
import { buildFtsPrefixQuery, dbUpsertFtsCard, getDB } from './db';
import { TUS_CARDS } from './data';
import { getSubjectIdSet, resolveSubjectDeckId } from './subjects';
import { humanizeCardText } from './displayText';

/** Anki stores tags space-separated with a leading and trailing space (" a b "), so that a
 *  whole-tag search (`LIKE '% a %'`) cannot partially match a longer tag. Empty -> "". */
function serializeTags(tags: string[]): string {
    return tags.length > 0 ? ` ${tags.join(' ')} ` : '';
}

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
        serializeTags(note.tags),
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
            const placeholders = cardIds.map(() => '?').join(', ');
            db.runSync(`DELETE FROM revlog WHERE cardId IN (${placeholders})`, ...cardIds);
            db.runSync(`DELETE FROM cards_fts WHERE card_id IN (${placeholders})`, ...cardIds.map(String));
        }

        db.runSync('DELETE FROM anki_cards WHERE noteId = ?', id);
        db.runSync('DELETE FROM notes WHERE id = ?', id);

        // Tombstones so the deletion can propagate on the next sync (grave types: 0=card, 1=note).
        for (const cardId of cardIds) {
            db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 0, -1)', cardId);
        }
        db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 1, -1)', id);

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
    tags: string[] = [],
    guid?: string,
): { note: Note; cards: AnkiCard[] } {
    const now = uniqueId();
    const sfld = fields[noteType.sortFieldIdx] || fields[0] || '';

    const note: Note = {
        id: now,
        // Preserve a supplied guid (Anki .apkg keeps a stable per-note id) so a later re-import
        // recognises the same note; otherwise mint a fresh one.
        guid: guid ?? generateGuid(),
        noteTypeId: noteType.id,
        mod: Math.floor(now / 1000),
        usn: -1,
        tags,
        fields,
        sfld,
        csum: checksumField(fields[0] ?? ''),
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
        // One card per cloze number, over the field the template actually clozes.
        const text = note.fields[clozeFieldIndex(noteType)] || '';
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

/** Next new-card position: Anki gives each new card an incrementing `due` that sets its order. */
export function nextNewCardPosition(): number {
    const db = getDB();
    const row = db.getFirstSync<{ maxDue: number | null }>(
        'SELECT MAX(due) AS maxDue FROM anki_cards WHERE type = 0',
    );
    return (row?.maxDue ?? 0) + 1;
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
        due: nextNewCardPosition(),  // new-card position
        ivl: 0,
        factor: 0,
        reps: 0,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0 as CardFlag,
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

    // Preserve any forward-compat keys the stored blob may carry that aren't on AnkiCard.
    let serializedData = JSON.stringify(card);
    if (existing?.data) {
        try {
            const existingParsed = JSON.parse(existing.data) as Record<string, unknown>;
            serializedData = JSON.stringify({ ...existingParsed, ...card });
        } catch (e) {
            console.warn('[NoteManager] failed to merge stored card data:', e);
        }
    }

    if (!existing) {
        db.runSync(
            `INSERT INTO anki_cards
             (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, usn, tombstone)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            card.left ?? 0,
            card.flags,
            serializedData,
            nowMs,
            card.usn ?? -1,
            0,
        );
        return;
    }

    db.runSync(
        `UPDATE anki_cards
         SET noteId = ?, deckId = ?, ord = ?, type = ?, queue = ?, due = ?, ivl = ?, factor = ?,
             reps = ?, lapses = ?, "left" = ?, flags = ?, data = ?, updated_at = ?, usn = ?, tombstone = 0
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
        card.left ?? 0,
        card.flags,
        serializedData,
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
    // Anki: sched/sibling bury = -2, user/manual bury = -3.
    card.queue = schedulerBury ? -2 : -3;
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

export interface CardDeckMoveSnapshot {
    cardId: number;
    previousDeckId: number;
    targetDeckId: number;
}

/**
 * Move a browser selection to another deck as one undoable operation.
 *
 * The caller owns the undo stack, while this function keeps the database write atomic and
 * returns the original deck of every card. Scheduling data is preserved exactly; only deckId,
 * mod and usn change, matching Anki's browser "Change Deck" action.
 */
export function moveCardsToDeck(cardIds: number[], targetDeckId: number): CardDeckMoveSnapshot[] {
    const uniqueCardIds = [...new Set(cardIds)];
    const moves = uniqueCardIds
        .map((cardId) => getAnkiCard(cardId))
        .filter((card): card is AnkiCard => card !== null && card.deckId !== targetDeckId)
        .map((card) => ({
            cardId: card.id,
            previousDeckId: card.deckId,
            targetDeckId,
        }));

    if (moves.length === 0) return [];

    const db = getDB();
    const nowSec = Math.floor(Date.now() / 1000);
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const move of moves) {
            const card = getAnkiCard(move.cardId);
            if (!card) continue;
            saveAnkiCard({ ...card, deckId: targetDeckId, mod: nowSec, usn: -1 });
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return moves;
}

/** Restore the cards captured by moveCardsToDeck(), without overwriting later scheduling data. */
export function undoCardsMovedToDeck(moves: CardDeckMoveSnapshot[]): number {
    if (moves.length === 0) return 0;

    const db = getDB();
    const nowSec = Math.floor(Date.now() / 1000);
    let restored = 0;
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const move of moves) {
            const card = getAnkiCard(move.cardId);
            if (!card) continue;
            saveAnkiCard({ ...card, deckId: move.previousDeckId, mod: nowSec, usn: -1 });
            restored += 1;
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return restored;
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

/** Unbury both sched-buried (-2) and user-buried (-3) cards at day rollover.
 *  Matches Anki: burying is "until the next day" for both kinds; only suspend (-1) persists. */
export function unburyAllCards(rolloverHour: number = 4): number {
    const db = getDB();
    const buried = db.getAllSync<{ data: string }>(
        'SELECT data FROM anki_cards WHERE queue = -2 OR queue = -3'
    );
    if (buried.length === 0) return 0;

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const row of buried) {
            const card: AnkiCard = JSON.parse(row.data);
            card.queue = restoreQueueFromType(card, rolloverHour);
            saveAnkiCard(card);
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
    return buried.length;
}

// ---- Leech Detection ----

export function isLeech(card: AnkiCard, threshold: number = 8): boolean {
    if (!threshold || card.lapses < threshold) return false;
    // Anki fires leech on threshold, then every threshold/2 lapses after that, rounding the
    // half up so an odd threshold does not fire on every single lapse (rslib review.rs).
    return (card.lapses - threshold) % Math.max(1, Math.ceil(threshold / 2)) === 0;
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

/**
 * Convert notes to another note type while preserving the scheduling of every card that can be
 * mapped to a target template. Fields with the same name are mapped first; remaining fields fall
 * back to their ordinal. Existing cards are reused in order, surplus cards are removed, and only
 * genuinely new target cards start with new scheduling.
 */
export function changeNotesType(noteIds: number[], targetNoteTypeId: number): number {
    const targetType = getNoteType(targetNoteTypeId);
    if (!targetType) return 0;

    const db = getDB();
    const uniqueNoteIds = [...new Set(noteIds)];
    let changed = 0;

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const noteId of uniqueNoteIds) {
            const note = getNote(noteId);
            const sourceType = note ? getNoteType(note.noteTypeId) : null;
            if (!note || !sourceType || note.noteTypeId === targetNoteTypeId) continue;

            const sourceByName = new Map(
                sourceType.fields.map((field, index) => [field.name.normalize('NFC').toLocaleLowerCase(), index]),
            );
            const fields = targetType.fields.map((field, index) => {
                const sameNameIndex = sourceByName.get(field.name.normalize('NFC').toLocaleLowerCase());
                if (sameNameIndex !== undefined) return note.fields[sameNameIndex] ?? '';
                return note.fields[index] ?? '';
            });

            note.noteTypeId = targetType.id;
            note.fields = fields;
            note.sfld = fields[targetType.sortFieldIdx] || fields[0] || '';
            note.csum = checksumField(fields[0] ?? '');
            note.mod = Math.floor(Date.now() / 1000);
            note.usn = -1;
            saveNote(note);

            const existingCards = getCardsForNote(note.id).sort((a, b) => a.ord - b.ord || a.id - b.id);
            const requiredOrds = targetType.kind === 'cloze'
                ? extractClozeNumbers(fields[clozeFieldIndex(targetType)] || '').map((number) => number - 1)
                : targetType.templates
                    .filter((template) => shouldGenerateCard(targetType, note, template.ord))
                    .map((template) => template.ord);
            const destinationDeckId = existingCards[0]?.deckId ?? resolveSubjectDeckId('custom');

            requiredOrds.forEach((ord, index) => {
                const existing = existingCards[index];
                if (existing) {
                    saveAnkiCard({
                        ...existing,
                        ord,
                        mod: Math.floor(Date.now() / 1000),
                        usn: -1,
                    });
                } else {
                    createCardForNote(note, destinationDeckId, ord);
                }
            });
            for (const surplus of existingCards.slice(requiredOrds.length)) {
                db.runSync('DELETE FROM revlog WHERE cardId = ?', surplus.id);
                db.runSync('DELETE FROM cards_fts WHERE card_id = ?', String(surplus.id));
                db.runSync('DELETE FROM anki_cards WHERE id = ?', surplus.id);
                db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 0, -1)', surplus.id);
            }

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

/** Apply the same add/remove tag delta to multiple notes without erasing unrelated tags. */
export function updateNotesTags(noteIds: number[], addTags: string[], removeTags: string[]): number {
    const db = getDB();
    const uniqueNoteIds = [...new Set(noteIds)];
    const additions = [...new Set(addTags.map((tag) => tag.normalize('NFC').trim()).filter(Boolean))];
    const removals = new Set(removeTags.map((tag) => tag.normalize('NFC').toLocaleLowerCase()));
    let changed = 0;

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const noteId of uniqueNoteIds) {
            const note = getNote(noteId);
            if (!note) continue;
            const existingKeys = new Set(note.tags.map((tag) => tag.normalize('NFC').toLocaleLowerCase()));
            const nextTags = note.tags.filter((tag) => !removals.has(tag.normalize('NFC').toLocaleLowerCase()));
            for (const tag of additions) {
                const key = tag.toLocaleLowerCase();
                if (!existingKeys.has(key)) nextTags.push(tag);
            }
            if (JSON.stringify(nextTags) === JSON.stringify(note.tags)) continue;

            note.tags = nextTags;
            note.mod = Math.floor(Date.now() / 1000);
            note.usn = -1;
            saveNote(note);
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

export interface SearchIndexCard {
    id: number;
    question: string;
    answer: string;
    topic: string;
    subject: string;
}

/** Build a card's search-index entry from its note. Shared by full and incremental indexing. */
export function searchIndexCardFromNote(note: Note, cardId: number): SearchIndexCard {
    const subjectTags = getSubjectIdSet();
    const subject = note.catalogSubject ?? note.tags.find((tag) => subjectTags.has(tag)) ?? 'custom';
    const topic = note.catalogTopic ?? (note.fields[2] || note.tags.find((tag) => tag !== subject) || 'General');
    return {
        id: cardId,
        subject,
        topic,
        question: humanizeCardText(note.fields[0] || note.sfld || ''),
        answer: humanizeCardText(note.fields[1] || ''),
    };
}

export function getSearchIndexCards(): SearchIndexCard[] {
    const db = getDB();
    const rows = db.getAllSync<{ cardId: number; noteData: string }>(
        `SELECT c.id AS cardId, n.data AS noteData
         FROM anki_cards c
         JOIN notes n ON n.id = c.noteId`
    );

    return rows.map((row) => searchIndexCardFromNote(JSON.parse(row.noteData), row.cardId));
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

    const fields = noteType.fields.map(() => '');
    fields[0] = input.question;
    if (fields.length > 1) fields[1] = input.answer;
    if (noteTypeId === 7 && fields.length > 2) fields[2] = (input.reverseAnswer ?? '').trim();
    if ([4, 5, 6].includes(noteTypeId) && fields.length > 2) fields[2] = topic;
    if (noteTypeId === 6 && fields.length > 3) fields[3] = (input.reverseAnswer ?? '').trim();

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
    },
): { note: Note; card: AnkiCard } | null {
    const card = getAnkiCard(cardId);
    if (!card) return null;

    const note = getNote(card.noteId);
    if (!note) return null;

    // The compact editor owns the first two (and optional Add Reverse) fields. Notes of
    // richer types may carry legacy/imported fields, so keep every slot the editor does not show.
    const noteType = getNoteType(note.noteTypeId);
    const fieldCount = Math.max(noteType?.fields.length ?? 2, note.fields.length, 2);
    const fields = [...note.fields];
    fields.length = fieldCount;
    for (let i = 0; i < fieldCount; i++) fields[i] = fields[i] ?? '';
    fields[0] = input.question;
    fields[1] = input.answer;
    if (input.topic !== undefined && (note.noteTypeId === 4 || note.noteTypeId === 5 || note.noteTypeId === 6)) {
        fields[2] = input.topic;
    }
    if (note.noteTypeId === 6 && input.reverseAnswer !== undefined) fields[3] = input.reverseAnswer.trim();
    if (note.noteTypeId === 7 && input.reverseAnswer !== undefined) fields[2] = input.reverseAnswer.trim();

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

// ---- Empty Cards (Anki's "Find Empty Cards") ----

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
            const text = note.fields[clozeFieldIndex(noteType)] || '';
            if (!extractClozeNumbers(text).includes(row.ord + 1)) {
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

/**
 * Deletes a single card without touching its note or any sibling cards — unlike
 * deleteTusCardByCardId, which deletes the whole note. For orphaned cards found by
 * findEmptyCards(), where the note (and its other cards) may still be perfectly valid.
 */
export function deleteAnkiCardOnly(cardId: number): void {
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        db.runSync('DELETE FROM revlog WHERE cardId = ?', cardId);
        db.runSync('DELETE FROM cards_fts WHERE card_id = ?', String(cardId));
        db.runSync('DELETE FROM anki_cards WHERE id = ?', cardId);
        db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 0, -1)', cardId);
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
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

/** Reserved tag mirroring Anki's note "mark" (star) feature. */
export const MARKED_TAG = 'marked';

export function isNoteMarked(note: Note): boolean {
    return note.tags.includes(MARKED_TAG);
}

/** Toggles the reserved "marked" tag on a note. Returns the new marked state. */
export function toggleNoteMark(noteId: number): boolean {
    const note = getNote(noteId);
    if (!note) return false;
    const willMark = !isNoteMarked(note);
    if (willMark) {
        addTagToNote(noteId, MARKED_TAG);
    } else {
        removeTagFromNote(noteId, MARKED_TAG);
    }
    return willMark;
}

/** Duplicates a note (fields + tags) into a fresh note, generating cards in the same deck. */
export function duplicateNote(noteId: number): { note: Note; cards: AnkiCard[] } | null {
    const note = getNote(noteId);
    if (!note) return null;

    const noteType = getNoteType(note.noteTypeId);
    if (!noteType) return null;

    const existingCards = getCardsForNote(noteId);
    const deckId = existingCards[0]?.deckId ?? subjectToDeckId('anatomy');

    return createNote(noteType, [...note.fields], deckId, [...note.tags]);
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

        // Whole-tag match: wrap the stored tags in spaces so the query can't partially match a
        // longer tag (works whether or not the row already has Anki's surrounding spaces).
        const rows = db.getAllSync<{ data: string }>(
            "SELECT data FROM notes WHERE (' ' || LOWER(TRIM(tags)) || ' ') LIKE ? ORDER BY id",
            `% ${tagQuery} %`,
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
