// ============================================================
// TUS Flashcard - Deck Manager
// Hierarchical deck management (Anki-compatible)
// ============================================================

import type { Deck, DeckConfig, AnkiCard } from './models';
import { DEFAULT_DECK_CONFIG, getDeckDisplayName, getDeckChildren, getParentDeckName, uniqueId } from './models';
import { getDB } from './db';

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
        'INSERT OR REPLACE INTO decks (id, name, data) VALUES (?, ?, ?)',
        deck.id, deck.name, JSON.stringify(deck)
    );
}

export function deleteDeck(id: number): void {
    const db = getDB();
    db.runSync('DELETE FROM decks WHERE id = ?', id);
}

export function renameDeck(id: number, newName: string): void {
    const deck = getDeck(id);
    if (!deck) return;

    const oldPrefix = deck.name + '::';
    const allDecks = getAllDecks();

    // Rename the deck itself
    deck.name = newName;
    deck.mod = Math.floor(Date.now() / 1000);
    saveDeck(deck);

    // Rename all children
    for (const child of allDecks) {
        if (child.name.startsWith(oldPrefix)) {
            const newChildName = newName + '::' + child.name.slice(oldPrefix.length);
            child.name = newChildName;
            child.mod = Math.floor(Date.now() / 1000);
            saveDeck(child);
        }
    }
}

export function createDeck(name: string, configId?: number): Deck {
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

export function saveDeckConfig(config: DeckConfig): void {
    const db = getDB();
    db.runSync(
        'INSERT OR REPLACE INTO deck_configs (id, data) VALUES (?, ?)',
        config.id, JSON.stringify(config)
    );
}

// ---- Card Counts per Deck ----

export function getCardCountsByDeck(nowMs: number = Date.now()): Map<number, { new: number; learn: number; review: number; total: number }> {
    const db = getDB();
    const rows = db.getAllSync<{ deckId: number; queue: number; due: number }>(
        'SELECT deckId, queue, due FROM anki_cards'
    );

    const today = Math.floor(new Date(new Date(nowMs).setHours(0, 0, 0, 0)).getTime() / 86400000);
    const counts = new Map<number, { new: number; learn: number; review: number; total: number }>();

    for (const row of rows) {
        if (!counts.has(row.deckId)) {
            counts.set(row.deckId, { new: 0, learn: 0, review: 0, total: 0 });
        }

        const entry = counts.get(row.deckId)!;
        entry.total += 1;

        if (row.queue === -1 || row.queue === -2 || row.queue === -3) {
            continue;
        }

        if (row.queue === 0) {
            entry.new += 1;
            continue;
        }

        if ((row.queue === 1 || row.queue === 3) && row.due <= nowMs) {
            entry.learn += 1;
            continue;
        }

        if (row.queue === 2 && row.due <= today) {
            entry.review += 1;
        }
    }

    return counts;
}
