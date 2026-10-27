/**
 * Plain-text export of the whole collection, in the same `#directive` + tab-separated shape
 * importDelimited.ts already reads — so a file this module writes round-trips through the
 * app's own /import screen, mirroring Anki's "Notes in Plain Text" export/import pair.
 */

import { getAllAnkiCards, getAllNotes, getAllNoteTypes } from './noteManager';
import { BUILTIN_NOTE_TYPES, type AnkiCard, type Deck, type Note, type NoteType } from './models';
import { getDB } from './db';
import { getAllDecks } from './deckManager';
import { isCatalogDeck, isCatalogNote, PaidCatalogProtectionError } from './catalogProtection';
import { decodeEntitiesLikeAnki } from './noteChecksum';

function escapeField(value: string): string {
    // Anki's text exporter uses real CSV quoting, even though the separator is a tab.
    // This preserves embedded tabs, quotes and multiline fields byte-for-byte on import.
    return /[#\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Anki drops two things from every plain-text export regardless of the HTML option: a field's
 * `<style>` block and the `[[type:…]]` typing placeholder. Neither is note content — one is
 * styling that belongs to the note type, the other is a template instruction — so carrying them
 * into a text file would re-import them as literal text.
 */
function stripRedundantSections(value: string): string {
    return value
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/\[\[type:[^\]]+\]\]/g, '');
}

/**
 * Anki's "Include HTML and media references" option, unchecked: the field is reduced to the line
 * of text Anki writes for it. A line break, a bare `<div>` and a newline each become one space;
 * sound and TTS tags, comments, scripts, styles and every other tag are dropped; entities are
 * decoded as Anki decodes them, a non-breaking space to a plain one; and the ends are trimmed. Spaces inside are kept as they
 * are, and media leaves nothing behind — the file is data, so no placeholder is invented for it.
 * Checked against Anki 26.09.3's text exports (lib/exportNotes.test.ts).
 *
 * https://docs.ankiweb.net/exporting.html
 */
export function fieldToPlainText(value: string): string {
    return decodeEntitiesLikeAnki(stripRedundantSections(value)
        .replace(/<br\s*\/?>|<div>|\n/gi, ' ')
        .replace(/\[sound:[^\]]*\]/gi, '')
        .replace(/\[anki:tts\b[^\]]*\][\s\S]*?\[\/anki:tts\]/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<[^>]*>/g, ''))
        .trim();
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
    // Exact, case-sensitive subtree: LIKE would also take in "TUS::…" for a deck named "tus".
    const rows = getDB().getAllSync<{ noteId: number }>(
        `SELECT DISTINCT c.noteId AS noteId
         FROM anki_cards c
         JOIN decks d ON d.id = c.deckId
         WHERE d.name = ? OR instr(d.name, ?) = 1`,
        deckName,
        `${deckName}::`,
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
    // The `#html:` header tells an importer how to read the fields below it, so the fields have to
    // agree with it: writing `#html:false` over markup would make a round trip escape it twice.
    const exportField = withHtml ? stripRedundantSections : fieldToPlainText;
    const withTags = options.withTags !== false;
    const withDeck = options.withDeck !== false;
    const withNotetype = options.withNotetype !== false;
    const withGuid = options.withGuid !== false;
    if (deckName && data.decks.some((deck) => (deck.name === deckName || deck.name.startsWith(`${deckName}::`)) && isCatalogDeck(deck))) {
        throw new PaidCatalogProtectionError('Ücretli katalog desteleri dışa aktarılamaz.');
    }
    if (selectedNoteIds && data.notes.some((note) => selectedNoteIds.has(note.id) && isCatalogNote(note))) {
        throw new PaidCatalogProtectionError('Ücretli katalog kartları dışa aktarılamaz.');
    }
    const decks = new Map(data.decks.map((deck) => [deck.id, deck.name]));
    const scope = selectedNoteIds ?? (deckName
        ? new Set(data.cards.filter((card) => {
            const name = decks.get(card.deckId);
            return name === deckName || name?.startsWith(`${deckName}::`);
        }).map((card) => card.noteId))
        : null);
    const notes = data.notes.filter((note) => !isCatalogNote(note) && (!scope || scope.has(note.id)));
    if (notes.some((note) => isCatalogNote(note))) {
        throw new PaidCatalogProtectionError('Ücretli katalog kartları dışa aktarılamaz.');
    }
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
        for (let i = 0; i < fieldColumns; i++) row.push(escapeField(exportField(note.fields[i] ?? '')));
        if (withTags) row.push(escapeField(note.tags.join(' ')));
        lines.push(row.join('\t'));
    }

    // Anki ends every row, the last one too, with a newline.
    return `${lines.join('\n')}\n`;
}
