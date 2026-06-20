// Deck and deck-config storage: CRUD, name hierarchy, deck tree, and per-deck card counts.

import type { Deck, DeckConfig, AnkiCard } from './models';
import { DEFAULT_DECK_CONFIG, getParentDeckName, uniqueId } from './models';
import { getDB } from './db';
import { localDayNumber, restoreQueueFromType } from './ankiState';
import { saveAnkiCard } from './noteManager';

// Anki's learn-ahead limit: intraday learning cards due within this window count as due now.
const LEARN_AHEAD_MS = 20 * 60 * 1000;

/** Escape LIKE wildcards so deck names containing %, _ or \ match literally (paired with ESCAPE). */
function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function sqlPlaceholders(count: number): string {
    return Array.from({ length: count }, () => '?').join(', ');
}

// ---- Deck CRUD ----

export function getAllDecks(): Deck[] {
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>('SELECT data FROM decks ORDER BY name');
    return rows.map(r => JSON.parse(r.data));
}

export function getDeck(id: number): Deck | null {
    const db = getDB();
    const row = db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE id = ?', id);
    return row ? JSON.parse(row.data) : null;
}

export function getDeckByName(name: string): Deck | null {
    const db = getDB();
    const row = db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE name = ?', name);
    return row ? JSON.parse(row.data) : null;
}

export function saveDeck(deck: Deck): void {
    const db = getDB();
    db.runSync(
        'INSERT OR REPLACE INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
        deck.id,
        deck.name,
        JSON.stringify(deck),
        Date.now(),
        deck.usn ?? -1,
        0,
    );
}

/**
 * Delete a deck the way Anki does: a filtered deck returns its cards to their home decks and is
 * removed; a regular deck is removed together with all its subdecks and the cards in them (and any
 * note left with no cards). Everything runs in one transaction and writes sync tombstones
 * (grave types: 0=card, 1=note, 2=deck).
 */
export function deleteDeck(id: number): void {
    const db = getDB();
    const deck = getDeck(id);
    if (!deck) return;

    db.execSync('BEGIN TRANSACTION;');
    try {
        if (deck.isFiltered) {
            returnFilteredCardsHome(id);
            db.runSync('DELETE FROM decks WHERE id = ?', id);
            db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 2, -1)', id);
            db.execSync('COMMIT;');
            return;
        }

        // The deck itself plus every subdeck (matched by the "name::" prefix).
        const deckRows = db.getAllSync<{ id: number }>(
            "SELECT id FROM decks WHERE id = ? OR name LIKE ? ESCAPE '\\'",
            id,
            `${escapeLikePattern(`${deck.name}::`)}%`,
        );
        const deckIds = deckRows.map((row) => row.id);

        const cardRows = db.getAllSync<{ id: number; noteId: number }>(
            `SELECT id, noteId FROM anki_cards WHERE deckId IN (${sqlPlaceholders(deckIds.length)})`,
            ...deckIds,
        );
        const cardIds = cardRows.map((row) => row.id);
        const noteIds = [...new Set(cardRows.map((row) => row.noteId))];

        if (cardIds.length > 0) {
            const placeholders = sqlPlaceholders(cardIds.length);
            db.runSync(`DELETE FROM revlog WHERE cardId IN (${placeholders})`, ...cardIds);
            db.runSync(`DELETE FROM cards_fts WHERE card_id IN (${placeholders})`, ...cardIds.map(String));
            db.runSync(`DELETE FROM anki_cards WHERE id IN (${placeholders})`, ...cardIds);
            for (const cardId of cardIds) {
                db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 0, -1)', cardId);
            }
        }

        // A note is deleted only once it has no cards left in any other deck.
        for (const noteId of noteIds) {
            const remaining = db.getFirstSync<{ cnt: number }>(
                'SELECT COUNT(*) AS cnt FROM anki_cards WHERE noteId = ?',
                noteId,
            );
            if (!remaining || remaining.cnt === 0) {
                db.runSync('DELETE FROM notes WHERE id = ?', noteId);
                db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 1, -1)', noteId);
            }
        }

        for (const deckId of deckIds) {
            db.runSync('DELETE FROM decks WHERE id = ?', deckId);
            db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 2, -1)', deckId);
        }

        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

/** Move a filtered deck's cards back to their original decks, restoring their pre-filter schedule. */
function returnFilteredCardsHome(filteredDeckId: number): void {
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>('SELECT data FROM anki_cards WHERE deckId = ?', filteredDeckId);
    for (const row of rows) {
        const card = JSON.parse(row.data) as AnkiCard;
        card.deckId = card.odid && card.odid > 0 ? card.odid : DEFAULT_DECK_CONFIG.id;
        if (card.odue && card.odue > 0) card.due = card.odue;
        card.odid = 0;
        card.odue = 0;
        card.queue = restoreQueueFromType(card);
        saveAnkiCard(card);
    }
}

export function renameDeck(id: number, newName: string): void {
    const db = getDB();
    const deck = getDeck(id);
    if (!deck) return;
    if (newName === deck.name) return;

    // Deck names are unique; refuse to rename onto an existing (different) deck.
    const collision = getDeckByName(newName);
    if (collision && collision.id !== id) {
        throw new Error(`A deck named "${newName}" already exists.`);
    }

    const oldPrefix = `${deck.name}::`;
    const nowSec = Math.floor(Date.now() / 1000);
    const nowMs = Date.now();

    db.execSync('BEGIN TRANSACTION;');
    try {
        const rows = db.getAllSync<{ id: number; name: string; data: string }>(
            `SELECT id, name, data
             FROM decks
             WHERE id = ? OR name LIKE ? ESCAPE '\\'
             ORDER BY LENGTH(name) ASC`,
            id,
            `${escapeLikePattern(oldPrefix)}%`,
        );

        for (const row of rows) {
            const parsed = JSON.parse(row.data) as Deck;
            const resolvedName = row.id === id
                ? newName
                : `${newName}::${row.name.slice(oldPrefix.length)}`;

            parsed.name = resolvedName;
            parsed.mod = nowSec;
            parsed.usn = -1;

            db.runSync(
                `UPDATE decks
                 SET name = ?, data = ?, updated_at = ?, usn = ?, tombstone = 0
                 WHERE id = ?`,
                resolvedName,
                JSON.stringify(parsed),
                nowMs,
                parsed.usn,
                row.id,
            );
        }

        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

export function createDeck(name: string, configId?: number): Deck {
    // Deck names are unique in Anki: return the existing deck instead of creating a duplicate.
    const existing = getDeckByName(name);
    if (existing) return existing;

    const now = uniqueId();
    const deck: Deck = {
        id: now,
        name,
        configId: configId || 1,
        mod: Math.floor(now / 1000),
        usn: -1,
        description: '',
        collapsed: false,
        isFiltered: false,
    };
    saveDeck(deck);

    // Ensure parent decks exist
    const parent = getParentDeckName(name);
    if (parent && !getDeckByName(parent)) {
        createDeck(parent, configId);
    }

    return deck;
}

export function createFilteredDeck(name: string, searchQuery: string, limit?: number): Deck {
    const now = uniqueId();
    const deck: Deck = {
        id: now,
        name,
        configId: 1,
        mod: Math.floor(now / 1000),
        usn: -1,
        description: 'Filtered deck',
        collapsed: false,
        isFiltered: true,
        searchQuery,
        searchLimit: limit || 100,
        searchOrder: 0,
    };
    saveDeck(deck);
    return deck;
}

// ---- Deck Hierarchy Helpers ----

export interface DeckTreeNode {
    deck: Deck;
    children: DeckTreeNode[];
    depth: number;
    // Aggregated counts
    newCount: number;
    learnCount: number;
    reviewCount: number;
    totalCards: number;
}

export function buildDeckTree(decks: Deck[], cardCounts?: Map<number, { new: number; learn: number; review: number; total: number }>): DeckTreeNode[] {
    // Sort by name for hierarchy
    const sorted = [...decks].sort((a, b) => a.name.localeCompare(b.name));

    // Build tree
    const nodeMap = new Map<string, DeckTreeNode>();

    for (const deck of sorted) {
        const counts = cardCounts?.get(deck.id) || { new: 0, learn: 0, review: 0, total: 0 };
        const node: DeckTreeNode = {
            deck,
            children: [],
            depth: deck.name.split('::').length - 1,
            newCount: counts.new,
            learnCount: counts.learn,
            reviewCount: counts.review,
            totalCards: counts.total,
        };
        nodeMap.set(deck.name, node);
    }

    // Link children to parents
    const roots: DeckTreeNode[] = [];
    for (const [name, node] of nodeMap) {
        const parentName = getParentDeckName(name);
        if (parentName && nodeMap.has(parentName)) {
            nodeMap.get(parentName)!.children.push(node);
        } else {
            roots.push(node);
        }
    }

    // Aggregate counts from children up
    function aggregateCounts(node: DeckTreeNode): void {
        for (const child of node.children) {
            aggregateCounts(child);
            node.newCount += child.newCount;
            node.learnCount += child.learnCount;
            node.reviewCount += child.reviewCount;
            node.totalCards += child.totalCards;
        }
    }
    roots.forEach(aggregateCounts);

    return roots;
}

/** Flatten deck tree for rendering (with depth info) */
export function flattenDeckTree(nodes: DeckTreeNode[], includeCollapsed = false): DeckTreeNode[] {
    const result: DeckTreeNode[] = [];
    function walk(nodeList: DeckTreeNode[]) {
        for (const node of nodeList) {
            result.push(node);
            if (!node.deck.collapsed || includeCollapsed) {
                walk(node.children);
            }
        }
    }
    walk(nodes);
    return result;
}

// ---- Deck Config ----

export function getAllDeckConfigs(): DeckConfig[] {
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>('SELECT data FROM deck_configs');
    return rows.map(r => JSON.parse(r.data));
}

export function getDeckConfig(id: number): DeckConfig {
    const db = getDB();
    const row = db.getFirstSync<{ data: string }>('SELECT data FROM deck_configs WHERE id = ?', id);
    return row ? JSON.parse(row.data) : { ...DEFAULT_DECK_CONFIG };
}

export function getDeckConfigForDeck(deckId: number): DeckConfig {
    const deck = getDeck(deckId);
    if (!deck) {
        return getDeckConfig(DEFAULT_DECK_CONFIG.id);
    }
    return getDeckConfig(deck.configId || DEFAULT_DECK_CONFIG.id);
}

export function saveDeckConfig(config: DeckConfig): void {
    const db = getDB();
    db.runSync(
        'INSERT OR REPLACE INTO deck_configs (id, data) VALUES (?, ?)',
        config.id, JSON.stringify(config)
    );
}

// ---- Card Counts per Deck ----

export function getCardCountsByDeck(
    nowMs: number = Date.now(),
    rolloverHour: number = 4,
): Map<number, { new: number; learn: number; review: number; total: number }> {
    const db = getDB();
    const today = localDayNumber(nowMs, rolloverHour);
    // Match the study queue: intraday learning cards within the learn-ahead window count as due.
    const learnAheadCutoff = nowMs + LEARN_AHEAD_MS;

    // NOTE: `due` has queue-specific semantics in Anki:
    // - queue=1 (intraday learning): epoch milliseconds
    // - queue=3 (interday learning): study day number
    // - queue=2 (review): study day number
    // This query intentionally compares queue=1 against `nowMs` and queue=3/2 against `today`.
    const rows = db.getAllSync<{
        deckId: number;
        totalCount: number;
        newCount: number;
        learnCount: number;
        reviewCount: number;
    }>(
        `SELECT
            deckId,
            COUNT(*) AS totalCount,
            SUM(CASE WHEN queue = 0 THEN 1 ELSE 0 END) AS newCount,
            SUM(CASE
                    WHEN queue = 1 AND due <= ? THEN 1
                    WHEN queue = 3 AND due <= ? THEN 1
                    ELSE 0
                END) AS learnCount,
            SUM(CASE WHEN queue = 2 AND due <= ? THEN 1 ELSE 0 END) AS reviewCount
         FROM anki_cards
         GROUP BY deckId`,
        learnAheadCutoff,
        today,
        today,
    );

    const counts = new Map<number, { new: number; learn: number; review: number; total: number }>();
    for (const row of rows) {
        // Cap the "new" badge at the deck's daily limit like Anki. This is a start-of-day upper
        // bound: per-deck "introduced today" isn't tracked, so the study queue does the exact,
        // hierarchical, studied-today-aware capping.
        const newPerDay = Math.max(0, getDeckConfigForDeck(row.deckId).newPerDay);
        counts.set(row.deckId, {
            new: Math.min(Number(row.newCount) || 0, newPerDay),
            learn: Number(row.learnCount) || 0,
            review: Number(row.reviewCount) || 0,
            total: Number(row.totalCount) || 0,
        });
    }

    return counts;
}
