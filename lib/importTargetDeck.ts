import { getAllDecks, getDeck, getDeckByName } from './deckManager';
import { deckNameKey, normalizeDeckName } from './deckNames';
import type { DelimitedMetadata } from './importDelimited';
import type { Deck, NoteType } from './models';

export function resolveInitialTargetDeckId(params: { deckId?: string; deckName?: string; deck?: string } = {}): number {
    const rawDeckId = params.deckId ? Number(params.deckId) : undefined;
    if (rawDeckId && Number.isFinite(rawDeckId)) {
        const requested = getDeck(rawDeckId);
        if (requested && !requested.isFiltered) return requested.id;
    }
    const requestedName = typeof params.deckName === 'string'
        ? params.deckName
        : (typeof params.deck === 'string' ? params.deck : null);
    if (requestedName && requestedName.trim()) {
        const requested = getDeckByName(requestedName.trim());
        if (requested && !requested.isFiltered) return requested.id;
    }
    const defaultDeck = getDeckByName('Varsayılan')
        ?? getDeck(1)
        ?? getAllDecks().find((deck) => !deck.isFiltered);
    return defaultDeck?.id ?? 1;
}

/**
 * The import screen's deck: an existing deck, or one a text file's `#deck:` header names that the
 * collection does not have yet. Anki 25.07+ offers that name as "A new deck will be created" and
 * makes the deck only when the import runs, so a cancelled or failed import leaves no deck behind.
 */
export type ImportDeckChoice =
    | { kind: 'existing'; deckId: number }
    | { kind: 'new'; name: string };

export interface TextImportHeaderPresets {
    /** Null leaves the screen's own deck: no header, or one the import could not file notes under. */
    deck: ImportDeckChoice | null;
    /** Null leaves the screen's own note type: no header, or a type the collection does not have. */
    noteTypeId: number | null;
}

type HeaderMetadata = Pick<DelimitedMetadata, 'deck' | 'notetype' | 'deckColumn' | 'notetypeColumn'>;

/** Anki reads a header value as an id first and falls back to it as a name. */
function asId(value: string): number | null {
    return /^\d+$/.test(value) ? Number(value) : null;
}

/** Folds as getDeckByName does, so a preset names the same deck the import later resolves. */
function findDeck(name: string, decks: readonly Deck[]): Deck | undefined {
    const normalized = normalizeDeckName(name);
    const key = deckNameKey(normalized);
    return decks.find((deck) => deck.name === normalized) ?? decks.find((deck) => deckNameKey(deck.name) === key);
}

/** Each ancestor that exists keeps its stored spelling, the path createDeck will write. */
function canonicalNewDeckPath(name: string, decks: readonly Deck[]): { path: string; blocked: boolean } {
    let path = '';
    let blocked = false;
    for (const part of normalizeDeckName(name).split('::')) {
        const candidate = path ? `${path}::${part}` : part;
        const existing = findDeck(candidate, decks);
        // A filtered deck cannot have subdecks, so createDeck would refuse this path at import.
        if (existing?.isFiltered) blocked = true;
        path = existing?.name ?? candidate;
    }
    return { path, blocked };
}

function headerDeck(raw: string | undefined, decks: readonly Deck[]): ImportDeckChoice | null {
    const value = raw?.trim();
    if (!value) return null;
    const id = asId(value);
    const deck = (id !== null ? decks.find((entry) => entry.id === id) : undefined) ?? findDeck(value, decks);
    if (deck) return deck.isFiltered ? null : { kind: 'existing', deckId: deck.id };
    const { path, blocked } = canonicalNewDeckPath(value, decks);
    return blocked ? null : { kind: 'new', name: path };
}

function headerNoteTypeId(raw: string | undefined, noteTypes: readonly Pick<NoteType, 'id' | 'name'>[]): number | null {
    const value = raw?.trim();
    if (!value) return null;
    const id = asId(value);
    const byId = id !== null ? noteTypes.find((type) => type.id === id) : undefined;
    const key = value.normalize('NFC').toLowerCase();
    const byName = noteTypes.find((type) => type.name.trim().normalize('NFC').toLowerCase() === key);
    return (byId ?? byName)?.id ?? null;
}

/**
 * The deck and note type a text file's `#deck:` and `#notetype:` headers preselect on the import
 * screen; the learner can still change both. As in Anki 26.09.3, an existing deck or note type
 * matches by id or by name in any case, an unknown note type leaves the screen's choice, and an
 * unknown deck becomes a new deck. A `#deck column` / `#notetype column` names one per row instead,
 * so its header is not preset. (rslib text/csv/metadata.rs, behaviour only.)
 * https://docs.ankiweb.net/importing/text-files.html#file-headers
 */
export function textImportHeaderPresets(
    metadata: HeaderMetadata,
    decks: readonly Deck[],
    noteTypes: readonly Pick<NoteType, 'id' | 'name'>[],
): TextImportHeaderPresets {
    return {
        deck: metadata.deckColumn ? null : headerDeck(metadata.deck, decks),
        noteTypeId: metadata.notetypeColumn ? null : headerNoteTypeId(metadata.notetype, noteTypes),
    };
}

/**
 * Stand-ins the deck picker lists for a new deck's path, so the learner can return to it after
 * choosing another deck. Only the missing parts of the path appear, with negative ids that no
 * stored deck has; choosing one means "create this deck when importing".
 */
export function newDeckPickerEntries(name: string, decks: readonly Deck[]): Deck[] {
    const parts = name.split('::');
    const entries: Deck[] = [];
    for (let depth = 1; depth <= parts.length; depth++) {
        const path = parts.slice(0, depth).join('::');
        if (findDeck(path, decks)) continue;
        entries.push({
            id: -(entries.length + 1), name: path, configId: 1, mod: 0, usn: -1,
            description: '', collapsed: false, isFiltered: false,
        });
    }
    return entries;
}
