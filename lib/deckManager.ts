// Deck and deck-config storage: CRUD, name hierarchy, deck tree, and per-deck card counts.

import {
    CUSTOM_STUDY_DECK_NAME,
    CUSTOM_STUDY_MAX_VALUE,
    EMPTY_CUSTOM_STUDY_DEFAULTS,
    type CustomStudyDefaults,
    type CustomStudySessionConfig,
} from './customStudy';
import type { Deck, DeckConfig, AnkiCard } from './models';
import { DEFAULT_DECK_CONFIG, getDeckDisplayName, getParentDeckName, uniqueId } from './models';
import { DEFAULT_SECOND_SEARCH_LIMIT, FILTERED_SEARCH_ORDER } from './filteredDeckOptions';
import { getDB } from './db';
import { dayNumberToYmd, localDayNumber, nextRolloverMs, restoreQueueFromType } from './ankiState';
import { saveAnkiCard } from './noteManager';
import { markSourcePackageDirty } from './ankiPackageArchive';
import { assertCatalogDeckConfigMutable, assertCatalogDeckMutable, isCatalogDeck } from './catalogProtection';
import { getTodayLimitUsageByDeck } from './reviewLogger';

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
    assertCatalogDeckMutable(deck);
    const db = getDB();
    const existing = db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE id = ?', deck.id);
    if (existing?.data) {
        try {
            markSourcePackageDirty((JSON.parse(existing.data) as Deck).sourcePackageId);
        } catch { /* malformed legacy blobs are replaced below */ }
    }
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
        if (isCatalogDeck(deck)) continue;
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
    assertCatalogDeckMutable(deck);

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
    assertCatalogDeckMutable(deck);
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
    const parent = getParentDeckName(name);
    const deck: Deck = {
        id: now,
        name,
        configId: configId || 1,
        mod: Math.floor(now / 1000),
        usn: -1,
        description: '',
        collapsed: false,
        isFiltered: false,
        sortOrder: nextSiblingSortOrderForAppend(parent),
    };
    saveDeck(deck);

    // Ensure parent decks exist
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
        // Anki's brand-new filtered deck gathers its first filter randomly (rslib
        // Deck::new_filtered), so a deck created here starts where Anki's would.
        searchOrder: FILTERED_SEARCH_ORDER.random,
        filteredAllowEmpty: false,
        filteredDeckEmpty: false,
        filteredDoneCardIds: [],
        filteredBuildAt: now,
        sortOrder: nextSiblingSortOrderForAppend(null),
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

/**
 * Freeze any legacy alphabetical siblings into their currently visible order, then return the
 * next position. This makes every newly created deck append to its sibling list instead of being
 * inserted alphabetically. Catalog decks already carry explicit positions and are never edited.
 */
function nextSiblingSortOrderForAppend(parentName: string | null): number {
    const siblings = getAllDecks()
        .filter((deck) => getParentDeckName(deck.name) === parentName)
        .sort(compareDeckDisplayOrder);
    let nextOrder = siblings.reduce(
        (max, sibling) => Number.isFinite(sibling.sortOrder) ? Math.max(max, sibling.sortOrder!) : max,
        -1,
    ) + 1;
    const nowSec = Math.floor(Date.now() / 1000);

    for (const sibling of siblings) {
        if (Number.isFinite(sibling.sortOrder)) continue;
        // Bundled catalog trees are installed with explicit positions. Keep this guard so an
        // older catalog row can never be mutated merely because the learner adds a personal deck.
        if (isCatalogDeck(sibling)) continue;
        sibling.sortOrder = nextOrder++;
        sibling.mod = nowSec;
        sibling.usn = -1;
        saveDeck(sibling);
    }

    return nextOrder;
}

/**
 * Deck shortcuts for a collection/deck scope. Collection scope exposes root decks;
 * a deck scope exposes only its immediate children. Each returned deck can then be
 * treated as the root of its complete subtree by consumers such as Browser/Stats.
 */
export function getDirectDecksForScope(
    decks: Deck[],
    scopeName: string | null,
    includeFiltered = false,
): Deck[] {
    return decks
        .filter((deck) => (includeFiltered || !deck.isFiltered)
            && getParentDeckName(deck.name) === scopeName)
        .sort(compareDeckDisplayOrder);
}

/**
 * Return only deck branches that actually contain at least one card in the requested scope.
 *
 * Browser shortcuts used to include every persisted descendant. An early Ders/Konu migration
 * created empty descendants, so those rows surfaced as "ghost" chips even though the selected
 * deck correctly reported zero cards. Keeping the empty decks themselves is intentional (users
 * may have created them), but an empty branch is not a useful card filter.
 */
export function getPopulatedDecksForScope(
    decks: Deck[],
    cardCounts: Map<number, { total: number }>,
    scopeName: string | null,
): Deck[] {
    const candidates = decks.filter((deck) => !deck.isFiltered && (
        scopeName ? deck.name.startsWith(`${scopeName}::`) : true
    ));
    const candidateNames = new Set(candidates.map((deck) => deck.name));
    const populatedNames = new Set<string>();

    for (const deck of candidates) {
        if ((cardCounts.get(deck.id)?.total ?? 0) <= 0) continue;

        let branchName: string | null = deck.name;
        while (branchName) {
            if (candidateNames.has(branchName)) populatedNames.add(branchName);
            branchName = getParentDeckName(branchName);
        }
    }

    return candidates.filter((deck) => populatedNames.has(deck.name));
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

    // What each deck already spent of today's allowance, so the tree shows what is still to come
    // rather than the full daily allotment all over again (Anki's per-deck newToday/revToday).
    const usageByDeckId = getTodayLimitUsageByDeck(rolloverHour);
    const spent = new Map<string, { newIntroduced: number; reviewsAnswered: number }>();

    // Aggregate counts from children up
    function aggregateCounts(node: DeckTreeNode): void {
        const own = usageByDeckId.get(node.deck.id);
        const used = { newIntroduced: own?.newIntroduced ?? 0, reviewsAnswered: own?.reviewsAnswered ?? 0 };
        spent.set(node.deck.name, used);

        for (const child of node.children) {
            aggregateCounts(child);
            // Filtered decks reference cards from their home decks. In this app they are gathered
            // virtually, so adding their counts to a parent would count the same cards twice.
            if (child.deck.isFiltered) continue;
            node.newCount += child.newCount;
            node.learnCount += child.learnCount;
            node.reviewCount += child.reviewCount;
            node.totalCards += child.totalCards;
            const childUsed = spent.get(child.deck.name);
            if (childUsed) {
                used.newIntroduced += childUsed.newIntroduced;
                used.reviewsAnswered += childUsed.reviewsAnswered;
            }
        }

        // When the parent is selected, its own limits cap the total drawn from all children.
        // This keeps the deck-list number aligned with the overview/study queue instead of
        // advertising the uncapped sum of every subdeck. The cap is what today's limits still
        // allow: Anki does not hand out a deck's full allowance twice in one day.
        if (!node.deck.isFiltered) {
            const config = getDeckConfigForDeck(node.deck.id, rolloverHour);
            node.newCount = Math.min(node.newCount, Math.max(0, config.newPerDay - used.newIntroduced));
            node.reviewCount = Math.min(node.reviewCount, Math.max(0, config.maxReviewsPerDay - used.reviewsAnswered));
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

    // Anki keeps per-deck limits separate from the shared preset, so two decks can share every
    // scheduling option while retaining different daily caps.
    if (Number.isFinite(deck?.newLimit)) config.newPerDay = Math.max(0, Math.floor(deck!.newLimit!));
    if (Number.isFinite(deck?.reviewLimit)) config.maxReviewsPerDay = Math.max(0, Math.floor(deck!.reviewLimit!));

    // Anki's "today only" limit bump (custom study / deck options): layered on top of the
    // persistent config so every consumer — queue build, counts, previews — sees it at once.
    const boost = getDeckTodayBoost(deckId, rolloverHour);
    if (boost.extraNew !== 0) config.newPerDay = Math.max(0, config.newPerDay + boost.extraNew);
    if (boost.extraReview !== 0) config.maxReviewsPerDay = Math.max(0, config.maxReviewsPerDay + boost.extraReview);
    const today = getDeckTodayLimits(deckId, rolloverHour);
    if (today.newLimit !== undefined) config.newPerDay = today.newLimit;
    if (today.reviewLimit !== undefined) config.maxReviewsPerDay = today.reviewLimit;

    return config;
}

export function saveDeckConfig(config: DeckConfig): void {
    assertCatalogDeckConfigMutable(config);
    const db = getDB();
    const existing = db.getFirstSync<{ data: string }>('SELECT data FROM deck_configs WHERE id = ?', config.id);
    if (existing?.data) {
        try {
            markSourcePackageDirty((JSON.parse(existing.data) as DeckConfig).sourcePackageId);
        } catch { /* malformed legacy blobs are replaced below */ }
    }
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
    const nextName = name.normalize('NFC').trim();
    if (!nextName) throw new Error('A preset name cannot be empty.');
    if (nextName === config.name) return;
    config.name = nextName;
    saveDeckConfig(config);
}

/** Restore a preset's scheduling values while keeping its identity and import metadata. */
export function restoreDeckConfigDefaults(configId: number): DeckConfig {
    const current = getDeckConfig(configId);
    assertCatalogDeckConfigMutable(current);
    const restored: DeckConfig = {
        ...current,
        ...DEFAULT_DECK_CONFIG,
        id: current.id,
        name: current.name,
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
    };
    saveDeckConfig(restored);
    return restored;
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

interface DeckTodayLimits {
    ymd: string;
    newLimit?: number;
    reviewLimit?: number;
}

function deckTodayLimitsKey(deckId: number): string {
    return `deck_today_limits:${deckId}`;
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
            extraNew: Math.trunc(parsed.extraNew) || 0,
            extraReview: Math.trunc(parsed.extraReview) || 0,
        };
    } catch {
        return { extraNew: 0, extraReview: 0 };
    }
}

/**
 * Anki custom study "increase today's limits": adds on top of any bump already granted today.
 * A negative delta shrinks today's allowance, which is what Anki's spinner does below zero; the
 * resulting limit is floored at zero when the queue is built.
 */
export function addDeckTodayBoost(deckId: number, extraNew: number, extraReview: number, rolloverHour: number = 4): void {
    const todayLimits = getDeckTodayLimits(deckId, rolloverHour);
    if (todayLimits.newLimit !== undefined || todayLimits.reviewLimit !== undefined) {
        const effective = getDeckConfigForDeck(deckId, rolloverHour);
        const addNew = Math.trunc(extraNew) || 0;
        const addReview = Math.trunc(extraReview) || 0;
        setDeckTodayLimits(
            deckId,
            todayLimits.newLimit !== undefined || addNew !== 0 ? effective.newPerDay + addNew : undefined,
            todayLimits.reviewLimit !== undefined || addReview !== 0 ? effective.maxReviewsPerDay + addReview : undefined,
            rolloverHour,
        );
        return;
    }
    const current = getDeckTodayBoost(deckId, rolloverHour);
    const next: DeckTodayBoost = {
        ymd: todayBoostYmd(rolloverHour),
        extraNew: current.extraNew + (Math.trunc(extraNew) || 0),
        extraReview: current.extraReview + (Math.trunc(extraReview) || 0),
    };
    getDB().runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        deckBoostKey(deckId),
        JSON.stringify(next),
    );
}

/**
 * Anki's custom study "increase today's limit" (`Collection::extend_limits`). Anki grants the
 * headroom on the deck itself, and on every parent as well when a parent's limit can hold the
 * deck back — the collection-wide "limits start from the top" preference. Without that second
 * step the extra cards would be handed out by the deck and then taken away again by its parent.
 */
export function extendDeckTodayLimits(
    deckId: number,
    extraNew: number,
    extraReview: number,
    rolloverHour: number = 4,
    options: { includeParents?: boolean } = {},
): void {
    addDeckTodayBoost(deckId, extraNew, extraReview, rolloverHour);
    if (!options.includeParents) return;

    let parentName = getParentDeckName(getDeck(deckId)?.name ?? '');
    while (parentName) {
        const parent = getDeckByName(parentName);
        if (parent) addDeckTodayBoost(parent.id, extraNew, extraReview, rolloverHour);
        parentName = getParentDeckName(parentName);
    }
}

/** Absolute "Today only" limits from Anki's deck-options tabs. */
export function getDeckTodayLimits(deckId: number, rolloverHour: number = 4): { newLimit?: number; reviewLimit?: number } {
    const row = getDB().getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        deckTodayLimitsKey(deckId),
    );
    if (!row?.value) return {};
    try {
        const parsed = JSON.parse(row.value) as DeckTodayLimits;
        if (parsed.ymd !== todayBoostYmd(rolloverHour)) return {};
        const clamp = (value: unknown) => Number.isFinite(value)
            ? Math.max(0, Math.min(9999, Math.floor(value as number)))
            : undefined;
        return { newLimit: clamp(parsed.newLimit), reviewLimit: clamp(parsed.reviewLimit) };
    } catch {
        return {};
    }
}

export function setDeckTodayLimits(
    deckId: number,
    newLimit: number | undefined,
    reviewLimit: number | undefined,
    rolloverHour: number = 4,
): void {
    const clamp = (value: number | undefined) => Number.isFinite(value)
        ? Math.max(0, Math.min(9999, Math.floor(value as number)))
        : undefined;
    const next: DeckTodayLimits = {
        ymd: todayBoostYmd(rolloverHour),
        newLimit: clamp(newLimit),
        reviewLimit: clamp(reviewLimit),
    };
    getDB().runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        deckTodayLimitsKey(deckId),
        JSON.stringify(next),
    );
}

/** Save/clear Anki's "This deck" limit overrides without cloning the shared preset. */
export function setDeckLimitOverrides(deckId: number, newLimit?: number, reviewLimit?: number): void {
    const deck = getDeck(deckId);
    if (!deck) return;
    const clamp = (value: number | undefined) => Number.isFinite(value)
        ? Math.max(0, Math.min(9999, Math.floor(value as number)))
        : undefined;
    deck.newLimit = clamp(newLimit);
    deck.reviewLimit = clamp(reviewLimit);
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
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
    previewDelays?: number[];
    allowEmpty?: boolean;
}

/** Update a filtered deck's search settings (Anki's filtered-deck options dialog). */
export function updateFilteredDeck(deckId: number, options: FilteredDeckOptions): void {
    const deck = getDeck(deckId);
    if (!deck?.isFiltered) return;

    deck.searchQuery = options.searchQuery;
    deck.searchLimit = Math.max(1, Math.min(CUSTOM_STUDY_MAX_VALUE, Math.floor(options.searchLimit) || 100));
    deck.searchOrder = options.searchOrder;
    deck.searchQuery2 = options.searchQuery2?.trim() ? options.searchQuery2 : undefined;
    deck.searchLimit2 = options.searchQuery2?.trim()
        ? Math.max(1, Math.min(CUSTOM_STUDY_MAX_VALUE, Math.floor(options.searchLimit2 ?? DEFAULT_SECOND_SEARCH_LIMIT) || DEFAULT_SECOND_SEARCH_LIMIT))
        : undefined;
    deck.searchOrder2 = options.searchQuery2?.trim()
        ? (options.searchOrder2 ?? FILTERED_SEARCH_ORDER.due)
        : undefined;
    deck.reschedule = options.reschedule;
    if (options.previewDelays) {
        deck.previewDelays = options.previewDelays;
    }
    deck.filteredAllowEmpty = options.allowEmpty ?? false;
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

/** Anki reuses one conventional deck name for every custom study session. */
export const CUSTOM_STUDY_PREFIX = CUSTOM_STUDY_DECK_NAME;

function customStudyDefaultsKey(deckId: number): string {
    return `deck_custom_study:${deckId}`;
}

/**
 * The per-deck values Anki reopens the custom study dialog with: the last limit deltas, and the
 * include/exclude tags of the last "study by card state or tag" run.
 */
export function getCustomStudyDefaults(deckId: number): CustomStudyDefaults {
    const row = getDB().getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        customStudyDefaultsKey(deckId),
    );
    if (!row?.value) return EMPTY_CUSTOM_STUDY_DEFAULTS;

    try {
        const parsed = JSON.parse(row.value) as Partial<CustomStudyDefaults>;
        const tagList = (value: unknown): string[] => (Array.isArray(value)
            ? value.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
            : []);
        return {
            extendNew: Math.trunc(Number(parsed.extendNew)) || 0,
            extendReview: Math.trunc(Number(parsed.extendReview)) || 0,
            includeTags: tagList(parsed.includeTags),
            excludeTags: tagList(parsed.excludeTags),
        };
    } catch {
        return EMPTY_CUSTOM_STUDY_DEFAULTS;
    }
}

function saveCustomStudyDefaults(deckId: number, defaults: CustomStudyDefaults): void {
    getDB().runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        customStudyDefaultsKey(deckId),
        JSON.stringify(defaults),
    );
}

/** Anki only remembers a positive delta, so the dialog never reopens asking to shrink a limit. */
export function rememberCustomStudyExtend(
    deckId: number,
    field: 'extendNew' | 'extendReview',
    delta: number,
): void {
    const value = Math.trunc(delta) || 0;
    if (value <= 0) return;
    saveCustomStudyDefaults(deckId, { ...getCustomStudyDefaults(deckId), [field]: value });
}

/** Tag choices are stored only after a session was successfully built, matching Anki. */
export function rememberCustomStudyTags(deckId: number, includeTags: string[], excludeTags: string[]): void {
    saveCustomStudyDefaults(deckId, { ...getCustomStudyDefaults(deckId), includeTags, excludeTags });
}

/**
 * Create — or rebuild — Anki's single conventional Custom Study Session. Renaming the session
 * preserves it; the next Custom Study action then creates a fresh deck with the conventional name.
 * Returns null when a regular deck already owns the reserved name, which is Anki's
 * "rename the existing deck first" case.
 */
export function createOrReplaceCustomStudySession(
    baseDeckId: number,
    config: CustomStudySessionConfig,
): Deck | null {
    const base = getDeck(baseDeckId);
    if (!base || base.isFiltered) return null;

    const name = CUSTOM_STUDY_PREFIX;
    const sanitizedLimit = Math.max(1, Math.min(CUSTOM_STUDY_MAX_VALUE, Math.floor(config.limit) || CUSTOM_STUDY_MAX_VALUE));

    const existing = getDeckByName(name);
    if (existing?.isFiltered) {
        existing.searchQuery = config.search;
        existing.searchLimit = sanitizedLimit;
        existing.searchOrder = config.order;
        existing.searchQuery2 = undefined;
        existing.searchLimit2 = undefined;
        existing.searchOrder2 = undefined;
        existing.reschedule = config.reschedule;
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

    const session = createFilteredDeck(name, config.search, sanitizedLimit);
    session.searchOrder = config.order;
    session.reschedule = config.reschedule;
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
