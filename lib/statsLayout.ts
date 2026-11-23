/**
 * Pure statistics section layout preferences (order, visibility, and optional wide-web
 * two-column layout) persisted separately from collection learning data and backups.
 */

import { getDB } from './db';
import { commitSettingsWrite } from './settingsWrite';
import type { StatsSectionId } from './statsSectionPriority';

export const STATS_LAYOUT_STORAGE_KEY = 'tus_stats_layout_v1';
export const STATS_LAYOUT_VERSION = 1;

export const DEFAULT_STATS_SECTION_ORDER: readonly StatsSectionId[] = [
    'today',
    'reviews',
    'comparison',
    'futureDue',
    'answerButtons',
    'trueRetention',
    'cardCounts',
    'intervals',
    'hourly',
    'added',
    'deckProgress',
];

export type StatsColumnCount = 1 | 2;

export interface StatsLayoutConfig {
    order: StatsSectionId[];
    hidden: StatsSectionId[];
    /** Applies only on wide web viewports; iOS always renders a single column. */
    columns: StatsColumnCount;
}

const KNOWN_SECTION_SET = new Set<string>(DEFAULT_STATS_SECTION_ORDER);

export function defaultStatsLayout(): StatsLayoutConfig {
    return {
        order: [...DEFAULT_STATS_SECTION_ORDER],
        hidden: [],
        columns: 1,
    };
}

/**
 * Normalize any stored or partial layout into a valid config:
 * - Drops unknown or duplicate section IDs
 * - Appends any newly introduced section IDs in default order
 * - Ensures at least one section remains visible
 */
export function normalizeStatsLayout(input: unknown): StatsLayoutConfig {
    if (!input || typeof input !== 'object') return defaultStatsLayout();
    const record = input as Record<string, unknown>;

    const rawOrder = Array.isArray(record.order) ? record.order : [];
    const seen = new Set<StatsSectionId>();
    const order: StatsSectionId[] = [];
    for (const item of rawOrder) {
        if (typeof item === 'string' && KNOWN_SECTION_SET.has(item)) {
            const id = item as StatsSectionId;
            if (!seen.has(id)) {
                seen.add(id);
                order.push(id);
            }
        }
    }
    for (const id of DEFAULT_STATS_SECTION_ORDER) {
        if (!seen.has(id)) {
            seen.add(id);
            order.push(id);
        }
    }

    const rawHidden = Array.isArray(record.hidden) ? record.hidden : [];
    const hiddenSet = new Set<StatsSectionId>();
    for (const item of rawHidden) {
        if (typeof item === 'string' && KNOWN_SECTION_SET.has(item)) {
            hiddenSet.add(item as StatsSectionId);
        }
    }
    // Never leave the screen completely blank: if every section was marked hidden, keep the first.
    if (hiddenSet.size >= order.length && order.length > 0) {
        hiddenSet.delete(order[0]);
    }

    const hidden = order.filter((id) => hiddenSet.has(id));
    const columns: StatsColumnCount = record.columns === 2 ? 2 : 1;
    return { order, hidden, columns };
}

/** Visible section IDs in the learner's chosen order. */
export function getVisibleStatsSections(layout: StatsLayoutConfig): StatsSectionId[] {
    const hiddenSet = new Set<StatsSectionId>(layout.hidden);
    return layout.order.filter((id) => !hiddenSet.has(id));
}

/** Move a section up (`delta = -1`) or down (`delta = +1`) within `layout.order`. */
export function moveStatsSection(
    layout: StatsLayoutConfig,
    id: StatsSectionId,
    delta: -1 | 1,
): StatsLayoutConfig {
    const index = layout.order.indexOf(id);
    if (index < 0) return layout;
    const target = index + delta;
    if (target < 0 || target >= layout.order.length) return layout;
    const nextOrder = [...layout.order];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(target, 0, moved);
    const hiddenSet = new Set(layout.hidden);
    return {
        ...layout,
        order: nextOrder,
        hidden: nextOrder.filter((entry) => hiddenSet.has(entry)),
    };
}

/** Toggle a section's visibility; refuses to hide the last remaining visible section. */
export function toggleStatsSectionVisibility(
    layout: StatsLayoutConfig,
    id: StatsSectionId,
): StatsLayoutConfig {
    const hiddenSet = new Set(layout.hidden);
    if (hiddenSet.has(id)) {
        hiddenSet.delete(id);
    } else {
        const visibleCount = layout.order.length - hiddenSet.size;
        if (visibleCount <= 1) return layout;
        hiddenSet.add(id);
    }
    return {
        ...layout,
        hidden: layout.order.filter((entry) => hiddenSet.has(entry)),
    };
}

export function setStatsLayoutColumns(
    layout: StatsLayoutConfig,
    columns: StatsColumnCount,
): StatsLayoutConfig {
    if (layout.columns === columns) return layout;
    return { ...layout, columns };
}

export function isStatsLayoutEqual(a: StatsLayoutConfig, b: StatsLayoutConfig): boolean {
    if (a.columns !== b.columns) return false;
    if (a.order.length !== b.order.length || a.hidden.length !== b.hidden.length) return false;
    for (let i = 0; i < a.order.length; i += 1) {
        if (a.order[i] !== b.order[i]) return false;
    }
    for (let i = 0; i < a.hidden.length; i += 1) {
        if (a.hidden[i] !== b.hidden[i]) return false;
    }
    return true;
}

export function isStatsLayoutDefault(layout: StatsLayoutConfig): boolean {
    return isStatsLayoutEqual(layout, defaultStatsLayout());
}

/**
 * Load persisted UI layout preferences from local SQLite `settings`.
 * This key is excluded from collection backups and Anki exports.
 */
export function loadStatsLayout(): StatsLayoutConfig {
    try {
        const row = getDB().getFirstSync<{ value?: string }>(
            'SELECT value FROM settings WHERE key = ?',
            STATS_LAYOUT_STORAGE_KEY,
        );
        if (typeof row?.value !== 'string' || !row.value.trim()) return defaultStatsLayout();
        const parsed = JSON.parse(row.value);
        if (parsed && typeof parsed === 'object' && parsed.version === STATS_LAYOUT_VERSION) {
            return normalizeStatsLayout(parsed);
        }
        return normalizeStatsLayout(parsed);
    } catch (error) {
        console.warn('[StatsLayout] load failed:', error);
        return defaultStatsLayout();
    }
}

/** Persist statistics layout preferences locally. Returns false if storage cannot be written. */
export function saveStatsLayout(layout: StatsLayoutConfig): boolean {
    const normalized = normalizeStatsLayout(layout);
    try {
        if (isStatsLayoutDefault(normalized)) {
            getDB().runSync('DELETE FROM settings WHERE key = ?', STATS_LAYOUT_STORAGE_KEY);
            return true;
        }
        const payload = JSON.stringify({
            version: STATS_LAYOUT_VERSION,
            order: normalized.order,
            hidden: normalized.hidden,
            columns: normalized.columns,
        });
        getDB().runSync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            STATS_LAYOUT_STORAGE_KEY,
            payload,
        );
        return true;
    } catch (error) {
        console.warn('[StatsLayout] save failed:', error);
        return false;
    }
}

/** An explicit UI Save waits for durable web storage and rolls back failed writes. */
export async function saveStatsLayoutDurably(layout: StatsLayoutConfig): Promise<boolean> {
    try {
        await commitSettingsWrite([STATS_LAYOUT_STORAGE_KEY], () => {
            if (!saveStatsLayout(layout)) throw new Error('Section layout write failed');
        });
        return true;
    } catch (error) {
        console.warn('[StatsLayout] commit failed:', error);
        return false;
    }
}
