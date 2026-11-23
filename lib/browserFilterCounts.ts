import { getDB } from './db';
import type { CardFlag } from './models';
import { BROWSER_FROM, buildBrowserWhere, type BrowserCardQuery } from './browserRepository';

/**
 * Contextual (faceted) result counts for the Card Browser's flag and tag filters.
 *
 * Each filter panel evaluates the active scope (deck, text search, table mode, and every other
 * active filter) in ONE bulk query, returning compact histograms so toggling options updates
 * option counts and the previewed result count ("Show N cards / notes") in memory without
 * re-scanning the collection per option.
 *
 * Sibling cards in Notes mode are deduplicated cleanly:
 * - Flags use an 8-bit per-note flag bitmask histogram (at most 256 rows), so a note whose
 *   siblings carry different flags is counted under each of those flags, yet counted once when
 *   both flags are selected together.
 * - Tags group by `n.tags` with distinct note counts (Notes mode) or matching card counts
 *   (Cards mode), expanding `parent::child` hierarchies once per tag set so sibling cards or
 *   co-occurring child tags are never double-counted.
 */

const CARD_FLAGS: readonly CardFlag[] = [0, 1, 2, 3, 4, 5, 6, 7];

export interface BrowserFlagFacetCounts {
    /** Total cards (Cards mode) or distinct notes (Notes mode) when all flags are allowed. */
    total: number;
    /** Matching cards or distinct notes for each individual flag (0..7). */
    byFlag: Record<CardFlag, number>;
    /** Compact bitmask histogram: bit `f` is set when the card/note matches flag `f`. */
    maskCounts: ReadonlyArray<{ mask: number; count: number }>;
}

export interface BrowserTagGroupCount {
    /** Normalized exact + ancestor tag keys present on notes in this group. */
    keys: ReadonlySet<string>;
    /** Cards (Cards mode) or distinct notes (Notes mode) represented by this group. */
    weight: number;
}

export interface BrowserTagFacetCounts {
    /** Total cards or distinct notes matching the active scope when no tag filter is applied. */
    total: number;
    /** Matching cards or distinct notes for each normalized tag key (including ancestors). */
    byTagKey: ReadonlyMap<string, number>;
    /** Grouped tag-set weights for exact OR union counts of any selected tag combination. */
    groups: readonly BrowserTagGroupCount[];
}

export function normalizeBrowserTagKey(tag: string): string {
    return tag.normalize('NFC').trim().toLowerCase();
}

/** Expand `a::b::c` into `['a', 'a::b', 'a::b::c']` (NFC, lowercased). */
export function tagAndAncestorKeys(rawTag: string): string[] {
    const normalized = normalizeBrowserTagKey(rawTag);
    if (!normalized) return [];
    const parts = normalized.split('::');
    const keys: string[] = [];
    let prefix = '';
    for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        prefix = index === 0 ? part : `${prefix}::${part}`;
        if (part) keys.push(prefix);
    }
    return keys;
}

function emptyByFlag(): Record<CardFlag, number> {
    return { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
}

/** Build flag facet counts from a `(mask, count)` histogram (pure, used by SQL and tests). */
export function buildFlagFacetCounts(
    maskCounts: ReadonlyArray<{ mask: number; count: number }>,
): BrowserFlagFacetCounts {
    const byFlag = emptyByFlag();
    let total = 0;
    for (const entry of maskCounts) {
        if (entry.count <= 0) continue;
        total += entry.count;
        for (const flag of CARD_FLAGS) {
            if ((entry.mask & (1 << flag)) !== 0) {
                byFlag[flag] += entry.count;
            }
        }
    }
    return { total, byFlag, maskCounts };
}

/** Exact card/note count for any subset of selected flags (OR semantics, sibling-safe). */
export function countMatchingSelectedFlags(
    facets: BrowserFlagFacetCounts,
    selectedFlags: readonly CardFlag[],
): number {
    let selectedMask = 0;
    for (const flag of selectedFlags) selectedMask |= 1 << flag;
    if (selectedMask === 0) return 0;
    let total = 0;
    for (const entry of facets.maskCounts) {
        if ((entry.mask & selectedMask) !== 0) total += entry.count;
    }
    return total;
}

/**
 * Compute contextual flag counts for the active browser scope (deck, text search, marked,
 * suspended, tags, and table mode), ignoring the flag filter itself.
 */
export function getBrowserFlagFilterCounts(
    query: BrowserCardQuery = {},
    searchQuery: string = '',
): BrowserFlagFacetCounts {
    const db = getDB();
    const baseQuery: BrowserCardQuery = { ...query, flags: undefined, flag: undefined };
    const trimmedSearch = searchQuery.trim();
    const where = buildBrowserWhere(baseQuery, {
        extraSearchTerms: trimmedSearch ? [trimmedSearch] : [],
    });

    if (query.tableMode === 'notes') {
        const rows = db.getAllSync<{ mask: number; cnt: number }>(
            `SELECT mask, COUNT(*) AS cnt
             FROM (
                 SELECT
                     c.noteId,
                     MAX(CASE WHEN (c.flags & 7) = 0 THEN 1 ELSE 0 END)
                     + MAX(CASE WHEN (c.flags & 7) = 1 THEN 2 ELSE 0 END)
                     + MAX(CASE WHEN (c.flags & 7) = 2 THEN 4 ELSE 0 END)
                     + MAX(CASE WHEN (c.flags & 7) = 3 THEN 8 ELSE 0 END)
                     + MAX(CASE WHEN (c.flags & 7) = 4 THEN 16 ELSE 0 END)
                     + MAX(CASE WHEN (c.flags & 7) = 5 THEN 32 ELSE 0 END)
                     + MAX(CASE WHEN (c.flags & 7) = 6 THEN 64 ELSE 0 END)
                     + MAX(CASE WHEN (c.flags & 7) = 7 THEN 128 ELSE 0 END) AS mask
                 ${BROWSER_FROM}
                 ${where.sql}
                 GROUP BY c.noteId
             )
             GROUP BY mask`,
            ...where.params,
        );
        return buildFlagFacetCounts(rows.map((row) => ({
            mask: Number(row.mask) || 0,
            count: Number(row.cnt) || 0,
        })));
    }

    const rows = db.getAllSync<{ flag: number; cnt: number }>(
        `SELECT (c.flags & 7) AS flag, COUNT(*) AS cnt
         ${BROWSER_FROM}
         ${where.sql}
         GROUP BY (c.flags & 7)`,
        ...where.params,
    );
    return buildFlagFacetCounts(rows.map((row) => ({
        mask: 1 << (Number(row.flag) & 7),
        count: Number(row.cnt) || 0,
    })));
}

/** Build hierarchical tag facet counts from `(rawTags, weight)` groups (pure, used by SQL and tests). */
export function buildTagFacetCounts(
    rawGroups: ReadonlyArray<{ tags: string; weight: number }>,
): BrowserTagFacetCounts {
    const byTagKey = new Map<string, number>();
    const groups: BrowserTagGroupCount[] = [];
    let total = 0;

    for (const rawGroup of rawGroups) {
        const weight = rawGroup.weight;
        if (weight <= 0) continue;
        total += weight;

        const keys = new Set<string>();
        const trimmed = rawGroup.tags.trim();
        if (trimmed) {
            for (const token of trimmed.split(/\s+/)) {
                for (const key of tagAndAncestorKeys(token)) {
                    keys.add(key);
                }
            }
        }
        if (keys.size > 0) {
            for (const key of keys) {
                byTagKey.set(key, (byTagKey.get(key) ?? 0) + weight);
            }
            groups.push({ keys, weight });
        }
    }

    return { total, byTagKey, groups };
}

/** Matching card/note count for a single tag option (including notes carrying its child tags). */
export function countForTag(facets: BrowserTagFacetCounts, tag: string): number {
    const key = normalizeBrowserTagKey(tag);
    if (!key) return 0;
    return facets.byTagKey.get(key) ?? 0;
}

/**
 * Exact card/note count when `selectedTags` are combined with OR (AnkiDroid/TusAnkiM rule).
 * An empty selection means no tag filter, which returns the full base-scope `total`.
 */
export function countMatchingSelectedTags(
    facets: BrowserTagFacetCounts,
    selectedTags: readonly string[],
): number {
    const selectedKeys = selectedTags
        .map(normalizeBrowserTagKey)
        .filter(Boolean);
    if (selectedKeys.length === 0) return facets.total;
    if (selectedKeys.length === 1) return facets.byTagKey.get(selectedKeys[0]) ?? 0;

    let total = 0;
    for (const group of facets.groups) {
        for (const key of selectedKeys) {
            if (group.keys.has(key)) {
                total += group.weight;
                break;
            }
        }
    }
    return total;
}

/**
 * Compute contextual tag counts for the active browser scope (deck, text search, marked,
 * suspended, flags, and table mode), ignoring the tag filter itself.
 */
export function getBrowserTagFilterCounts(
    query: BrowserCardQuery = {},
    searchQuery: string = '',
): BrowserTagFacetCounts {
    const db = getDB();
    const baseQuery: BrowserCardQuery = { ...query, tags: undefined };
    const trimmedSearch = searchQuery.trim();
    const where = buildBrowserWhere(baseQuery, {
        extraSearchTerms: trimmedSearch ? [trimmedSearch] : [],
    });
    const weightExpr = query.tableMode === 'notes' ? 'COUNT(DISTINCT c.noteId)' : 'COUNT(c.id)';

    const rows = db.getAllSync<{ tags: string; weight: number }>(
        `SELECT COALESCE(n.tags, '') AS tags, ${weightExpr} AS weight
         ${BROWSER_FROM}
         ${where.sql}
         GROUP BY COALESCE(n.tags, '')`,
        ...where.params,
    );
    return buildTagFacetCounts(rows.map((row) => ({
        tags: String(row.tags ?? ''),
        weight: Number(row.weight) || 0,
    })));
}
