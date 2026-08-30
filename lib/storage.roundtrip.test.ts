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
    exec: [] as string[],
    failOnExec: null as string | null,
    transactionSnapshot: null as null | Record<string, unknown>,
}));

const asyncStorageState = vi.hoisted(() => new Map<string, string>());

function normalize(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim().toUpperCase();
}

const fakeDb = {
    execSync(sql: string) {
        const q = normalize(sql);
        dbState.exec.push(q);
        if (q === 'BEGIN TRANSACTION;' || q === 'BEGIN;') {
            dbState.transactionSnapshot = {
                settings: new Map(dbState.settings),
                note_types: [...dbState.note_types],
                notes: [...dbState.notes],
                anki_cards: [...dbState.anki_cards],
                decks: [...dbState.decks],
                deck_configs: [...dbState.deck_configs],
                revlog: [...dbState.revlog],
                graves: [...dbState.graves],
                session_stats: [...dbState.session_stats],
            };
        }
        if (dbState.failOnExec && q.includes(dbState.failOnExec)) throw new Error(`forced failure: ${dbState.failOnExec}`);
        if (q === 'ROLLBACK;' && dbState.transactionSnapshot) {
            const snapshot = dbState.transactionSnapshot as any;
            dbState.settings = new Map(snapshot.settings);
            dbState.note_types = snapshot.note_types;
            dbState.notes = snapshot.notes;
            dbState.anki_cards = snapshot.anki_cards;
            dbState.decks = snapshot.decks;
            dbState.deck_configs = snapshot.deck_configs;
            dbState.revlog = snapshot.revlog;
            dbState.graves = snapshot.graves;
            dbState.session_stats = snapshot.session_stats;
            dbState.transactionSnapshot = null;
            return;
        }
        if (q === 'COMMIT;') dbState.transactionSnapshot = null;
        if (q.includes('DELETE FROM REVLOG')) dbState.revlog = [];
        if (q.includes('DELETE FROM ANKI_CARDS')) dbState.anki_cards = [];
        if (q.includes('DELETE FROM NOTES')) dbState.notes = [];
        if (q.includes('DELETE FROM DECKS')) dbState.decks = [];
        if (q.includes('DELETE FROM DECK_CONFIGS')) dbState.deck_configs = [];
        if (q.includes('DELETE FROM NOTE_TYPES')) dbState.note_types = [];
        if (q.includes('DELETE FROM GRAVES')) dbState.graves = [];
        if (q.includes('DELETE FROM SESSION_STATS')) dbState.session_stats = [];
        if (q.includes('DELETE FROM SETTINGS')) dbState.settings.clear();
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
    migrateLegacySubjectTopicsToDecks: vi.fn(),
}));

vi.mock('./noteManager', () => ({
    getSearchIndexCards: () => [],
}));

import {
    DEFAULT_SETTINGS,
    exportAllData,
    importAllData,
    loadSettings,
    saveCollectionDeckOptions,
    saveSessionStats,
    saveSettings,
    resetAllData,
} from './storage';
import { saveDeckConfig } from './deckManager';
import { CATALOG_PACK_ID, CATALOG_PROGRESS_KEY } from './catalogRows';

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
        dbState.exec = [];
        dbState.failOnExec = null;
        dbState.transactionSnapshot = null;
        vi.mocked(saveDeckConfig).mockReset();

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
            date: '2026-04-30',
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

    it('persists the app language independently from deck scheduling options', () => {
        saveSettings({ ...DEFAULT_SETTINGS, language: 'en' });
        expect(loadSettings().language).toBe('en');

        saveSettings({ ...DEFAULT_SETTINGS, language: 'tr' });
        expect(loadSettings().language).toBe('tr');
    });

    it('rolls settings metadata back and reports failure when deck-config persistence fails', () => {
        expect(saveSettings({ ...DEFAULT_SETTINGS, language: 'en' }).ok).toBe(true);
        const before = new Map(dbState.settings);
        dbState.exec = [];
        vi.mocked(saveDeckConfig).mockImplementationOnce(() => { throw new Error('disk full'); });

        const result = saveSettings({ ...DEFAULT_SETTINGS, language: 'tr' });

        expect(result.ok).toBe(false);
        expect(dbState.settings).toEqual(before);
        expect(dbState.exec).toContain('BEGIN TRANSACTION;');
        expect(dbState.exec).toContain('ROLLBACK;');
    });

    it('rolls back database deletion and preserves legacy storage when reset fails', async () => {
        asyncStorageState.set('tus_settings_v2', '{"language":"tr"}');
        const notesBefore = [...dbState.notes];
        dbState.failOnExec = 'DELETE FROM NOTES';

        await expect(resetAllData()).rejects.toThrow('forced failure');

        expect(dbState.notes).toEqual(notesBefore);
        expect(asyncStorageState.get('tus_settings_v2')).toBe('{"language":"tr"}');
        expect(dbState.exec.at(-1)).toBe('ROLLBACK;');
    });

    it('persists both typed-answer presentation preferences', () => {
        saveSettings({
            ...DEFAULT_SETTINGS,
            typeAnswerInCard: true,
            focusTypeAnswer: false,
        });

        expect(loadSettings()).toMatchObject({
            typeAnswerInCard: true,
            focusTypeAnswer: false,
        });
    });

    it('preserves a one-percent swipe sensitivity selected in Controls', () => {
        saveSettings({ ...DEFAULT_SETTINGS, swipeSensitivity: 1 });
        expect(loadSettings().swipeSensitivity).toBe(1);
    });

    it('persists separate question and answer actions for all nine tap zones', () => {
        saveSettings({
            ...DEFAULT_SETTINGS,
            ninePointTouchEnabled: true,
            questionTapActions: { ...DEFAULT_SETTINGS.questionTapActions!, topLeft: 'replayAudio' },
            answerTapActions: { ...DEFAULT_SETTINGS.answerTapActions!, bottomCenter: 'easy' },
        });

        expect(loadSettings()).toMatchObject({
            ninePointTouchEnabled: true,
            questionTapActions: { topLeft: 'replayAudio', middleCenter: 'showAnswer' },
            answerTapActions: { bottomCenter: 'easy', middleLeft: 'again', middleRight: 'good' },
        });
    });

    it('persists collection-wide deck options independently from a preset', () => {
        saveSettings({ ...DEFAULT_SETTINGS, newCardsIgnoreReviewLimit: true, limitsStartFromTop: true });

        saveCollectionDeckOptions({ newCardsIgnoreReviewLimit: false, limitsStartFromTop: false });

        expect(loadSettings()).toMatchObject({
            newCardsIgnoreReviewLimit: false,
            limitsStartFromTop: false,
        });
    });

    it('rejects an incomplete canonical file before changing settings or tables', async () => {
        saveSettings({ ...DEFAULT_SETTINGS, language: 'tr' });
        const originalNotes = [...dbState.notes];

        const ok = await importAllData(JSON.stringify({
            version: 6,
            canonical: true,
            settings: { ...DEFAULT_SETTINGS, language: 'en' },
            tables: { notes: [] },
        }));

        expect(ok).toBe(false);
        expect(loadSettings().language).toBe('tr');
        expect(dbState.notes).toEqual(originalNotes);
    });
});

describe('backups and the purchased card pack', () => {
    const catalogNote = {
        id: 11,
        noteTypeId: 1,
        sfld: 'BKA sorusu',
        csum: 2,
        tags: '',
        data: JSON.stringify({ id: 11, catalogPack: CATALOG_PACK_ID, fields: ['BKA sorusu', 'BKA cevabı'] }),
        updated_at: 0,
        usn: -1,
        tombstone: 0,
    };
    const studiedCatalogCard = {
        id: 31, noteId: 11, deckId: 5, ord: 0, type: 2, queue: 2, due: 12, ivl: 21,
        factor: 2350, reps: 4, lapses: 1, flags: 0, updated_at: 0, usn: -1, tombstone: 0,
        data: JSON.stringify({
            id: 31, noteId: 11, deckId: 5, type: 2, queue: 2, due: 12, ivl: 21, factor: 2350,
            reps: 4, lapses: 1, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
        }),
    };
    const untouchedCatalogCard = {
        id: 32, noteId: 11, deckId: 5, ord: 0, type: 0, queue: 0, due: 1, ivl: 0,
        factor: 2500, reps: 0, lapses: 0, flags: 0, updated_at: 0, usn: -1, tombstone: 0,
        data: JSON.stringify({
            id: 32, noteId: 11, deckId: 5, type: 0, queue: 0, due: 1, ivl: 0, factor: 2500,
            reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
        }),
    };

    beforeEach(() => {
        dbState.notes = dbState.notes.filter((row: any) => row.id !== 11);
        dbState.anki_cards = dbState.anki_cards.filter((row: any) => row.noteId !== 11);
        dbState.decks = dbState.decks.filter((row: any) => row.id !== 5);
        dbState.notes.push(catalogNote);
        dbState.anki_cards.push(studiedCatalogCard, untouchedCatalogCard);
        dbState.decks.push({ id: 5, name: 'BKA TUS', data: JSON.stringify({ id: 5, catalogPack: CATALOG_PACK_ID }), updated_at: 0, usn: -1, tombstone: 0 });
    });

    it('omits pack content but keeps the learner collection and their progress on it', async () => {
        const json = await exportAllData();
        const data = JSON.parse(json);

        expect(data.tables.notes.map((row: any) => row.id)).toEqual([10]);
        expect(data.tables.anki_cards.map((row: any) => row.id)).toEqual([20]);
        // Paid card text must not travel inside a backup file the learner can share.
        expect(json).not.toContain('BKA cevabı');
        // Only the card with real study state is worth carrying.
        expect(data.catalogProgress).toEqual({ '31': [2, 2, 12, 21, 2350, 4, 1, 0, 0, 0, 0, 0] });
        // Note types, decks and presets stay whole so nothing the learner owns is orphaned.
        expect(data.tables.decks.map((row: any) => row.id)).toEqual([1, 5]);
        expect(data.tables.note_types).toHaveLength(1);
    });

    it('hands the pack progress to the installer when a backup is restored', async () => {
        const json = await exportAllData();
        dbState.settings.clear();

        await importAllData(json);

        expect(dbState.notes.map((row: any) => row.id)).toEqual([10]);
        expect(dbState.anki_cards.map((row: any) => row.id)).toEqual([20]);
        expect(JSON.parse(dbState.settings.get(CATALOG_PROGRESS_KEY)!)).toEqual({
            '31': [2, 2, 12, 21, 2350, 4, 1, 0, 0, 0, 0, 0],
        });
    });
});
