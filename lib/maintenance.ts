/**
 * Collection maintenance, in ascending order of consequence:
 *
 * 1. `runDailyMaintenance` — once-a-day housekeeping tied to Anki's day boundary. When a new day
 *    begins (per the deck's rollover hour) the cards buried the previous day are released back to
 *    their normal queues. Guarded to run at most once per day, so it is safe to call on startup
 *    and on every app foreground.
 * 2. `checkDatabase` — the read-only audit behind Settings › "Veritabanını kontrol et".
 * 3. `repairDatabase` / `optimizeDatabase` — the mutating pass behind "Onar ve optimize et".
 *
 * The audit and the repair share one definition of every defect, so the button can never claim to
 * fix something the audit does not see, or leave behind something the audit keeps reporting.
 */

import { Platform } from 'react-native';
import { localDayNumber, restoreQueueFromType } from './ankiState';
import { isCatalogNote } from './catalogProtection';
import { dbIndexAllCards, getDB } from './db';
import type { AnkiCard, Deck } from './models';
import { DEFAULT_DECK_CONFIG, uniqueId } from './models';
import { todayLocalYMD } from './scheduler';
import { getSearchIndexCards, unburyAllCards } from './noteManager';
import { getDbSetting, loadSettings, setDbSetting } from './storage';

type Db = ReturnType<typeof getDB>;

const LAST_MAINTENANCE_KEY = 'tus_last_maintenance';

export function runDailyMaintenance(): { unburiedCount: number; didRun: boolean } {
    const settings = loadSettings();
    const today = todayLocalYMD(undefined, settings.dayRolloverHour);

    if (getDbSetting(LAST_MAINTENANCE_KEY) === today) {
        return { unburiedCount: 0, didRun: false };
    }

    const unburiedCount = unburyAllCards(settings.dayRolloverHour);

    // Record the run only after the work succeeds, so a failure retries next time.
    setDbSetting(LAST_MAINTENANCE_KEY, today);

    return { unburiedCount, didRun: true };
}

/** A card no live note owns: it can never render, and no editor can reach it. */
const ORPHAN_CARDS_WHERE = `c.tombstone = 0
      AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.id = c.noteId AND n.tombstone = 0)`;

/** A note with no cards left: its text is stored but nothing schedules or shows it. */
const ORPHAN_NOTES_WHERE = `n.tombstone = 0
      AND NOT EXISTS (SELECT 1 FROM anki_cards c WHERE c.noteId = n.id AND c.tombstone = 0)`;

/** A card pointing at a deck row that is gone, so no deck list or study queue can reach it. */
const STRANDED_CARDS_WHERE = `c.tombstone = 0
      AND NOT EXISTS (SELECT 1 FROM decks d WHERE d.id = c.deckId)`;

/**
 * A card still carrying filtered-deck bookkeeping while the deck it sits in is not filtered.
 * Anki's `check_filtered_cards` clears `original_deck_id` and `original_due` for exactly this row
 * and deliberately leaves `due` alone, so a card left behind by a half-finished filtered-deck
 * teardown stops pointing at a home deck it is never going back to.
 *
 * A card whose deck row is gone entirely is a stranded card instead, and is rehomed rather than
 * cleared, so the two sets cannot overlap.
 *
 * Source: `rslib/src/dbcheck.rs` → `check_filtered_cards`.
 */
const FILTERED_LEFTOVER_CARDS_WHERE = `c.tombstone = 0
      AND json_valid(c.data) = 1
      AND COALESCE(json_extract(c.data, '$.odid'), 0) <> 0
      AND EXISTS (
        SELECT 1 FROM decks d
        WHERE d.id = c.deckId
          AND COALESCE(CASE WHEN json_valid(d.data) = 1 THEN json_extract(d.data, '$.isFiltered') END, 0) <> 1
      )`;

/**
 * An interval SQLite will store but the scheduler cannot use: negative, fractional, or past the
 * 32-bit ceiling. Anki rounds and clamps it into `[0, 2147483647]`.
 *
 * Source: `rslib/src/storage/card/fix_ivl.sql`.
 */
const INVALID_INTERVAL_CARDS_WHERE = `c.tombstone = 0
      AND c.ivl <> min(max(round(c.ivl), 0), 2147483647)`;

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

/**
 * `round()` in SQLite rounds a half away from zero; `Math.round` rounds it towards +infinity.
 * The repair has to agree with the query that selected the row, or a card would be rewritten to a
 * value the next audit reports all over again.
 */
function sqliteRound(value: number): number {
    return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * A new card whose queue position ran past the million Anki reserves for positions. Anki folds it
 * back into the reserved block rather than deleting the card, so the learner keeps it and only
 * loses its place in the pile. The preview queue is exempt: a card being previewed inside a
 * filtered deck carries a different meaning in `due`.
 *
 * A position is a plain counter in both collections, so this rule ports unchanged.
 *
 * Source: `rslib/src/storage/card/fix_due_new.sql`.
 */
const HIGH_POSITION_NEW_CARDS_WHERE = `c.tombstone = 0
      AND c.type = 0
      AND c.queue <> 4
      AND c.due >= 1000000
      AND c.due <> 1000000 + c.due % 1000000`;

/** The value `HIGH_POSITION_NEW_CARDS_WHERE` measures each row against. */
function wrappedNewCardPosition(due: number): number {
    return 1000000 + (Math.trunc(due) % 1000000);
}

/**
 * A `due` the scheduler cannot act on. Anki's rule is: a review card scheduled past day 100000 is
 * pulled back to today, and anything else is rounded and clamped into a 32-bit integer.
 *
 * Two notes on moving that rule to this collection, because one constant only survives by
 * accident and the other cannot come along at all:
 *
 * - Our day numbers count from the Unix epoch rather than from the collection's creation day, so
 *   a review due today is around 20,700 rather than the few thousand upstream sees. Day 100000 is
 *   still centuries away (it lands in 2243), so the threshold keeps meaning "no calendar reaches
 *   here" and is left where upstream put it.
 * - A learning step is stored here in milliseconds and upstream in seconds. Upstream's 32-bit
 *   clamp fits a timestamp in seconds until 2038; ours would move every card mid-step to January
 *   1970. So a card whose type is learning or relearning keeps a `due` that is large enough to be
 *   a timestamp, whatever queue it is parked in — suspending a card mid-step does not turn its
 *   timestamp into a day number.
 *
 * Rows `HIGH_POSITION_NEW_CARDS_WHERE` owns are excluded: upstream runs that statement first and
 * then measures the already-wrapped value, and a wrapped position is inside the 32-bit range, so
 * excluding them reproduces the same outcome without depending on the order two loops happen to run in.
 *
 * Source: `rslib/src/storage/card/fix_due_other.sql`.
 */
function invalidDueCardsWhere(today: number): string {
    return `c.tombstone = 0
      AND NOT (c.type = 0 AND c.queue <> 4 AND c.due >= 1000000)
      AND c.due <> CASE
            WHEN c.queue = 2 AND c.due > 100000 THEN ${today}
            WHEN c.type IN (1, 3) AND c.due >= 1000000 THEN c.due
            ELSE min(max(round(c.due), ${INT32_MIN}), ${INT32_MAX})
          END`;
}

/** The value `invalidDueCardsWhere` measures each row against. */
function repairedDue(card: { type: number; queue: number; due: number }, today: number): number {
    if (card.queue === 2 && card.due > 100000) return today;
    if ((card.type === 1 || card.type === 3) && card.due >= 1000000) return card.due;
    return Math.min(Math.max(sqliteRound(card.due), INT32_MIN), INT32_MAX);
}

/**
 * A template ordinal outside the range a note type can address. Anki clamps rather than deletes:
 * whether a template exists at the clamped ordinal is a separate defect with a separate repair, and
 * this one only stops the value itself from being nonsense.
 *
 * Source: `rslib/src/storage/card/fix_ordinal.sql`.
 */
const INVALID_ORDINAL_CARDS_WHERE = `c.tombstone = 0
      AND c.ord <> max(0, min(30000, c.ord))`;

/** The value `INVALID_ORDINAL_CARDS_WHERE` measures each row against. */
function clampedOrdinal(ord: number): number {
    return Math.max(0, Math.min(30000, ord));
}

/**
 * A card holding the due it had before a filtered deck took it, while nothing says it was ever in
 * one. `FILTERED_LEFTOVER_CARDS_WHERE` covers the opposite half — a home deck recorded on a card
 * sitting in a deck that is not filtered — so between them a card cannot keep filtered-deck
 * bookkeeping it has no use for. A new card is left alone: upstream's condition names the learning
 * and review states only.
 *
 * Only the zeroing branch is ported. Upstream also clamps a surviving `odue` to 32 bits, which
 * would truncate the millisecond timestamp a card pulled into a filtered deck mid-step carries
 * here, for the reason `invalidDueCardsWhere` explains.
 *
 * Source: `rslib/src/storage/card/fix_odue.sql`.
 */
const ORPHANED_ORIGINAL_DUE_CARDS_WHERE = `c.tombstone = 0
      AND json_valid(c.data) = 1
      AND COALESCE(json_extract(c.data, '$.odue'), 0) > 0
      AND COALESCE(json_extract(c.data, '$.odid'), 0) = 0
      AND (c.type = 1 OR c.queue = 2)`;

/**
 * A note whose blob no longer parses, or that lost its `fields` array. The mirrored columns hold
 * no field text, so nothing can rebuild it: this defect is reported and never repaired.
 *
 * CASE, not OR: SQLite documents CASE as evaluating its branches in order, while `json_type` on
 * malformed input raises an error that would abort the whole query.
 */
const UNREADABLE_NOTES_WHERE = `n.tombstone = 0
      AND CASE WHEN json_valid(n.data) = 0 THEN 1
               ELSE json_type(n.data, '$.fields') IS NOT 'array' END`;

function countRows(db: Db, from: string, where: string): number {
    try {
        return db.getFirstSync<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM ${from} WHERE ${where}`)?.cnt ?? 0;
    } catch (e) {
        // One unavailable SQL function (a build without JSON1) must not take the audit down with it.
        console.warn('[Maintenance] audit query failed:', e);
        return 0;
    }
}

export interface DatabaseCheckResult {
    /** 'ok', SQLite's first reported corruption message, or 'check_failed'. */
    integrity: string;
    /** Live cards whose note row is missing or deleted. */
    orphanCards: number;
    /** Live notes that no longer have any cards. */
    orphanNotes: number;
    /** Live cards sitting in a deck that no longer exists. */
    strandedCards: number;
    /** Live cards carrying filtered-deck bookkeeping while their deck is not filtered. */
    filteredLeftoverCards: number;
    /** Live cards whose interval is negative, fractional, or past the 32-bit ceiling. */
    invalidIntervalCards: number;
    /** Live new cards whose queue position ran past the million reserved for positions. */
    highPositionNewCards: number;
    /** Live cards whose due date the scheduler cannot act on. */
    invalidDueCards: number;
    /** Live cards whose template ordinal is outside the range a note type can address. */
    invalidOrdinalCards: number;
    /** Live cards holding a pre-filter due while nothing says they were ever in a filtered deck. */
    orphanedOriginalDueCards: number;
    /** Live notes whose stored JSON no longer parses. Reported only. */
    unreadableNotes: number;
}

/** Rows `repairDatabase` can actually fix. `unreadableNotes` is reported but never rewritten. */
export function repairableDefectCount(result: DatabaseCheckResult): number {
    return result.orphanCards + result.orphanNotes + result.strandedCards
        + result.filteredLeftoverCards + result.invalidIntervalCards
        + result.highPositionNewCards + result.invalidDueCards
        + result.invalidOrdinalCards + result.orphanedOriginalDueCards;
}

/** Every defect the audit found, whether or not the repair can fix it. */
export function totalDefectCount(result: DatabaseCheckResult): number {
    return repairableDefectCount(result) + result.unreadableNotes;
}

/**
 * Read-only database audit. Repair is deliberately a separate call so a button labelled "Check"
 * never rewrites the learner's collection without explicit consent.
 */
export function checkDatabase(): DatabaseCheckResult {
    const db = getDB();

    let integrity = 'ok';
    try {
        const row = db.getFirstSync<Record<string, unknown>>('PRAGMA quick_check');
        const value = row ? String(Object.values(row)[0] ?? '') : '';
        if (value) {
            integrity = value;
            if (value !== 'ok') console.warn('[Maintenance] Database integrity issue:', value);
        }
    } catch (e) {
        console.warn('[Maintenance] Database integrity check failed:', e);
        integrity = 'check_failed';
    }

    return {
        integrity,
        orphanCards: countRows(db, 'anki_cards c', ORPHAN_CARDS_WHERE),
        orphanNotes: countRows(db, 'notes n', ORPHAN_NOTES_WHERE),
        strandedCards: countRows(db, 'anki_cards c', STRANDED_CARDS_WHERE),
        filteredLeftoverCards: countRows(db, 'anki_cards c', FILTERED_LEFTOVER_CARDS_WHERE),
        invalidIntervalCards: countRows(db, 'anki_cards c', INVALID_INTERVAL_CARDS_WHERE),
        highPositionNewCards: countRows(db, 'anki_cards c', HIGH_POSITION_NEW_CARDS_WHERE),
        invalidDueCards: countRows(db, 'anki_cards c', invalidDueCardsWhere(localDayNumber(Date.now(), loadSettings().dayRolloverHour))),
        invalidOrdinalCards: countRows(db, 'anki_cards c', INVALID_ORDINAL_CARDS_WHERE),
        orphanedOriginalDueCards: countRows(db, 'anki_cards c', ORPHANED_ORIGINAL_DUE_CARDS_WHERE),
        unreadableNotes: countRows(db, 'notes n', UNREADABLE_NOTES_WHERE),
    };
}

/** Where rescued cards land, matching the name the catalog-revoke path already uses. */
export const RECOVERY_DECK_NAME = 'Kurtarılan Kartlar';

export interface DatabaseRepairResult {
    /** Cards deleted because no live note owned them. */
    orphanCardsDeleted: number;
    /** Notes deleted because they had no cards left to study. */
    orphanNotesDeleted: number;
    /** Cards moved into a real deck after the deck they pointed at disappeared. */
    strandedCardsRehomed: number;
    /** Cards whose leftover filtered-deck bookkeeping was cleared. */
    filteredLeftoversCleared: number;
    /** Cards whose interval was rounded and clamped back into range. */
    intervalsClamped: number;
    /** New cards whose queue position was folded back into the reserved block. */
    newCardPositionsWrapped: number;
    /** Cards whose due was pulled back to today or rounded into range. */
    duesRepaired: number;
    /** Cards whose template ordinal was clamped into range. */
    ordinalsClamped: number;
    /** Cards whose leftover pre-filter due was cleared. */
    originalDuesCleared: number;
    /** Rows left untouched on purpose because the paid catalog owns them. */
    protectedRowsKept: number;
    /** Notes whose JSON cannot be parsed; counted so the UI can say they need manual attention. */
    unreadableNotes: number;
    /** The deck rescued cards were put in, or null when none needed rescuing. */
    recoveryDeckName: string | null;
}

export function emptyRepairResult(): DatabaseRepairResult {
    return {
        orphanCardsDeleted: 0,
        orphanNotesDeleted: 0,
        strandedCardsRehomed: 0,
        filteredLeftoversCleared: 0,
        intervalsClamped: 0,
        newCardPositionsWrapped: 0,
        duesRepaired: 0,
        ordinalsClamped: 0,
        originalDuesCleared: 0,
        protectedRowsKept: 0,
        unreadableNotes: 0,
        recoveryDeckName: null,
    };
}

/** True when the repair actually rewrote something, so callers know to refresh the collection. */
export function repairChangedRows(result: DatabaseRepairResult): boolean {
    return result.orphanCardsDeleted > 0
        || result.orphanNotesDeleted > 0
        || result.strandedCardsRehomed > 0
        || result.filteredLeftoversCleared > 0
        || result.intervalsClamped > 0;
}

function deckNameTaken(db: Db, name: string): boolean {
    return db.getFirstSync<{ id: number }>('SELECT id FROM decks WHERE name = ?', name) !== null;
}

/**
 * The deck stranded cards are moved into. An existing regular deck with the recovery name is
 * reused so repeated repairs collect in one place; a filtered deck holding that name is not,
 * because a filtered deck would strand the cards again the moment it is emptied.
 */
function ensureRecoveryDeck(db: Db): { id: number; name: string } {
    const existing = db.getFirstSync<{ id: number; name: string }>(
        `SELECT id, name FROM decks
         WHERE name = ?
           AND COALESCE(CASE WHEN json_valid(data) = 1 THEN json_extract(data, '$.isFiltered') END, 0) <> 1`,
        RECOVERY_DECK_NAME,
    );
    if (existing) return { id: Number(existing.id), name: String(existing.name) };

    let name = RECOVERY_DECK_NAME;
    for (let suffix = 2; deckNameTaken(db, name); suffix += 1) {
        name = `${RECOVERY_DECK_NAME} ${suffix}`;
    }

    const id = uniqueId();
    const deck: Deck = {
        id,
        name,
        configId: DEFAULT_DECK_CONFIG.id,
        mod: Math.floor(id / 1000),
        usn: -1,
        description: '',
        collapsed: false,
        isFiltered: false,
    };
    db.runSync(
        'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, -1, 0)',
        id,
        deck.name,
        JSON.stringify(deck),
        Date.now(),
    );
    return { id, name };
}

interface StrandedCardRow {
    id: number;
    noteId: number;
    data: string;
    /** The card's home deck while it sits in a filtered deck; 0 when it is not in one. */
    odid: number | null;
}

/**
 * Put a card back somewhere reachable. A card whose *filtered* deck vanished still knows its home
 * deck in `odid`, so it goes home with its pre-filter schedule restored — the same restoration
 * `deleteDeck` performs. Anything else lands in the recovery deck, where the learner can find it.
 */
function rehomeStrandedCard(
    db: Db,
    row: StrandedCardRow,
    rolloverHour: number,
    recoveryDeckId: () => number,
): void {
    const now = Date.now();
    const homeDeckId = row.odid && row.odid > 0
        ? db.getFirstSync<{ id: number }>('SELECT id FROM decks WHERE id = ?', row.odid)?.id ?? null
        : null;

    let card: AnkiCard | null = null;
    try {
        card = JSON.parse(row.data) as AnkiCard;
    } catch {
        // The blob is already beyond repair. Fixing the mirrored column at least returns the card
        // to a deck the queue queries can see, which is strictly better than leaving it stranded.
        db.runSync(
            'UPDATE anki_cards SET deckId = ?, updated_at = ?, usn = -1 WHERE id = ?',
            homeDeckId ?? recoveryDeckId(),
            now,
            row.id,
        );
        return;
    }

    if (homeDeckId !== null) {
        card.deckId = homeDeckId;
        if (card.odue && card.odue > 0) card.due = card.odue;
        card.odid = 0;
        card.odue = 0;
        card.queue = restoreQueueFromType(card, rolloverHour);
    } else {
        card.deckId = recoveryDeckId();
    }
    card.mod = Math.floor(now / 1000);
    card.usn = -1;

    db.runSync(
        'UPDATE anki_cards SET deckId = ?, queue = ?, due = ?, data = ?, updated_at = ?, usn = -1 WHERE id = ?',
        card.deckId,
        card.queue,
        card.due,
        JSON.stringify(card),
        now,
        row.id,
    );
}

/**
 * Fix the rows `checkDatabase` reports, as one transaction so a failure cannot leave the
 * collection half-repaired.
 *
 * Deleted rows get a `graves` entry exactly like a manual delete, so the removal can still
 * propagate on a later sync. Their `revlog` rows are deliberately kept: a repair the learner did
 * not ask for by name must not shrink the lifetime review history the statistics screens count.
 * Paid-catalog rows are never deleted or moved — a broken catalog install is repaired by
 * reinstalling it, not by dismantling the protected tree.
 */
export function repairDatabase(): DatabaseRepairResult {
    const db = getDB();
    const result = emptyRepairResult();
    result.unreadableNotes = countRows(db, 'notes n', UNREADABLE_NOTES_WHERE);

    // Read the work list before opening the transaction: the defects are independent, so none of
    // these sets can grow because of another's repair.
    const orphanCards = db.getAllSync<{ id: number; noteId: number }>(
        `SELECT c.id AS id, c.noteId AS noteId FROM anki_cards c WHERE ${ORPHAN_CARDS_WHERE}`,
    );
    const orphanNotes = db.getAllSync<{ id: number }>(
        `SELECT n.id AS id FROM notes n WHERE ${ORPHAN_NOTES_WHERE}`,
    );
    // json_extract raises on a malformed blob, and a card can be stranded *and* unreadable; the
    // CASE keeps that card in the work list instead of failing the whole repair on its behalf.
    const strandedCards = db.getAllSync<StrandedCardRow>(
        `SELECT c.id AS id, c.noteId AS noteId, c.data AS data,
                CASE WHEN json_valid(c.data) = 1 THEN json_extract(c.data, '$.odid') END AS odid
         FROM anki_cards c WHERE ${STRANDED_CARDS_WHERE}`,
    );

    const filteredLeftovers = db.getAllSync<{ id: number; data: string }>(
        `SELECT c.id AS id, c.data AS data FROM anki_cards c WHERE ${FILTERED_LEFTOVER_CARDS_WHERE}`,
    );
    const invalidIntervals = db.getAllSync<{ id: number; ivl: number }>(
        `SELECT c.id AS id, c.ivl AS ivl FROM anki_cards c WHERE ${INVALID_INTERVAL_CARDS_WHERE}`,
    );

    // The card-property defects are read inside the transaction instead, after the deletes and the
    // rehoming have run: a card can be stranded *and* carry a bad due, and reading its property
    // afterwards means the repair measures the row it is about to write rather than the row as it
    // stood before another repair moved it.
    const rolloverHour = loadSettings().dayRolloverHour;
    const today = localDayNumber(Date.now(), rolloverHour);
    const propertyDefects = countRows(db, 'anki_cards c', HIGH_POSITION_NEW_CARDS_WHERE)
        + countRows(db, 'anki_cards c', invalidDueCardsWhere(today))
        + countRows(db, 'anki_cards c', INVALID_ORDINAL_CARDS_WHERE)
        + countRows(db, 'anki_cards c', ORPHANED_ORIGINAL_DUE_CARDS_WHERE);

    if (orphanCards.length === 0 && orphanNotes.length === 0 && strandedCards.length === 0
        && filteredLeftovers.length === 0 && invalidIntervals.length === 0 && propertyDefects === 0) {
        return result;
    }

    let recoveryDeck: { id: number; name: string } | null = null;
    const resolveRecoveryDeck = () => {
        if (recoveryDeck === null) {
            recoveryDeck = ensureRecoveryDeck(db);
            result.recoveryDeckName = recoveryDeck.name;
        }
        return recoveryDeck.id;
    };

    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const card of orphanCards) {
            // Only reachable when a catalog note row survives as a tombstone: a card whose note row
            // is simply gone cannot resolve to catalog ownership, and is safe to remove.
            if (isCatalogNote(card.noteId)) {
                result.protectedRowsKept += 1;
                continue;
            }
            db.runSync('DELETE FROM cards_fts WHERE card_id = ?', String(card.id));
            db.runSync('DELETE FROM anki_cards WHERE id = ?', card.id);
            db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 0, -1)', card.id);
            result.orphanCardsDeleted += 1;
        }

        for (const note of orphanNotes) {
            if (isCatalogNote(note.id)) {
                result.protectedRowsKept += 1;
                continue;
            }
            db.runSync('DELETE FROM notes WHERE id = ?', note.id);
            db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, 1, -1)', note.id);
            result.orphanNotesDeleted += 1;
        }

        for (const card of strandedCards) {
            if (isCatalogNote(card.noteId)) {
                result.protectedRowsKept += 1;
                continue;
            }
            rehomeStrandedCard(db, card, rolloverHour, resolveRecoveryDeck);
            result.strandedCardsRehomed += 1;
        }

        // Scheduling state is the learner's, not the catalog's — the same reason flags and tags
        // are open on a protected note. A catalog card stranded in a filtered deck that no longer
        // exists would otherwise stay unstudyable forever, so these two run over every row.
        for (const card of filteredLeftovers) {
            let parsed: Partial<AnkiCard>;
            try {
                parsed = JSON.parse(card.data) as Partial<AnkiCard>;
            } catch {
                continue; // Counted as unreadable rather than repaired here.
            }
            // Anki clears both markers and leaves `due` alone: the card stays where its current
            // schedule puts it instead of being sent back to a due it may have outgrown.
            const next = { ...parsed, odid: 0, odue: 0 };
            db.runSync('UPDATE anki_cards SET data = ? WHERE id = ?', JSON.stringify(next), card.id);
            result.filteredLeftoversCleared += 1;
        }

        for (const card of invalidIntervals) {
            const clamped = Math.min(Math.max(Math.round(card.ivl), 0), 2147483647);
            db.runSync('UPDATE anki_cards SET ivl = ? WHERE id = ?', clamped, card.id);
            // The mirrored column is the scheduler's source of truth, but the JSON blob carries a
            // copy, so leaving it behind would let the next read put the bad value back.
            db.runSync(
                `UPDATE anki_cards SET data = json_set(data, '$.ivl', ?) WHERE id = ? AND json_valid(data) = 1`,
                clamped,
                card.id,
            );
            result.intervalsClamped += 1;
        }

        for (const card of db.getAllSync<{ id: number; due: number }>(
            `SELECT c.id AS id, c.due AS due FROM anki_cards c WHERE ${HIGH_POSITION_NEW_CARDS_WHERE}`,
        )) {
            writeCardNumber(db, card.id, 'due', wrappedNewCardPosition(card.due));
            result.newCardPositionsWrapped += 1;
        }

        for (const card of db.getAllSync<{ id: number; type: number; queue: number; due: number }>(
            `SELECT c.id AS id, c.type AS type, c.queue AS queue, c.due AS due
             FROM anki_cards c WHERE ${invalidDueCardsWhere(today)}`,
        )) {
            writeCardNumber(db, card.id, 'due', repairedDue(card, today));
            result.duesRepaired += 1;
        }

        for (const card of db.getAllSync<{ id: number; ord: number }>(
            `SELECT c.id AS id, c.ord AS ord FROM anki_cards c WHERE ${INVALID_ORDINAL_CARDS_WHERE}`,
        )) {
            writeCardNumber(db, card.id, 'ord', clampedOrdinal(card.ord));
            result.ordinalsClamped += 1;
        }

        // `odue` lives only in the blob; there is no mirrored column for it.
        for (const card of db.getAllSync<{ id: number }>(
            `SELECT c.id AS id FROM anki_cards c WHERE ${ORPHANED_ORIGINAL_DUE_CARDS_WHERE}`,
        )) {
            db.runSync(
                `UPDATE anki_cards SET data = json_set(data, '$.odue', 0) WHERE id = ?`,
                card.id,
            );
            result.originalDuesCleared += 1;
        }

        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return result;
}

/**
 * Write one mirrored numeric card field. The column is what the scheduler reads, but the JSON blob
 * carries a copy, so leaving it behind would let the next read put the bad value straight back.
 */
function writeCardNumber(db: Db, cardId: number, field: 'due' | 'ord', value: number): void {
    db.runSync(`UPDATE anki_cards SET "${field}" = ? WHERE id = ?`, value, cardId);
    db.runSync(
        `UPDATE anki_cards SET data = json_set(data, '$.${field}', ?) WHERE id = ? AND json_valid(data) = 1`,
        value,
        cardId,
    );
}

/** The steps "Onar ve optimize et" runs, in order. */
export type MaintenanceStep = 'repair' | 'reindex' | 'analyze' | 'search' | 'compact';

export interface DatabaseOptimizeResult {
    repair: DatabaseRepairResult;
    /** Cards rebuilt into the FTS index (always 0 on web, which has no FTS). */
    ftsReindexed: number;
    /** Bytes VACUUM handed back to the filesystem; 0 when the size pragmas are unavailable. */
    freedBytes: number;
    /** Steps that failed. Every other step still ran. */
    failedSteps: MaintenanceStep[];
}

function pragmaValue(db: Db, pragma: string): number {
    const row = db.getFirstSync<Record<string, unknown>>(`PRAGMA ${pragma}`);
    return row ? Number(Object.values(row)[0] ?? 0) : 0;
}

/** File size from SQLite's own page accounting; 0 when either pragma is unavailable. */
function databaseByteSize(db: Db): number {
    try {
        const pageCount = pragmaValue(db, 'page_count');
        const pageSize = pragmaValue(db, 'page_size');
        return pageCount > 0 && pageSize > 0 ? pageCount * pageSize : 0;
    } catch (e) {
        console.warn('[Maintenance] database size unavailable:', e);
        return 0;
    }
}

function rebuildSearchIndex(): number {
    if (Platform.OS === 'web') return 0; // sql.js ships without FTS5, so there is no index to rebuild.
    const cards = getSearchIndexCards();
    dbIndexAllCards(cards);
    return cards.length;
}

/**
 * Mutating maintenance; callers must obtain confirmation and a safety backup first — use
 * `optimizeDatabaseWithBackup` rather than calling this from a screen.
 *
 * Each step is isolated: a collection SQLite refuses to VACUUM (no temp space, say) must still get
 * its search index rebuilt, and the caller is told exactly which steps did not finish rather than
 * being handed one failure for the whole button.
 */
export function optimizeDatabase(): DatabaseOptimizeResult {
    const db = getDB();
    const failedSteps: MaintenanceStep[] = [];
    const step = (name: MaintenanceStep, work: () => void) => {
        try {
            work();
        } catch (error) {
            console.warn(`[Maintenance] ${name} step failed:`, error);
            failedSteps.push(name);
        }
    };

    let repair = emptyRepairResult();
    step('repair', () => { repair = repairDatabase(); });

    // Anki's storage optimization, resequenced so each step can profit from the one before it:
    // REINDEX rebuilds the persistent indexes, ANALYZE refreshes the query planner's statistics,
    // the search index is rebuilt from the now-consistent rows, and VACUUM runs last because it is
    // the only step that can hand the pages every earlier step freed back to the filesystem.
    step('reindex', () => db.execSync('REINDEX;'));
    step('analyze', () => db.execSync('ANALYZE;'));

    let ftsReindexed = 0;
    step('search', () => { ftsReindexed = rebuildSearchIndex(); });

    const sizeBefore = databaseByteSize(db);
    let freedBytes = 0;
    step('compact', () => {
        db.execSync('VACUUM;');
        freedBytes = Math.max(0, sizeBefore - databaseByteSize(db));
    });

    return { repair, ftsReindexed, freedBytes, failedSteps };
}
