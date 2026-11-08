/**
 * The ids the catalog's note types, presets and decks take in this collection.
 *
 * The package brings its own ids, and they are not the catalog's alone: the catalog's notes use
 * AnKing's note types, which keep the same ids in every deck built on them, and the importer
 * keeps a package's ids when they are free. So a learner who imported an AnKing-based deck may
 * already own a note type under the catalog's id. A row the learner owns is never written over:
 * a package id taken by one gives the catalog's row a fresh id, recorded on that row as
 * `catalogSourceId` so that every later refresh finds it there again. A collection where the
 * catalog's rows already hold the package ids keeps them.
 */

import { getDB } from './db';
import { uniqueId } from './models';
import { CATALOG_PACK_ID } from './catalogRows';
import type { BkaCatalogSnapshot } from './bkaCatalogSnapshot';

type CatalogTable = 'note_types' | 'deck_configs' | 'decks';

/** Package id → the id the catalog's row has, or gets, in this collection. */
function assignIds(table: CatalogTable, packageIds: readonly number[]): Map<number, number> {
    const taken = new Set<number>();
    const learnerIds = new Set<number>();
    const catalogIdBySource = new Map<number, number>();
    for (const row of getDB().getAllSync<{ id: number; data: string }>(`SELECT id, data FROM ${table}`)) {
        const id = Number(row.id);
        taken.add(id);
        let owned: { catalogPack?: unknown; catalogSourceId?: unknown } | null = null;
        try { owned = JSON.parse(row.data); } catch { owned = null; }
        if (owned?.catalogPack !== CATALOG_PACK_ID) {
            learnerIds.add(id);
            continue;
        }
        const source = typeof owned.catalogSourceId === 'number' ? owned.catalogSourceId : id;
        if (!catalogIdBySource.has(source) || id === source) catalogIdBySource.set(source, id);
    }

    const reserved = new Set(packageIds);
    const assigned = new Map<number, number>();
    for (const packageId of packageIds) {
        let id = catalogIdBySource.get(packageId) ?? packageId;
        if (!catalogIdBySource.has(packageId) && learnerIds.has(packageId)) {
            do { id = uniqueId(); } while (taken.has(id) || reserved.has(id));
            reserved.add(id);
        }
        assigned.set(packageId, id);
    }
    return assigned;
}

/** The snapshot with its rows under the ids they take in this collection. */
export function withCatalogIds(snapshot: BkaCatalogSnapshot): BkaCatalogSnapshot {
    const noteTypeIds = assignIds('note_types', snapshot.noteTypes.map((noteType) => noteType.id));
    const presetIds = assignIds('deck_configs', snapshot.deckConfigs.map((preset) => preset.id));
    const deckIds = assignIds('decks', snapshot.decks.map((deck) => deck.id));
    const moved = (ids: Map<number, number>) => [...ids].some(([packageId, id]) => packageId !== id);
    if (!moved(noteTypeIds) && !moved(presetIds) && !moved(deckIds)) return snapshot;

    const local = (ids: Map<number, number>, packageId: number) => ids.get(packageId) ?? packageId;
    const relocated = <T extends { id: number }>(row: T, ids: Map<number, number>): T => {
        const id = local(ids, row.id);
        return id === row.id ? row : { ...row, id, catalogSourceId: row.id };
    };
    return {
        ...snapshot,
        noteTypes: snapshot.noteTypes.map((noteType) => relocated(noteType, noteTypeIds)),
        deckConfigs: snapshot.deckConfigs.map((preset) => relocated(preset, presetIds)),
        decks: snapshot.decks.map((deck) => ({ ...relocated(deck, deckIds), configId: local(presetIds, deck.configId) })),
        notes: snapshot.notes.map((note) => ({ ...note, noteTypeId: local(noteTypeIds, note.noteTypeId) })),
        cards: snapshot.cards.map((card) => ({ ...card, deckId: local(deckIds, card.deckId) })),
        subjects: snapshot.subjects.map((subject) => ({ ...subject, deckId: local(deckIds, subject.deckId) })),
    };
}
