// ============================================================
// TUS Flashcard - Storage Layer (AsyncStorage)
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardState, SessionStats, AppSettings, AlgorithmType } from './types';
import type { Card } from './types';
import { todayLocalYMD } from './scheduler';
import { dbSaveAllCardStates, dbGetSchemaVersion } from './db';
import { getDeckConfig, saveDeckConfig } from './deckManager';

const KEYS = {
    CARD_STATES: 'tus_card_states_v2',
    CUSTOM_CARDS: 'tus_custom_cards_v2',
    SESSION_STATS: 'tus_stats_v2',
    SETTINGS: 'tus_settings_v2',
};

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
    algorithm: 'ANKI_V3' as AlgorithmType,
    desiredRetention: 0.9,
};

// --- Card States ---
export async function loadCardStates(): Promise<Record<string, CardState>> {
    try {
        const data = await AsyncStorage.getItem(KEYS.CARD_STATES);
        return data ? JSON.parse(data) : {};
    } catch {
        return {};
    }
}

export async function saveCardStates(states: Record<string, CardState>): Promise<void> {
    try {
        await AsyncStorage.setItem(KEYS.CARD_STATES, JSON.stringify(states));
    } catch (e) {
        console.error('Card states kayıt hatası:', e);
    }
}

// QW5: Per-card incremental persistence — tek kart kaydet (blob yok)
const CARD_STATE_PREFIX = 'tus_cs:';

export async function saveCardState(id: number, state: CardState): Promise<void> {
    try {
        await AsyncStorage.setItem(`${CARD_STATE_PREFIX}${id}`, JSON.stringify(state));
    } catch (e) {
        console.error(`Card state ${id} kayıt hatası:`, e);
    }
}

// Hibrit load: önce blob, sonra per-card key'ler ile birleştir
export async function loadAllCardStates(): Promise<Record<string, CardState>> {
    try {
        const allKeys = await AsyncStorage.getAllKeys();
        const perCardKeys = allKeys.filter((k: string) => k.startsWith(CARD_STATE_PREFIX));

        // Legacy blob snapshot.
        const blobData = await AsyncStorage.getItem(KEYS.CARD_STATES);
        const states: Record<string, CardState> = blobData ? JSON.parse(blobData) : {};

        // Per-card values override the blob because they are newer.
        if (perCardKeys.length > 0) {
            const pairs = await AsyncStorage.multiGet(perCardKeys);
            for (const [key, value] of pairs) {
                if (value) {
                    const id = key.replace(CARD_STATE_PREFIX, '');
                    states[id] = JSON.parse(value);
                }
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

// --- Custom Cards ---
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

// --- Session Stats ---
export async function loadSessionStats(): Promise<SessionStats> {
    try {
        const data = await AsyncStorage.getItem(KEYS.SESSION_STATS);
        if (data) {
            const parsed = JSON.parse(data);
            const today = todayLocalYMD();
            if (parsed.date === today) return parsed;
        }
    } catch { }
    return { reviewed: 0, correct: 0, wrong: 0, startTime: Date.now(), newCardsToday: 0 };
}

export async function saveSessionStats(stats: SessionStats): Promise<void> {
    try {
        await AsyncStorage.setItem(KEYS.SESSION_STATS, JSON.stringify({
            ...stats,
            date: todayLocalYMD(),
        }));
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
            desiredRetention: config.desiredRetention || base.desiredRetention,
        };
    } catch {
        return base;
    }
}

// --- Settings ---
export async function loadSettings(): Promise<AppSettings> {
    try {
        const data = await AsyncStorage.getItem(KEYS.SETTINGS);
        if (data) {
            const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(data) } as AppSettings;
            return hydrateSettingsFromDeckConfig(parsed);
        }
    } catch {
        // ignore and fallback to defaults
    }

    return hydrateSettingsFromDeckConfig({ ...DEFAULT_SETTINGS });
}

export async function saveSettings(settings: AppSettings): Promise<void> {
    try {
        await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
        syncDefaultDeckConfig(settings);
    } catch (e) {
        console.error('Settings kayıt hatası:', e);
    }
}

// --- Reset ---
export async function resetAllData(): Promise<void> {
    await Promise.all([
        AsyncStorage.removeItem(KEYS.CARD_STATES),
        AsyncStorage.removeItem(KEYS.SESSION_STATS),
        AsyncStorage.removeItem(KEYS.CUSTOM_CARDS),
        AsyncStorage.removeItem(KEYS.SETTINGS),
    ]);

    try {
        const { getDB } = require('./db');
        const { initAnkiData } = require('./ankiInit');
        const { dbIndexAllCards } = require('./db');
        const { getSearchIndexCards } = require('./noteManager');

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
            DELETE FROM card_states;
            DELETE FROM cards_fts;
            DELETE FROM session_stats;
            DELETE FROM settings;
            COMMIT;
        `);

        initAnkiData();
        dbIndexAllCards(getSearchIndexCards());
    } catch {
        /* Database may not be initialized yet. */
    }
}

// --- Export All (canonical SQLite model) ---
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

function validateSettings(settings: Record<string, unknown>): Record<string, unknown> {
    const validated = { ...DEFAULT_SETTINGS, ...settings };
    validated.dailyNewLimit = Math.max(0, Math.min(9999, Number(validated.dailyNewLimit) || 20));
    validated.dailyReviewLimit = Math.max(0, Math.min(9999, Number(validated.dailyReviewLimit) || 200));
    validated.graduatingInterval = Math.max(1, Math.min(365, Number(validated.graduatingInterval) || 1));
    validated.easyInterval = Math.max(1, Math.min(365, Number(validated.easyInterval) || 4));
    validated.startingEase = Math.max(1.3, Math.min(5.0, Number(validated.startingEase) || 2.5));
    validated.lapseNewInterval = Math.max(0, Math.min(1.0, Number(validated.lapseNewInterval) || 0.7));
    validated.desiredRetention = Math.max(0.5, Math.min(0.99, Number(validated.desiredRetention) || 0.9));
    validated.learningSteps = sanitizeStepArray(validated.learningSteps, [1, 10]);
    validated.lapseSteps = sanitizeStepArray(validated.lapseSteps, [10]);
    validated.queueOrder = validated.queueOrder === 'learning-new-review' ? 'learning-new-review' : 'learning-review-new';
    validated.newCardOrder = validated.newCardOrder === 'random' ? 'random' : 'sequential';
    validated.algorithm = 'ANKI_V3' as AlgorithmType;
    return validated;
}

export async function exportAllData(): Promise<string> {
    const [settings, sessionStats] = await Promise.all([loadSettings(), loadSessionStats()]);

    let schemaVersion = 0;
    let tables = {
        note_types: [] as any[],
        notes: [] as any[],
        anki_cards: [] as any[],
        decks: [] as any[],
        deck_configs: [] as any[],
        revlog: [] as any[],
        graves: [] as any[],
    };

    try {
        const { getDB } = require('./db');
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
        };
    } catch {
        // If DB is not ready, fallback to metadata-only export.
    }

    return JSON.stringify({
        version: 5,
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
    const { initDB, getDB } = require('./db');
    const { dbIndexAllCards } = require('./db');
    const { getSearchIndexCards } = require('./noteManager');

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
        }

        const pairs: [string, string][] = [];
        if (data.settings) pairs.push([KEYS.SETTINGS, JSON.stringify(data.settings)]);
        if (data.sessionStats) pairs.push([KEYS.SESSION_STATS, JSON.stringify(data.sessionStats)]);
        if (pairs.length > 0) {
            await AsyncStorage.multiSet(pairs);
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

        const legacyPairs: [string, string][] = [];
        if (data.cardStates) legacyPairs.push([KEYS.CARD_STATES, JSON.stringify(data.cardStates)]);
        if (data.customCards) legacyPairs.push([KEYS.CUSTOM_CARDS, JSON.stringify(data.customCards)]);
        if (legacyPairs.length > 0) {
            await AsyncStorage.multiSet(legacyPairs);
        }

        if (data.cardStates) {
            try {
                dbSaveAllCardStates(data.cardStates);
            } catch (error) {
                console.warn('Import: SQLite sync hatası (legacy fallback):', error);
            }
        }

        return true;
    } catch (error) {
        console.error('Import hatası:', error);
        return false;
    }
}
