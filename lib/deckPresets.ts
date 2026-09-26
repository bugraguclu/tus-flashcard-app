import { DEFAULT_DECK_CONFIG, uniqueId, type Deck, type DeckConfig } from './models';
import { getDB } from './db';
import { markSourcePackageDirty } from './ankiPackageArchive';
import { assertCatalogDeckConfigMutable } from './catalogProtection';
import { getAllDecks, getDeck, saveDeck } from './deckStore';

/**
 * Deck option presets: reading and saving them, and which decks use each one.
 */

// ---- Deck Config ----

export function getAllDeckConfigs(): DeckConfig[] {
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>('SELECT data FROM deck_configs');
    return rows.map(r => JSON.parse(r.data));
}

export function getDeckConfig(id: number): DeckConfig {
    const db = getDB();
    const row = db.getFirstSync<{ data: string }>('SELECT data FROM deck_configs WHERE id = ?', id);
    return row ? JSON.parse(row.data) : { ...DEFAULT_DECK_CONFIG };
}

export function saveDeckConfig(config: DeckConfig): void {
    assertCatalogDeckConfigMutable(config);
    const db = getDB();
    const existing = db.getFirstSync<{ data: string }>('SELECT data FROM deck_configs WHERE id = ?', config.id);
    if (existing?.data) {
        try {
            markSourcePackageDirty((JSON.parse(existing.data) as DeckConfig).sourcePackageId);
        } catch { /* malformed legacy blobs are replaced below */ }
    }
    db.runSync(
        'INSERT OR REPLACE INTO deck_configs (id, data) VALUES (?, ?)',
        config.id, JSON.stringify(config)
    );
}

// ---- Presets (Anki: deck options presets shared across decks) ----

/** Decks currently assigned to a config/preset. */
export function getDecksUsingConfig(configId: number): Deck[] {
    return getAllDecks().filter((deck) => (deck.configId || DEFAULT_DECK_CONFIG.id) === configId);
}

/** Create a new preset, cloned from an existing config (default: the shared preset). */
export function createPreset(name: string, cloneFromId: number = DEFAULT_DECK_CONFIG.id): DeckConfig {
    const base = getDeckConfig(cloneFromId);
    const preset: DeckConfig = { ...base, id: uniqueId(), name: name.trim() || 'Yeni Ayar Grubu' };
    saveDeckConfig(preset);
    return preset;
}

export function renamePreset(configId: number, name: string): void {
    const config = getDeckConfig(configId);
    const nextName = name.normalize('NFC').trim();
    if (!nextName) throw new Error('A preset name cannot be empty.');
    if (nextName === config.name) return;
    config.name = nextName;
    saveDeckConfig(config);
}

/** Restore a preset's scheduling values while keeping its identity and import metadata. */
export function restoreDeckConfigDefaults(configId: number): DeckConfig {
    const current = getDeckConfig(configId);
    assertCatalogDeckConfigMutable(current);
    const restored: DeckConfig = {
        ...current,
        ...DEFAULT_DECK_CONFIG,
        id: current.id,
        name: current.name,
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
    };
    saveDeckConfig(restored);
    return restored;
}

/** Delete a preset; decks using it fall back to the shared default. The default itself stays. */
export function deletePreset(configId: number): void {
    if (configId === DEFAULT_DECK_CONFIG.id) return;

    for (const deck of getDecksUsingConfig(configId)) {
        deck.configId = DEFAULT_DECK_CONFIG.id;
        deck.mod = Math.floor(Date.now() / 1000);
        deck.usn = -1;
        saveDeck(deck);
    }
    getDB().runSync('DELETE FROM deck_configs WHERE id = ?', configId);
}

export function assignDeckConfig(deckId: number, configId: number): void {
    const deck = getDeck(deckId);
    if (!deck) return;
    deck.configId = configId;
    deck.mod = Math.floor(Date.now() / 1000);
    deck.usn = -1;
    saveDeck(deck);
}

/** Anki's "save to all subdecks": every subdeck adopts this deck's preset. */
export function applyConfigToSubdecks(deckId: number): number {
    const deck = getDeck(deckId);
    if (!deck) return 0;

    const prefix = `${deck.name}::`;
    let changed = 0;
    for (const candidate of getAllDecks()) {
        if (!candidate.name.startsWith(prefix) || candidate.isFiltered) continue;
        if ((candidate.configId || DEFAULT_DECK_CONFIG.id) === (deck.configId || DEFAULT_DECK_CONFIG.id)) continue;
        candidate.configId = deck.configId || DEFAULT_DECK_CONFIG.id;
        candidate.mod = Math.floor(Date.now() / 1000);
        candidate.usn = -1;
        saveDeck(candidate);
        changed++;
    }
    return changed;
}
