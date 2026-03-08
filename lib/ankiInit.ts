// ============================================================
// TUS Flashcard - Anki Data Initialization
// Sets up default decks, note types, and migrates TUS cards
// ============================================================

import { getDB } from './db';
import { DEFAULT_DECKS, DEFAULT_DECK_CONFIG, BUILTIN_NOTE_TYPES } from './models';
import type { Deck, DeckConfig, NoteType } from './models';
import { saveDeck } from './deckManager';
import { saveDeckConfig } from './deckManager';
import { saveNoteType, migrateTusCardsToNotes } from './noteManager';

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

/** Reset Anki data (for testing) */
export function resetAnkiData(): void {
    const db = getDB();
    db.execSync('DELETE FROM notes;');
    db.execSync('DELETE FROM anki_cards;');
    db.execSync('DELETE FROM decks;');
    db.execSync('DELETE FROM deck_configs;');
    db.execSync('DELETE FROM note_types;');
    db.execSync('DELETE FROM revlog;');
    db.execSync("DELETE FROM settings WHERE key = 'tus_anki_initialized';");
    console.log('[AnkiInit] All Anki data reset.');
}
