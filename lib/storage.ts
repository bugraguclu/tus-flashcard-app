// ============================================================
// TUS Flashcard - Storage Layer
// Canonical source: SQLite (Anki tables + deck config + app/session metadata)
// AsyncStorage is used only for legacy import/migration sources.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardState, SessionStats, AppSettings, AlgorithmType } from './types';
import type { Card } from './types';
import { todayLocalYMD } from './scheduler';
import { dbGetSchemaVersion, dbIndexAllCards, getDB, initDB } from './db';
import { getDeckConfig, saveDeckConfig } from './deckManager';
import {
    migrateLegacyCardStatesToAnki,
    migrateLegacyCustomCardsToAnki,
} from './legacyMigration';
import { initAnkiData } from './ankiInit';
import { getSearchIndexCards } from './noteManager';

const KEYS = {
    CARD_STATES: 'tus_card_states_v2',
    CUSTOM_CARDS: 'tus_custom_cards_v2',
    SESSION_STATS: 'tus_stats_v2', // legacy AsyncStorage key (migration source only)
    SETTINGS: 'tus_settings_v2', // legacy AsyncStorage key (migration source only)
};

const DB_SETTINGS_KEYS = {
    APP_SETTINGS_META: 'tus_app_settings_meta_v1',
    LEGACY_SETTINGS_MIGRATED: 'tus_legacy_settings_migrated_v1',
    LEGACY_SESSION_STATS_MIGRATED: 'tus_legacy_session_stats_migrated_v1',
};

// Legacy per-card state keys used by old builds.
const CARD_STATE_PREFIX = 'tus_cs:';

export const DEFAULT_SETTINGS: AppSettings = {
    dailyNewLimit: 20,
    dailyReviewLimit: 200,
    learningSteps: [1, 10],
    lapseSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseNewInterval: 0.7,
    queueOrder: 'learning-review-new',
    newCardOrder: 'sequential',
    hardIntervalMultiplier: 1.2,
    easyBonus: 1.3,
    intervalModifier: 1.0,
    maxInterval: 36500,
    dayRolloverHour: 4,
    algorithm: 'ANKI_V3' as AlgorithmType,
    desiredRetention: 0.9,
};

function getDbSetting(key: string): string | null {
    try {
        const db = getDB();
        const row = db.getFirstSync('SELECT value FROM settings WHERE key = ?', key) as { value?: string } | null;
        return typeof row?.value === 'string' ? row.value : null;
    } catch {
        return null;
    }
}

function setDbSetting(key: string, value: string): void {
    try {
        const db = getDB();
        db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
    } catch {
        // DB may not be initialized yet.
    }
}

// --- Legacy Card States (AsyncStorage migration source only) ---
export async function loadCardStates(): Promise<Record<string, CardState>> {
    try {
        const allKeys = await AsyncStorage.getAllKeys();
        const perCardKeys = allKeys.filter((k: string) => k.startsWith(CARD_STATE_PREFIX));

        const blobData = await AsyncStorage.getItem(KEYS.CARD_STATES);
        const states: Record<string, CardState> = blobData ? JSON.parse(blobData) : {};

        if (perCardKeys.length > 0) {
            const pairs = await AsyncStorage.multiGet(perCardKeys);
            for (const [key, value] of pairs) {
                if (!value) continue;
                const id = key.replace(CARD_STATE_PREFIX, '');
                states[id] = JSON.parse(value);
            }
        }

        return states;
    } catch {
        return {};
    }
}

export async function clearLegacyCardStates(): Promise<void> {
    const allKeys = await AsyncStorage.getAllKeys();
    const perCardKeys = allKeys.filter((k: string) => k.startsWith(CARD_STATE_PREFIX));
    const keys = [KEYS.CARD_STATES, ...perCardKeys];
    if (keys.length > 0) {
        await AsyncStorage.multiRemove(keys);
    }
}

// --- Legacy Settings (AsyncStorage -> SQLite one-shot migration) ---
export async function migrateLegacySettingsIfNeeded(): Promise<{ migrated: boolean }> {
    if (getDbSetting(DB_SETTINGS_KEYS.LEGACY_SETTINGS_MIGRATED) === 'true') {
        return { migrated: false };
    }

    let migrated = false;

    try {
        const legacyRaw = await AsyncStorage.getItem(KEYS.SETTINGS);
        if (legacyRaw) {
            const parsed = validateSettings(JSON.parse(legacyRaw) as Record<string, unknown>);
            saveSettings(parsed);
            migrated = true;
        }
    } catch (error) {
        console.warn('[Storage] Legacy settings migration failed:', error);
    }

    await AsyncStorage.removeItem(KEYS.SETTINGS);
    setDbSetting(DB_SETTINGS_KEYS.LEGACY_SETTINGS_MIGRATED, 'true');

    return { migrated };
}

// --- Legacy Custom Cards (AsyncStorage migration source only) ---
export async function loadCustomCards(): Promise<Card[]> {
    try {
        const data = await AsyncStorage.getItem(KEYS.CUSTOM_CARDS);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

export async function saveCustomCards(cards: Card[]): Promise<void> {
    try {
        await AsyncStorage.setItem(KEYS.CUSTOM_CARDS, JSON.stringify(cards));
    } catch (e) {
        console.error('Custom cards kayıt hatası:', e);
    }
}

function defaultSessionStats(date?: string): SessionStats {
    return {
        reviewed: 0,
        correct: 0,
        wrong: 0,
        startTime: Date.now(),
        newCardsToday: 0,
        ...(date ? { date } : {}),
    };
}

function loadSessionStatsFromDb(date: string): SessionStats | null {
    try {
        const db = getDB();
        const row = db.getFirstSync<{ data: string }>(
            'SELECT data FROM session_stats WHERE date = ?',
            date,
        );
        if (!row?.data) return null;

        const parsed = JSON.parse(row.data) as SessionStats;
        return {
            ...defaultSessionStats(date),
            ...parsed,
            date,
        };
    } catch {
        return null;
    }
}

function saveSessionStatsToDb(date: string, stats: SessionStats): void {
    const db = getDB();
    db.runSync(
        'INSERT OR REPLACE INTO session_stats (date, data) VALUES (?, ?)',
        date,
        JSON.stringify({
            ...defaultSessionStats(date),
            ...stats,
            date,
        }),
    );
}

async function migrateLegacySessionStatsIfNeeded(today: string): Promise<void> {
    if (getDbSetting(DB_SETTINGS_KEYS.LEGACY_SESSION_STATS_MIGRATED) === 'true') {
        return;
    }

    try {
        const raw = await AsyncStorage.getItem(KEYS.SESSION_STATS);
        if (raw) {
            const parsed = JSON.parse(raw) as SessionStats;
            const date = typeof parsed.date === 'string' && parsed.date.trim() ? parsed.date : today;
            saveSessionStatsToDb(date, parsed);
        }
    } catch (error) {
        console.warn('[Storage] Legacy session stats migration failed:', error);
    }

    await AsyncStorage.removeItem(KEYS.SESSION_STATS);
    setDbSetting(DB_SETTINGS_KEYS.LEGACY_SESSION_STATS_MIGRATED, 'true');
}

// --- Session Stats (SQLite canonical) ---
export async function loadSessionStats(): Promise<SessionStats> {
    const settings = loadSettings();
    const today = todayLocalYMD(undefined, settings.dayRolloverHour);

    const existing = loadSessionStatsFromDb(today);
    if (existing) return existing;

    await migrateLegacySessionStatsIfNeeded(today);
    return loadSessionStatsFromDb(today) ?? defaultSessionStats(today);
}

export async function saveSessionStats(stats: SessionStats): Promise<void> {
    try {
        const settings = loadSettings();
        const date = todayLocalYMD(undefined, settings.dayRolloverHour);
        saveSessionStatsToDb(date, stats);
    } catch (e) {
        console.error('Stats kayıt hatası:', e);
    }
}

function syncDefaultDeckConfig(settings: AppSettings): void {
    try {
        const config = getDeckConfig(1);
        config.newPerDay = settings.dailyNewLimit;
        config.maxReviewsPerDay = settings.dailyReviewLimit;
        config.learningSteps = [...settings.learningSteps];
        config.relearningSteps = [...settings.lapseSteps];
        config.graduatingIvl = settings.graduatingInterval;
        config.easyIvl = settings.easyInterval;
        config.startingEase = Math.round(settings.startingEase * 1000);
        config.newIvlPercent = settings.lapseNewInterval;
        config.insertionOrder = settings.newCardOrder;
        config.hardIvl = settings.hardIntervalMultiplier;
        config.easyBonus = settings.easyBonus;
        config.ivlModifier = settings.intervalModifier;
        config.maxIvl = settings.maxInterval;
        config.desiredRetention = settings.desiredRetention;
        config.mod = Math.floor(Date.now() / 1000);
        config.usn = -1;
        saveDeckConfig(config);
    } catch {
        // DB may not be initialized yet.
    }
}

function hydrateSettingsFromDeckConfig(base: AppSettings): AppSettings {
    try {
        const config = getDeckConfig(1);
        return {
            ...base,
            dailyNewLimit: config.newPerDay,
            dailyReviewLimit: config.maxReviewsPerDay,
            learningSteps: config.learningSteps?.length ? [...config.learningSteps] : base.learningSteps,
            lapseSteps: config.relearningSteps?.length ? [...config.relearningSteps] : base.lapseSteps,
            graduatingInterval: config.graduatingIvl,
            easyInterval: config.easyIvl,
            startingEase: config.startingEase > 0 ? config.startingEase / 1000 : base.startingEase,
            lapseNewInterval: config.newIvlPercent >= 0 ? config.newIvlPercent : base.lapseNewInterval,
            newCardOrder: config.insertionOrder || base.newCardOrder,
            hardIntervalMultiplier: config.hardIvl > 0 ? config.hardIvl : base.hardIntervalMultiplier,
            easyBonus: config.easyBonus > 0 ? config.easyBonus : base.easyBonus,
            intervalModifier: config.ivlModifier > 0 ? config.ivlModifier : base.intervalModifier,
            maxInterval: config.maxIvl > 0 ? config.maxIvl : base.maxInterval,
            desiredRetention: config.desiredRetention || base.desiredRetention,
        };
    } catch {
        return base;
    }
}

function loadAppSettingsMeta(): Partial<AppSettings> {
    try {
        const raw = getDbSetting(DB_SETTINGS_KEYS.APP_SETTINGS_META);
        if (!raw) return {};

        const parsed = JSON.parse(raw) as Partial<AppSettings>;

        return {
            queueOrder: parsed.queueOrder === 'learning-new-review' ? 'learning-new-review' : 'learning-review-new',
            dayRolloverHour: Math.max(0, Math.min(23, Number(parsed.dayRolloverHour ?? DEFAULT_SETTINGS.dayRolloverHour))),
            algorithm: 'ANKI_V3',
        };
    } catch {
        return {};
    }
}

function persistAppSettingsMeta(settings: AppSettings): void {
    const meta = {
        queueOrder: settings.queueOrder,
        dayRolloverHour: settings.dayRolloverHour,
        algorithm: settings.algorithm,
    };

    setDbSetting(DB_SETTINGS_KEYS.APP_SETTINGS_META, JSON.stringify(meta));
}

// --- Settings (source of truth: SQLite deck config + SQLite settings metadata) ---
export function loadSettings(): AppSettings {
    const fromDeck = hydrateSettingsFromDeckConfig({ ...DEFAULT_SETTINGS });
    const meta = loadAppSettingsMeta();

    return {
        ...fromDeck,
        queueOrder: meta.queueOrder ?? fromDeck.queueOrder,
        dayRolloverHour: meta.dayRolloverHour ?? fromDeck.dayRolloverHour,
        algorithm: meta.algorithm ?? fromDeck.algorithm,
    };
}

export function saveSettings(settings: AppSettings): void {
    try {
        const validated = validateSettings(settings as unknown as Record<string, unknown>);
        syncDefaultDeckConfig(validated);
        persistAppSettingsMeta(validated);
    } catch (e) {
        console.error('Settings kayıt hatası:', e);
    }
}

// --- Reset ---
export async function resetAllData(): Promise<void> {
    await Promise.all([
        clearLegacyCardStates(),
        AsyncStorage.removeItem(KEYS.SESSION_STATS),
        AsyncStorage.removeItem(KEYS.CUSTOM_CARDS),
        AsyncStorage.removeItem(KEYS.SETTINGS),
    ]);

    try {
        const db = getDB();

        db.execSync(`
            BEGIN TRANSACTION;
            DELETE FROM revlog;
            DELETE FROM anki_cards;
            DELETE FROM notes;
            DELETE FROM decks;
            DELETE FROM deck_configs;
            DELETE FROM note_types;
            DELETE FROM graves;
            DELETE FROM cards_fts;
            DELETE FROM session_stats;
            DELETE FROM settings;
            COMMIT;
        `);

        initAnkiData();
        saveSettings({ ...DEFAULT_SETTINGS });
        dbIndexAllCards(getSearchIndexCards());
    } catch {
        /* Database may not be initialized yet. */
    }
}

// --- Export / Import ---
const MAX_IMPORT_SIZE = 50 * 1024 * 1024; // 50 MB limit

/** Sanitize imported object to prevent prototype pollution */
function sanitizeObject<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeObject) as unknown as T;
    const clean: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(obj as Record<string, unknown>)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        clean[key] = sanitizeObject((obj as Record<string, unknown>)[key]);
    }
    return clean as T;
}

function sanitizeStepArray(value: unknown, fallback: number[]): number[] {
    if (!Array.isArray(value)) return fallback;
    const clean = value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0 && entry <= 10080)
        .slice(0, 20);

    return clean.length > 0 ? clean : fallback;
}

function validateSettings(settings: Record<string, unknown>): AppSettings {
    const validated = { ...DEFAULT_SETTINGS, ...settings } as AppSettings;
    validated.dailyNewLimit = Math.max(0, Math.min(9999, Number(validated.dailyNewLimit) || 20));
    validated.dailyReviewLimit = Math.max(0, Math.min(9999, Number(validated.dailyReviewLimit) || 200));
    validated.graduatingInterval = Math.max(1, Math.min(365, Number(validated.graduatingInterval) || 1));
    validated.easyInterval = Math.max(1, Math.min(365, Number(validated.easyInterval) || 4));
    validated.startingEase = Math.max(1.3, Math.min(5.0, Number(validated.startingEase) || 2.5));
    validated.lapseNewInterval = Math.max(0, Math.min(1.0, Number(validated.lapseNewInterval) || 0.7));
    validated.hardIntervalMultiplier = Math.max(1.0, Math.min(2.0, Number(validated.hardIntervalMultiplier) || 1.2));
    validated.easyBonus = Math.max(1.0, Math.min(2.0, Number(validated.easyBonus) || 1.3));
    validated.intervalModifier = Math.max(0.1, Math.min(3.0, Number(validated.intervalModifier) || 1.0));
    validated.maxInterval = Math.max(1, Math.min(36500, Number(validated.maxInterval) || 36500));
    validated.dayRolloverHour = Math.max(0, Math.min(23, Number(validated.dayRolloverHour) || 4));
    validated.desiredRetention = Math.max(0.5, Math.min(0.99, Number(validated.desiredRetention) || 0.9));
    validated.learningSteps = sanitizeStepArray(validated.learningSteps, [1, 10]);
    validated.lapseSteps = sanitizeStepArray(validated.lapseSteps, [10]);
    validated.queueOrder = validated.queueOrder === 'learning-new-review' ? 'learning-new-review' : 'learning-review-new';
    validated.newCardOrder = validated.newCardOrder === 'random' ? 'random' : 'sequential';
    validated.algorithm = 'ANKI_V3';
    return validated;
}

export async function exportAllData(): Promise<string> {
    const settings = loadSettings();
    const sessionStats = await loadSessionStats();

    let schemaVersion = 0;
    let tables = {
        note_types: [] as any[],
        notes: [] as any[],
        anki_cards: [] as any[],
        decks: [] as any[],
        deck_configs: [] as any[],
        revlog: [] as any[],
        graves: [] as any[],
        session_stats: [] as any[],
    };

    try {
        const db = getDB();

        schemaVersion = dbGetSchemaVersion();
        tables = {
            note_types: db.getAllSync('SELECT * FROM note_types ORDER BY id'),
            notes: db.getAllSync('SELECT * FROM notes ORDER BY id'),
            anki_cards: db.getAllSync('SELECT * FROM anki_cards ORDER BY id'),
            decks: db.getAllSync('SELECT * FROM decks ORDER BY id'),
            deck_configs: db.getAllSync('SELECT * FROM deck_configs ORDER BY id'),
            revlog: db.getAllSync('SELECT * FROM revlog ORDER BY id'),
            graves: db.getAllSync('SELECT * FROM graves'),
            session_stats: db.getAllSync('SELECT * FROM session_stats ORDER BY date'),
        };
    } catch {
        // If DB is not ready, fallback to metadata-only export.
    }

    return JSON.stringify({
        version: 6,
        schema_version: schemaVersion,
        exportDate: new Date().toISOString(),
        canonical: true,
        settings,
        sessionStats,
        tables,
    });
}

function isCanonicalImport(data: any): boolean {
    return Boolean(data?.canonical && data?.tables && typeof data.tables === 'object');
}

function importCanonicalTables(data: any): void {
    initDB();
    const db = getDB();

    db.execSync('BEGIN TRANSACTION;');
    try {
        db.execSync(`
            DELETE FROM revlog;
            DELETE FROM anki_cards;
            DELETE FROM notes;
            DELETE FROM decks;
            DELETE FROM deck_configs;
            DELETE FROM note_types;
            DELETE FROM graves;
            DELETE FROM cards_fts;
            DELETE FROM session_stats;
        `);

        for (const row of data.tables.note_types || []) {
            db.runSync(
                'INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
                row.id,
                row.name,
                row.data,
                row.updated_at ?? 0,
                row.usn ?? -1,
                row.tombstone ?? 0,
            );
        }

        for (const row of data.tables.notes || []) {
            db.runSync(
                'INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                row.id,
                row.noteTypeId,
                row.sfld,
                row.csum,
                row.tags,
                row.data,
                row.updated_at ?? 0,
                row.usn ?? -1,
                row.tombstone ?? 0,
            );
        }

        for (const row of data.tables.anki_cards || []) {
            db.runSync(
                `INSERT INTO anki_cards
                 (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, flags, data, updated_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                row.id,
                row.noteId,
                row.deckId,
                row.ord,
                row.type,
                row.queue,
                row.due,
                row.ivl,
                row.factor,
                row.reps,
                row.lapses,
                row.flags,
                row.data,
                row.updated_at ?? 0,
                row.usn ?? -1,
                row.tombstone ?? 0,
            );
        }

        for (const row of data.tables.decks || []) {
            db.runSync(
                'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
                row.id,
                row.name,
                row.data,
                row.updated_at ?? 0,
                row.usn ?? -1,
                row.tombstone ?? 0,
            );
        }

        for (const row of data.tables.deck_configs || []) {
            db.runSync('INSERT INTO deck_configs (id, data) VALUES (?, ?)', row.id, row.data);
        }

        for (const row of data.tables.revlog || []) {
            db.runSync(
                'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                row.id,
                row.cardId,
                row.usn,
                row.ease,
                row.ivl,
                row.lastIvl,
                row.factor,
                row.time,
                row.type,
            );
        }

        for (const row of data.tables.graves || []) {
            db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, ?, ?)', row.oid, row.type, row.usn);
        }

        for (const row of data.tables.session_stats || []) {
            db.runSync('INSERT INTO session_stats (date, data) VALUES (?, ?)', row.date, row.data);
        }

        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    dbIndexAllCards(getSearchIndexCards());
}

export async function importAllData(jsonString: string): Promise<boolean> {
    try {
        if (jsonString.length > MAX_IMPORT_SIZE) {
            console.error(`Import: Dosya çok büyük (${(jsonString.length / 1024 / 1024).toFixed(1)} MB > 50 MB limit)`);
            return false;
        }

        let data = JSON.parse(jsonString);
        data = sanitizeObject(data);

        if (!data.version || typeof data.version !== 'number') {
            console.error('Import: Geçersiz version alanı');
            return false;
        }

        if (data.settings && typeof data.settings !== 'object') {
            console.error('Import: settings bir obje değil');
            return false;
        }

        if (data.settings) {
            data.settings = validateSettings(data.settings);
            saveSettings(data.settings);
        }

        if (data.sessionStats) {
            await saveSessionStats(data.sessionStats as SessionStats);
        }

        if (isCanonicalImport(data)) {
            importCanonicalTables(data);
            await clearLegacyCardStates();
            await saveCustomCards([]);
            return true;
        }

        // Legacy import fallback (pre-canonical export format)
        if (data.cardStates && typeof data.cardStates !== 'object') {
            console.error('Import: cardStates bir obje değil');
            return false;
        }

        if (data.customCards && !Array.isArray(data.customCards)) {
            console.error('Import: customCards bir dizi değil');
            return false;
        }

        if (data.customCards) {
            migrateLegacyCustomCardsToAnki(data.customCards as Card[], { force: true });
        }

        if (data.cardStates) {
            const settings = loadSettings();
            migrateLegacyCardStatesToAnki(data.cardStates as Record<string, CardState>, settings, { force: true });
        }

        await clearLegacyCardStates();
        await saveCustomCards([]);

        return true;
    } catch (error) {
        console.error('Import hatası:', error);
        return false;
    }
}
