import type { AnkiCard, Note } from './models';
import { CATALOG_PACK_ID } from './catalogRows';

/** Keep learner-authored fields and their generated cards when the bundled package is updated. */
export function preserveCatalogNoteEdits(
    snapshot: { notes: Note[]; cards: AnkiCard[] },
    installedNotes: Note[],
    installedCards: AnkiCard[],
): void {
    const edited = new Map(installedNotes
        .filter((note) => note.catalogPack === CATALOG_PACK_ID && note.catalogFieldsEdited)
        .map((note) => [note.id, note]));
    const preservedIds = new Set<number>();
    snapshot.notes = snapshot.notes.map((source) => {
        const local = edited.get(source.id);
        // A package identity/schema change must never attach old fields to another note.
        if (!local || local.guid !== source.guid || local.noteTypeId !== source.noteTypeId) return source;
        preservedIds.add(source.id);
        return {
            ...source,
            fields: [...local.fields],
            tags: [...local.tags],
            sfld: local.sfld,
            csum: local.csum,
            mod: local.mod,
            usn: local.usn,
            catalogFieldsEdited: true,
        };
    });
    if (preservedIds.size === 0) return;
    snapshot.cards = [
        ...snapshot.cards.filter((card) => !preservedIds.has(card.noteId)),
        ...installedCards.filter((card) => preservedIds.has(card.noteId)),
    ];
}
