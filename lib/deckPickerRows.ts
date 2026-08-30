// Pure row model for the deck picker (components/DeckPickerModal.tsx). A collection imported
// from Anki desktop can carry hundreds of decks, so the modal renders these rows through a
// FlatList; folding filter, expansion and depth into one flat array here keeps that list's
// renderItem trivial and lets the tree logic be tested without React.

import type { DeckTreeNode } from './deckManager';
import { matchesSearch } from './searchText';

export interface DeckPickerRow {
    /** Stable across re-renders; deck names are unique within a collection. */
    key: string;
    node: DeckTreeNode;
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
}

export interface DeckPickerRowsInput {
    query: string;
    expanded: ReadonlySet<string>;
    /** While searching, matches are force-expanded so a nested hit is never hidden. */
    searching: boolean;
}

/** Keeps a node when it matches, or when any descendant does, so parents of a hit stay reachable. */
export function filterDeckTree(nodes: readonly DeckTreeNode[], query: string): DeckTreeNode[] {
    if (!query) return [...nodes];
    const filtered: DeckTreeNode[] = [];
    for (const node of nodes) {
        const children = filterDeckTree(node.children, query);
        if (matchesSearch(node.deck.name.replaceAll('::', ' '), query) || children.length > 0) {
            filtered.push({ ...node, children });
        }
    }
    return filtered;
}

/** Every deck that owns children, used to open the tree fully when the picker mounts. */
export function expandableDeckNames(nodes: readonly DeckTreeNode[]): Set<string> {
    const names = new Set<string>();
    const walk = (items: readonly DeckTreeNode[]) => {
        for (const node of items) {
            if (node.children.length > 0) names.add(node.deck.name);
            walk(node.children);
        }
    };
    walk(nodes);
    return names;
}

export function buildDeckPickerRows(
    nodes: readonly DeckTreeNode[],
    input: DeckPickerRowsInput,
): DeckPickerRow[] {
    const query = input.query.trim();
    const searching = input.searching && query.length > 0;
    const rows: DeckPickerRow[] = [];

    const walk = (items: readonly DeckTreeNode[], depth: number) => {
        for (const node of items) {
            const hasChildren = node.children.length > 0;
            const expanded = searching || input.expanded.has(node.deck.name);
            rows.push({ key: node.deck.name, node, depth, hasChildren, expanded });
            if (expanded) walk(node.children, depth + 1);
        }
    };

    walk(filterDeckTree(nodes, query), 0);
    return rows;
}
