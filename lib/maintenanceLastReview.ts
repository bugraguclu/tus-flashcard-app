/**
 * Check Database's last-review-time (`lrt`) repair, independently derived from Anki 26.09.3's
 * behaviour (https://github.com/ankitects/anki/pull/4648) and pinned to outputs recorded from
 * Anki itself in `test/fixtures/anki-26.09-fsrs-ops.json`.
 *
 * FSRS measures elapsed days from `lrt`, so a wrong value gives a wrong interval and
 * retrievability. For every non-new card with review-log rows, the right value is the time of the
 * last answer that affects scheduling after the card's last reset — the same rule as
 * `fsrsLastReviewInfo` in lib/fsrsMemory.ts: an entry with a rating that is not a cramming
 * filtered review (filtered, factor 0), counted after the last reset (manual, factor 0). Manual
 * Set Due Date and rescheduled rows carry no rating and do not count. When nothing counts, `lrt`
 * is removed. New cards and cards without any log row are left as they are.
 */

import { parseAnkiCardData, updateAnkiCardData } from './fsrsCardData';
import type { getDB } from './db';
import type { AnkiCard } from './models';

type Db = ReturnType<typeof getDB>;

export interface LastReviewTimeDefect {
    id: number;
    /** The card JSON as stored. */
    data: string;
    /** The `lrt` the card should carry, in epoch seconds; null when it should have none. */
    expectedSecs: number | null;
}

const LAST_ANSWERS_SQL = `
    SELECT c.id AS id, c.data AS data, l.answerId AS answerId, l.resetId AS resetId
    FROM anki_cards c
    JOIN (
        SELECT r.cardId AS cardId,
               MAX(CASE WHEN r.ease > 0 AND NOT (r.type = 3 AND r.factor = 0) THEN r.id END) AS answerId,
               MAX(CASE WHEN r.type = 4 AND r.factor = 0 THEN r.id END) AS resetId
        FROM revlog r
        GROUP BY r.cardId
    ) l ON l.cardId = c.id
    WHERE c.tombstone = 0 AND c.type != 0 AND json_valid(c.data) = 1`;

/** Cards whose stored `lrt` disagrees with their review log. */
export function lastReviewTimeDefects(db: Db): LastReviewTimeDefect[] {
    const rows = db.getAllSync<{ id: number; data: string; answerId: number | null; resetId: number | null }>(LAST_ANSWERS_SQL);
    const defects: LastReviewTimeDefect[] = [];
    for (const row of rows) {
        let card: AnkiCard;
        try {
            card = JSON.parse(row.data) as AnkiCard;
        } catch {
            continue;
        }
        const answerId = row.answerId === null ? null : Number(row.answerId);
        const resetId = row.resetId === null ? null : Number(row.resetId);
        const expectedSecs = answerId !== null && (resetId === null || answerId > resetId)
            ? Math.floor(answerId / 1000)
            : null;
        const stored = parseAnkiCardData(card.ankiData).lastReviewTimeSecs ?? null;
        if (stored !== expectedSecs) defects.push({ id: Number(row.id), data: row.data, expectedSecs });
    }
    return defects;
}

/** Write the expected `lrt` into the card's Anki data, leaving every other key as it was. */
export function repairLastReviewTime(db: Db, defect: LastReviewTimeDefect): void {
    const card = JSON.parse(defect.data) as AnkiCard;
    const ankiData = updateAnkiCardData(card.ankiData, { lastReviewTimeSecs: defect.expectedSecs });
    const next: AnkiCard = { ...card, ankiData };
    if (ankiData === undefined) delete next.ankiData;
    db.runSync('UPDATE anki_cards SET data = ? WHERE id = ?', JSON.stringify(next), defect.id);
}
