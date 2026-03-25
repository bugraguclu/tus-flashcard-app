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

const MIGRATE_NEW_LIMIT_KEY = 'tus_migrate_new_limit_v1';

/** Migrate existing users from dailyNewLimit 20 → 9999 (effectively unlimited for TUS prep) */
export function migrateNewCardLimit(): void {
    const db = getDB();
    const row = db.getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        MIGRATE_NEW_LIMIT_KEY,
    );
    if (row?.value === 'done') return;

    try {
        const configRow = db.getFirstSync<{ data: string }>('SELECT data FROM deck_configs WHERE id = 1');
        if (configRow?.data) {
            const config = JSON.parse(configRow.data) as DeckConfig;
            if (config.newPerDay === 20) {
                config.newPerDay = DEFAULT_DECK_CONFIG.newPerDay; // 9999
                saveDeckConfig(config);
                console.log('[AnkiInit] Migrated dailyNewLimit from 20 → 9999');
            }
        }
    } catch (e) {
        console.warn('[AnkiInit] migrateNewCardLimit failed:', e);
    }

    db.runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        MIGRATE_NEW_LIMIT_KEY, 'done',
    );
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
