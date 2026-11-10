import { remapDeckLearningSteps } from './deckPresetSteps';
import { DEFAULT_DECK_CONFIG, uniqueId, type Deck, type DeckConfig } from './models';
import { getDB } from './db';
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
    let before: DeckConfig | null = null;
    try { if (existing?.data) before = JSON.parse(existing.data); } catch { /* No recoverable old steps. */ }
    db.execSync('SAVEPOINT save_deck_preset;');
    try {
        db.runSync('INSERT OR REPLACE INTO deck_configs (id, data) VALUES (?, ?)', config.id, JSON.stringify(config));
        if (before) remapDeckLearningSteps(getDecksUsingConfig(config.id).map(d => d.id), before, config);
        db.execSync('RELEASE SAVEPOINT save_deck_preset;');
    } catch (error) {
        db.execSync('ROLLBACK TO SAVEPOINT save_deck_preset; RELEASE SAVEPOINT save_deck_preset;');
        throw error;
    }
}

// ---- Presets (Anki: deck options presets shared across decks) ----

/**
 * The name a preset is shown under.
 *
 * The built-in preset was labelled after what used to be the app's one deck, "TUS Kartları". The
 * ready-made package now brings a deck and presets of that very name, so Deck Options showed a
 * learner's own decks as sharing "TUS Kartları" with them. Until the learner renames it, the
 * built-in preset reads "Varsayılan", as Anki's reads "Default". The stored name is left alone.
 */
export function presetDisplayName(preset: Pick<DeckConfig, 'id' | 'name'>, l: (tr: string, en: string) => string): string {
    return preset.id === DEFAULT_DECK_CONFIG.id && preset.name === DEFAULT_DECK_CONFIG.name
        ? l('Varsayılan', 'Default')
        : preset.name;
}

/** Decks currently assigned to a config/preset. */
export function getDecksUsingConfig(configId: number): Deck[] {
    return getAllDecks().filter((deck) => (deck.configId || DEFAULT_DECK_CONFIG.id) === configId);
}

/** Create a new preset, cloned from an existing config (default: the shared preset). */
export function createPreset(name: string, cloneFromId: number = DEFAULT_DECK_CONFIG.id): DeckConfig {
    // A copy belongs to the learner: it never inherits the source's catalog ownership or the
    // package it was imported from.
    const {
        catalogPack: _catalogPack, catalogSourceId: _catalogSourceId, sourcePackageId: _sourcePackageId, ...owned
    } = getDeckConfig(cloneFromId);
    const preset: DeckConfig = { ...owned, id: uniqueId(), name: name.trim() || 'Yeni Ayar Grubu' };
    saveDeckConfig(preset);
    return preset;
}

/** Anki's "Add Preset": a new preset with the built-in defaults, not a copy of another one. */
export function createDefaultPreset(name: string): DeckConfig {
    const preset: DeckConfig = {
        ...DEFAULT_DECK_CONFIG,
        id: uniqueId(),
        name: name.normalize('NFC').trim() || 'Yeni Ayar Grubu',
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
    };
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

/**
 * A preset with every option at its default, for Deck Options' Restore Defaults. It keeps the
 * preset's identity and import metadata and writes nothing: the screen shows the values and Save
 * stores them, as Anki's revert buttons only change the form. Options the defaults leave unset (the
 * audio speed, "Ignore reviews before" and the optimizer's stamp) go back to unset.
 */
export function presetWithDefaults(config: DeckConfig): DeckConfig {
    const { ankiRaw, sourcePackageId, catalogPack } = config;
    return {
        ...DEFAULT_DECK_CONFIG,
        id: config.id,
        name: config.name,
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
        ...(ankiRaw === undefined ? {} : { ankiRaw }),
        ...(sourcePackageId === undefined ? {} : { sourcePackageId }),
        ...(catalogPack === undefined ? {} : { catalogPack }),
    };
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
    const before = getDeckConfig(deck.configId || DEFAULT_DECK_CONFIG.id);
    const after = getDeckConfig(configId);
    const db = getDB();
    db.execSync('SAVEPOINT assign_deck_preset;');
    try {
        deck.configId = configId;
        deck.mod = Math.floor(Date.now() / 1000);
        deck.usn = -1;
        saveDeck(deck);
        remapDeckLearningSteps([deck.id], before, after);
        db.execSync('RELEASE SAVEPOINT assign_deck_preset;');
    } catch (error) {
        db.execSync('ROLLBACK TO SAVEPOINT assign_deck_preset; RELEASE SAVEPOINT assign_deck_preset;');
        throw error;
    }
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
        assignDeckConfig(candidate.id, deck.configId || DEFAULT_DECK_CONFIG.id);
        changed++;
    }
    return changed;
}
