// ============================================================
// TUS Flashcard - Anki Data Initialization
// Sets up default decks, note types, and migrates TUS cards
// ============================================================

import { getDB } from './db';
import { DEFAULT_DECKS, DEFAULT_DECK_CONFIG, BUILTIN_NOTE_TYPES } from './models';
import { saveDeck } from './deckManager';
import { saveDeckConfig } from './deckManager';
import { saveNoteType, getNoteType, migrateTusCardsToNotes } from './noteManager';

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
    healBuiltinNoteTypeTemplates();
}

// Early builds printed the Kaynak field (which actually stores the card's topic — scope
// filtering reads it) under every answer as "📚 <topic>".
const LEGACY_SOURCE_FOOTER = '{{#Kaynak}}<div class="source">📚 {{Kaynak}}</div>{{/Kaynak}}';

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
