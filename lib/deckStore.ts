import { normalizeDeckName, deckNameKey } from './deckNames';
import { captureDeletion, deleteCardRows, type DeletionUndo } from './noteDeletion';
import {
    getDeckDisplayName,
    getParentDeckName,
    uniqueId,
    type Deck,
    type AnkiCard,
} from './models';
import { getDB } from './db';
import { translateActive } from './i18n';
import { localDayNumber, restoreQueueFromType } from './ankiState';
import { saveAnkiCard } from './noteManager';
import { markSourcePackageDirty } from './ankiPackageArchive';
import { clearDeckWhiteboards } from './whiteboardSession';
import { returnFilteredDeckCardsHome } from './filteredDeckReturn';
import {
    clearFilteredDeckMembership,
    readFilteredDeckMembershipRow,
    restoreFilteredDeckMembershipRow,
} from './filteredDeckMembership';
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
    const normalized = normalizeDeckName(name);
    const exact = db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE name = ?', normalized);
    if (exact) return JSON.parse(exact.data);
    // Case and Unicode folding happen in JS (SQLite's lower() is ASCII-only); scan names only and
    // read the one matching blob.
    const key = deckNameKey(normalized);
    const match = db.getAllSync<{ id: number; name: string }>('SELECT id, name FROM decks ORDER BY id')
        .find(entry => deckNameKey(entry.name) === key);
    return match ? getDeck(match.id) : null;
}

/** One snapshot of every deck name, resolving names as getDeckByName does, for batch checks. */
function deckNameIndex(): (name: string) => number | undefined {
    const rows = getDB().getAllSync<{ id: number; name: string }>('SELECT id, name FROM decks ORDER BY id');
    const exact = new Map<string, number>();
    const folded = new Map<string, number>();
    for (const row of rows) {
        if (!exact.has(row.name)) exact.set(row.name, row.id);
        const key = deckNameKey(row.name);
        if (!folded.has(key)) folded.set(key, row.id);
    }
    return (name) => {
        const normalized = normalizeDeckName(name);
        return exact.get(normalized) ?? folded.get(deckNameKey(normalized));
    };
}

function canonicalDeckPath(name: string): string {
    // Resolve all ancestors from one snapshot rather than querying each prefix recursively.
    const rows = getDB().getAllSync<{ name: string }>('SELECT name FROM decks ORDER BY id');
    const exact = new Set(rows.map(row => row.name));
    const folded = new Map<string, string>();
    for (const row of rows) if (!folded.has(deckNameKey(row.name))) folded.set(deckNameKey(row.name), row.name);
    const parts = normalizeDeckName(name).split('::');
    let path = '';
    for (const part of parts) {
        const candidate = path ? `${path}::${part}` : part;
        path = exact.has(candidate) ? candidate : folded.get(deckNameKey(candidate)) ?? candidate;
    }
    return path;
}

/** Anki's `ensure_deck_name_unique`: a clashing name gets `+` appended until it is free. */
function deckNameWithPlusSuffix(name: string, count: number): string {
    return `${name}${'+'.repeat(count)}`;
}

/** Return the requested deck path, or Anki's first free `+`-suffixed variant of it. */
export function getAvailableDeckName(name: string): string {
    name = canonicalDeckPath(name);
    if (!getDeckByName(name)) return name;

    let suffix = 1;
    let candidate = deckNameWithPlusSuffix(name, suffix);
    while (getDeckByName(candidate)) {
        suffix += 1;
        candidate = deckNameWithPlusSuffix(name, suffix);
    }
    return candidate;
}

/**
 * Resolve a collision-free destination for an entire deck subtree. The `+` suffix belongs on the
 * moved root's leaf (`Parent::Deck+`), while every descendant keeps its relative path.
 */
function getAvailableSubtreeName(deck: Deck, desiredName: string): string {
    const subtreePrefix = `${deck.name}::`;
    const subtree = getAllDecks().filter((entry) => (
        entry.id === deck.id || entry.name.startsWith(subtreePrefix)
    ));
    const subtreeIds = new Set(subtree.map((entry) => entry.id));
    const lookup = deckNameIndex();
    const collides = (candidateRoot: string) => subtree.some((entry) => {
        const candidateName = entry.id === deck.id
            ? candidateRoot
            : `${candidateRoot}::${entry.name.slice(subtreePrefix.length)}`;
        const existing = lookup(candidateName);
        return existing !== undefined && !subtreeIds.has(existing);
    });

    if (!collides(desiredName)) return desiredName;
    let suffix = 1;
    let candidate = deckNameWithPlusSuffix(desiredName, suffix);
    while (collides(candidate)) {
        suffix += 1;
        candidate = deckNameWithPlusSuffix(desiredName, suffix);
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
    const existing = db.getFirstSync<{ name: string; data: string }>('SELECT name, data FROM decks WHERE id = ?', deck.id);
    // Only creating a deck or renaming it into another deck's name collides. A legacy deck whose
    // stored name differs from another only by case or outer spaces must still save as itself.
    if (!existing || existing.name !== deck.name) {
        const collision = getDeckByName(deck.name);
        if (collision && collision.id !== deck.id) throw new Error(translateActive('decks.nameExists', { name: deck.name }));
    }
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
export function deleteDeck(id: number): DeletionUndo | undefined {
    assertCatalogDeckNotDeletable(id);
    const db = getDB();
    const deck = getDeck(id);
    if (!deck) return;
    assertCatalogDeckMutable(deck);

    const affectedDecks = getAllDecks().filter(d => d.id === id || (!deck.isFiltered && d.name.startsWith(`${deck.name}::`))).map(d => d.id);
    // Cards an imported filtered deck holds for these decks belong to them too (`odid`); Anki
    // deletes a deck's cards wherever they currently sit, so none is stranded without a home.
    const cardsOfDecksSql = deck.isFiltered
        ? `deckId IN (${sqlPlaceholders(affectedDecks.length)})`
        : `deckId IN (${sqlPlaceholders(affectedDecks.length)}) OR COALESCE(json_extract(data, '$.odid'), 0) IN (${sqlPlaceholders(affectedDecks.length)})`;
    const cardsOfDecksParams = deck.isFiltered ? affectedDecks : [...affectedDecks, ...affectedDecks];
    const affectedCards = db.getAllSync<{ id: number; noteId: number }>(`SELECT id, noteId FROM anki_cards WHERE ${cardsOfDecksSql}`, ...cardsOfDecksParams);
    const finishDeletion = captureDeletion({ deckIds: affectedDecks, cardIds: affectedCards.map(c => c.id), noteIds: [...new Set(affectedCards.map(c => c.noteId))] });
    db.execSync('BEGIN TRANSACTION;');
    try {
        if (deck.isFiltered) {
            // The same trip home as Empty and Rebuild: original deck, original due, and a
            // suspension or bury kept.
            returnFilteredDeckCardsHome(id);
            const membership = readFilteredDeckMembershipRow(id);
            clearFilteredDeckMembership(id);
            db.runSync('DELETE FROM decks WHERE id = ?', id);
            db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 2, -1)', id);
            const deletion = finishDeletion();
            db.execSync('COMMIT;');
            forgetWhiteboards([id]);
            return membership === null ? deletion : {
                cardCount: deletion.cardCount,
                undo() {
                    deletion.undo();
                    // The restored deck gets its fixed build back instead of re-gathering.
                    restoreFilteredDeckMembershipRow(id, membership);
                },
            };
        }

        // The deck itself plus every subdeck (matched by the "name::" prefix).
        const deckRows = db.getAllSync<{ id: number }>(
            "SELECT id FROM decks WHERE id = ? OR instr(name, ?) = 1",
            id,
            `${deck.name}::`,
        );
        const deckIds = deckRows.map((row) => row.id);

        const cardRows = db.getAllSync<{ id: number; noteId: number }>(
            `SELECT id, noteId FROM anki_cards WHERE deckId IN (${sqlPlaceholders(deckIds.length)})
                OR COALESCE(json_extract(data, '$.odid'), 0) IN (${sqlPlaceholders(deckIds.length)})`,
            ...deckIds,
            ...deckIds,
        );
        const cardIds = cardRows.map((row) => row.id);
        const noteIds = [...new Set(cardRows.map((row) => row.noteId))];

        deleteCardRows(cardIds);

        // A note is deleted only once it has no cards left in any other deck.
        if (noteIds.length) {
            const orphaned = db.getAllSync<{ id: number }>(
                `SELECT id FROM notes
                 WHERE id IN (SELECT value FROM json_each(?))
                   AND NOT EXISTS (SELECT 1 FROM anki_cards c WHERE c.noteId = notes.id)
                 ORDER BY id`,
                JSON.stringify(noteIds),
            ).map((row) => Number(row.id));
            if (orphaned.length) {
                db.runSync('DELETE FROM notes WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(orphaned));
                db.runSync('INSERT INTO graves (oid, type, usn) SELECT value, 1, -1 FROM json_each(?)', JSON.stringify(orphaned));
            }
        }

        for (const deckId of deckIds) {
            if (deckId === 1) {
                const defaultNameOwner = getDeckByName('Default');
                const name = defaultNameOwner && defaultNameOwner.id !== 1 ? getAvailableDeckName('Default') : 'Default';
                saveDeck({ ...getDeck(1)!, name, mod: Math.floor(Date.now() / 1000), usn: -1 });
            } else {
                db.runSync('DELETE FROM decks WHERE id = ?', deckId);
                db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 2, -1)', deckId);
            }
        }

        const deletion = finishDeletion();
        db.execSync('COMMIT;');
        forgetWhiteboards(deckIds);
        return deletion;
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

export function renameDeck(id: number, newName: string): void {
    newName = normalizeDeckName(newName);
    // Ancestors take the stored case of existing decks, as createDeck resolves them; the
    // renamed deck's own leaf keeps the case the learner typed.
    const typedParent = getParentDeckName(newName);
    if (typedParent) newName = `${canonicalDeckPath(typedParent)}::${getDeckDisplayName(newName)}`;
    assertCatalogDeckNotRenamable(id);
    const db = getDB();
    const deck = getDeck(id);
    if (!deck) return;
    assertCatalogDeckMutable(deck);
    if (newName === deck.name) return;

    // Deck names are unique; refuse to rename onto an existing (different) deck.
    const lookup = deckNameIndex();
    const collision = lookup(newName);
    if (collision !== undefined && collision !== id) {
        throw new Error(translateActive('decks.nameExists', { name: newName }));
    }

    // Validate every descendant before creating a missing target parent. A root-only collision
    // check is not enough when, for example, A::Child is moved onto an existing B::Child.
    const oldPrefix = `${deck.name}::`;
    const subtree = db.getAllSync<{ id: number; name: string }>(
        `SELECT id, name
         FROM decks
         WHERE id = ? OR instr(name, ?) = 1`,
        id,
        oldPrefix,
    );
    const subtreeIds = new Set(subtree.map((row) => row.id));
    for (const row of subtree) {
        const resolvedName = row.id === id
            ? newName
            : `${newName}::${row.name.slice(oldPrefix.length)}`;
        const target = lookup(resolvedName);
        if (target !== undefined && !subtreeIds.has(target)) {
            throw new Error(translateActive('decks.nameExists', { name: resolvedName }));
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
            if (ancestor && isCatalogDeck(ancestor)) {
                throw new PaidCatalogProtectionError('Katalog desteleri altına başka deste taşınamaz.');
            }
            ancestorName = getParentDeckName(ancestorName);
        }

        // A missing parent is a new deck, so it starts on the default preset as in Anki.
        if (!getDeckByName(newParentName)) createDeck(newParentName);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const nowMs = Date.now();

    db.execSync('BEGIN TRANSACTION;');
    try {
        const rows = db.getAllSync<{ id: number; name: string; data: string }>(
            `SELECT id, name, data
             FROM decks
             WHERE id = ? OR instr(name, ?) = 1
             ORDER BY LENGTH(name) ASC`,
            id,
            oldPrefix,
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
    name = canonicalDeckPath(name);
    const existing = getDeckByName(name);
    if (existing) return existing;

    // Validate and resolve each ancestor once, then create missing parents top-down. Re-entering
    // createDeck for every parent used to repeat all earlier prefix queries at every depth.
    const byName = new Map(getAllDecks().map(deck => [deck.name, deck]));
    const parts = name.split('::');
    const paths = parts.map((_, index) => parts.slice(0, index + 1).join('::'));
    for (const path of paths.slice(0, -1)) {
        if (byName.get(path)?.isFiltered) throw new Error('Filtrelenmiş bir destenin alt destesi olamaz.');
    }
    let destination: Deck | undefined;
    for (const path of paths) {
        const found = byName.get(path);
        if (found) { destination = found; continue; }
        const now = uniqueId();
        destination = {
            id: now, name: path, configId: configId || 1,
            mod: Math.floor(now / 1000), usn: -1, description: '', collapsed: false,
            isFiltered: false, sortOrder: nextSiblingSortOrderForAppend(getParentDeckName(path)),
        };
        saveDeck(destination);
        byName.set(path, destination);
    }
    return destination!;
}

/**
 * A deck picker's "create": an existing deck of that name (any case) is selected, as Anki's
 * chooser does, instead of creating a numbered copy. A filtered deck cannot be chosen.
 */
export function createOrSelectDeck(name: string): Deck {
    const existing = getDeckByName(canonicalDeckPath(name));
    if (existing?.isFiltered) throw new Error(translateActive('decks.filteredNameExists', { name: existing.name }));
    return existing ?? createDeck(name);
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
export function setDeckDescription(deckId: number, description: string, markdown?: boolean): void {
    const deck = getDeck(deckId);
    if (!deck) return;
    deck.description = description.trim();
    // Anki's "Interpret as Markdown" (`md`); left as it was when the caller does not say.
    if (markdown !== undefined) deck.descriptionMarkdown = markdown || undefined;
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
         WHERE c.queue IN (-2, -3) AND (d.name = ? OR instr(d.name, ?) = 1)`,
        deck.name,
        `${deck.name}::`,
    );
    return row?.cnt ?? 0;
}

/** Buried cards in the deck subtree by kind: manual (queue -3) and buried siblings (queue -2). */
export function getBuriedKindsForDeck(deckId: number): { manual: number; siblings: number } {
    const deck = getDeck(deckId);
    if (!deck) return { manual: 0, siblings: 0 };
    const row = getDB().getFirstSync<{ manual: number | null; siblings: number | null }>(
        `SELECT SUM(c.queue = -3) AS manual, SUM(c.queue = -2) AS siblings
         FROM anki_cards c
         JOIN decks d ON d.id = c.deckId
         WHERE c.queue IN (-2, -3) AND (d.name = ? OR instr(d.name, ?) = 1)`,
        deck.name,
        `${deck.name}::`,
    );
    return { manual: Number(row?.manual ?? 0), siblings: Number(row?.siblings ?? 0) };
}

/**
 * Anki's overview "Unbury": wake buried cards in the deck subtree now instead of at rollover —
 * all of them, only the manually buried ones, or only the buried siblings.
 */
export function unburyDeck(deckId: number, rolloverHour: number = 4, kind: 'all' | 'manual' | 'siblings' = 'all'): number {
    const deck = getDeck(deckId);
    if (!deck) return 0;

    const db = getDB();
    const queues = kind === 'manual' ? '(-3)' : kind === 'siblings' ? '(-2)' : '(-2, -3)';
    const rows = db.getAllSync<{ data: string }>(
        `SELECT c.data AS data
         FROM anki_cards c
         JOIN decks d ON d.id = c.deckId
         WHERE c.queue IN ${queues} AND (d.name = ? OR instr(d.name, ?) = 1)`,
        deck.name,
        `${deck.name}::`,
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

/** One deck's raw due counts. `learn` includes the interday learning cards counted separately. */
export interface DeckDueCounts {
    new: number;
    learn: number;
    review: number;
    total: number;
    /** Interday learning cards due today (queue 3); they share the review limit with reviews. */
    interdayLearn?: number;
}

export function getCardCountsByDeck(
    nowMs: number = Date.now(),
    rolloverHour: number = 4,
    learnAheadMinutes: number = 0,
): Map<number, DeckDueCounts> {
    const db = getDB();
    const today = localDayNumber(nowMs, rolloverHour);
    // The same window the study queue serves from: intraday learning cards count once they are
    // due now or within the learn-ahead limit (Anki's `learn_ahead_secs`), not hours before. A
    // badge counting a card due this evening promised a card the reviewer could not deal.
    const learnAheadCutoff = nowMs + Math.max(0, learnAheadMinutes) * 60_000;

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
        interdayLearnCount: number;
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
            SUM(CASE WHEN queue = 2 AND due <= ? THEN 1 ELSE 0 END) AS reviewCount,
            SUM(CASE WHEN queue = 3 AND due <= ? THEN 1 ELSE 0 END) AS interdayLearnCount
         FROM anki_cards
         GROUP BY deckId`,
        learnAheadCutoff,
        today,
        today,
        today,
    );

    const counts = new Map<number, DeckDueCounts>();
    for (const row of rows) {
        counts.set(row.deckId, {
            // Keep raw counts here. buildDeckTree applies the selected deck's cap after child
            // aggregation, which is required for correct parent/subdeck limit semantics.
            new: Number(row.newCount) || 0,
            learn: Number(row.learnCount) || 0,
            review: Number(row.reviewCount) || 0,
            total: Number(row.totalCount) || 0,
            interdayLearn: Number(row.interdayLearnCount) || 0,
        });
    }

    return counts;
}
