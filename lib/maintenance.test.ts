import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';

const h = vi.hoisted(() => ({ exec: [] as string[], indexed: vi.fn() }));

vi.mock('./db', () => ({
    getDB: () => ({
        execSync: (sql: string) => h.exec.push(sql),
        getFirstSync: (sql: string) => {
            if (sql.includes('quick_check')) return { quick_check: 'ok' };
            if (sql.includes('SELECT COUNT(*) as cnt FROM notes n')) return { cnt: 3 };
            if (sql.includes('SELECT COUNT(*) as cnt FROM anki_cards c')) return { cnt: 2 };
            return null;
        },
    }),
    dbIndexAllCards: h.indexed,
}));

vi.mock('./noteManager', () => ({
    getSearchIndexCards: () => [{ id: 1 }, { id: 2 }],
    unburyAllCards: vi.fn(),
}));

vi.mock('./storage', () => ({
    getDbSetting: vi.fn(),
    loadSettings: () => ({ dayRolloverHour: 4 }),
    setDbSetting: vi.fn(),
}));

import { checkDatabase, optimizeDatabase } from './maintenance';

beforeEach(() => {
    h.exec.length = 0;
    h.indexed.mockReset();
    Platform.OS = 'ios';
});

describe('database maintenance boundaries', () => {
    it('keeps Check Database read-only', () => {
        expect(checkDatabase()).toEqual({ integrity: 'ok', orphanCards: 2, orphanNotes: 3 });
        expect(h.exec).toEqual([]);
        expect(h.indexed).not.toHaveBeenCalled();
    });

    it('runs optimization and FTS rebuilding only through the explicit mutating operation', () => {
        expect(optimizeDatabase()).toEqual({ ftsReindexed: 2 });
        expect(h.exec).toEqual(['VACUUM; REINDEX; ANALYZE;']);
        expect(h.indexed).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
    });
});
