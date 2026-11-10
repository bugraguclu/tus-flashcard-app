import type { DeckTreeNode } from './deckManager';

export interface DeckListRowModel {
    key: string;
    node: DeckTreeNode;
    isRoot: boolean;
    isLastSibling: boolean;
    isExpanded: boolean;
}

function appendVisibleBranch(
    target: DeckListRowModel[],
    nodes: DeckTreeNode[],
    expandedDeckNames: ReadonlySet<string>,
): void {
    nodes.forEach((node, index) => {
        target.push({
            key: `deck:${node.deck.id}`,
            node,
            isRoot: node.depth === 0,
            isLastSibling: index === nodes.length - 1,
            isExpanded: expandedDeckNames.has(node.deck.name),
        });
        if (expandedDeckNames.has(node.deck.name)) {
            appendVisibleBranch(target, node.children, expandedDeckNames);
        }
    });
}

export function buildVisibleDeckRows(
    tree: DeckTreeNode[],
    expandedDeckNames: ReadonlySet<string>,
): DeckListRowModel[] {
    const rows: DeckListRowModel[] = [];
    appendVisibleBranch(rows, tree, expandedDeckNames);
    return rows;
}

export interface DeckDisclosureState {
    expanded: Set<string>;
    /** Ids of the decks the list has already shown; an id survives a rename, a name does not. */
    knownDeckIds: Set<number>;
}

/**
 * The expanded branches for a fresh snapshot of the deck list.
 *
 * The list keeps its open branches in memory (a toggle on a protected catalog deck cannot be
 * stored), so a deck it has shown before stays as the learner left it. A deck that has appeared
 * since — created here or in a picker, imported, installed — has no such state yet and starts
 * from its stored `collapsed` flag. Without that, a new `Fizyoloji::Kalp` showed a closed
 * `Fizyoloji` until the app was relaunched, as if `Kalp` had not been created.
 */
export function deckDisclosureForSnapshot(
    decks: ReadonlyArray<{ id: number; name: string; collapsed?: boolean }>,
    previous: DeckDisclosureState | null,
): DeckDisclosureState {
    const expanded = new Set(previous?.expanded);
    for (const deck of decks) {
        if (previous?.knownDeckIds.has(deck.id)) continue;
        if (!deck.collapsed) expanded.add(deck.name);
    }
    return { expanded, knownDeckIds: new Set(decks.map((deck) => deck.id)) };
}

function findNode(nodes: DeckTreeNode[], deckName: string): DeckTreeNode | null {
    for (const node of nodes) {
        if (node.deck.name === deckName) return node;
        const child = findNode(node.children, deckName);
        if (child) return child;
    }
    return null;
}

/** Splice only the toggled branch so every unaffected row model keeps object identity. */
export function toggleDeckBranchRows(
    currentRows: DeckListRowModel[],
    tree: DeckTreeNode[],
    deckName: string,
    expandedDeckNames: ReadonlySet<string>,
): DeckListRowModel[] {
    const rowIndex = currentRows.findIndex((row) => row.node.deck.name === deckName);
    const node = findNode(tree, deckName);
    if (rowIndex < 0 || !node) return buildVisibleDeckRows(tree, expandedDeckNames);

    let branchEnd = rowIndex + 1;
    while (branchEnd < currentRows.length && currentRows[branchEnd].node.depth > node.depth) {
        branchEnd += 1;
    }

    const inserted: DeckListRowModel[] = [];
    if (expandedDeckNames.has(deckName)) {
        appendVisibleBranch(inserted, node.children, expandedDeckNames);
    }
    const toggledRow: DeckListRowModel = {
        ...currentRows[rowIndex],
        isExpanded: expandedDeckNames.has(deckName),
    };
    return [
        ...currentRows.slice(0, rowIndex),
        toggledRow,
        ...inserted,
        ...currentRows.slice(branchEnd),
    ];
}
