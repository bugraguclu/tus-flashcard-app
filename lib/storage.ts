// ============================================================
// TUS Flashcard - Storage Layer (AsyncStorage)
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardState, SessionStats, AppSettings, AlgorithmType } from './types';
import type { Card } from './types';
import { todayLocalYMD } from './scheduler';
import { dbSaveAllCardStates, dbGetSchemaVersion } from './db';

const KEYS = {
    CARD_STATES: 'tus_card_states_v2',
    CUSTOM_CARDS: 'tus_custom_cards_v2',
    SESSION_STATS: 'tus_stats_v2',
    SETTINGS: 'tus_settings_v2',
};

export const DEFAULT_SETTINGS: AppSettings = {
    dailyNewLimit: 20,
    learningSteps: [1, 10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseNewInterval: 0.7,
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

        // Blob (eski format uyumluluğu)
        const blobData = await AsyncStorage.getItem(KEYS.CARD_STATES);
        const states: Record<string, CardState> = blobData ? JSON.parse(blobData) : {};

        // Per-card keys ile üzerine yaz (daha güncel)
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

// --- Settings ---
export async function loadSettings(): Promise<AppSettings> {
    try {
        const data = await AsyncStorage.getItem(KEYS.SETTINGS);
        if (data) return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch { }
    return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
    try {
        await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
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
    // Also clear SQLite card_states
    try {
        const { getDB } = require('./db');
        const db = getDB();
        db.execSync('DELETE FROM card_states;');
    } catch { /* DB might not be initialized */ }
}

// --- Export All (D5: versioned + compact) ---
export async function exportAllData(): Promise<string> {
    const [cardStates, customCards, settings, sessionStats] = await Promise.all([
        loadAllCardStates(),
        loadCustomCards(),
        loadSettings(),
        loadSessionStats(),
    ]);

    let schemaVersion = 0;
    try { schemaVersion = dbGetSchemaVersion(); } catch { /* DB might not be initialized */ }

    return JSON.stringify({
        version: 4,
        schema_version: schemaVersion,
        exportDate: new Date().toISOString(),
        cardCount: Object.keys(cardStates).length,
        cardStates,
        customCards,
        settings,
        sessionStats,
    });
}

// --- Import All (D5: validation + SQLite sync) ---
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

/** Validate and clamp imported settings to safe ranges */
function validateSettings(settings: Record<string, unknown>): Record<string, unknown> {
    const validated = { ...DEFAULT_SETTINGS, ...settings };
    // Clamp numeric values to safe ranges
    validated.dailyNewLimit = Math.max(0, Math.min(9999, Number(validated.dailyNewLimit) || 20));
    validated.graduatingInterval = Math.max(1, Math.min(365, Number(validated.graduatingInterval) || 1));
    validated.easyInterval = Math.max(1, Math.min(365, Number(validated.easyInterval) || 4));
    validated.startingEase = Math.max(1.3, Math.min(5.0, Number(validated.startingEase) || 2.5));
    validated.lapseNewInterval = Math.max(0, Math.min(1.0, Number(validated.lapseNewInterval) || 0.7));
    validated.desiredRetention = Math.max(0.5, Math.min(0.99, Number(validated.desiredRetention) || 0.9));
    // Validate learningSteps array
    if (Array.isArray(validated.learningSteps)) {
        validated.learningSteps = validated.learningSteps
            .filter((s: unknown) => typeof s === 'number' && s > 0 && s <= 10080)
            .slice(0, 20);
        if (validated.learningSteps.length === 0) validated.learningSteps = [1, 10];
    } else {
        validated.learningSteps = [1, 10];
    }
    validated.algorithm = 'ANKI_V3' as AlgorithmType;
    return validated;
}

export async function importAllData(jsonString: string): Promise<boolean> {
    try {
        // S2: Size limit to prevent memory exhaustion
        if (jsonString.length > MAX_IMPORT_SIZE) {
            console.error(`Import: Dosya çok büyük (${(jsonString.length / 1024 / 1024).toFixed(1)} MB > 50 MB limit)`);
            return false;
        }

        let data = JSON.parse(jsonString);

        // S2: Prototype pollution prevention
        data = sanitizeObject(data);

        // Validation: version kontrolü
        if (!data.version || typeof data.version !== 'number') {
            console.error('Import: Geçersiz version alanı');
            return false;
        }

        // Validation: cardStates obje mi?
        if (data.cardStates && typeof data.cardStates !== 'object') {
            console.error('Import: cardStates bir obje değil');
            return false;
        }

        // Validation: customCards dizi mi?
        if (data.customCards && !Array.isArray(data.customCards)) {
            console.error('Import: customCards bir dizi değil');
            return false;
        }

        // Validation: settings obje mi?
        if (data.settings && typeof data.settings !== 'object') {
            console.error('Import: settings bir obje değil');
            return false;
        }

        // S8: Validate and clamp settings
        if (data.settings) {
            data.settings = validateSettings(data.settings);
        }

        // AsyncStorage'a yaz (backward compat)
        const pairs: [string, string][] = [];
        if (data.cardStates) pairs.push([KEYS.CARD_STATES, JSON.stringify(data.cardStates)]);
        if (data.customCards) pairs.push([KEYS.CUSTOM_CARDS, JSON.stringify(data.customCards)]);
        if (data.settings) pairs.push([KEYS.SETTINGS, JSON.stringify(data.settings)]);
        if (data.sessionStats) pairs.push([KEYS.SESSION_STATS, JSON.stringify(data.sessionStats)]);

        await AsyncStorage.multiSet(pairs);

        // SQLite'a da sync et
        if (data.cardStates) {
            try {
                dbSaveAllCardStates(data.cardStates);
            } catch (e) {
                console.warn('Import: SQLite sync hatası (AsyncStorage\'a yazıldı):', e);
            }
        }

        return true;
    } catch (e) {
        console.error('Import hatası:', e);
        return false;
    }
}
