/**
 * Plain-text export of the whole collection, in the same `#directive` + tab-separated shape
 * importDelimited.ts already reads — so a file this module writes round-trips through the
 * app's own /import screen, mirroring Anki's "Notes in Plain Text" export/import pair.
 */

import { getAllNotes, getNoteType } from './noteManager';
import { BUILTIN_NOTE_TYPES } from './models';
import { getDB } from './db';

function escapeField(value: string): string {
    // Tabs and newlines would desync columns/rows on re-import; Anki's own exporter
    // collapses them the same way.
    return value.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
}

/** Note ids that have at least one card inside the deck subtree (Anki's per-deck export scope). */
export function getNoteIdsInDeck(deckName: string): Set<number> {
    const escaped = deckName.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const rows = getDB().getAllSync<{ noteId: number }>(
        `SELECT DISTINCT c.noteId AS noteId
         FROM anki_cards c
         JOIN decks d ON d.id = c.deckId
         WHERE d.name = ? OR d.name LIKE ? ESCAPE '\\'`,
        deckName,
        `${escaped}::%`,
    );
    return new Set(rows.map((row) => row.noteId));
}

/** Serializes notes as `#separator:tab` / `#html:true` text, one row per note.
 *  With `deckName`, only notes that have a card in that deck subtree are included. */
export function buildExportText(deckName?: string, selectedNoteIds?: Set<number>): string {
    const scope = selectedNoteIds ?? (deckName ? getNoteIdsInDeck(deckName) : null);
    const notes = getAllNotes().filter((note) => !scope || scope.has(note.id));
    const lines = ['#separator:tab', '#html:true'];

    for (const note of notes) {
        const noteType = getNoteType(note.noteTypeId) ?? BUILTIN_NOTE_TYPES.find((nt) => nt.id === note.noteTypeId);
        const fieldCount = noteType?.fields.length ?? note.fields.length;
        const row: string[] = [];
        for (let i = 0; i < fieldCount; i++) row.push(escapeField(note.fields[i] ?? ''));
        lines.push(row.join('\t'));
    }

    return lines.join('\n');
}

export function exportFileName(deckName?: string): string {
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = deckName
        ? `-${deckName.split('::').pop()!.toLowerCase().replace(/[^a-z0-9çğıöşü]+/gi, '-')}`
        : '';
    return `tusankim-disa-aktarim${scope}-${stamp}.txt`;
}
