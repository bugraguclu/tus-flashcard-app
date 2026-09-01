import { matchesSearch } from './searchText';
// Type-only: the picker shares the deck list's tree shape without pulling the database layer in.
import type { DeckTreeNode } from './deckManager';

export interface VisibleDeckPickerRow {
    node: DeckTreeNode;
    depth: number;
}

/** Keep only the branches whose deck name matches the query, parents included. */
export function filterDeckTree(nodes: DeckTreeNode[], query: string): DeckTreeNode[] {
    if (!query) return nodes;
    const filtered: DeckTreeNode[] = [];
    for (const node of nodes) {
        const children = filterDeckTree(node.children, query);
        // "::" reads as a space so "tus anatomi" finds "TUS Kartları::Anatomi".
        if (matchesSearch(node.deck.name.replaceAll('::', ' '), query) || children.length > 0) {
            filtered.push({ ...node, children });
        }
    }
    return filtered;
}

/**
 * Which branches are open the moment the picker appears.
 *
 * Opening every branch buries the top-level decks under a wall of sub-subdecks, so only the
 * root decks unfold: the user lands on their first level of subdecks and drills down from
 * there. A pre-selected deck is the one exception — its ancestors open so it stays visible.
 */
export function initialExpandedDeckNames(
    nodes: DeckTreeNode[],
    selectedDeckName?: string | null,
): Set<string> {
    const names = new Set<string>();
    for (const node of nodes) {
        if (node.children.length > 0) names.add(node.deck.name);
    }
    if (selectedDeckName) {
        const parts = selectedDeckName.split('::');
        for (let index = 1; index < parts.length; index += 1) {
            names.add(parts.slice(0, index).join('::'));
        }
    }
    return names;
}

/** Flatten the tree into the rows a list renders, honouring the open branches. */
export function flattenVisibleDeckPicker(
    nodes: DeckTreeNode[],
    expanded: Set<string>,
    searching: boolean,
): VisibleDeckPickerRow[] {
    const rows: VisibleDeckPickerRow[] = [];
    const walk = (items: DeckTreeNode[], depth: number) => {
        for (const node of items) {
            rows.push({ node, depth });
            // A search shows every match, however deep it sits.
            if (searching || expanded.has(node.deck.name)) walk(node.children, depth + 1);
        }
    };
    walk(nodes, 0);
    return rows;
}
