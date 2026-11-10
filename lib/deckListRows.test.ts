import { describe, expect, it } from 'vitest';
import type { DeckTreeNode } from './deckManager';
import type { Deck } from './models';
import { buildVisibleDeckRows, deckDisclosureForSnapshot, toggleDeckBranchRows } from './deckListRows';

function node(name: string, id: number, children: DeckTreeNode[] = []): DeckTreeNode {
    const deck: Deck = {
        id,
        name,
        configId: 1,
        mod: 0,
        usn: 0,
        description: '',
        collapsed: false,
        isFiltered: false,
    };
    return {
        deck,
        children,
        depth: name.split('::').length - 1,
        newCount: 0,
        learnCount: 0,
        reviewCount: 0,
        totalCards: 0,
    };
}

describe('virtualized deck-list row model', () => {
    it('builds only visible rows for a large hierarchy', () => {
        let id = 1;
        const tree = Array.from({ length: 500 }, (_, rootIndex) => {
            const rootName = `Deste ${String(rootIndex).padStart(3, '0')}`;
            const children = Array.from({ length: 5 }, (_, childIndex) => {
                const childName = `${rootName}::Alt ${childIndex}`;
                return node(childName, id++);
            });
            return node(rootName, id++, children);
        });
        const expanded = new Set(['Deste 000', 'Deste 249', 'Deste 499']);

        const rows = buildVisibleDeckRows(tree, expanded);

        expect(rows).toHaveLength(515);
        expect(rows.filter((row) => row.node.depth === 1)).toHaveLength(15);
        expect(rows[0].key).toBe('deck:6');
    });

    it('changes only the toggled branch and preserves unaffected row objects', () => {
        const tree = [
            node('A', 1, [node('A::Bir', 2), node('A::Iki', 3)]),
            node('B', 4, [node('B::Bir', 5)]),
        ];
        const collapsed = buildVisibleDeckRows(tree, new Set());
        const expandedNames = new Set(['A']);

        const opened = toggleDeckBranchRows(collapsed, tree, 'A', expandedNames);
        expect(opened.map((row) => row.node.deck.name)).toEqual(['A', 'A::Bir', 'A::Iki', 'B']);
        expect(opened[0]).not.toBe(collapsed[0]);
        expect(opened[0].isExpanded).toBe(true);
        expect(opened[3]).toBe(collapsed[1]);

        const closed = toggleDeckBranchRows(opened, tree, 'A', new Set());
        expect(closed.map((row) => row.node.deck.name)).toEqual(['A', 'B']);
        expect(closed[0]).not.toBe(opened[0]);
        expect(closed[0].isExpanded).toBe(false);
        expect(closed[1]).toBe(opened[3]);
    });
});

describe('deck disclosure across snapshots', () => {
    const decks = [
        { id: 1, name: 'Anatomi', collapsed: false },
        { id: 2, name: 'Anatomi::Kalp', collapsed: true },
        { id: 3, name: 'Anatomi::Kalp::Kapaklar', collapsed: false },
    ];

    it('starts from the stored flags', () => {
        const first = deckDisclosureForSnapshot(decks, null);
        expect([...first.expanded].sort()).toEqual(['Anatomi', 'Anatomi::Kalp::Kapaklar']);
        expect([...first.knownDeckIds].sort()).toEqual([1, 2, 3]);
    });

    it('keeps what the learner toggled and opens a deck that appeared since', () => {
        const first = deckDisclosureForSnapshot(decks, null);
        // The learner closes Anatomi; a toggle on a protected deck is never stored, so the stored
        // flag still says open.
        first.expanded.delete('Anatomi');

        const next = deckDisclosureForSnapshot([
            ...decks,
            { id: 4, name: 'Fizyoloji', collapsed: false },
            { id: 5, name: 'Fizyoloji::Kalp', collapsed: false },
            { id: 6, name: 'Paket', collapsed: true },
        ], first);

        expect(next.expanded.has('Anatomi')).toBe(false);
        expect(next.expanded.has('Fizyoloji')).toBe(true);
        expect(next.expanded.has('Paket')).toBe(false);
        expect(next.knownDeckIds.has(5)).toBe(true);
    });

    it('does not reopen a renamed deck the learner had closed', () => {
        const first = deckDisclosureForSnapshot(decks, null);
        first.expanded.delete('Anatomi');
        const renamed = decks.map((deck) => ({ ...deck, name: deck.name.replace('Anatomi', 'Anatomi 2024') }));

        expect(deckDisclosureForSnapshot(renamed, first).expanded.has('Anatomi 2024')).toBe(false);
    });
});
