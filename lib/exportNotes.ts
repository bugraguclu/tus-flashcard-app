/**
 * Plain-text export of the whole collection, in the same `#directive` + tab-separated shape
 * importDelimited.ts already reads — so a file this module writes round-trips through the
 * app's own /import screen, mirroring Anki's "Notes in Plain Text" export/import pair.
 */

import { getAllAnkiCards, getAllNotes, getAllNoteTypes } from './noteManager';
import { BUILTIN_NOTE_TYPES, type AnkiCard, type Deck, type Note, type NoteType } from './models';
import { getDB } from './db';
import { getAllDecks } from './deckManager';
import { isCatalogNote } from './catalogProtection';

function escapeField(value: string): string {
    // Anki's text exporter uses real CSV quoting, even though the separator is a tab.
    // This preserves embedded tabs, quotes and multiline fields byte-for-byte on import.
    return /[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export interface NoteTextExportOptions {
    withHtml?: boolean;
    withTags?: boolean;
    withDeck?: boolean;
    withNotetype?: boolean;
    withGuid?: boolean;
    /** Prefer a card from one of these exact decks for the exported deck column. */
    preferredDeckIds?: ReadonlySet<number>;
}

export interface NoteTextExportData {
    notes: Note[];
    cards: AnkiCard[];
    decks: Deck[];
    noteTypes: NoteType[];
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
export function buildExportText(
    deckName?: string,
    selectedNoteIds?: Set<number>,
    options: NoteTextExportOptions = {},
): string {
    return buildExportTextFromData({
        notes: getAllNotes(),
        cards: getAllAnkiCards(),
        decks: getAllDecks(),
        noteTypes: getAllNoteTypes(),
    }, deckName, selectedNoteIds, options);
}

/** Pure-data variant used by stored-backup export. It never consults or mutates the live DB. */
export function buildExportTextFromData(
    data: NoteTextExportData,
    deckName?: string,
    selectedNoteIds?: Set<number>,
    options: NoteTextExportOptions = {},
): string {
    const withHtml = options.withHtml !== false;
    const withTags = options.withTags !== false;
    const withDeck = options.withDeck !== false;
    const withNotetype = options.withNotetype !== false;
    const withGuid = options.withGuid !== false;
    const decks = new Map(data.decks.map((deck) => [deck.id, deck.name]));
    const scope = selectedNoteIds ?? (deckName
        ? new Set(data.cards.filter((card) => {
            const name = decks.get(card.deckId);
            return name === deckName || name?.startsWith(`${deckName}::`);
        }).map((card) => card.noteId))
        : null);
    const notes = data.notes.filter((note) => !isCatalogNote(note) && (!scope || scope.has(note.id)));
    const cards = data.cards;
    const noteTypes = new Map(data.noteTypes.map((noteType) => [noteType.id, noteType]));
    const fieldColumns = notes.reduce((max, note) => {
        const noteType = noteTypes.get(note.noteTypeId) ?? BUILTIN_NOTE_TYPES.find((nt) => nt.id === note.noteTypeId);
        return Math.max(max, noteType?.fields.length ?? note.fields.length);
    }, 0);
    let specialColumns = 0;
    const lines = ['#separator:tab', `#html:${withHtml}`];
    if (withGuid) lines.push(`#guid column:${++specialColumns}`);
    if (withNotetype) lines.push(`#notetype column:${++specialColumns}`);
    if (withDeck) lines.push(`#deck column:${++specialColumns}`);
    if (withTags) lines.push(`#tags column:${specialColumns + fieldColumns + 1}`);

    for (const note of notes) {
        const noteType = noteTypes.get(note.noteTypeId) ?? BUILTIN_NOTE_TYPES.find((nt) => nt.id === note.noteTypeId);
        const row: string[] = [];
        if (withGuid) row.push(escapeField(note.guid));
        if (withNotetype) row.push(escapeField(noteType?.name ?? String(note.noteTypeId)));
        if (withDeck) {
            const candidateCards = cards.filter((card) => card.noteId === note.id);
            const scopedCard = deckName
                ? candidateCards.find((card) => {
                    const name = decks.get(card.deckId);
                    return name === deckName || name?.startsWith(`${deckName}::`);
                })
                : options.preferredDeckIds
                    ? candidateCards.find((card) => options.preferredDeckIds?.has(card.deckId))
                    : candidateCards[0];
            row.push(escapeField(decks.get(scopedCard?.deckId ?? 0) ?? ''));
        }
        for (let i = 0; i < fieldColumns; i++) row.push(escapeField(note.fields[i] ?? ''));
        if (withTags) row.push(escapeField(note.tags.join(' ')));
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
