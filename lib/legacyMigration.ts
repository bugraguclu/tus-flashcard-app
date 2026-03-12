import { getDB } from './db';
import type { AppSettings, CardState, Card } from './types';
import { ankiCardIdFromLegacyCardId, cardStateToAnkiCard } from './ankiState';
import { createTusCard, getAnkiCard, saveAnkiCard } from './noteManager';

const LEGACY_MIGRATION_KEY = 'tus_legacy_card_state_migrated_v1';
const LEGACY_CUSTOM_CARDS_MIGRATION_KEY = 'tus_legacy_custom_cards_migrated_v1';

interface MigrationOptions {
    force?: boolean;
}

export interface LegacyMigrationResult {
    migratedCards: number;
    skippedCards: number;
    alreadyMigrated: boolean;
}

export interface LegacyCustomCardsMigrationResult {
    migratedCards: number;
    alreadyMigrated: boolean;
}

function hasMeaningfulLegacyProgress(state: CardState): boolean {
    return (
        state.status !== 'new'
        || state.interval > 0
        || state.repetition > 0
        || state.lapses > 0
        || state.suspended
        || state.buried
    );
}

export function migrateLegacyCustomCardsToAnki(
    customCards: Card[],
    options: MigrationOptions = {},
): LegacyCustomCardsMigrationResult {
    const db = getDB();
    const migrationFlag = db.getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        LEGACY_CUSTOM_CARDS_MIGRATION_KEY,
    );

    if (!options.force && migrationFlag?.value === 'true') {
        return { migratedCards: 0, alreadyMigrated: true };
    }

    let migratedCards = 0;

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const card of customCards) {
            createTusCard({
                subject: card.subject,
                topic: card.topic,
                question: card.question,
                answer: card.answer,
            });
            migratedCards += 1;
        }

        db.runSync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            LEGACY_CUSTOM_CARDS_MIGRATION_KEY,
            'true',
        );

        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return { migratedCards, alreadyMigrated: false };
}

export function migrateLegacyCardStatesToAnki(
    legacyStates: Record<string, CardState>,
    settings: AppSettings,
    options: MigrationOptions = {},
): LegacyMigrationResult {
    const db = getDB();
    const migrationFlag = db.getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        LEGACY_MIGRATION_KEY,
    );

    if (!options.force && migrationFlag?.value === 'true') {
        return { migratedCards: 0, skippedCards: 0, alreadyMigrated: true };
    }

    let migratedCards = 0;
    let skippedCards = 0;

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const [legacyId, state] of Object.entries(legacyStates)) {
            if (!options.force && !hasMeaningfulLegacyProgress(state)) {
                skippedCards++;
                continue;
            }

            const ankiCardId = ankiCardIdFromLegacyCardId(Number(legacyId));
            const card = getAnkiCard(ankiCardId);
            if (!card) {
                skippedCards++;
                continue;
            }

            // Avoid overriding progress already written by canonical flow unless forced import.
            if (!options.force && (card.reps > 0 || card.type !== 0 || card.queue !== 0)) {
                skippedCards++;
                continue;
            }

            const migrated = cardStateToAnkiCard(card, state, settings, Date.now());
            saveAnkiCard(migrated);
            migratedCards++;
        }

        db.runSync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            LEGACY_MIGRATION_KEY,
            'true',
        );

        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return { migratedCards, skippedCards, alreadyMigrated: false };
}
