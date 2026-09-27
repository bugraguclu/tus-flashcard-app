import {
    generateGuid,
    checksumField,
    uniqueId,
    type Note,
    type NoteType,
    type AnkiCard,
    type CardFlag,
} from './models';
import { clozeFieldIndex, extractClozeNumbers, shouldGenerateCard } from './templates';
import { restoreQueueFromType } from './ankiState';
import { updateAnkiCardData } from './fsrsCardData';
import { buildFtsPrefixQuery, getDB } from './db';
import { getSubjectIdSet } from './subjects';
import { humanizeCardText } from './displayText';
import { markSourcePackageDirty } from './ankiPackageArchive';
import {
    assertCatalogCardMutable,
    assertCatalogCardsMovable,
    assertCatalogNoteContentMutable,
    assertCatalogNoteMutable,
    assertCatalogNoteNotDeletable,
    isCatalogCard,
    PaidCatalogProtectionError,
} from './catalogProtection';


/**
 * Note and card storage: reading and writing notes and cards, card generation, suspend, bury,
 * flag and deck moves, leeches, the search index rows, duplicates and note search.
 */

/** Anki stores tags space-separated with a leading and trailing space (" a b "), so that a
 *  whole-tag search (`LIKE '% a %'`) cannot partially match a longer tag. Empty -> "". */
export function serializeTags(tags: string[]): string {
    return tags.length > 0 ? ` ${tags.join(' ')} ` : '';
}

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
    assertCatalogNoteMutable(note);
    const db = getDB();
    const existing = db.getFirstSync<{ data: string }>('SELECT data FROM notes WHERE id = ?', note.id);
    if (existing?.data) {
        try {
            const parsed = JSON.parse(existing.data) as Note;
            assertCatalogNoteContentMutable(note, parsed);
            markSourcePackageDirty(parsed.sourcePackageId);
        } catch (e) {
            if (e instanceof PaidCatalogProtectionError) throw e;
            /* malformed legacy blobs are replaced below */
        }
    }
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
    assertCatalogNoteNotDeletable(id);
    assertCatalogNoteMutable(id);
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
function nextNewCardPosition(): number {
    const db = getDB();
    const row = db.getFirstSync<{ maxDue: number | null }>(
        'SELECT MAX(due) AS maxDue FROM anki_cards WHERE type = 0',
    );
    return (row?.maxDue ?? 0) + 1;
}

export function createCardForNote(note: Note, deckId: number, ord: number): AnkiCard {
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
    assertCatalogCardMutable(card);
    const db = getDB();
    const nowMs = Date.now();
    const existing = db.getFirstSync<{ data: string }>('SELECT data FROM anki_cards WHERE id = ?', card.id);
    if (existing?.data) {
        try {
            const existingCard = JSON.parse(existing.data) as AnkiCard;
            if (isCatalogCard(existingCard)) {
                if (card.noteId !== existingCard.noteId) {
                    throw new PaidCatalogProtectionError('Katalog kartlarının not bağlantısı değiştirilemez.');
                }
                if (card.deckId !== existingCard.deckId) {
                    let isTargetFiltered = false;
                    try {
                        const targetDeckRow = db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE id = ?', card.deckId);
                        isTargetFiltered = Boolean(targetDeckRow?.data && (JSON.parse(targetDeckRow.data) as { isFiltered?: boolean }).isFiltered);
                    } catch {
                        isTargetFiltered = false;
                    }

                    const isMovingToFiltered = Boolean(
                        card.odid
                        && card.odid === existingCard.deckId
                        && isTargetFiltered
                    );
                    const isReturningFromFiltered = Boolean(
                        existingCard.odid
                        && existingCard.odid > 0
                        && card.deckId === existingCard.odid
                        && (!card.odid || card.odid === 0)
                    );
                    if (!isMovingToFiltered && !isReturningFromFiltered) {
                        throw new PaidCatalogProtectionError('Ücretli katalog kartları başka bir desteye taşınamaz.');
                    }
                }
            }
            markSourcePackageDirty(existingCard.sourcePackageId);
        } catch (e) {
            if (e instanceof PaidCatalogProtectionError) throw e;
            /* malformed legacy blobs are replaced below */
        }
    }

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
             (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    /** The card's data column before the move, which the move strips of its FSRS values. */
    previousAnkiData?: string;
    /** The data column the move wrote, so undo can tell whether anything touched it since. */
    movedAnkiData?: string;
}

/**
 * Move a browser selection to another deck as one undoable operation.
 *
 * The caller owns the undo stack, while this function keeps the database write atomic and
 * returns the original deck of every card. Scheduling is kept as it was, but the FSRS memory
 * state, desired retention and decay are dropped, as Anki's `Card::set_deck` does: the card may
 * now follow another preset, so its state is derived again from its review log, under that
 * preset's parameters, when it is next answered.
 */
export function moveCardsToDeck(cardIds: number[], targetDeckId: number): CardDeckMoveSnapshot[] {
    assertCatalogCardsMovable(cardIds, targetDeckId);
    const uniqueCardIds = [...new Set(cardIds)];
    const moves = uniqueCardIds
        .map((cardId) => getAnkiCard(cardId))
        .filter((card): card is AnkiCard => card !== null && card.deckId !== targetDeckId)
        .map((card) => ({
            cardId: card.id,
            previousDeckId: card.deckId,
            targetDeckId,
            previousAnkiData: card.ankiData,
            movedAnkiData: updateAnkiCardData(card.ankiData, {
                stability: null,
                difficulty: null,
                desiredRetention: null,
                decay: null,
            }),
        }));

    if (moves.length === 0) return [];

    const db = getDB();
    const nowSec = Math.floor(Date.now() / 1000);
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const move of moves) {
            const card = getAnkiCard(move.cardId);
            if (!card) continue;
            saveAnkiCard({ ...card, deckId: targetDeckId, ankiData: move.movedAnkiData, mod: nowSec, usn: -1 });
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
            // The FSRS values come back only if nothing (an answer, say) has rewritten them since.
            const ankiData = card.ankiData === move.movedAnkiData ? move.previousAnkiData : card.ankiData;
            saveAnkiCard({ ...card, deckId: move.previousDeckId, ankiData, mod: nowSec, usn: -1 });
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

export function isLeech(card: AnkiCard, threshold: number = 8): boolean {
    if (!threshold || card.lapses < threshold) return false;
    // Anki fires leech on threshold, then every threshold/2 lapses after that, rounding the half
    // UP for odd thresholds (rslib `leech_threshold_met` casts to float before ceiling). Flooring
    // collapses an odd threshold's half towards 1 and fires on every lapse past the threshold.
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

    // A single unreadable note blob must not cost the whole collection its search index: skip it
    // here, and let the Settings database check report it as a note needing attention.
    return rows.flatMap((row) => {
        try {
            return [searchIndexCardFromNote(JSON.parse(row.noteData), row.cardId)];
        } catch {
            return [];
        }
    });
}

export interface NavigationCardCount {
    subject: string;
    topic: string;
    count: number;
}

/** Sidebar counts without materializing every card/question/answer into JS. Native builds read
 * the already-maintained FTS projection; the web fallback parses each distinct note once. */
export function getNavigationCardCounts(): NavigationCardCount[] {
    const db = getDB();
    try {
        const indexed = db.getAllSync<{ subject: string; topic: string; count: number }>(
            `SELECT subject, topic, COUNT(*) AS count
             FROM cards_fts
             GROUP BY subject, topic`,
        ).map((row) => ({ subject: row.subject, topic: row.topic, count: Number(row.count) || 0 }));
        if (indexed.some((row) => row.count > 0)) return indexed;
    } catch { /* FTS can be unavailable during early web/database migration startup. */ }

    const subjectTags = getSubjectIdSet();
    const counts = new Map<string, NavigationCardCount>();
    for (const row of db.getAllSync<{ noteData: string; count: number }>(
        `SELECT n.data AS noteData, COUNT(c.id) AS count
         FROM notes n
         JOIN anki_cards c ON c.noteId = n.id
         GROUP BY n.id`,
    )) {
        try {
            const note = JSON.parse(row.noteData) as Note;
            const subject = note.catalogSubject ?? note.tags.find((tag) => subjectTags.has(tag)) ?? 'custom';
            const topic = note.catalogTopic ?? (note.fields[2] || note.tags.find((tag) => tag !== subject) || 'General');
            const key = `${subject}\u001f${topic}`;
            const existing = counts.get(key);
            if (existing) existing.count += Number(row.count) || 0;
            else counts.set(key, { subject, topic, count: Number(row.count) || 0 });
        } catch { /* Skip malformed legacy note blobs; maintenance can repair them. */ }
    }
    return [...counts.values()];
}

export interface DuplicateNoteResult {
    noteId: number;
    cardId: number | null;
    firstField: string;
    deckName?: string;
}

/**
 * Checks whether an existing note with the same noteTypeId shares the exact same first field
 * (ignoring outer whitespace). Matches Anki's duplicate-check behavior on add/edit.
 */
export function findDuplicateNote(
    noteTypeId: number,
    firstFieldValue: string,
    excludeNoteId?: number,
): DuplicateNoteResult | null {
    const target = firstFieldValue.trim();
    if (!target) return null;

    const db = getDB();
    const csum = checksumField(target);

    const rows = db.getAllSync<{ noteId: number; cardId: number | null; deckName: string | null; noteData: string }>(
        `SELECT n.id AS noteId, c.id AS cardId, d.name AS deckName, n.data AS noteData
         FROM notes n
         LEFT JOIN anki_cards c ON c.noteId = n.id AND c.ord = 0
         LEFT JOIN decks d ON d.id = c.deckId
         WHERE n.csum = ? AND n.noteTypeId = ? ${excludeNoteId ? 'AND n.id != ?' : ''}
         LIMIT 10`,
        ...(excludeNoteId ? [csum, noteTypeId, excludeNoteId] : [csum, noteTypeId]),
    );

    for (const row of rows) {
        try {
            const parsed = JSON.parse(row.noteData) as { fields?: string[] };
            const field0 = parsed.fields?.[0];
            if (typeof field0 === 'string' && field0.trim() === target) {
                return {
                    noteId: row.noteId,
                    cardId: row.cardId,
                    firstField: field0,
                    deckName: row.deckName || undefined,
                };
            }
        } catch {
            // Skip unparseable row
        }
    }

    return null;
}

/**
 * Deletes a single card without touching its note or any sibling cards — unlike
 * deleteTusCardByCardId, which deletes the whole note. For orphaned cards found by
 * findEmptyCards(), where the note (and its other cards) may still be perfectly valid.
 */
export function deleteAnkiCardOnly(cardId: number): void {
    deleteAnkiCardsOnly([cardId]);
}

/** Delete empty cards as one transaction so a failed bulk operation cannot partially apply. */
export function deleteAnkiCardsOnly(cardIds: number[]): void {
    if (cardIds.length === 0) return;
    if (cardIds.some(isCatalogCard)) {
        throw new PaidCatalogProtectionError('Katalog kartları tek tek silinemez.');
    }
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        const uniqueIds = [...new Set(cardIds)];
        for (const cardId of uniqueIds) {
            db.runSync('DELETE FROM revlog WHERE cardId = ?', cardId);
            db.runSync('DELETE FROM cards_fts WHERE card_id = ?', String(cardId));
            db.runSync('DELETE FROM anki_cards WHERE id = ?', cardId);
            db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 0, -1)', cardId);
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

/** Searches notes, using the FTS5 index when it is available. */
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
