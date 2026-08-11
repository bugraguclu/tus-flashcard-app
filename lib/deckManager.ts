// Deck and deck-config storage: CRUD, name hierarchy, deck tree, and per-deck card counts.

import type { Deck, DeckConfig, AnkiCard } from './models';
import { DEFAULT_DECK_CONFIG, getDeckDisplayName, getParentDeckName, uniqueId } from './models';
import { getDB } from './db';
import { dayNumberToYmd, localDayNumber, nextRolloverMs, restoreQueueFromType } from './ankiState';
import { saveAnkiCard } from './noteManager';

/** Escape LIKE wildcards so deck names containing %, _ or \ match literally (paired with ESCAPE). */
function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function sqlPlaceholders(count: number): string {
    return Array.from({ length: count }, () => '?').join(', ');
}

const DECK_DISCLOSURE_DEFAULTS_KEY = 'deck_disclosure_defaults_v1';

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

function deckNameWithNumericSuffix(name: string, suffix: number): string {
    const parent = getParentDeckName(name);
    const leaf = getDeckDisplayName(name);
    const numberedLeaf = `${leaf} (${suffix})`;
    return parent ? `${parent}::${numberedLeaf}` : numberedLeaf;
}

/** Return the requested deck path, or the first free PC-style `(n)` variant of its leaf name. */
export function getAvailableDeckName(name: string): string {
    if (!getDeckByName(name)) return name;

    let suffix = 1;
    let candidate = deckNameWithNumericSuffix(name, suffix);
    while (getDeckByName(candidate)) {
        suffix += 1;
        candidate = deckNameWithNumericSuffix(name, suffix);
    }
    return candidate;
}

/**
 * Resolve a collision-free destination for an entire deck subtree. The suffix belongs on the
 * moved root's leaf (`Parent::Deck (1)`), while every descendant keeps its relative path.
 */
function getAvailableSubtreeName(deck: Deck, desiredName: string): string {
    const subtreePrefix = `${deck.name}::`;
    const subtree = getAllDecks().filter((entry) => (
        entry.id === deck.id || entry.name.startsWith(subtreePrefix)
    ));
    const subtreeIds = new Set(subtree.map((entry) => entry.id));
    const collides = (candidateRoot: string) => subtree.some((entry) => {
        const candidateName = entry.id === deck.id
            ? candidateRoot
            : `${candidateRoot}::${entry.name.slice(subtreePrefix.length)}`;
        const existing = getDeckByName(candidateName);
        return Boolean(existing && !subtreeIds.has(existing.id));
    });

    if (!collides(desiredName)) return desiredName;
    let suffix = 1;
    let candidate = deckNameWithNumericSuffix(desiredName, suffix);
    while (collides(candidate)) {
        suffix += 1;
        candidate = deckNameWithNumericSuffix(desiredName, suffix);
    }
    return candidate;
}

/** Resolve a collision-free rename destination while preserving a deck's complete subtree. */
export function getAvailableDeckSubtreeName(deckId: number, desiredName: string): string {
    const deck = getDeck(deckId);
    return deck ? getAvailableSubtreeName(deck, desiredName) : desiredName;
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
 * Existing collections used to open every deck level because `collapsed` defaulted to false.
 * Apply Anki-like first-run disclosure once: top-level decks reveal their immediate children, and
 * deeper parent decks wait for the user's explicit expansion. Later clicks are persisted normally.
 */
export function initializeDeckDisclosureDefaults(): void {
    const db = getDB();
    const applied = db.getFirstSync<{ value?: string }>(
        'SELECT value FROM settings WHERE key = ?',
        DECK_DISCLOSURE_DEFAULTS_KEY,
    );
    if (applied) return;

    const decks = getAllDecks();
    const parentNames = new Set<string>();
    for (const deck of decks) {
        const parent = getParentDeckName(deck.name);
        if (parent) parentNames.add(parent);
    }

    for (const deck of decks) {
        const depth = deck.name.split('::').length - 1;
        if (depth >= 1 && parentNames.has(deck.name) && deck.collapsed !== true) {
            saveDeck({ ...deck, collapsed: true });
        }
    }

    db.runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        DECK_DISCLOSURE_DEFAULTS_KEY,
        'true',
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

    // Validate every descendant before creating a missing target parent. A root-only collision
    // check is not enough when, for example, A::Child is moved onto an existing B::Child.
    const oldPrefix = `${deck.name}::`;
    const subtree = db.getAllSync<{ id: number; name: string }>(
        `SELECT id, name
         FROM decks
         WHERE id = ? OR name LIKE ? ESCAPE '\\'`,
        id,
        `${escapeLikePattern(oldPrefix)}%`,
    );
    const subtreeIds = new Set(subtree.map((row) => row.id));
    for (const row of subtree) {
        const resolvedName = row.id === id
            ? newName
            : `${newName}::${row.name.slice(oldPrefix.length)}`;
        const target = getDeckByName(resolvedName);
        if (target && !subtreeIds.has(target.id)) {
            throw new Error(`A deck named "${resolvedName}" already exists.`);
        }
    }

    const newParentName = getParentDeckName(newName);
    if (newParentName) {
        if (deck.isFiltered) {
            throw new Error('Filtrelenmiş bir deste alt deste olamaz.');
        }
        if (newParentName === deck.name || newParentName.startsWith(`${deck.name}::`)) {
            throw new Error('Bir deste kendi altındaki bir desteye taşınamaz.');
        }

        let ancestorName: string | null = newParentName;
        while (ancestorName) {
            const ancestor = getDeckByName(ancestorName);
            if (ancestor?.isFiltered) {
                throw new Error('Filtrelenmiş bir destenin alt destesi olamaz.');
            }
            ancestorName = getParentDeckName(ancestorName);
        }

        if (!getDeckByName(newParentName)) createDeck(newParentName, deck.configId);
    }

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

    // Anki filtered decks are always top-level and may not contain regular subdecks.
    let ancestorName = getParentDeckName(name);
    while (ancestorName) {
        const ancestor = getDeckByName(ancestorName);
        if (ancestor?.isFiltered) {
            throw new Error('Filtrelenmiş bir destenin alt destesi olamaz.');
        }
        ancestorName = getParentDeckName(ancestorName);
    }

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
        filteredDeckEmpty: false,
        filteredDoneCardIds: [],
        filteredBuildAt: now,
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

function compareDeckDisplayOrder(a: Deck, b: Deck): number {
    const aOrder = Number.isFinite(a.sortOrder) ? a.sortOrder! : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(b.sortOrder) ? b.sortOrder! : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
}

export function buildDeckTree(
    decks: Deck[],
    cardCounts?: Map<number, { new: number; learn: number; review: number; total: number }>,
    rolloverHour: number = 4,
): DeckTreeNode[] {
    // Legacy collections without a manual position stay alphabetical. As soon as the user
    // reorders siblings, their persisted sortOrder takes precedence.
    const sorted = [...decks].sort(compareDeckDisplayOrder);

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

    const sortBranch = (nodes: DeckTreeNode[]) => {
        nodes.sort((a, b) => compareDeckDisplayOrder(a.deck, b.deck));
        nodes.forEach((node) => sortBranch(node.children));
    };
    sortBranch(roots);

    // Aggregate counts from children up
    function aggregateCounts(node: DeckTreeNode): void {
        for (const child of node.children) {
            aggregateCounts(child);
            // Filtered decks reference cards from their home decks. In this app they are gathered
            // virtually, so adding their counts to a parent would count the same cards twice.
            if (child.deck.isFiltered) continue;
            node.newCount += child.newCount;
            node.learnCount += child.learnCount;
            node.reviewCount += child.reviewCount;
            node.totalCards += child.totalCards;
        }

        // When the parent is selected, its own limits cap the total drawn from all children.
        // This keeps the deck-list number aligned with the overview/study queue instead of
        // advertising the uncapped sum of every subdeck.
        if (!node.deck.isFiltered) {
            const config = getDeckConfigForDeck(node.deck.id, rolloverHour);
            node.newCount = Math.min(node.newCount, Math.max(0, config.newPerDay));
            node.reviewCount = Math.min(node.reviewCount, Math.max(0, config.maxReviewsPerDay));
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

export function getDeckConfigForDeck(deckId: number, rolloverHour: number = 4): DeckConfig {
    const deck = getDeck(deckId);
    const config = getDeckConfig(deck?.configId || DEFAULT_DECK_CONFIG.id);

    // Anki's "today only" limit bump (custom study / deck options): layered on top of the
    // persistent config so every consumer — queue build, counts, previews — sees it at once.
    const boost = getDeckTodayBoost(deckId, rolloverHour);
    if (boost.extraNew > 0) config.newPerDay += boost.extraNew;
    if (boost.extraReview > 0) config.maxReviewsPerDay += boost.extraReview;

    return config;
}

export function saveDeckConfig(config: DeckConfig): void {
    const db = getDB();
    db.runSync(
        'INSERT OR REPLACE INTO deck_configs (id, data) VALUES (?, ?)',
        config.id, JSON.stringify(config)
    );
}

// ---- Presets (Anki: deck options presets shared across decks) ----

/** Decks currently assigned to a config/preset. */
export function getDecksUsingConfig(configId: number): Deck[] {
    return getAllDecks().filter((deck) => (deck.configId || DEFAULT_DECK_CONFIG.id) === configId);
}

/** Create a new preset, cloned from an existing config (default: the shared preset). */
export function createPreset(name: string, cloneFromId: number = DEFAULT_DECK_CONFIG.id): DeckConfig {
    const base = getDeckConfig(cloneFromId);
    const preset: DeckConfig = { ...base, id: uniqueId(), name: name.trim() || 'Yeni Ayar Grubu' };
    saveDeckConfig(preset);
    return preset;
}

export function renamePreset(configId: number, name: string): void {
    const config = getDeckConfig(configId);
    config.name = name.trim() || config.name;
    saveDeckConfig(config);
}

/** Delete a preset; decks using it fall back to the shared default. The default itself stays. */
export function deletePreset(configId: number): void {
    if (configId === DEFAULT_DECK_CONFIG.id) return;

    for (const deck of getDecksUsingConfig(configId)) {
        deck.configId = DEFAULT_DECK_CONFIG.id;
        deck.mod = Math.floor(Date.now() / 1000);
        deck.usn = -1;
        saveDeck(deck);
    }
    getDB().runSync('DELETE FROM deck_configs WHERE id = ?', configId);
}

export function assignDeckConfig(deckId: number, configId: number): void {
    const deck = getDeck(deckId);
    if (!deck) return;
    deck.configId = configId;
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
}

/** Anki's "save to all subdecks": every subdeck adopts this deck's preset. */
export function applyConfigToSubdecks(deckId: number): number {
    const deck = getDeck(deckId);
    if (!deck) return 0;

    const prefix = `${deck.name}::`;
    let changed = 0;
    for (const candidate of getAllDecks()) {
        if (!candidate.name.startsWith(prefix) || candidate.isFiltered) continue;
        if ((candidate.configId || DEFAULT_DECK_CONFIG.id) === (deck.configId || DEFAULT_DECK_CONFIG.id)) continue;
        candidate.configId = deck.configId || DEFAULT_DECK_CONFIG.id;
        candidate.mod = Math.floor(Date.now() / 1000);
        candidate.usn = -1;
        saveDeck(candidate);
        changed++;
    }
    return changed;
}

/** Update a deck's description (shown on the study screen, like Anki's deck description). */
export function setDeckDescription(deckId: number, description: string): void {
    const deck = getDeck(deckId);
    if (!deck) return;
    deck.description = description.trim();
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
}

// ---- Deck options: limits, today-only boosts, moving, custom study ----

function deckBoostKey(deckId: number): string {
    return `deck_today_boost:${deckId}`;
}

interface DeckTodayBoost {
    ymd: string;
    extraNew: number;
    extraReview: number;
}

function todayBoostYmd(rolloverHour: number): string {
    return dayNumberToYmd(localDayNumber(Date.now(), rolloverHour), rolloverHour);
}

/** Today's one-day limit bump for a deck; expires automatically at the day rollover. */
export function getDeckTodayBoost(deckId: number, rolloverHour: number = 4): { extraNew: number; extraReview: number } {
    const db = getDB();
    const row = db.getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        deckBoostKey(deckId),
    );
    if (!row?.value) return { extraNew: 0, extraReview: 0 };

    try {
        const parsed = JSON.parse(row.value) as DeckTodayBoost;
        if (parsed.ymd !== todayBoostYmd(rolloverHour)) return { extraNew: 0, extraReview: 0 };
        return {
            extraNew: Math.max(0, Math.floor(parsed.extraNew) || 0),
            extraReview: Math.max(0, Math.floor(parsed.extraReview) || 0),
        };
    } catch {
        return { extraNew: 0, extraReview: 0 };
    }
}

/** Anki custom study "increase today's limits": adds on top of any bump already granted today. */
export function addDeckTodayBoost(deckId: number, extraNew: number, extraReview: number, rolloverHour: number = 4): void {
    const current = getDeckTodayBoost(deckId, rolloverHour);
    const next: DeckTodayBoost = {
        ymd: todayBoostYmd(rolloverHour),
        extraNew: current.extraNew + Math.max(0, Math.floor(extraNew) || 0),
        extraReview: current.extraReview + Math.max(0, Math.floor(extraReview) || 0),
    };
    getDB().runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        deckBoostKey(deckId),
        JSON.stringify(next),
    );
}

/**
 * Persistent per-deck daily limits (Anki deck options "this deck"). The first edit splits the
 * deck off the shared preset onto its own config, so sibling decks keep their existing limits.
 */
export function setDeckLimits(deckId: number, newPerDay: number, maxReviewsPerDay: number): void {
    const deck = getDeck(deckId);
    if (!deck) return;

    const clamp = (value: number, fallback: number) =>
        Number.isFinite(value) ? Math.max(0, Math.min(9999, Math.floor(value))) : fallback;

    if (!deck.configId || deck.configId === DEFAULT_DECK_CONFIG.id) {
        const base = getDeckConfig(DEFAULT_DECK_CONFIG.id);
        const config: DeckConfig = {
            ...base,
            id: uniqueId(),
            name: getDeckDisplayName(deck.name),
            newPerDay: clamp(newPerDay, base.newPerDay),
            maxReviewsPerDay: clamp(maxReviewsPerDay, base.maxReviewsPerDay),
        };
        saveDeckConfig(config);

        deck.configId = config.id;
        deck.mod = Math.floor(Date.now() / 1000);
        deck.usn = -1;
        saveDeck(deck);
        return;
    }

    const config = getDeckConfig(deck.configId);
    config.newPerDay = clamp(newPerDay, config.newPerDay);
    config.maxReviewsPerDay = clamp(maxReviewsPerDay, config.maxReviewsPerDay);
    saveDeckConfig(config);
}

/**
 * Move a deck (with its whole subtree) under a new parent — Anki's drag-and-drop nesting.
 * `newParentName` null means "make it a top-level deck".
 */
export function moveDeckUnder(deckId: number, newParentName: string | null): string | null {
    const deck = getDeck(deckId);
    if (!deck) return null;

    if (newParentName) {
        if (deck.isFiltered) {
            throw new Error('Filtrelenmiş bir deste alt deste olamaz.');
        }
        if (newParentName === deck.name || newParentName.startsWith(`${deck.name}::`)) {
            throw new Error('Bir deste kendi altındaki bir desteye taşınamaz.');
        }
        const parent = getDeckByName(newParentName);
        if (!parent) throw new Error('Hedef deste bulunamadı.');
        if (parent.isFiltered) throw new Error('Filtrelenmiş bir destenin alt destesi olamaz.');
    }

    const leaf = getDeckDisplayName(deck.name);
    const targetName = newParentName ? `${newParentName}::${leaf}` : leaf;
    if (targetName === deck.name) return deck.name;
    const availableName = getAvailableDeckSubtreeName(deck.id, targetName);
    renameDeck(deckId, availableName);
    return availableName;
}

/**
 * Place a deck immediately before/after another deck. If they have different parents, the
 * dragged deck (and its subtree) first moves beside the target, then the sibling order is saved.
 */
export function reorderDeckRelative(
    deckId: number,
    targetDeckId: number,
    placement: 'before' | 'after',
): string {
    const deck = getDeck(deckId);
    const target = getDeck(targetDeckId);
    if (!deck || !target) throw new Error('Deste bulunamadı.');
    if (deck.id === target.id) return deck.name;
    if (target.name.startsWith(`${deck.name}::`)) {
        throw new Error('Bir deste kendi altındaki bir destenin yanına taşınamaz.');
    }

    const targetParent = getParentDeckName(target.name);
    if (deck.isFiltered && targetParent) {
        throw new Error('Filtrelenmiş bir deste alt deste olamaz.');
    }

    const nextName = targetParent
        ? `${targetParent}::${getDeckDisplayName(deck.name)}`
        : getDeckDisplayName(deck.name);
    if (nextName !== deck.name) moveDeckUnder(deck.id, targetParent);

    const moved = getDeck(deck.id);
    if (!moved) throw new Error('Taşınan deste bulunamadı.');
    const siblings = getAllDecks()
        .filter((entry) => getParentDeckName(entry.name) === targetParent && entry.id !== moved.id)
        .sort(compareDeckDisplayOrder);
    const targetIndex = siblings.findIndex((entry) => entry.id === target.id);
    if (targetIndex < 0) throw new Error('Hedef deste bulunamadı.');

    siblings.splice(placement === 'before' ? targetIndex : targetIndex + 1, 0, moved);
    const nowSec = Math.floor(Date.now() / 1000);
    for (let index = 0; index < siblings.length; index++) {
        const sibling = siblings[index];
        if (sibling.sortOrder === index) continue;
        sibling.sortOrder = index;
        sibling.mod = nowSec;
        sibling.usn = -1;
        saveDeck(sibling);
    }
    return moved.name;
}

/** Persist the disclosure state of a deck row, matching Anki's remembered deck tree. */
export function setDeckCollapsed(deckId: number, collapsed: boolean): void {
    const deck = getDeck(deckId);
    if (!deck || deck.collapsed === collapsed) return;
    deck.collapsed = collapsed;
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
}

/** Buried-card count (sched- or user-buried) inside a deck subtree, for the overview screen. */
export function getBuriedCountForDeck(deckId: number): number {
    const deck = getDeck(deckId);
    if (!deck) return 0;

    const row = getDB().getFirstSync<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt
         FROM anki_cards c
         JOIN decks d ON d.id = c.deckId
         WHERE c.queue IN (-2, -3) AND (d.name = ? OR d.name LIKE ? ESCAPE '\\')`,
        deck.name,
        `${escapeLikePattern(deck.name)}::%`,
    );
    return row?.cnt ?? 0;
}

/** Anki's overview "Unbury": wake every buried card in the deck subtree now instead of at rollover. */
export function unburyDeck(deckId: number, rolloverHour: number = 4): number {
    const deck = getDeck(deckId);
    if (!deck) return 0;

    const db = getDB();
    const rows = db.getAllSync<{ data: string }>(
        `SELECT c.data AS data
         FROM anki_cards c
         JOIN decks d ON d.id = c.deckId
         WHERE c.queue IN (-2, -3) AND (d.name = ? OR d.name LIKE ? ESCAPE '\\')`,
        deck.name,
        `${escapeLikePattern(deck.name)}::%`,
    );
    if (rows.length === 0) return 0;

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const row of rows) {
            const card: AnkiCard = JSON.parse(row.data);
            card.queue = restoreQueueFromType(card, rolloverHour);
            saveAnkiCard(card);
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
    return rows.length;
}

export interface FilteredDeckOptions {
    searchQuery: string;
    searchLimit: number;
    searchOrder: number;
    searchQuery2?: string;
    searchLimit2?: number;
    searchOrder2?: number;
    reschedule: boolean;
}

/** Update a filtered deck's search settings (Anki's filtered-deck options dialog). */
export function updateFilteredDeck(deckId: number, options: FilteredDeckOptions): void {
    const deck = getDeck(deckId);
    if (!deck?.isFiltered) return;

    deck.searchQuery = options.searchQuery;
    deck.searchLimit = Math.max(1, Math.min(9999, Math.floor(options.searchLimit) || 100));
    deck.searchOrder = options.searchOrder;
    deck.searchQuery2 = options.searchQuery2?.trim() ? options.searchQuery2 : undefined;
    deck.searchLimit2 = options.searchQuery2?.trim()
        ? Math.max(1, Math.min(9999, Math.floor(options.searchLimit2 ?? 100) || 100))
        : undefined;
    deck.searchOrder2 = options.searchQuery2?.trim() ? (options.searchOrder2 ?? 0) : undefined;
    deck.reschedule = options.reschedule;
    // Saving filtered-deck options is Anki's Build/Rebuild action.
    deck.filteredDeckEmpty = false;
    deck.filteredDoneCardIds = [];
    deck.filteredBuildAt = Date.now();
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
}

/** Empty a filtered deck without deleting its saved search or the cards in their home decks. */
export function emptyFilteredDeck(deckId: number): boolean {
    const deck = getDeck(deckId);
    if (!deck?.isFiltered) return false;
    deck.filteredDeckEmpty = true;
    deck.filteredDoneCardIds = [];
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
    return true;
}

/** Rebuild a previously emptied filtered deck from its saved search. */
export function rebuildFilteredDeck(deckId: number): boolean {
    const deck = getDeck(deckId);
    if (!deck?.isFiltered) return false;
    deck.filteredDeckEmpty = false;
    deck.filteredDoneCardIds = [];
    deck.filteredBuildAt = Date.now();
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
    return true;
}

/** Retire one card from the current filtered-deck build after it has completed its steps. */
export function completeFilteredCard(deckId: number, cardId: number): boolean {
    const deck = getDeck(deckId);
    if (!deck?.isFiltered) return false;
    const completed = new Set(deck.filteredDoneCardIds ?? []);
    if (completed.has(cardId)) return false;
    completed.add(cardId);
    deck.filteredDoneCardIds = [...completed];
    deck.usn = -1;
    saveDeck(deck);
    return true;
}

/** Put a completed card back into the active filtered build when its answer is undone. */
export function restoreFilteredCard(deckId: number, cardId: number): boolean {
    const deck = getDeck(deckId);
    if (!deck?.isFiltered || !deck.filteredDoneCardIds?.includes(cardId)) return false;
    deck.filteredDoneCardIds = deck.filteredDoneCardIds.filter((id) => id !== cardId);
    deck.usn = -1;
    saveDeck(deck);
    return true;
}

export const CUSTOM_STUDY_PREFIX = 'Özel Çalışma Oturumu';

/**
 * Create — or rebuild — Anki's single conventional Custom Study Session. Renaming the session
 * preserves it; the next Custom Study action then creates a fresh deck with the conventional name.
 */
export function createOrReplaceCustomStudySession(
    baseDeckId: number,
    searchQuery: string,
    limit: number = 100,
    options: { reschedule?: boolean; searchOrder?: number } = {},
): Deck | null {
    const base = getDeck(baseDeckId);
    if (!base || base.isFiltered) return null;

    const name = CUSTOM_STUDY_PREFIX;
    const sanitizedLimit = Math.max(1, Math.min(9999, Math.floor(limit) || 100));

    const existing = getDeckByName(name);
    if (existing?.isFiltered) {
        existing.searchQuery = searchQuery;
        existing.searchLimit = sanitizedLimit;
        existing.searchOrder = options.searchOrder ?? 0;
        existing.searchQuery2 = undefined;
        existing.reschedule = options.reschedule ?? true;
        existing.filteredDeckEmpty = false;
        existing.filteredDoneCardIds = [];
        existing.filteredBuildAt = Date.now();
        existing.mod = Math.floor(Date.now() / 1000);
        existing.usn = -1;
        saveDeck(existing);
        return existing;
    }

    // A regular deck using Anki's reserved conventional name must not be overwritten.
    if (existing) return null;

    const session = createFilteredDeck(name, searchQuery, sanitizedLimit);
    session.searchOrder = options.searchOrder ?? 0;
    session.reschedule = options.reschedule ?? true;
    session.filteredDeckEmpty = false;
    session.filteredDoneCardIds = [];
    session.filteredBuildAt = Date.now();
    saveDeck(session);
    return session;
}

// ---- Card Counts per Deck ----

export function getCardCountsByDeck(
    nowMs: number = Date.now(),
    rolloverHour: number = 4,
    learnAheadMinutes: number = 0,
): Map<number, { new: number; learn: number; review: number; total: number }> {
    const db = getDB();
    const today = localDayNumber(nowMs, rolloverHour);
    // Anki deck-list semantics: intraday learning cards count until the day rolls over, even
    // while their step timer is still running — the badge answers "how much is left today",
    // not "what can be dealt this second". Learn-ahead can only widen that window.
    const learnAheadCutoff = Math.max(
        nextRolloverMs(nowMs, rolloverHour),
        nowMs + Math.max(0, learnAheadMinutes) * 60_000,
    );

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
        counts.set(row.deckId, {
            // Keep raw counts here. buildDeckTree applies the selected deck's cap after child
            // aggregation, which is required for correct parent/subdeck limit semantics.
            new: Number(row.newCount) || 0,
            learn: Number(row.learnCount) || 0,
            review: Number(row.reviewCount) || 0,
            total: Number(row.totalCount) || 0,
        });
    }

    return counts;
}
