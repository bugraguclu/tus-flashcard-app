// What `deck:`, `did:` and `preset:` read about a card's decks: its home deck when it sits
// physically in a filtered deck, the filtered decks it belongs to, and its deck's preset.
//
// Filtered decks here keep their cards in the home deck and record membership in
// `filtered_membership_v1:<deckId>` settings rows (lib/filteredDeckMembership.ts). This module only
// reads those rows; it never gathers, so a search cannot rebuild a filtered deck. A row whose
// build stamp or definition no longer matches its deck is stale and ignored, as the membership
// reader does.
import type { getDB } from './db';
import type { Deck, DeckConfig } from './models';

type SearchDb = ReturnType<typeof getDB>;

export const FILTERED_MEMBERSHIP_PREFIX = 'filtered_membership_v1:';

export interface SearchDeckFacts {
    homeDeckId?: number;
    homeDeckName?: string;
    filteredDeckNames: string[];
    presetName?: string;
}

export interface SearchDeckInfo {
    describe(cardId: number, deckId: number, odid: number | null | undefined): SearchDeckFacts;
}

function parse<T>(raw: string): T | null {
    try {
        const value = JSON.parse(raw);
        return value && typeof value === 'object' ? value as T : null;
    } catch {
        return null;
    }
}

/** The definition a membership row was built from (mirrors lib/filteredDeckMembership.ts). */
function membershipSignature(deck: Deck): string {
    return JSON.stringify([deck.searchQuery, deck.searchLimit, deck.searchOrder, deck.searchQuery2, deck.searchLimit2, deck.searchOrder2]);
}

export function searchDeckInfo(db: SearchDb): SearchDeckInfo {
    const decks = new Map<number, Deck>();
    for (const row of db.getAllSync<{ id: number; name: string; data: string }>('SELECT id, name, data FROM decks')) {
        const deck = parse<Deck>(row.data);
        decks.set(Number(row.id), { ...(deck ?? {} as Deck), id: Number(row.id), name: row.name });
    }
    const presets = new Map<number, string>();
    for (const row of db.getAllSync<{ id: number; data: string }>('SELECT id, data FROM deck_configs')) {
        const config = parse<DeckConfig>(row.data);
        if (config && typeof config.name === 'string') presets.set(Number(row.id), config.name);
    }

    const memberOf = new Map<number, string[]>();
    for (const row of db.getAllSync<{ key: string; value: string }>(
        'SELECT key, value FROM settings WHERE substr(key, 1, ?) = ?',
        FILTERED_MEMBERSHIP_PREFIX.length,
        FILTERED_MEMBERSHIP_PREFIX,
    )) {
        const deck = decks.get(Number(row.key.slice(FILTERED_MEMBERSHIP_PREFIX.length)));
        if (!deck?.isFiltered || deck.filteredDeckEmpty) continue;
        const membership = parse<{ buildAt?: number; signature?: string; ids?: unknown }>(row.value);
        if (!membership || !Array.isArray(membership.ids)) continue;
        if (membership.buildAt !== (deck.filteredBuildAt ?? 0) || membership.signature !== membershipSignature(deck)) continue;
        const done = new Set(deck.filteredDoneCardIds ?? []);
        for (const id of membership.ids) {
            const cardId = Number(id);
            if (!Number.isFinite(cardId) || done.has(cardId)) continue;
            const names = memberOf.get(cardId);
            if (names) { if (!names.includes(deck.name)) names.push(deck.name); } else memberOf.set(cardId, [deck.name]);
        }
    }

    return {
        describe(cardId, deckId, odid) {
            const deck = decks.get(deckId);
            const names = [...(memberOf.get(cardId) ?? [])];
            let homeId = deckId;
            let homeDeckId: number | undefined;
            let homeDeckName: string | undefined;
            if (deck?.isFiltered) {
                if (!names.includes(deck.name)) names.push(deck.name);
                const home = odid ? decks.get(Number(odid)) : undefined;
                if (home) {
                    homeId = home.id;
                    homeDeckId = home.id;
                    homeDeckName = home.name;
                }
            }
            const homeDeck = decks.get(homeId);
            return {
                homeDeckId,
                homeDeckName,
                filteredDeckNames: names,
                presetName: homeDeck && !homeDeck.isFiltered ? presets.get(Number(homeDeck.configId)) ?? '' : '',
            };
        },
    };
}
