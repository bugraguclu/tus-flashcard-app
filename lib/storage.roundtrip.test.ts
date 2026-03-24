import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = vi.hoisted(() => ({
    settings: new Map<string, string>(),
    note_types: [] as any[],
    notes: [] as any[],
    anki_cards: [] as any[],
    decks: [] as any[],
    deck_configs: [] as any[],
    revlog: [] as any[],
    graves: [] as any[],
    session_stats: [] as any[],
}));

const asyncStorageState = vi.hoisted(() => new Map<string, string>());

function normalize(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim().toUpperCase();
}

const fakeDb = {
    execSync(sql: string) {
        const q = normalize(sql);
        if (q.includes('DELETE FROM REVLOG')) dbState.revlog = [];
        if (q.includes('DELETE FROM ANKI_CARDS')) dbState.anki_cards = [];
        if (q.includes('DELETE FROM NOTES')) dbState.notes = [];
        if (q.includes('DELETE FROM DECKS')) dbState.decks = [];
        if (q.includes('DELETE FROM DECK_CONFIGS')) dbState.deck_configs = [];
        if (q.includes('DELETE FROM NOTE_TYPES')) dbState.note_types = [];
        if (q.includes('DELETE FROM GRAVES')) dbState.graves = [];
        if (q.includes('DELETE FROM SESSION_STATS')) dbState.session_stats = [];
    },
    getFirstSync<T>(sql: string, ...params: any[]): T | null {
        const q = normalize(sql);

        if (q.startsWith('SELECT VALUE FROM SETTINGS WHERE KEY = ?')) {
            const value = dbState.settings.get(String(params[0]));
            return value ? ({ value } as T) : null;
        }

        if (q.startsWith('SELECT DATA FROM SESSION_STATS WHERE DATE = ?')) {
            const row = dbState.session_stats.find((item) => item.date === params[0]);
            return row ? ({ data: row.data } as T) : null;
        }

        if (q.startsWith('SELECT VERSION FROM SCHEMA_VERSION')) {
            return ({ version: 6 } as T);
        }

        return null;
    },
    getAllSync<T>(sql: string): T[] {
        const q = normalize(sql);
        if (q.includes('FROM NOTE_TYPES')) return [...dbState.note_types] as T[];
        if (q.includes('FROM NOTES')) return [...dbState.notes] as T[];
        if (q.includes('FROM ANKI_CARDS')) return [...dbState.anki_cards] as T[];
        if (q.includes('FROM DECKS')) return [...dbState.decks] as T[];
        if (q.includes('FROM DECK_CONFIGS')) return [...dbState.deck_configs] as T[];
        if (q.includes('FROM REVLOG')) return [...dbState.revlog] as T[];
        if (q.includes('FROM GRAVES')) return [...dbState.graves] as T[];
        if (q.includes('FROM SESSION_STATS')) return [...dbState.session_stats] as T[];
        return [];
    },
    runSync(sql: string, ...params: any[]) {
        const q = normalize(sql);

        if (q.startsWith('INSERT OR REPLACE INTO SETTINGS')) {
            dbState.settings.set(String(params[0]), String(params[1]));
            return;
        }

        if (q.startsWith('INSERT OR REPLACE INTO SESSION_STATS') || q.startsWith('INSERT INTO SESSION_STATS')) {
            const [date, data] = params;
            dbState.session_stats = dbState.session_stats.filter((row) => row.date !== date);
            dbState.session_stats.push({ date, data });
            return;
        }

        if (q.startsWith('INSERT INTO NOTE_TYPES')) {
            const [id, name, data, updated_at, usn, tombstone] = params;
            dbState.note_types.push({ id, name, data, updated_at, usn, tombstone });
            return;
        }

        if (q.startsWith('INSERT INTO NOTES')) {
            const [id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone] = params;
            dbState.notes.push({ id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone });
            return;
        }

        if (q.startsWith('INSERT INTO ANKI_CARDS')) {
            const [
                id,
                noteId,
                deckId,
                ord,
                type,
                queue,
                due,
                ivl,
                factor,
                reps,
                lapses,
                flags,
                data,
                updated_at,
                usn,
                tombstone,
            ] = params;
            dbState.anki_cards.push({
                id,
                noteId,
                deckId,
                ord,
                type,
                queue,
                due,
                ivl,
                factor,
                reps,
                lapses,
                flags,
                data,
                updated_at,
                usn,
                tombstone,
            });
            return;
        }

        if (q.startsWith('INSERT INTO DECKS')) {
            const [id, name, data, updated_at, usn, tombstone] = params;
            dbState.decks.push({ id, name, data, updated_at, usn, tombstone });
            return;
        }

        if (q.startsWith('INSERT INTO DECK_CONFIGS')) {
            const [id, data] = params;
            dbState.deck_configs.push({ id, data });
            return;
        }

        if (q.startsWith('INSERT INTO REVLOG')) {
            const [id, cardId, usn, ease, ivl, lastIvl, factor, time, type] = params;
            dbState.revlog.push({ id, cardId, usn, ease, ivl, lastIvl, factor, time, type });
            return;
        }

        if (q.startsWith('INSERT INTO GRAVES')) {
            const [oid, type, usn] = params;
            dbState.graves.push({ oid, type, usn });
        }
    },
};

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getAllKeys: async () => Array.from(asyncStorageState.keys()),
        getItem: async (key: string) => asyncStorageState.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            asyncStorageState.set(key, value);
        },
        removeItem: async (key: string) => {
            asyncStorageState.delete(key);
        },
        multiGet: async (keys: string[]) => keys.map((key) => [key, asyncStorageState.get(key) ?? null]),
        multiRemove: async (keys: string[]) => {
            keys.forEach((key) => asyncStorageState.delete(key));
        },
    },
}));

vi.mock('./db', () => ({
    getDB: () => fakeDb,
    initDB: vi.fn(),
    dbIndexAllCards: vi.fn(),
    dbGetSchemaVersion: () => 6,
}));

vi.mock('./deckManager', () => ({
    getDeckConfig: () => ({
        id: 1,
        newPerDay: 20,
        maxReviewsPerDay: 200,
        learningSteps: [1, 10],
        relearningSteps: [10],
        graduatingIvl: 1,
        easyIvl: 4,
        startingEase: 2500,
        newIvlPercent: 0,
        insertionOrder: 'sequential',
        hardIvl: 1.2,
        easyBonus: 1.3,
        ivlModifier: 1,
        maxIvl: 36500,
    }),
    saveDeckConfig: vi.fn(),
}));

vi.mock('./legacyMigration', () => ({
    migrateLegacyCardStatesToAnki: vi.fn(),
    migrateLegacyCustomCardsToAnki: vi.fn(),
}));

vi.mock('./ankiInit', () => ({
    initAnkiData: vi.fn(),
}));

vi.mock('./noteManager', () => ({
    getSearchIndexCards: () => [],
}));

import { exportAllData, importAllData, saveSessionStats } from './storage';

describe('storage import/export canonical round-trip', () => {
    beforeEach(() => {
        dbState.settings.clear();
        dbState.note_types = [];
        dbState.notes = [];
        dbState.anki_cards = [];
        dbState.decks = [];
        dbState.deck_configs = [];
        dbState.revlog = [];
        dbState.graves = [];
        dbState.session_stats = [];
        asyncStorageState.clear();

        dbState.note_types.push({ id: 1, name: 'Basic', data: '{}', updated_at: 0, usn: -1, tombstone: 0 });
        dbState.notes.push({ id: 10, noteTypeId: 1, sfld: 'Q', csum: 1, tags: 'anatomi', data: '{}', updated_at: 0, usn: -1, tombstone: 0 });
        dbState.anki_cards.push({ id: 20, noteId: 10, deckId: 1, ord: 0, type: 2, queue: 2, due: 10, ivl: 5, factor: 2500, reps: 4, lapses: 0, flags: 0, data: '{}', updated_at: 0, usn: -1, tombstone: 0 });
        dbState.decks.push({ id: 1, name: 'TUS', data: '{}', updated_at: 0, usn: -1, tombstone: 0 });
        dbState.deck_configs.push({ id: 1, data: '{}' });
    });

    it('exports and imports canonical data without loss', async () => {
        await saveSessionStats({
            reviewed: 12,
            correct: 9,
            wrong: 3,
            startTime: Date.now() - 1000,
            newCardsToday: 2,
        });

        const exported = await exportAllData();

        // Simulate clean state before import.
        dbState.note_types = [];
        dbState.notes = [];
        dbState.anki_cards = [];
        dbState.decks = [];
        dbState.deck_configs = [];
        dbState.revlog = [];
        dbState.graves = [];
        dbState.session_stats = [];

        const ok = await importAllData(exported);
        expect(ok).toBe(true);

        expect(dbState.note_types).toHaveLength(1);
        expect(dbState.notes).toHaveLength(1);
        expect(dbState.anki_cards).toHaveLength(1);
        expect(dbState.decks).toHaveLength(1);
        expect(dbState.deck_configs).toHaveLength(1);
        expect(dbState.session_stats.length).toBeGreaterThanOrEqual(1);
    });
});
