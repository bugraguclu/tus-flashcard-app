// Pure helpers and constants for the deck list screen (app/(tabs)/decks.tsx),
// extracted so they can be unit tested independently of the screen component.
import { getAllDecks, initializeDeckDisclosureDefaults } from './deckManager';

export function parseCount(text: string, fallback: number = 0): number {
    const value = parseInt(text, 10);
    return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export const ROOT_DROP_TARGET = '__root_deck_drop_target__';
export const FILTER_ORDER_UI = [7, 1, 2, 3, 6, 4, 0, 5, 8, 9] as const;
export type DeckDropPlacement = 'before' | 'inside' | 'after';

export function decodeDeckDropTarget(target: string | null):
    | { kind: 'root' }
    | { kind: 'deck'; name: string; placement: DeckDropPlacement }
    | null {
    if (!target) return null;
    if (target === ROOT_DROP_TARGET) return { kind: 'root' };
    const separator = target.indexOf(':');
    if (separator < 0) return null;
    const placement = target.slice(0, separator) as DeckDropPlacement;
    if (placement !== 'before' && placement !== 'inside' && placement !== 'after') return null;
    return { kind: 'deck', placement, name: target.slice(separator + 1) };
}

export function encodeDeckDropTarget(name: string, placement: DeckDropPlacement): string {
    return `${placement}:${name}`;
}

// A deliberate spring-open delay prevents a parent from expanding while the pointer merely
// passes over it. 800 ms sits in the familiar 0.6–1.0 s range used by tree/list drag UIs.
export const DECK_HOVER_EXPAND_DELAY_MS = 800;

export function getPersistedExpandedDeckNames(): Set<string> {
    initializeDeckDisclosureDefaults();
    return new Set(getAllDecks().filter((deck) => !deck.collapsed).map((deck) => deck.name));
}

/** Keep disclosure state attached to the same decks after an Anki-style subtree rename. */
export function remapExpandedDeckPaths(
    paths: Set<string>,
    oldPath: string,
    newPath: string,
    additionallyExpand?: string | null,
): Set<string> {
    const next = new Set<string>();
    for (const path of paths) {
        if (path === oldPath || path.startsWith(`${oldPath}::`)) {
            next.add(`${newPath}${path.slice(oldPath.length)}`);
        } else {
            next.add(path);
        }
    }
    if (additionallyExpand) next.add(additionallyExpand);
    return next;
}
