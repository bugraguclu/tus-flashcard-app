/**
 * Data-layer protection for the paid BKA catalog.
 *
 * UI locks are only presentation. These checks sit beside persistence/import/export so deep
 * links, stale screens and future buttons cannot mutate or copy catalog rows by accident.
 */

import type { AnkiCard, Deck, DeckConfig, Note, NoteType } from './models';
import { getDB } from './db';
import { BKA_MANIFEST } from './bkaManifest';
import { CATALOG_INSTALL_KEY, CATALOG_PACK_ID, isCatalogPackRow } from './catalogRows';

type CatalogOwned = { catalogPack?: string };

const PROTECTED_GUIDS = new Set(BKA_MANIFEST.protectedNoteGuids);

export class PaidCatalogProtectionError extends Error {
    readonly code = 'PAID_CATALOG_PROTECTED';

    constructor(message = 'Ücretli BKA kataloğu içe veya dışa aktarılamaz ve satın alma olmadan değiştirilemez.') {
        super(message);
        this.name = 'PaidCatalogProtectionError';
    }
}

export function isCatalogOwned(value: unknown): boolean {
    return Boolean(value && typeof value === 'object'
        && (value as CatalogOwned).catalogPack === CATALOG_PACK_ID);
}

export function isProtectedCatalogGuid(guid: unknown): boolean {
    return typeof guid === 'string' && PROTECTED_GUIDS.has(guid);
}

export function assertNoProtectedCatalogGuids(guids: Iterable<unknown>): void {
    for (const guid of guids) {
        if (isProtectedCatalogGuid(guid)) throw new PaidCatalogProtectionError(
            'Bu dosyada ücretli BKA kartları bulundu. Katalog yalnızca uygulama içi satın alma ile etkinleştirilebilir.',
        );
    }
}

export function isPaidCatalogUnlocked(): boolean {
    try {
        const value = getDB().getFirstSync<{ value: string }>(
            'SELECT value FROM settings WHERE key = ?',
            CATALOG_INSTALL_KEY,
        )?.value;
        return value === 'full' || value === 'true';
    } catch {
        return false;
    }
}

function parseOwnedRow(table: 'notes' | 'decks' | 'deck_configs' | 'note_types', id: number): boolean {
    const row = getDB().getFirstSync<{ data: string }>(`SELECT data FROM ${table} WHERE id = ?`, id);
    return Boolean(row && isCatalogPackRow(row.data));
}

export function isCatalogNote(noteOrId: Note | number): boolean {
    return typeof noteOrId === 'number'
        ? parseOwnedRow('notes', noteOrId)
        : isCatalogOwned(noteOrId) || isProtectedCatalogGuid(noteOrId.guid);
}

export function isCatalogCard(cardOrId: AnkiCard | number): boolean {
    const card = typeof cardOrId === 'number'
        ? getDB().getFirstSync<{ noteId: number }>('SELECT noteId FROM anki_cards WHERE id = ?', cardOrId)
        : cardOrId;
    return Boolean(card && isCatalogNote(Number(card.noteId)));
}

export function isCatalogDeck(deckOrId: Deck | number): boolean {
    return typeof deckOrId === 'number' ? parseOwnedRow('decks', deckOrId) : isCatalogOwned(deckOrId);
}

export function isCatalogDeckConfig(configOrId: DeckConfig | number): boolean {
    return typeof configOrId === 'number'
        ? parseOwnedRow('deck_configs', configOrId)
        : isCatalogOwned(configOrId);
}

export function isCatalogNoteType(typeOrId: NoteType | number): boolean {
    return typeof typeOrId === 'number' ? parseOwnedRow('note_types', typeOrId) : isCatalogOwned(typeOrId);
}

export function assertCatalogMutable(value: Note | AnkiCard | Deck | DeckConfig | NoteType, kind: 'note' | 'card' | 'deck' | 'config' | 'type'): void {
    if (isPaidCatalogUnlocked()) return;
    const owned = kind === 'note' ? isCatalogNote(value as Note)
        : kind === 'card' ? isCatalogCard(value as AnkiCard)
            : kind === 'deck' ? isCatalogDeck(value as Deck)
                : kind === 'config' ? isCatalogDeckConfig(value as DeckConfig)
                    : isCatalogNoteType(value as NoteType);
    if (owned) throw new PaidCatalogProtectionError('Bu içerik satın alma tamamlanmadan değiştirilemez.');
}

function assertMutable(owned: boolean): void {
    if (owned && !isPaidCatalogUnlocked()) {
        throw new PaidCatalogProtectionError('Bu içerik satın alma tamamlanmadan değiştirilemez.');
    }
}

export function assertCatalogNoteMutable(value: Note | number): void { assertMutable(isCatalogNote(value)); }
export function assertCatalogCardMutable(value: AnkiCard | number): void { assertMutable(isCatalogCard(value)); }
export function assertCatalogDeckMutable(value: Deck | number): void { assertMutable(isCatalogDeck(value)); }
export function assertCatalogDeckConfigMutable(value: DeckConfig | number): void { assertMutable(isCatalogDeckConfig(value)); }
export function assertCatalogNoteTypeMutable(value: NoteType | number): void { assertMutable(isCatalogNoteType(value)); }

export function canonicalBackupContainsCatalog(data: any): boolean {
    const tables = data?.tables;
    if (!tables || typeof tables !== 'object') return false;
    // Deck/config/notetype metadata may legitimately be referenced by learner-authored notes.
    // The paid intellectual property is in the note payload; its cards cannot exist without it.
    const protectedRows = ['notes'];
    for (const table of protectedRows) {
        for (const row of Array.isArray(tables[table]) ? tables[table] : []) {
            if (isCatalogPackRow(row?.data)) return true;
            if (table === 'notes' && typeof row?.data === 'string') {
                try {
                    if (isProtectedCatalogGuid((JSON.parse(row.data) as Note).guid)) return true;
                } catch { /* shape validation handles malformed rows separately */ }
            }
        }
    }
    return false;
}
