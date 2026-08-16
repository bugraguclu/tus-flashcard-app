// ============================================================
// TUS Flashcard - Anki Data Initialization
// Sets up default decks, note types, and migrates TUS cards
// ============================================================

import { getDB } from './db';
import { DEFAULT_DECKS, DEFAULT_DECK_CONFIG, BUILTIN_NOTE_TYPES, getParentDeckName } from './models';
import { createDeck, getDeck, saveDeck, getDeckByName } from './deckManager';
import { saveDeckConfig } from './deckManager';
import {
    getAllNotes,
    getCardsForNote,
    saveAnkiCard,
    saveNoteType,
    getNoteType,
    migrateTusCardsToNotes,
} from './noteManager';
import { getAllSubjects, resolveSubjectDeckId } from './subjects';

const ANKI_INIT_KEY = 'tus_anki_initialized';

/** Initialize Anki-compatible data model on first run */
export function initAnkiData(): { initialized: boolean; notesCreated: number; cardsCreated: number } {
    const db = getDB();

    // Check if already initialized
    const row = db.getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        ANKI_INIT_KEY
    );
    if (row?.value === 'true') {
        return { initialized: false, notesCreated: 0, cardsCreated: 0 };
    }

    console.log('[AnkiInit] Initializing Anki-compatible data...');

    // 1. Insert default deck config
    saveDeckConfig(DEFAULT_DECK_CONFIG);
    console.log('[AnkiInit] Default deck config created.');

    // 2. Insert default decks
    for (const deck of DEFAULT_DECKS) {
        saveDeck(deck);
    }
    console.log(`[AnkiInit] ${DEFAULT_DECKS.length} default decks created.`);

    // 3. Insert built-in note types
    for (const nt of BUILTIN_NOTE_TYPES) {
        saveNoteType(nt);
    }
    console.log(`[AnkiInit] ${BUILTIN_NOTE_TYPES.length} note types created.`);

    // 4. Migrate TUS cards to notes + cards
    const { notesCreated, cardsCreated } = migrateTusCardsToNotes();
    console.log(`[AnkiInit] Migrated ${notesCreated} notes → ${cardsCreated} cards.`);

    // Mark as initialized
    db.runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ANKI_INIT_KEY, 'true'
    );

    console.log('[AnkiInit] Initialization complete.');
    return { initialized: true, notesCreated, cardsCreated };
}

/**
 * Idempotently seeds any built-in note type missing from the DB. initAnkiData() only seeds
 * BUILTIN_NOTE_TYPES on an installation's very first launch, so an app update that adds a new
 * built-in type (e.g. the Type Answer / Reversed additions) would otherwise leave existing
 * installs without a note_types row for it — and every study/browser query INNER JOINs
 * note_types, so notes of that type would silently vanish. INSERT OR IGNORE so a user's own
 * edits to an existing built-in type (via the note type editor) are never overwritten.
 */
export function ensureBuiltinNoteTypesSeeded(): void {
    const db = getDB();
    for (const nt of BUILTIN_NOTE_TYPES) {
        db.runSync(
            `INSERT OR IGNORE INTO note_types (id, name, data, updated_at, usn, tombstone)
             VALUES (?, ?, ?, ?, ?, ?)`,
            nt.id, nt.name, JSON.stringify(nt), Date.now(), -1, 0,
        );
    }
    healLegacyStockNoteTypes();
    healBuiltinNoteTypeTemplates();
    healSeededDeckDescriptions();
}

const SUBJECT_TOPIC_DECK_MIGRATION_KEY = 'subject_topic_decks_v1';

/**
 * Convert the old editor's Ders/Konu taxonomy into an actual Anki deck tree:
 * Python::Ders::Konu. Existing cards are moved only when they are still in their original
 * subject deck, so a deck choice the user made manually is never overwritten.
 */
export function migrateLegacySubjectTopicsToDecks(): void {
    const db = getDB();
    const migrated = db.getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        SUBJECT_TOPIC_DECK_MIGRATION_KEY,
    );
    if (migrated?.value === 'true') return;

    const allSubjects = getAllSubjects();
    const subjectDecks = allSubjects.map((subject) => ({
        subject,
        deck: getDeck(resolveSubjectDeckId(subject.id)),
    })).filter((entry) => Boolean(entry.deck));
    if (subjectDecks.length === 0) return;

    // Preserve a user's prior manual order. Collections that still have the legacy implicit
    // alphabetical order adopt the original Ders order once during this conversion.
    const manuallyOrderedParents = new Set(
        subjectDecks
            .filter(({ deck }) => Number.isFinite(deck?.sortOrder))
            .map(({ deck }) => getParentDeckName(deck!.name) ?? ''),
    );
    const nextSubjectOrderByParent = new Map<string, number>();
    const targetByLegacyGrouping = new Map<string, { id: number; parentId: number }>();
    const nowSec = Math.floor(Date.now() / 1000);
    const allNotes = getAllNotes();

    for (const { subject, deck: maybeParent } of subjectDecks) {
        const parent = maybeParent!;
        const parentPath = getParentDeckName(parent.name) ?? '';
        if (!manuallyOrderedParents.has(parentPath)) {
            const siblingOrder = nextSubjectOrderByParent.get(parentPath) ?? 0;
            parent.sortOrder = siblingOrder;
            nextSubjectOrderByParent.set(parentPath, siblingOrder + 1);
            parent.mod = nowSec;
            parent.usn = -1;
            saveDeck(parent);
        }

        const topics = [...subject.topics];
        for (const note of allNotes) {
            if (!note.tags.includes(subject.id)) continue;
            const legacyTopic = note.fields[2]?.trim();
            if (legacyTopic && !topics.includes(legacyTopic)) topics.push(legacyTopic);
        }

        for (let topicIndex = 0; topicIndex < topics.length; topicIndex++) {
            const topic = topics[topicIndex];
            const topicDeckName = topic.replace(/::/g, ' - ').trim();
            if (!topicDeckName) continue;
            const path = `${parent.name}::${topicDeckName}`;
            const existing = getDeckByName(path);
            const child = existing ?? createDeck(path);
            if (!Number.isFinite(child.sortOrder)) {
                child.sortOrder = topicIndex;
                child.mod = nowSec;
                child.usn = -1;
                saveDeck(child);
            }
            targetByLegacyGrouping.set(`${subject.id}\u0000${topic}`, {
                id: child.id,
                parentId: parent.id,
            });
        }
    }

    for (const note of allNotes) {
        const subject = allSubjects.find((entry) => note.tags.includes(entry.id));
        const topic = note.fields[2]?.trim();
        if (!subject || !topic) continue;
        const target = targetByLegacyGrouping.get(`${subject.id}\u0000${topic}`);
        if (!target) continue;

        for (const card of getCardsForNote(note.id)) {
            if (card.deckId !== target.parentId) continue;
            card.deckId = target.id;
            card.mod = nowSec;
            card.usn = -1;
            saveAnkiCard(card);
        }
    }

    db.runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        SUBJECT_TOPIC_DECK_MIGRATION_KEY,
        'true',
    );
}

// The first seed gave the Python deck a placeholder description ("Python ana deste") that then
// surfaced under the study header. It was never something the user wrote.
const LEGACY_PYTHON_DECK_DESCRIPTION = 'Python ana deste';

/**
 * Clears the seeded placeholder description from the Python deck. Exact-string match, so a real
 * description the user later wrote (or an already-empty one) is left untouched.
 */
export function healSeededDeckDescriptions(): void {
    const deck = getDeckByName('Python');
    if (deck && deck.description === LEGACY_PYTHON_DECK_DESCRIPTION) {
        deck.description = '';
        deck.mod = Math.floor(Date.now() / 1000);
        saveDeck(deck);
    }
}

// Early builds printed the Kaynak field (which actually stores the card's topic — scope
// filtering reads it) under every answer as "📚 <topic>".
const LEGACY_SOURCE_FOOTER = '{{#Kaynak}}<div class="source">📚 {{Kaynak}}</div>{{/Kaynak}}';

/**
 * Early builds stored slightly different copies of Anki's Basic/Reversed/Cloze defaults.
 * Replace only those untouched legacy signatures; user-customized templates are preserved.
 */
export function healLegacyStockNoteTypes(): void {
    const replacements = new Map(BUILTIN_NOTE_TYPES.map((noteType) => [noteType.id, noteType]));

    const basic = getNoteType(1);
    if (basic?.name === 'Basic'
        && basic.templates[0]?.afmt === '{{FrontSide}}<hr id=answer>{{Back}}') {
        saveNoteType({ ...replacements.get(1)!, mod: basic.mod });
    }

    const reversed = getNoteType(2);
    if (reversed?.name === 'Basic (and Reversed Card)'
        && reversed.fields.map((field) => field.name).join('|') === 'Front|Back') {
        saveNoteType({ ...replacements.get(2)!, mod: reversed.mod });
    }

    const cloze = getNoteType(3);
    if (cloze?.name === 'Cloze'
        && cloze.fields.map((field) => field.name).join('|') === 'Text|Extra'
        && cloze.templates[0]?.afmt === '{{cloze:Text}}<br>{{Extra}}') {
        saveNoteType({ ...replacements.get(3)!, mod: cloze.mod });
    }
}

/**
 * Strips the legacy Kaynak footer from the stored TUS templates (note types 4 and 5).
 * Exact-snippet replacement, so templates the user customized further keep every other edit.
 */
export function healBuiltinNoteTypeTemplates(): void {
    for (const id of [4, 5]) {
        const noteType = getNoteType(id);
        if (!noteType) continue;

        let changed = false;
        for (const template of noteType.templates) {
            if (template.afmt.includes(LEGACY_SOURCE_FOOTER)) {
                template.afmt = template.afmt.replace(LEGACY_SOURCE_FOOTER, '');
                changed = true;
            }
        }

        if (changed) {
            noteType.mod = Math.floor(Date.now() / 1000);
            saveNoteType(noteType);
        }
    }
}

/** Reset Anki data (for testing) — uses transaction for atomicity */
export function resetAnkiData(): void {
    const db = getDB();
    db.execSync(`
        BEGIN TRANSACTION;
        DELETE FROM notes;
        DELETE FROM anki_cards;
        DELETE FROM decks;
        DELETE FROM deck_configs;
        DELETE FROM note_types;
        DELETE FROM revlog;
        DELETE FROM settings WHERE key = 'tus_anki_initialized';
        COMMIT;
    `);
    console.log('[AnkiInit] All Anki data reset.');
}
