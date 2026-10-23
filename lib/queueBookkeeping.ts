/**
 * Housekeeping for the queue's own rows in the `settings` table.
 *
 * Two key families exist only to keep today's queue honest:
 * - `interday_review_usage:<revlogId>` marks an answer on an interday learning card, which spends a
 *   review slot although its revlog row looks like any learning step. Only answers since today's
 *   rollover are ever read, so older markers are dead weight that would otherwise grow forever.
 * - `filtered_membership_v1:<deckId>` holds a filtered deck's fixed build. A row whose deck is
 *   gone (or is no longer filtered) can never be read again.
 *
 * `pruneQueueBookkeeping` removes exactly those rows and nothing else. It is safe to call at any
 * time: at startup, on a day rollover, and right after a backup restore or a collection import has
 * replaced the revlog and the decks, where a stale marker could otherwise change today's limits.
 */

import { getDB } from './db';
import { INTERDAY_REVIEW_USAGE_PREFIX, startOfStudyDayMs } from './reviewLogger';
import { FILTERED_MEMBERSHIP_KEY_PREFIX } from './filteredDeckMembership';

export interface QueueBookkeepingPruneResult {
    interdayUsageRemoved: number;
    filteredMembershipRemoved: number;
}

const likePrefix = (prefix: string) => `${prefix.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

export function pruneQueueBookkeeping(rolloverHour: number = 4, nowMs: number = Date.now()): QueueBookkeepingPruneResult {
    const db = getDB();
    const count = (pattern: string) => Number(db.getFirstSync<{ n: number }>(
        "SELECT COUNT(*) AS n FROM settings WHERE key LIKE ? ESCAPE '\\'", pattern,
    )?.n ?? 0);
    const usagePattern = likePrefix(INTERDAY_REVIEW_USAGE_PREFIX);
    const membershipPattern = likePrefix(FILTERED_MEMBERSHIP_KEY_PREFIX);
    const usageBefore = count(usagePattern);
    const membershipBefore = count(membershipPattern);
    const usageId = `CAST(substr(settings.key, ${INTERDAY_REVIEW_USAGE_PREFIX.length + 1}) AS INTEGER)`;
    const deckId = `CAST(substr(settings.key, ${FILTERED_MEMBERSHIP_KEY_PREFIX.length + 1}) AS INTEGER)`;
    db.runSync(
        `DELETE FROM settings WHERE key LIKE ? ESCAPE '\\'
           AND (${usageId} < ? OR NOT EXISTS (SELECT 1 FROM revlog r WHERE r.id = ${usageId}))`,
        usagePattern,
        startOfStudyDayMs(nowMs, rolloverHour),
    );
    db.runSync(
        `DELETE FROM settings WHERE key LIKE ? ESCAPE '\\'
           AND NOT EXISTS (SELECT 1 FROM decks d WHERE d.id = ${deckId}
                           AND COALESCE(json_extract(d.data, '$.isFiltered'), 0) != 0)`,
        membershipPattern,
    );
    return {
        interdayUsageRemoved: usageBefore - count(usagePattern),
        filteredMembershipRemoved: membershipBefore - count(membershipPattern),
    };
}
