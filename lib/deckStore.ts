import {
    DEFAULT_DECK_CONFIG,
    getDeckDisplayName,
    getParentDeckName,
    uniqueId,
    type Deck,
    type AnkiCard,
} from './models';
import { getDB } from './db';
import { localDayNumber, nextRolloverMs, restoreQueueFromType } from './ankiState';
import { saveAnkiCard } from './noteManager';
import { markSourcePackageDirty } from './ankiPackageArchive';
import { clearDeckWhiteboards } from './whiteboardSession';
import {
    assertCatalogDeckMutable,
    assertCatalogDeckNotDeletable,
    assertCatalogDeckNotRenamable,
    isCatalogDeck,
    PaidCatalogProtectionError,
} from './catalogProtection';


/**
 * Decks themselves: reading, naming, creating, renaming, moving and deleting them, and the
 * per-deck counts and burying that go with them.
 */

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
    assertCatalogDeckNotDeletable(id);
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
            forgetWhiteboards([id]);
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
        forgetWhiteboards(deckIds);
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

/**
 * Drop the board rows of decks that no longer exist. Runs after the commit, so a delete that rolls
 * back leaves the drawings alone, and never throws: losing a deck must not fail because a pen
 * colour could not be forgotten.
 */
function forgetWhiteboards(deckIds: number[]): void {
    for (const deckId of deckIds) {
        try {
            clearDeckWhiteboards(deckId);
        } catch (e) {
            console.warn('[Deck] Failed to clear whiteboards for deleted deck:', e);
        }
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
    assertCatalogDeckNotRenamable(id);
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

export function compareDeckDisplayOrder(a: Deck, b: Deck): number {
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
export function nextSiblingSortOrderForAppend(parentName: string | null): number {
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

/** Update a deck's description (shown on the study screen, like Anki's deck description). */
export function setDeckDescription(deckId: number, description: string): void {
    const deck = getDeck(deckId);
    if (!deck) return;
    deck.description = description.trim();
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
}

/**
 * Move a deck (with its whole subtree) under a new parent — Anki's drag-and-drop nesting.
 * `newParentName` null means "make it a top-level deck".
 */
export function moveDeckUnder(deckId: number, newParentName: string | null): string | null {
    assertCatalogDeckNotRenamable(deckId);
    const deck = getDeck(deckId);
    if (!deck) return null;

    if (newParentName) {
        const parent = getDeckByName(newParentName);
        if (parent && isCatalogDeck(parent)) {
            throw new PaidCatalogProtectionError('Katalog desteleri altına başka deste taşınamaz.');
        }
        if (deck.isFiltered) {
            throw new Error('Filtrelenmiş bir deste alt deste olamaz.');
        }
        if (newParentName === deck.name || newParentName.startsWith(`${deck.name}::`)) {
            throw new Error('Bir deste kendi altındaki bir desteye taşınamaz.');
        }
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
    assertCatalogDeckNotRenamable(deckId);
    assertCatalogDeckNotRenamable(targetDeckId);
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
