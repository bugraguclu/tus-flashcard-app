import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
const mockDb = vi.hoisted(() => ({
    getFirstSync: vi.fn((_sql: string, key: string) => (
        storage.has(key) ? { value: storage.get(key) } : null
    )),
    runSync: vi.fn((sql: string, key: string, value?: string) => {
        if (sql.startsWith('DELETE')) {
            storage.delete(key);
        } else if (typeof value === 'string') {
            storage.set(key, value);
        }
    }),
    execSync: vi.fn(),
}));

const durability = vi.hoisted(() => ({ flush: vi.fn(), readOnly: vi.fn() }));
vi.mock('./db', () => ({ getDB: () => mockDb, flushDatabaseWrites: durability.flush, readOnlyTabMessage: durability.readOnly }));

import {
    DEFAULT_STATS_SECTION_ORDER,
    STATS_LAYOUT_STORAGE_KEY,
    defaultStatsLayout,
    getVisibleStatsSections,
    isStatsLayoutDefault,
    loadStatsLayout,
    moveStatsSection,
    normalizeStatsLayout,
    saveStatsLayout,
    saveStatsLayoutDurably,
    setStatsLayoutColumns,
    toggleStatsSectionVisibility,
} from './statsLayout';

describe('statsLayout', () => {
    beforeEach(() => {
        storage.clear();
        vi.clearAllMocks();
        durability.flush.mockReset().mockResolvedValue(undefined);
        durability.readOnly.mockReset().mockReturnValue(null);
    });

    it('reorders sections cleanly and preserves bounds at top and bottom', () => {
        const base = defaultStatsLayout();
        const movedUp = moveStatsSection(base, 'reviews', -1);
        expect(movedUp.order[0]).toBe('reviews');
        expect(movedUp.order[1]).toBe('today');

        // Already at index 0 -> no-op
        expect(moveStatsSection(movedUp, 'reviews', -1)).toBe(movedUp);

        const last = base.order[base.order.length - 1];
        expect(moveStatsSection(base, last, 1)).toBe(base);
    });

    it('shows/hides sections and never allows hiding the last visible section', () => {
        let layout = defaultStatsLayout();
        for (const id of DEFAULT_STATS_SECTION_ORDER.slice(1)) {
            layout = toggleStatsSectionVisibility(layout, id);
        }
        expect(getVisibleStatsSections(layout)).toEqual(['today']);

        // Attempting to hide the sole remaining visible section is ignored.
        const attempted = toggleStatsSectionVisibility(layout, 'today');
        expect(getVisibleStatsSections(attempted)).toEqual(['today']);

        // Re-showing brings it back in order.
        const restored = toggleStatsSectionVisibility(attempted, 'reviews');
        expect(getVisibleStatsSections(restored)).toEqual(['today', 'reviews']);
    });

    it('normalizes corrupt, incomplete, duplicate, or all-hidden stored configs', () => {
        const normalized = normalizeStatsLayout({
            order: ['hourly', 'unknownSection', 'hourly', 'today'],
            hidden: [...DEFAULT_STATS_SECTION_ORDER],
            columns: 99,
        });
        expect(normalized.order[0]).toBe('hourly');
        expect(normalized.order[1]).toBe('today');
        expect(normalized.order).toHaveLength(DEFAULT_STATS_SECTION_ORDER.length);
        // At least one section stays visible.
        expect(getVisibleStatsSections(normalized)).toEqual(['hourly']);
        expect(normalized.columns).toBe(1);
    });

    it('persists customized order, visibility, and columns across reloads and clears on reset to default', () => {
        let draft = defaultStatsLayout();
        draft = moveStatsSection(draft, 'comparison', -1);
        draft = toggleStatsSectionVisibility(draft, 'added');
        draft = setStatsLayoutColumns(draft, 2);

        expect(saveStatsLayout(draft)).toBe(true);
        expect(storage.has(STATS_LAYOUT_STORAGE_KEY)).toBe(true);

        const reloaded = loadStatsLayout();
        expect(reloaded).toEqual(draft);
        expect(isStatsLayoutDefault(reloaded)).toBe(false);

        // Resetting to default cleans up storage key.
        expect(saveStatsLayout(defaultStatsLayout())).toBe(true);
        expect(storage.has(STATS_LAYOUT_STORAGE_KEY)).toBe(false);
        expect(isStatsLayoutDefault(loadStatsLayout())).toBe(true);
    });

    it('reports a failed durable save and restores the previous layout, including a failed reset', async () => {
        const previous = toggleStatsSectionVisibility(defaultStatsLayout(), 'added');
        saveStatsLayout(previous);
        durability.flush.mockRejectedValueOnce(new Error('Quota exceeded'));
        expect(await saveStatsLayoutDurably(defaultStatsLayout())).toBe(false);
        expect(loadStatsLayout()).toEqual(previous);
        expect(await saveStatsLayoutDurably(defaultStatsLayout())).toBe(true);
        expect(loadStatsLayout()).toEqual(defaultStatsLayout());
    });
});
