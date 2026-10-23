/** Fixed virtual membership; no scheduler units are reinterpreted or stored on the card. */
import { getDB } from './db';
import type { Deck } from './models';
import type { AppSettings } from './types';
import { gatherFilteredTermCardIds } from './filteredDeckGather';

type Definition = Pick<Deck, 'searchQuery' | 'searchLimit' | 'searchOrder' | 'searchQuery2' | 'searchLimit2' | 'searchOrder2' | 'filteredBuildAt' | 'filteredDeckEmpty' | 'filteredDoneCardIds'> & { id?: number };
type SearchSettings = Pick<AppSettings, 'dayRolloverHour' | 'fsrsEnabled'>;
interface Membership { buildAt: number; signature: string; ids: number[] }
const signature = (deck: Definition) => JSON.stringify([deck.searchQuery, deck.searchLimit, deck.searchOrder, deck.searchQuery2, deck.searchLimit2, deck.searchOrder2]);
const key = (id: number) => `filtered_membership_v1:${id}`;

function read(deck: Definition): Membership | null {
    if (deck.id === undefined) return null;
    const row = getDB().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key(deck.id));
    if (!row) return null;
    const value = JSON.parse(row.value) as Membership;
    return value.buildAt === (deck.filteredBuildAt ?? 0) && value.signature === signature(deck) && Array.isArray(value.ids) ? value : null;
}

export function clearFilteredDeckMembership(id: number): void {
    getDB().runSync('DELETE FROM settings WHERE key = ?', key(id));
}

/** Reservations from persisted builds; completed slots stay empty until Rebuild. */
export function reservedFilteredCardIds(exceptDeckId?: number): number[] {
    const ids = new Set<number>();
    const decks = getDB().getAllSync<{ data: string }>('SELECT data FROM decks');
    for (const row of decks) {
        const deck = JSON.parse(row.data) as Deck;
        if (!deck.isFiltered || deck.filteredDeckEmpty || deck.id === exceptDeckId) continue;
        const done = new Set(deck.filteredDoneCardIds ?? []);
        for (const id of read(deck)?.ids ?? []) if (!done.has(id)) ids.add(id);
    }
    return [...ids];
}

/**
 * The cards a build of this definition would gather now, without storing anything. Only the
 * reservations of other filtered decks are left out: `ownerDeckId` is the deck being built or the
 * one a rebuild would replace, whose own cards that rebuild releases first.
 */
export function gatherFilteredDeckMemberIds(
    deck: Definition,
    settings: SearchSettings,
    nowMs: number,
    ownerDeckId: number | undefined = deck.id,
): number[] {
    const excluded = reservedFilteredCardIds(ownerDeckId);
    const ids = gatherFilteredTermCardIds({ search: deck.searchQuery ?? '', order: deck.searchOrder, limit: deck.searchLimit }, settings, nowMs, excluded);
    if (deck.searchQuery2?.trim()) {
        ids.push(...gatherFilteredTermCardIds({ search: deck.searchQuery2, order: deck.searchOrder2, limit: deck.searchLimit2 }, settings, nowMs, [...excluded, ...ids]));
    }
    return ids;
}

/** Build once, at Create/Rebuild; legacy virtual decks are initialized on first access. */
export function filteredDeckMemberIds(deck: Definition, settings: SearchSettings, nowMs: number): number[] {
    if (deck.filteredDeckEmpty) return [];
    const stored = read(deck);
    if (stored) return stored.ids;
    const ids = gatherFilteredDeckMemberIds(deck, settings, nowMs);
    if (deck.id !== undefined) {
        // Imported packages may already hold cards physically in the filtered deck.
        for (const row of getDB().getAllSync<{ id: number }>('SELECT id FROM anki_cards WHERE deckId = ? ORDER BY due, id', deck.id)) {
            if (!ids.includes(row.id)) ids.push(row.id);
        }
        getDB().runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key(deck.id), JSON.stringify({ buildAt: deck.filteredBuildAt ?? 0, signature: signature(deck), ids }));
    }
    return ids;
}
