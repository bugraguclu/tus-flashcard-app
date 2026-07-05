import { getDB } from './db';
import type { AppSettings, CardState, Card } from './types';
import { ankiCardIdFromLegacyCardId, cardStateToAnkiCard } from './ankiState';
import { createTusCard, findTusCardIdByFirstField, getAnkiCard, saveAnkiCard } from './noteManager';

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
    duplicateCards: number;
    alreadyMigrated: boolean;
    /**
     * Legacy custom Card.id -> the AnkiCard.id it now maps to (freshly created or an existing
     * duplicate). Card-state migration consults this so a custom card's legacy progress lands on
     * the right card: custom cards are re-created with timestamp-based ids, not legacyId * 1000.
     */
    legacyIdToAnkiCardId: Record<number, number>;
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
        return { migratedCards: 0, duplicateCards: 0, alreadyMigrated: true, legacyIdToAnkiCardId: {} };
    }

    let migratedCards = 0;
    let duplicateCards = 0;
    const legacyIdToAnkiCardId: Record<number, number> = {};

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const card of customCards) {
            // Dedupe by first field, the way Anki dedupes text imports. A re-import (or force) must
            // not fork an existing card; reuse it and still record the id so its progress migrates.
            const existingCardId = findTusCardIdByFirstField(card.question);
            if (existingCardId !== null) {
                legacyIdToAnkiCardId[card.id] = existingCardId;
                duplicateCards += 1;
                continue;
            }

            const { card: created } = createTusCard({
                subject: card.subject,
                topic: card.topic,
                question: card.question,
                answer: card.answer,
            });
            legacyIdToAnkiCardId[card.id] = created.id;
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

    return { migratedCards, duplicateCards, alreadyMigrated: false, legacyIdToAnkiCardId };
}

export function migrateLegacyCardStatesToAnki(
    legacyStates: Record<string, CardState>,
    settings: AppSettings,
    options: MigrationOptions = {},
    customCardIdMap: Record<number, number> = {},
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

    // Legacy progress carries scheduling state only; the old app kept no per-review history, so we
    // intentionally write no revlog rows. Migrated cards feed the queue but not history-based stats
    // (review counts, true retention) until they are reviewed again under the new scheduler.
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const [legacyId, state] of Object.entries(legacyStates)) {
            if (!options.force && !hasMeaningfulLegacyProgress(state)) {
                skippedCards++;
                continue;
            }

            const numericLegacyId = Number(legacyId);
            if (!Number.isFinite(numericLegacyId)) {
                // Corrupt (non-numeric) legacy key: nothing to resolve, skip defensively.
                skippedCards++;
                continue;
            }

            // Custom cards were re-created with fresh ids, so their progress is routed through the
            // custom-migration map; seeded TUS cards follow the fixed legacyId * 1000 rule.
            const ankiCardId = customCardIdMap[numericLegacyId] ?? ankiCardIdFromLegacyCardId(numericLegacyId);
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
