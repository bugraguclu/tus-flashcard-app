import { getDeckDisplayName } from './models';
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
 * Resolves an active or selected deck target against the tree nodes.
 * Handles exact paths, trial roots, partial course suffixes (e.g. "Dahiliye" -> "TUS Kartları::Dahiliye"),
 * and case-insensitive/Turkish matches.
 */
export function resolveTargetDeckPath(
    nodes: DeckTreeNode[],
    targetName?: string | null,
): string | null {
    if (!targetName || !targetName.trim()) return null;
    const clean = targetName.trim();

    const allNodes: DeckTreeNode[] = [];
    const collect = (items: DeckTreeNode[]) => {
        for (const item of items) {
            allNodes.push(item);
            if (item.children.length > 0) collect(item.children);
        }
    };
    collect(nodes);

    // 1. Exact path match
    const exact = allNodes.find((n) => n.deck.name === clean);
    if (exact) return exact.deck.name;

    // 2. Case-insensitive exact match
    const lowerClean = clean.toLowerCase();
    const trClean = clean.toLocaleLowerCase('tr');
    const caseExact = allNodes.find((n) => {
        const lower = n.deck.name.toLowerCase();
        const tr = n.deck.name.toLocaleLowerCase('tr');
        return lower === lowerClean || tr === trClean;
    });
    if (caseExact) return caseExact.deck.name;

    // 3. Subdeck suffix match: e.g. "Dahiliye" or "Dahiliye::Kardiyoloji" matches "TUS Kartları::Dahiliye"
    const suffix = `::${clean}`;
    const suffixMatches = allNodes.filter((n) => {
        const name = n.deck.name;
        const lower = name.toLowerCase();
        const tr = name.toLocaleLowerCase('tr');
        return (
            name.endsWith(suffix) ||
            lower.endsWith(`::${lowerClean}`) ||
            tr.endsWith(`::${trClean}`)
        );
    });
    if (suffixMatches.length > 0) {
        suffixMatches.sort((a, b) => a.depth - b.depth);
        return suffixMatches[0].deck.name;
    }

    // 4. Display name match (last component): e.g. "Dahiliye"
    const displayMatches = allNodes.filter((n) => {
        const displayName = getDeckDisplayName(n.deck.name);
        const lower = displayName.toLowerCase();
        const tr = displayName.toLocaleLowerCase('tr');
        return lower === lowerClean || tr === trClean;
    });
    if (displayMatches.length > 0) {
        displayMatches.sort((a, b) => a.depth - b.depth);
        return displayMatches[0].deck.name;
    }

    return null;
}

/**
 * Reorders tree nodes so that the branch containing `activeDeckName` is positioned first
 * at each level of the hierarchy. Siblings outside the active path preserve their original order.
 */
export function prioritizeDeckTree(
    nodes: DeckTreeNode[],
    activeDeckName?: string | null,
): DeckTreeNode[] {
    if (!activeDeckName) return nodes;
    const resolvedName = resolveTargetDeckPath(nodes, activeDeckName);
    if (!resolvedName) return nodes;

    const parts = resolvedName.split('::');

    function prioritizeLevel(items: DeckTreeNode[], depth: number): DeckTreeNode[] {
        if (depth >= parts.length || items.length === 0) return items;

        const targetPrefix = parts.slice(0, depth + 1).join('::');
        const matchIndex = items.findIndex((item) => item.deck.name === targetPrefix);

        if (matchIndex === -1) {
            return items;
        }

        const matchedNode = items[matchIndex];
        const reorderedChildren = matchedNode.children.length > 0
            ? prioritizeLevel(matchedNode.children, depth + 1)
            : matchedNode.children;

        const updatedMatchedNode: DeckTreeNode = reorderedChildren !== matchedNode.children
            ? { ...matchedNode, children: reorderedChildren }
            : matchedNode;

        const result: DeckTreeNode[] = [updatedMatchedNode];
        for (let i = 0; i < items.length; i += 1) {
            if (i !== matchIndex) {
                result.push(items[i]);
            }
        }
        return result;
    }

    return prioritizeLevel(nodes, 0);
}

/**
 * Which branches are open the moment the picker appears.
 *
 * Opening every branch buries the top-level decks under a wall of sub-subdecks, so only the
 * root decks unfold: the user lands on their first level of subdecks and drills down from
 * there. A pre-selected or active deck is expanded along with its ancestors so its subdecks
 * are immediately visible, while other sibling subdecks remain closed.
 */
export function initialExpandedDeckNames(
    nodes: DeckTreeNode[],
    selectedDeckName?: string | null,
): Set<string> {
    const names = new Set<string>();
    for (const node of nodes) {
        if (node.children.length > 0) names.add(node.deck.name);
    }
    const resolvedName = resolveTargetDeckPath(nodes, selectedDeckName);
    if (resolvedName) {
        const parts = resolvedName.split('::');
        for (let index = 1; index <= parts.length; index += 1) {
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
