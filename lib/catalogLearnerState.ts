/**
 * The learner's own state on an installed catalog, carried onto the rows of a reinstall.
 *
 * A package refresh rewrites every catalog row from the package. What the learner made of those
 * rows is theirs and has to come through: each card's scheduling and its Anki data blob (FSRS
 * memory state, desired retention, original position, custom data), a new card's position, the
 * tags added to or removed from a note and, while the tier stays the same, the catalog's presets
 * and each catalog deck's preset, limits, description and folding. Edited fields are kept by
 * lib/catalogNoteEdits.ts. Nothing here writes: lib/bkaCatalog.ts reads the installed rows, lays
 * them over the package's snapshot and writes the result in the transaction that swaps the rows.
 */

import { getDB } from './db';
import type { AnkiCard, Deck, DeckConfig, Note } from './models';
import { CATALOG_PACK_ID, CATALOG_PROGRESS_FIELDS, isCatalogPackRow } from './catalogRows';
import type { BkaCatalogSnapshot } from './bkaCatalog';

/** What a refresh needs from an installed note; the fields of the ~7,700 notes are left out. */
export type InstalledCatalogNote = Pick<Note, 'id' | 'guid' | 'tags' | 'catalogPackageTags'>;

export interface InstalledCatalogState {
    notes: Map<number, InstalledCatalogNote>;
    /** Notes whose fields the learner edited, whole: their fields replace the package's. */
    editedNotes: Note[];
    /** Cards of the installed catalog notes. */
    cards: Map<number, AnkiCard>;
    decks: Map<number, Deck>;
    presets: Map<number, DeckConfig>;
    /** Every preset in the collection, the learner's own included. */
    presetIds: Set<number>;
}

/** Deck settings a learner chooses on a catalog deck; the package's are only a starting point. */
const DECK_LEARNER_FIELDS = ['configId', 'newLimit', 'reviewLimit', 'desiredRetention', 'collapsed'] as const;

/** The catalog's rows of a table, by id. Only rows naming the pack are read out of SQLite. */
function readCatalogRows<T>(table: 'notes' | 'decks' | 'deck_configs'): Map<number, T> {
    const parsed = new Map<number, T>();
    const rows = getDB().getAllSync<{ id: number; data: string }>(
        `SELECT id, data FROM ${table} WHERE instr(data, ?) > 0`, CATALOG_PACK_ID,
    );
    for (const row of rows) {
        if (!isCatalogPackRow(row.data)) continue;
        try { parsed.set(Number(row.id), JSON.parse(row.data) as T); } catch { /* the marker check parsed it once */ }
    }
    return parsed;
}

/** Read the installed catalog's notes, cards, decks and presets. */
export function readInstalledCatalogState(): InstalledCatalogState {
    const db = getDB();
    const notes = new Map<number, InstalledCatalogNote>();
    const editedNotes: Note[] = [];
    for (const [id, note] of readCatalogRows<Note>('notes')) {
        notes.set(id, { id, guid: note.guid, tags: note.tags, catalogPackageTags: note.catalogPackageTags });
        if (note.catalogFieldsEdited) editedNotes.push(note);
    }
    const cards = new Map<number, AnkiCard>();
    const cardRows = notes.size === 0 ? [] : db.getAllSync<{ id: number; data: string }>(
        'SELECT id, data FROM anki_cards WHERE noteId IN (SELECT value FROM json_each(?))',
        JSON.stringify([...notes.keys()]),
    );
    for (const row of cardRows) {
        try { cards.set(Number(row.id), JSON.parse(row.data) as AnkiCard); } catch { /* nothing readable to keep */ }
    }
    return {
        notes,
        editedNotes,
        cards,
        decks: readCatalogRows<Deck>('decks'),
        presets: readCatalogRows<DeckConfig>('deck_configs'),
        presetIds: new Set(db.getAllSync<{ id: number }>('SELECT id FROM deck_configs').map((row) => Number(row.id))),
    };
}

const tagKey = (tag: string) => tag.normalize('NFC').toLocaleLowerCase();

/**
 * The tags a reinstalled note gets. The learner's additions and removals since the package's own
 * tags were recorded on the note are laid over the new package's tags, so an author's tag fix
 * still reaches a note the learner never re-tagged. A note installed before that record existed
 * keeps its installed tags whole: there is no telling which of them the learner chose.
 */
export function mergeCatalogTags(
    packageTags: readonly string[],
    installedTags: readonly string[],
    recordedPackageTags: readonly string[] | undefined,
): string[] {
    if (!recordedPackageTags) return [...installedTags];
    const recorded = new Set(recordedPackageTags.map(tagKey));
    const kept = new Set(installedTags.map(tagKey));
    const merged = packageTags.filter((tag) => !recorded.has(tagKey(tag)) || kept.has(tagKey(tag)));
    const present = new Set(merged.map(tagKey));
    for (const tag of installedTags) {
        const key = tagKey(tag);
        if (recorded.has(key) || present.has(key)) continue;
        merged.push(tag);
        present.add(key);
    }
    return merged;
}

/**
 * Lay the learner's state from the installed rows over a snapshot read from the package. Deck and
 * preset choices are carried only between installs of the same tier; card and note state always,
 * for every card and note that is still the same card or note in the new package.
 *
 * Returns the snapshot to write and the ids of cards whose state came from the installed rows,
 * which an older stash of progress must not overwrite.
 */
export function carryCatalogLearnerState(
    source: BkaCatalogSnapshot,
    installed: InstalledCatalogState,
    sameTier: boolean,
): { snapshot: BkaCatalogSnapshot; carriedCardIds: Set<number> } {
    const carriedCardIds = new Set<number>();
    const cards = source.cards.map((card) => {
        const before = installed.cards.get(card.id);
        if (!before || before.noteId !== card.noteId || before.ord !== card.ord) return card;
        carriedCardIds.add(card.id);
        const carried = { ...card } as unknown as Record<string, unknown>;
        for (const field of CATALOG_PROGRESS_FIELDS) {
            if (before[field] !== undefined) carried[field] = before[field];
        }
        if (before.ankiData !== undefined) carried.ankiData = before.ankiData;
        return carried as unknown as AnkiCard;
    });

    const notes = source.notes.map((note) => {
        const before = installed.notes.get(note.id);
        const tags = before && before.guid === note.guid
            ? mergeCatalogTags(note.tags, before.tags ?? [], before.catalogPackageTags)
            : note.tags;
        return { ...note, tags, catalogPackageTags: [...note.tags] };
    });

    if (!sameTier) return { snapshot: { ...source, cards, notes }, carriedCardIds };

    // The catalog's presets as the learner tuned them, and any the new package dropped that a
    // catalog deck still uses.
    const deckConfigs = source.deckConfigs.map((preset) => installed.presets.get(preset.id) ?? preset);
    const offered = new Set(deckConfigs.map((preset) => preset.id));
    const decks = source.decks.map((deck) => {
        const before = installed.decks.get(deck.id);
        if (!before) return deck;
        const kept: Deck = { ...deck };
        for (const field of DECK_LEARNER_FIELDS) {
            (kept as unknown as Record<string, unknown>)[field] = before[field];
        }
        // A description the learner wrote; the package ships none.
        if (before.description) {
            kept.description = before.description;
            kept.descriptionMarkdown = before.descriptionMarkdown;
        }
        const keptPreset = installed.presets.get(kept.configId);
        if (keptPreset && !offered.has(keptPreset.id)) {
            deckConfigs.push(keptPreset);
            offered.add(keptPreset.id);
        }
        // A preset that is neither the catalog's nor still in the collection falls back to the package's.
        if (!offered.has(kept.configId) && !(installed.presetIds.has(kept.configId) && !installed.presets.has(kept.configId))) {
            kept.configId = deck.configId;
        }
        return kept;
    });
    return { snapshot: { ...source, cards, notes, decks, deckConfigs }, carriedCardIds };
}
