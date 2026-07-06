/**
 * Imports scheduling state and review history from a legacy .apkg collection,
 * so cards arrive with their intervals, ease and revlog instead of starting new.
 *
 * Mapping: an Anki card is identified by its note guid + template ordinal, which
 * survives our note conversion (standard notes keep ord 0, cloze ords equal
 * cloze number - 1 on both sides). Cards whose ordinal has no counterpart here
 * (e.g. the reverse card of "Basic (and reversed)") are skipped.
 *
 * Day numbers: Anki's review `due` counts days since the collection's creation
 * day (col.crt); this app counts days since the Unix epoch (lib/ankiState.ts).
 * Conversion anchors on days elapsed since crt as of now, so "due in k days"
 * stays due in k days without trusting crt's original timezone.
 */

import { getDB } from './db';
import { getCardsForNote, saveAnkiCard } from './noteManager';
import { localDayNumber } from './ankiState';
import type { AnkiCard, CardQueue, CardType } from './models';
import type { SqliteReader } from './importApkg';

const DAY_SECS = 86400;
const MAX_ANSWER_TIME_MS = 600000;
// Matches restoreQueueFromType in ankiState.ts: a (re)learning `due` below this is a
// day number (interday step), anything larger is an epoch timestamp (intraday step).
const MAX_DAY_NUMBER = 1000000;

export interface AnkiProgressCard {
    ankiCardId: number;
    guid: string;
    ord: number;
    type: number;
    queue: number;
    due: number;
    ivl: number;
    factor: number;
    reps: number;
    lapses: number;
    left: number;
    odue: number;
    odid: number;
}

export interface AnkiRevlogRow {
    id: number;
    cid: number;
    ease: number;
    ivl: number;
    lastIvl: number;
    factor: number;
    time: number;
    type: number;
}

export interface AnkiProgress {
    /** Collection creation time, epoch seconds. */
    crt: number;
    cards: AnkiProgressCard[];
    revlog: AnkiRevlogRow[];
}

/** Reads cards + revlog from the package's collection. Best-effort: a collection
 *  without readable progress tables still imports its notes. */
export function readAnkiProgress(reader: SqliteReader): AnkiProgress | null {
    try {
        const col = reader.getFirstSync<{ crt: number }>('SELECT crt FROM col LIMIT 1');
        const cards = reader.getAllSync<AnkiProgressCard>(
            `SELECT c.id AS ankiCardId, n.guid AS guid, c.ord, c.type, c.queue, c.due,
                    c.ivl, c.factor, c.reps, c.lapses, c.left, c.odue, c.odid
             FROM cards c JOIN notes n ON n.id = c.nid`,
        );
        const revlog = reader.getAllSync<AnkiRevlogRow>(
            'SELECT id, cid, ease, ivl, lastIvl, factor, time, type FROM revlog',
        );
        return { crt: Number(col?.crt) || 0, cards, revlog };
    } catch (e) {
        console.warn('[ApkgProgress] reading progress tables failed, importing notes only:', e);
        return null;
    }
}

/** Anki review-due day (days since col.crt) -> this app's days-since-epoch numbering. */
export function ankiDueDayToLocal(
    ankiDue: number,
    crt: number,
    nowMs: number,
    rolloverHour: number,
): number {
    const elapsedDays = Math.max(0, Math.floor((nowMs / 1000 - crt) / DAY_SECS));
    return localDayNumber(nowMs, rolloverHour) - elapsedDays + Math.trunc(ankiDue);
}

function clampInt(value: number, min: number, max: number): number {
    const n = Math.trunc(Number(value) || 0);
    return Math.min(max, Math.max(min, n));
}

function nonNegativeInt(value: number): number {
    return Math.max(0, Math.trunc(Number(value) || 0));
}

/**
 * Translate one Anki card row onto our already-created card. Returns null when the
 * source card is still new (nothing to carry over) so callers can skip the write.
 */
export function progressCardToAnkiCard(
    ourCard: AnkiCard,
    row: AnkiProgressCard,
    crt: number,
    nowMs: number,
    rolloverHour: number,
    lastReviewMs: number,
): AnkiCard | null {
    let type = clampInt(row.type, 0, 3) as CardType;
    let queue = clampInt(row.queue, -3, 4);
    let due = Math.trunc(Number(row.due) || 0);

    // Filtered-deck cards go home on import, the way Anki's importer rebuilds them:
    // the original due survives in odue.
    if (row.odid && row.odue) due = Math.trunc(row.odue);
    // Scheduler-v1 relearning was type 2 in a learning queue; map it to the v2+ notion.
    if (type === 2 && (queue === 1 || queue === 3)) type = 3;
    // The preview queue (filtered decks) has no meaning here; fall back to the type's home queue.
    if (queue === 4) queue = type === 0 ? 0 : type === 2 ? 2 : 1;

    const isUntouched = type === 0 && queue === 0 && nonNegativeInt(row.reps) === 0;
    if (isUntouched) return null;

    // Decode `due` per slot: new = position, review/interday-learning = day number,
    // intraday learning = epoch seconds. Suspended/buried cards fall back to their
    // durable type, with the day-number heuristic for learning cards.
    const effectiveQueue = queue < 0
        ? (type === 0 ? 0 : type === 2 ? 2 : (due > 0 && due < MAX_DAY_NUMBER ? 3 : 1))
        : queue;

    if (effectiveQueue === 2 || effectiveQueue === 3) {
        due = ankiDueDayToLocal(due, crt, nowMs, rolloverHour);
    } else if (effectiveQueue === 1) {
        // Anki stores intraday due in epoch seconds; we keep epoch ms.
        due = due > 0 ? due * 1000 : nowMs;
    }

    return {
        ...ourCard,
        type,
        queue: queue as CardQueue,
        due,
        ivl: Math.trunc(Number(row.ivl) || 0),
        factor: nonNegativeInt(row.factor),
        reps: nonNegativeInt(row.reps),
        lapses: nonNegativeInt(row.lapses),
        left: nonNegativeInt(row.left),
        lastReview: lastReviewMs,
        mod: Math.floor(nowMs / 1000),
        usn: -1,
    };
}

export interface ApplyProgressOptions {
    /** Notes created by this import run (guid -> our note id); progress is only
     *  applied to these, never to pre-existing notes a duplicate row pointed at. */
    addedNotes: { guid: string; noteId: number }[];
    rolloverHour?: number;
    nowMs?: number;
}

export interface ApplyProgressResult {
    cardsUpdated: number;
    revlogImported: number;
}

/** Writes the imported scheduling state and review history in one transaction. */
export function applyAnkiProgress(progress: AnkiProgress, options: ApplyProgressOptions): ApplyProgressResult {
    const result: ApplyProgressResult = { cardsUpdated: 0, revlogImported: 0 };
    if (progress.cards.length === 0 || options.addedNotes.length === 0) return result;

    const rolloverHour = options.rolloverHour ?? 4;
    const nowMs = options.nowMs ?? Date.now();

    // NUL separator: unlike any printable character, it can never appear inside a guid.
    const cardKey = (guid: string, ord: number) => guid + '\u0000' + ord;

    const ourCardByKey = new Map<string, AnkiCard>();
    for (const { guid, noteId } of options.addedNotes) {
        for (const card of getCardsForNote(noteId)) {
            ourCardByKey.set(cardKey(guid, card.ord), card);
        }
    }

    // Revlog is the source of truth for the last review time (Anki derives it the same way).
    const lastReviewByCid = new Map<number, number>();
    for (const rev of progress.revlog) {
        const id = Math.trunc(Number(rev.id) || 0);
        if (id > (lastReviewByCid.get(rev.cid) ?? 0)) lastReviewByCid.set(rev.cid, id);
    }

    const ourCardByAnkiId = new Map<number, AnkiCard>();

    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const row of progress.cards) {
            const ourCard = ourCardByKey.get(cardKey(row.guid, row.ord));
            if (!ourCard) continue;
            ourCardByAnkiId.set(row.ankiCardId, ourCard);

            const updated = progressCardToAnkiCard(
                ourCard, row, progress.crt, nowMs, rolloverHour, lastReviewByCid.get(row.ankiCardId) ?? 0,
            );
            if (updated) {
                saveAnkiCard(updated);
                result.cardsUpdated++;
            }
        }

        for (const rev of progress.revlog) {
            const ourCard = ourCardByAnkiId.get(rev.cid);
            if (!ourCard) continue;

            // Original epoch-ms ids are kept so history dates stay real; OR IGNORE
            // absorbs the (rare) id collision with an existing local entry.
            const inserted = db.runSync(
                `INSERT OR IGNORE INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type)
                 VALUES (?, ?, -1, ?, ?, ?, ?, ?, ?)`,
                Math.trunc(Number(rev.id) || 0),
                ourCard.id,
                clampInt(rev.ease, 1, 4),
                Math.trunc(Number(rev.ivl) || 0),
                Math.trunc(Number(rev.lastIvl) || 0),
                nonNegativeInt(rev.factor),
                clampInt(rev.time, 0, MAX_ANSWER_TIME_MS),
                clampInt(rev.type, 0, 4),
            );
            if ((inserted?.changes ?? 1) > 0) result.revlogImported++;
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return result;
}
